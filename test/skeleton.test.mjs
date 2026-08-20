// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import test from "node:test";

test("the public entrypoint contains no product or vendor namespace", async () => {
  const publicApi = await import("../src/index.js");
  assert.ok("validateForExecution" in publicApi);
  assert.equal(Object.keys(publicApi).some((name) => /pindian|zhoupu/i.test(name)), false);
});
