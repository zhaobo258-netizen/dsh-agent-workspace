# DSH Agent Workspace

This is a local, clean-room community project for DSH-compatible agent
extension primitives. Its first implemented module is a minimal Recipe core
with a constrained read-only grammar, deterministic content hashes, lifecycle
transitions, caller-supplied approval evidence, and one mandatory execution
validation gate.

The package remains `private: true` and has no configured remote. It is not yet
published. Future code may be admitted only after source-ledger, privacy,
licensing, and clean-room review.

This is an independent community project and is not affiliated with, endorsed
by, or sponsored by DeepSeek. “DeepSeek” and “DeepSeek Harness” remain the
respective owners' trademarks.

## Local checks

```sh
pnpm install --frozen-lockfile
pnpm run check
```

## Current scope

The public Recipe grammar permits only:

- one exact-origin assertion as the first step;
- same-origin navigation by path;
- text extraction;
- extraction of `title`, `aria-*`, and `data-*` attributes.

It does not execute recipes, record browser sessions, store credentials, or
provide a tamper-proof audit system. Teach mode, arbitrary code, shell, SQL,
write actions, wildcard origins, vendor recipes, and real fixtures are outside
this package.

```js
import {
  activateRecipe,
  approveRecipe,
  createRecipe,
  markValidated,
  validateForExecution
} from "@zhaobo/dsh-agent-workspace";

const draft = createRecipe({
  schema_version: "1",
  recipe_id: "synthetic.sales-summary",
  revision: 1,
  title: "Synthetic sales summary",
  origin: "https://sales.example.test",
  steps: [
    { verb: "assert_origin", origin: "https://sales.example.test" },
    { verb: "navigate", path: "/reports/daily" },
    { verb: "extract_text", selector: "[data-field='net-sales']", output: "net_sales" }
  ]
});

const validated = markValidated(draft);
const approved = approveRecipe(validated, {
  approvedBy: "maintainer-1",
  approvedAt: "2026-08-20T00:00:00.000Z"
});
const executable = validateForExecution(activateRecipe(approved));
```
