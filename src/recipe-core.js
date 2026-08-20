// SPDX-License-Identifier: Apache-2.0

import { createHash } from "node:crypto";

/** @typedef {"DRAFT" | "VALIDATED" | "APPROVED" | "ACTIVE" | "NEEDS_REVIEW" | "DEPRECATED"} RecipeStatus */
/** @typedef {{readonly verb: "assert_origin", readonly origin: string}} AssertOriginStep */
/** @typedef {{readonly verb: "navigate", readonly path: string}} NavigateStep */
/** @typedef {{readonly verb: "extract_text", readonly selector: string, readonly output: string}} ExtractTextStep */
/** @typedef {{readonly verb: "extract_attribute", readonly selector: string, readonly attribute: string, readonly output: string}} ExtractAttributeStep */
/** @typedef {AssertOriginStep | NavigateStep | ExtractTextStep | ExtractAttributeStep} RecipeStep */
/**
 * @typedef {object} RecipeDefinition
 * @property {"1"} schema_version
 * @property {string} recipe_id
 * @property {number} revision
 * @property {string} title
 * @property {string} origin
 * @property {ReadonlyArray<RecipeStep>} steps
 */
/**
 * @typedef {object} RecipeApproval
 * @property {string} recipe_hash
 * @property {string} approved_by
 * @property {string} approved_at
 */
/**
 * @typedef {RecipeDefinition & {
 *   readonly status: RecipeStatus,
 *   readonly content_hash: string,
 *   readonly approval: Readonly<RecipeApproval> | null
 * }} Recipe
 */

/** @type {"1"} */
export const RECIPE_SCHEMA_VERSION = "1";
/** @type {ReadonlyArray<RecipeStatus>} */
export const RECIPE_STATUSES = Object.freeze([
  "DRAFT",
  "VALIDATED",
  "APPROVED",
  "ACTIVE",
  "NEEDS_REVIEW",
  "DEPRECATED"
]);
/** @type {ReadonlyArray<RecipeStep["verb"]>} */
export const RECIPE_VERBS = Object.freeze([
  "assert_origin",
  "navigate",
  "extract_text",
  "extract_attribute"
]);

