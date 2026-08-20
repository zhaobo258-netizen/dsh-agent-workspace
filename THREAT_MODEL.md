# Recipe core threat model

Version: `0.1.0-alpha.1`

## Scope and trust boundary

The package validates serialized Recipe definitions in a single Node.js
process. Recipe input is untrusted. The application calling this package,
choosing the approver identity, and any future browser runner are trusted.

The package does not connect to a browser, execute a Recipe, store data, manage
credentials, authenticate users, or integrate with a DSH Host. It has no
network or filesystem access.

## Assets protected

- integrity of behavior-bearing Recipe fields;
- exact scheme, host, and effective port of the allowed origin;
- the constrained read-only verb set;
- binding between caller-supplied approval evidence and Recipe content;
- exclusion of obvious credentials and absolute local paths from definitions.

## Threats and controls

| Threat | Control |
|---|---|
| Serialized Recipe is modified after approval | Canonical SHA-256 content hash is recomputed by `validateForExecution()` |
| Origin confusion or wildcard authorization | Canonical `URL.origin` equality; wildcard, credentials, paths, queries, and fragments are rejected in `origin` |
| Navigation escapes the approved origin | `navigate` accepts only same-origin absolute paths and rejects protocol-relative paths |
| Recipe introduces arbitrary execution | Closed verb grammar; unknown fields and JS, shell, SQL, and write verbs are rejected |
| Recipe embeds a credential or local path | All accepted strings pass credential-pattern, control-character, and absolute-path checks |
| Stale approval survives drift review | `markNeedsReview()` clears approval and executable status |
| Nested values mutate after hashing | Accepted Recipes are copied and deeply frozen |
| Oversized definition causes excessive work | Strings, step count, and individual field sizes have fixed limits |

## Residual risks and non-goals

- Approval evidence is supplied by the caller. It is not a signature and is
  not an authentication or tamper-proof audit system.
- SHA-256 detects definition changes but does not prove who authored or
  approved a Recipe.
- A future runner can still expose page data through permitted extraction. It
  must independently enforce authorization, runtime origin, output redaction,
  rate limits, cancellation, and audit storage.
- The string checks are narrow admission controls, not general DLP, malware
  detection, or PII classification.
- Multi-user isolation, session identity, credential storage, browser policy,
  Teach mode, Replay, and DSH adapters are outside this release.

## Integration requirement

Every future execution entrypoint must call `validateForExecution()` on the
serialized Recipe immediately before execution. A runner must not add verbs or
interpret unknown fields beyond the grammar exported by this package.
