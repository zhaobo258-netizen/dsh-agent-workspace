// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import test from "node:test";
import {
  RecipeValidationError,
  activateRecipe,
  approveRecipe,
  createRecipe,
  deprecateRecipe,
  markNeedsReview,
  markValidated,
  validateForExecution
} from "../src/index.js";

const DEFINITION = {
  schema_version: "1",
  recipe_id: "synthetic.sales-summary",
  revision: 1,
  title: "Synthetic sales summary",
  origin: "https://sales.example.test:8443",
  steps: [
    { verb: "assert_origin", origin: "https://sales.example.test:8443" },
    { verb: "navigate", path: "/reports/daily?view=summary" },
    { verb: "extract_text", selector: "[data-field='net-sales']", output: "net_sales" },
    {
      verb: "extract_attribute",
      selector: "[data-field='period']",
      attribute: "data-period",
      output: "reporting_period"
    }
  ]
};

function activeRecipe() {
  const draft = createRecipe(DEFINITION);
  const validated = markValidated(draft);
  const approved = approveRecipe(validated, {
    approvedBy: "maintainer-1",
    approvedAt: "2026-08-20T00:00:00.000Z"
  });
  return activateRecipe(approved);
}

function expectCode(fn, code) {
  assert.throws(fn, (error) => {
    assert.ok(error instanceof RecipeValidationError);
    assert.equal(error.code, code);
    return true;
  });
}

test("creates a deterministic deeply immutable recipe", () => {
  const first = createRecipe(DEFINITION);
  const second = createRecipe({ ...DEFINITION, steps: DEFINITION.steps.map((step) => ({ ...step })) });

  assert.equal(first.content_hash, second.content_hash);
  assert.match(first.content_hash, /^sha256:[a-f0-9]{64}$/);
  assert.equal(first.status, "DRAFT");
  assert.ok(Object.isFrozen(first));
  assert.ok(Object.isFrozen(first.steps));
  assert.ok(Object.isFrozen(first.steps[0]));
  assert.throws(() => {
    first.steps[0].origin = "https://other.example.test";
  }, TypeError);
});

test("accepts a serialized ACTIVE recipe through the single execution gate", () => {
  const serialized = JSON.parse(JSON.stringify(activeRecipe()));
  const executable = validateForExecution(serialized);

  assert.equal(executable.status, "ACTIVE");
  assert.equal(executable.approval.recipe_hash, executable.content_hash);
  assert.ok(Object.isFrozen(executable.steps));
});

test("rejects content tampering and approval bound to another hash", () => {
  const changed = JSON.parse(JSON.stringify(activeRecipe()));
  changed.title = "Changed title";
  expectCode(() => validateForExecution(changed), "HASH_MISMATCH");

  const wrongApproval = JSON.parse(JSON.stringify(activeRecipe()));
  wrongApproval.approval.recipe_hash = `sha256:${"0".repeat(64)}`;
  expectCode(() => validateForExecution(wrongApproval), "APPROVAL_HASH_MISMATCH");
});

test("requires exact origin assertion and rejects wildcard or cross-origin navigation", () => {
  expectCode(
    () => createRecipe({ ...DEFINITION, steps: DEFINITION.steps.slice(1) }),
    "MISSING_ORIGIN_ASSERTION"
  );
  expectCode(
    () => createRecipe({ ...DEFINITION, origin: "https://*.example.test" }),
    "INVALID_ORIGIN"
  );
  expectCode(
    () => createRecipe({
      ...DEFINITION,
      steps: [DEFINITION.steps[0], { verb: "navigate", path: "//evil.example.test/data" }]
    }),
    "CROSS_ORIGIN_NAVIGATION"
  );
});

test("rejects arbitrary execution verbs and unsafe attribute extraction", () => {
  expectCode(
    () => createRecipe({
      ...DEFINITION,
      steps: [DEFINITION.steps[0], { verb: "execute_js", source: "return document.cookie" }]
    }),
    "FORBIDDEN_VERB"
  );
  expectCode(
    () => createRecipe({
      ...DEFINITION,
      steps: [
        DEFINITION.steps[0],
        { verb: "extract_attribute", selector: "input", attribute: "value", output: "password" }
      ]
    }),
    "FORBIDDEN_ATTRIBUTE"
  );
});

test("rejects credentials, absolute local paths and hidden schema fields", () => {
  expectCode(() => createRecipe({ ...DEFINITION, title: "Authorization: Bearer synthetic-token" }), "SENSITIVE_VALUE");
  expectCode(() => createRecipe({ ...DEFINITION, title: "Load /Users/example/private.json" }), "ABSOLUTE_PATH");
  expectCode(() => createRecipe({ ...DEFINITION, credential: "hidden" }), "INVALID_SCHEMA");
});

test("enforces lifecycle and invalidates approval when review is required", () => {
  const draft = createRecipe(DEFINITION);
  expectCode(() => activateRecipe(draft), "INVALID_LIFECYCLE");
  expectCode(() => validateForExecution(draft), "INVALID_LIFECYCLE");

  const active = activeRecipe();
  const review = markNeedsReview(active);
  assert.equal(review.status, "NEEDS_REVIEW");
  assert.equal(review.approval, null);
  expectCode(() => validateForExecution(review), "INVALID_LIFECYCLE");

  const deprecated = deprecateRecipe(active);
  assert.equal(deprecated.status, "DEPRECATED");
  expectCode(() => validateForExecution(deprecated), "INVALID_LIFECYCLE");
});

test("requires explicit, well-formed caller approval evidence", () => {
  const validated = markValidated(createRecipe(DEFINITION));
  expectCode(
    () => approveRecipe(validated, { approvedBy: "maintainer-1", approvedAt: "not-a-date" }),
    "INVALID_APPROVAL"
  );
  expectCode(
    () => approveRecipe(validated, { approvedBy: "api_key=synthetic", approvedAt: "2026-08-20T00:00:00.000Z" }),
    "SENSITIVE_VALUE"
  );
  expectCode(
    () => approveRecipe(validated, { approvedBy: "maintainer-1", approvedAt: "2026-02-31T00:00:00.000Z" }),
    "INVALID_APPROVAL"
  );

  const approvedWithGeneratedTime = approveRecipe(validated, { approvedBy: "maintainer-1" });
  assert.match(approvedWithGeneratedTime.approval.approved_at, /^\d{4}-\d{2}-\d{2}T/);
});