const RECIPE_KEYS = new Set([
  "schema_version",
  "recipe_id",
  "revision",
  "title",
  "origin",
  "steps",
  "status",
  "content_hash",
  "approval"
]);
const DEFINITION_KEYS = new Set([
  "schema_version",
  "recipe_id",
  "revision",
  "title",
  "origin",
  "steps"
]);
const APPROVAL_KEYS = new Set(["recipe_hash", "approved_by", "approved_at"]);
const SECRET_PATTERN = /(?:authorization\s*:|bearer\s+[a-z0-9._~+\/-]+=*|cookie\s*:|(?:password|passwd|secret|api[_-]?key|access[_-]?token|refresh[_-]?token|jwt)\s*[:=])/i;
const ABSOLUTE_PATH_PATTERN = /(?:^|[\s"'])(?:\/(?:Users|home|var|private|etc|opt|tmp)\/|[a-z]:\\Users\\)/i;
const IDENTIFIER_PATTERN = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;
const OUTPUT_PATTERN = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/;

export class RecipeValidationError extends Error {
  /** @param {string} code @param {string} message */
  constructor(code, message) {
    super(message);
    this.name = "RecipeValidationError";
    this.code = code;
  }
}

/**
 * Creates an immutable DRAFT recipe and binds its behavior-bearing definition
 * to a deterministic SHA-256 hash.
 *
 * @param {RecipeDefinition} input
 * @returns {Recipe}
 */
export function createRecipe(input) {
  const definition = normalizeDefinition(input);
  return deepFreeze({
    ...definition,
    status: "DRAFT",
    content_hash: hashDefinition(definition),
    approval: null
  });
}

/** @param {unknown} recipe @returns {Recipe} */
export function markValidated(recipe) {
  const current = normalizeRecipe(recipe);
  requireStatus(current, ["DRAFT", "NEEDS_REVIEW"], "VALIDATED");
  return deepFreeze({ ...current, status: "VALIDATED", approval: null });
}

/**
 * The approval is an assertion supplied by the caller. It binds an identity
 * and timestamp to the recipe hash, but is not a cryptographic signature.
 *
 * @param {unknown} recipe
 * @param {{approvedBy: string, approvedAt?: string}} evidence
 * @returns {Recipe}
 */
export function approveRecipe(recipe, evidence) {
  const current = normalizeRecipe(recipe);
  requireStatus(current, ["VALIDATED"], "APPROVED");
  assertPlainObject(evidence, "INVALID_APPROVAL", "Approval evidence must be an object");
  assertAllowedKeys(evidence, new Set(["approvedBy", "approvedAt"]), "INVALID_APPROVAL");
  if (!("approvedBy" in evidence)) fail("INVALID_APPROVAL", "approvedBy is required");
  const approvedBy = requireSafeString(evidence.approvedBy, "approvedBy", 128);
  const approvedAt = evidence.approvedAt ?? new Date().toISOString();
  requireIsoTimestamp(approvedAt);

  return deepFreeze({
    ...current,
    status: "APPROVED",
    approval: {
      recipe_hash: current.content_hash,
      approved_by: approvedBy,
      approved_at: approvedAt
    }
  });
}

/** @param {unknown} recipe @returns {Recipe} */
export function activateRecipe(recipe) {
  const current = normalizeRecipe(recipe);
  requireStatus(current, ["APPROVED"], "ACTIVE");
  validateApproval(current);
  return deepFreeze({ ...current, status: "ACTIVE" });
}

/** @param {unknown} recipe @returns {Recipe} */
export function markNeedsReview(recipe) {
  const current = normalizeRecipe(recipe);
  requireStatus(current, ["ACTIVE"], "NEEDS_REVIEW");
  return deepFreeze({ ...current, status: "NEEDS_REVIEW", approval: null });
}

/** @param {unknown} recipe @returns {Recipe} */
export function deprecateRecipe(recipe) {
  const current = normalizeRecipe(recipe);
  requireStatus(current, ["APPROVED", "ACTIVE", "NEEDS_REVIEW"], "DEPRECATED");
  return deepFreeze({ ...current, status: "DEPRECATED" });
}

/**
 * The single mandatory gate for any future runner. It returns a normalized,
 * deeply frozen copy only when the recipe is safe and executable.
 *
 * @param {unknown} recipe
 * @returns {Recipe}
 */
export function validateForExecution(recipe) {
  const current = normalizeRecipe(recipe);
  requireStatus(current, ["ACTIVE"], "execution");
  validateApproval(current);
  return current;
}

/** @param {unknown} input @returns {RecipeDefinition} */
function normalizeDefinition(input) {
  assertPlainObject(input, "INVALID_SCHEMA", "Recipe definition must be an object");
  const object = /** @type {Record<string, unknown>} */ (input);
  assertExactKeys(object, DEFINITION_KEYS, "INVALID_SCHEMA");

  if (object.schema_version !== RECIPE_SCHEMA_VERSION) {
    fail("UNSUPPORTED_SCHEMA", `schema_version must be ${RECIPE_SCHEMA_VERSION}`);
  }
  const recipeId = requireSafeString(object.recipe_id, "recipe_id", 128);
  if (!IDENTIFIER_PATTERN.test(recipeId)) {
    fail("INVALID_SCHEMA", "recipe_id must be a lowercase stable identifier");
  }
  if (!Number.isSafeInteger(object.revision) || /** @type {number} */ (object.revision) < 1) {
    fail("INVALID_SCHEMA", "revision must be a positive safe integer");
  }
  const revision = /** @type {number} */ (object.revision);
  const title = requireSafeString(object.title, "title", 160);
  const origin = normalizeExactOrigin(object.origin);
  if (!Array.isArray(object.steps) || object.steps.length < 1 || object.steps.length > 100) {
    fail("INVALID_SCHEMA", "steps must contain between 1 and 100 items");
  }
  const steps = object.steps.map((step, index) => normalizeStep(step, index, origin));
  const firstStep = steps[0];
  if (firstStep.verb !== "assert_origin" || firstStep.origin !== origin) {
    fail("MISSING_ORIGIN_ASSERTION", "The first step must assert the recipe exact origin");
  }
  if (steps.filter((step) => step.verb === "assert_origin").length !== 1) {
    fail("INVALID_ORIGIN_ASSERTION", "Exactly one assert_origin step is required");
  }

  return {
    schema_version: RECIPE_SCHEMA_VERSION,
    recipe_id: recipeId,
    revision,
    title,
    origin,
    steps
  };
}

/** @param {unknown} input @returns {Recipe} */
function normalizeRecipe(input) {
  assertPlainObject(input, "INVALID_SCHEMA", "Recipe must be an object");
  const object = /** @type {Record<string, unknown>} */ (input);
  assertExactKeys(object, RECIPE_KEYS, "INVALID_SCHEMA");
  const definition = normalizeDefinition({
    schema_version: object.schema_version,
    recipe_id: object.recipe_id,
    revision: object.revision,
    title: object.title,
    origin: object.origin,
    steps: object.steps
  });
  if (typeof object.status !== "string" || !RECIPE_STATUSES.includes(/** @type {RecipeStatus} */ (object.status))) {
    fail("INVALID_LIFECYCLE", "Recipe status is not supported");
  }
  const expectedHash = hashDefinition(definition);
  if (object.content_hash !== expectedHash) {
    fail("HASH_MISMATCH", "Recipe content does not match content_hash");
  }
  const approval = normalizeApproval(object.approval);
  if (["DRAFT", "VALIDATED", "NEEDS_REVIEW"].includes(object.status) && approval !== null) {
    fail("INVALID_APPROVAL", `${object.status} recipes must not carry approval evidence`);
  }

  return deepFreeze({
    ...definition,
    status: /** @type {RecipeStatus} */ (object.status),
    content_hash: expectedHash,
    approval
  });
}

/** @param {unknown} input @returns {RecipeApproval | null} */
function normalizeApproval(input) {
  if (input === null) return null;
  assertPlainObject(input, "INVALID_APPROVAL", "approval must be null or an object");
  const object = /** @type {Record<string, unknown>} */ (input);
  assertExactKeys(object, APPROVAL_KEYS, "INVALID_APPROVAL");
  const recipeHash = requireSafeString(object.recipe_hash, "approval.recipe_hash", 80);
  const approvedBy = requireSafeString(object.approved_by, "approval.approved_by", 128);
  const approvedAt = requireIsoTimestamp(object.approved_at);
  return {
    recipe_hash: recipeHash,
    approved_by: approvedBy,
    approved_at: approvedAt
  };
}

/** @param {Recipe} recipe */
function validateApproval(recipe) {
  const approval = recipe.approval;
  if (approval === null || typeof approval !== "object") {
    fail("MISSING_APPROVAL", "An executable recipe requires approval evidence");
  }
  const evidence = /** @type {Record<string, unknown>} */ (approval);
  if (evidence.recipe_hash !== recipe.content_hash) {
    fail("APPROVAL_HASH_MISMATCH", "Approval evidence is bound to another recipe hash");
  }
}

/**
 * @param {unknown} input
 * @param {number} index
 * @param {string} recipeOrigin
 * @returns {RecipeStep}
 */
function normalizeStep(input, index, recipeOrigin) {
  assertPlainObject(input, "INVALID_STEP", `steps[${index}] must be an object`);
  const object = /** @type {Record<string, unknown>} */ (input);
  if (typeof object.verb !== "string" || !RECIPE_VERBS.includes(/** @type {RecipeStep["verb"]} */ (object.verb))) {
    fail("FORBIDDEN_VERB", `steps[${index}] uses an unsupported verb`);
  }

  if (object.verb === "assert_origin") {
    assertExactKeys(object, new Set(["verb", "origin"]), "INVALID_STEP");
    return { verb: "assert_origin", origin: normalizeExactOrigin(object.origin) };
  }
  if (object.verb === "navigate") {
    assertExactKeys(object, new Set(["verb", "path"]), "INVALID_STEP");
    const path = requireSafeString(object.path, `steps[${index}].path`, 2048);
    if (!path.startsWith("/") || path.startsWith("//")) {
      fail("CROSS_ORIGIN_NAVIGATION", "navigate.path must be a same-origin absolute path");
    }
    const target = new URL(path, `${recipeOrigin}/`);
    if (target.origin !== recipeOrigin || target.username || target.password) {
      fail("CROSS_ORIGIN_NAVIGATION", "navigate.path must stay on the recipe origin");
    }
    return { verb: "navigate", path: `${target.pathname}${target.search}${target.hash}` };
  }
  if (object.verb === "extract_text") {
    assertExactKeys(object, new Set(["verb", "selector", "output"]), "INVALID_STEP");
    return {
      verb: "extract_text",
      selector: requireSelector(object.selector, index),
      output: requireOutput(object.output, index)
    };
  }

  assertExactKeys(object, new Set(["verb", "selector", "attribute", "output"]), "INVALID_STEP");
  const attribute = requireSafeString(object.attribute, `steps[${index}].attribute`, 80);
  if (!/^(?:title|aria-[a-z0-9-]+|data-[a-z0-9-]+)$/.test(attribute)) {
    fail("FORBIDDEN_ATTRIBUTE", "extract_attribute permits only title, aria-* and data-* attributes");
  }
  return {
    verb: "extract_attribute",
    selector: requireSelector(object.selector, index),
    attribute,
    output: requireOutput(object.output, index)
  };
}

/** @param {unknown} value @returns {string} */
function normalizeExactOrigin(value) {
  const origin = requireSafeString(value, "origin", 2048);
  if (origin.includes("*")) fail("INVALID_ORIGIN", "Wildcard origins are forbidden");
  /** @type {URL} */
  let parsed;
  try {
    parsed = new URL(origin);
  } catch {
    fail("INVALID_ORIGIN", "origin must be a valid URL origin");
  }
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) {
    fail("INVALID_ORIGIN", "origin must use HTTP(S) without embedded credentials");
  }
  if (origin !== parsed.origin) {
    fail("INVALID_ORIGIN", "origin must contain exactly scheme, host and effective port");
  }
  return parsed.origin;
}

/** @param {unknown} value @param {number} index @returns {string} */
function requireSelector(value, index) {
  const selector = requireSafeString(value, `steps[${index}].selector`, 512);
  if (selector.includes("javascript:") || selector.includes("${")) {
    fail("INVALID_SELECTOR", "Selector contains an executable expression");
  }
  return selector;
}

/** @param {unknown} value @param {number} index @returns {string} */
function requireOutput(value, index) {
  const output = requireSafeString(value, `steps[${index}].output`, 80);
  if (!OUTPUT_PATTERN.test(output)) {
    fail("INVALID_OUTPUT", "Output names must use lowercase snake_case");
  }
  return output;
}

/** @param {unknown} value @param {string} field @param {number} maximum @returns {string} */
function requireSafeString(value, field, maximum) {
  if (typeof value !== "string" || value.length < 1 || value.length > maximum || value.trim() !== value) {
    fail("INVALID_SCHEMA", `${field} must be a non-empty trimmed string up to ${maximum} characters`);
  }
  if (SECRET_PATTERN.test(value)) fail("SENSITIVE_VALUE", `${field} appears to contain a credential`);
  if (ABSOLUTE_PATH_PATTERN.test(value)) fail("ABSOLUTE_PATH", `${field} contains an absolute local path`);
  if (/\p{Cc}/u.test(value)) fail("INVALID_SCHEMA", `${field} contains control characters`);
  return value;
}

/** @param {unknown} value @returns {string} */
function requireIsoTimestamp(value) {
  const timestamp = requireSafeString(value, "approved_at", 64);
  const parsed = Date.parse(timestamp);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(timestamp) || Number.isNaN(parsed) || new Date(parsed).toISOString() !== timestamp) {
    fail("INVALID_APPROVAL", "approved_at must be a valid UTC ISO-8601 timestamp");
  }
  return timestamp;
}

