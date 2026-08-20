# Third-party notices

No third-party source code or production dependency is incorporated into the
distributed Recipe core.

The development-only toolchain is not redistributed in the package tarball:

| Direct development dependency | Version | Declared license |
|---|---:|---|
| `@types/node` | `22.20.1` | MIT |
| `eslint` | `9.39.1` | MIT |
| `typescript` | `5.9.3` | Apache-2.0 |

The locked transitive development tree was scanned with
`pnpm licenses list --json`. Observed license families were MIT, Apache-2.0,
Python-2.0, BSD-2-Clause, BSD-3-Clause, and ISC. `pnpm-lock.yaml` is the exact
dependency inventory. The release SBOM intentionally lists only the package
itself because `pnpm licenses list --prod --json` reported no production
packages and the tarball contains no dependency source.
