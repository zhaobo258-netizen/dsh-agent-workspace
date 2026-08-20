# Contributing

Issues and focused pull requests are welcome after the public alpha release.
Run `pnpm install --frozen-lockfile` and `pnpm run check` before submitting a
change.

Any future contribution must be original or have documented redistribution
rights, contain no secrets or customer/vendor data, and use explicitly
synthetic fixtures. Do not add code copied from private repositories, browser
profiles, recordings, or service integrations without a documented review.

Changes to the Recipe grammar or lifecycle must include positive and negative
tests, update the threat model when the trust boundary changes, and preserve
the single `validateForExecution()` gate.