/** @param {Recipe} recipe @param {RecipeStatus[]} allowed @param {string} action */
function requireStatus(recipe, allowed, action) {
  if (typeof recipe.status !== "string" || !allowed.includes(recipe.status)) {
    fail("INVALID_LIFECYCLE", `Cannot enter ${action} from ${recipe.status}`);
  }
}

/** @param {RecipeDefinition} definition */
function hashDefinition(definition) {
  return `sha256:${createHash("sha256").update(stableStringify(definition)).digest("hex")}`;
}

/** @param {unknown} value @returns {string} */
function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const object = /** @type {Record<string, unknown>} */ (value);
    return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(object[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/** @param {unknown} value @param {string} code @param {string} message */
function assertPlainObject(value, code, message) {
  if (value === null || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    fail(code, message);
  }
}

/** @param {Record<string, unknown>} value @param {Set<string>} allowed @param {string} code */
function assertExactKeys(value, allowed, code) {
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  const missing = [...allowed].filter((key) => !(key in value));
  if (unknown.length || missing.length) {
    fail(code, `Unexpected or missing fields: ${[...unknown, ...missing].join(", ")}`);
  }
}

/** @param {Record<string, unknown>} value @param {Set<string>} allowed @param {string} code */
function assertAllowedKeys(value, allowed, code) {
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length) fail(code, `Unexpected fields: ${unknown.join(", ")}`);
}

/** @template T @param {T} value @returns {T} */
function deepFreeze(value) {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const item of Object.values(value)) deepFreeze(item);
    Object.freeze(value);
  }
  return value;
}

/** @param {string} code @param {string} message @returns {never} */
function fail(code, message) {
  throw new RecipeValidationError(code, message);
}
