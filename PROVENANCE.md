# Provenance boundary

This repository began as an empty Git history. It contains no files copied from
any private source repository and no imported implementation from DSH or other
third-party projects.

The Recipe core was written clean-room from a public-module requirements list
owned by Zhao Bo. It is an original implementation, not a line-by-line port.
The requirements cover a constrained read-only grammar, exact-origin checks,
deterministic hashing, lifecycle transitions, and approval binding. Private
vendor adapters, fixtures, recordings, and product contracts were not used as
source material.

## OS-03A file ledger

| Path | Origin | Owner | License | Admission |
|---|---|---|---|---|
| `src/index.js` | Original clean-room public API | 赵波 | Apache-2.0 | OS-03A |
| `src/recipe-core.js` | Original clean-room implementation from behavior requirements | 赵波 | Apache-2.0 | OS-03A |
| `test/recipe-core.test.mjs` | Original synthetic tests | 赵波 | Apache-2.0 | OS-03A |
| `test/skeleton.test.mjs` | OS-02 synthetic test, revised for the OS-03A public API | 赵波 | Apache-2.0 | OS-03A |
| `THREAT_MODEL.md` | Original Recipe-only security analysis | 赵波 | Apache-2.0 | OS-G2 |
| `sbom.spdx.json` | Generated SPDX 2.3 release inventory | 赵波 | CC0-1.0 metadata | OS-G2 |

No private source file was copied or adapted into these paths. The only source
inputs were the frozen behavior and safety requirements: constrained read-only
verbs, exact-origin enforcement, deterministic definition hashing, lifecycle
transitions, approval-to-hash binding, and execution-time revalidation.

Future code admission requires a per-file origin, owner, license, and privacy
record. Until that review is complete, this repository must remain local-only
and private.
