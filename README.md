# DSH Agent Workspace

This is a local, clean-room community project for DSH-compatible agent
extension primitives. Its first implemented module is a minimal Recipe core
with a constrained read-only grammar, deterministic content hashes, lifecycle
transitions, caller-supplied approval evidence, and one mandatory execution
validation gate.

This repository publishes source-only alpha releases. The package remains
`private: true` to prevent accidental npm publication. Future code may be
admitted only after source-ledger, privacy, licensing, and clean-room review.

This is an independent community project and is not affiliated with, endorsed
by, or sponsored by DeepSeek. “DeepSeek” and “DeepSeek Harness” remain the
respective owners' trademarks.

## Compatibility

| Component | Verified scope |
|---|---|
| Node.js | `22.23.1` |
| pnpm | `11.9.0` for development and clean installation |
| Operating system | macOS arm64 development verification |
| DeepSeek Harness | No adapter is included; this core makes no Host-version compatibility claim |

The module uses only standard Node.js APIs and has no production dependency,
but other operating systems have not yet been independently verified.

## Local checks

```sh
pnpm install --frozen-lockfile
pnpm run check
```

The supported release artifact is the GitHub source release. npm installation
and npm publication are not supported in this alpha.

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

See [THREAT_MODEL.md](THREAT_MODEL.md) for the trust boundary and requirements
that a future runner must enforce.
