#!/usr/bin/env python3
"""Inject the fixture helper into test files that call getFixtureCustomer but lack it."""
import re, pathlib

HELPER = """
// --- isolated fixture customer (post-incident: never touch real customers) ---
import { createTestCustomer, cleanupTestCustomer, type TestCustomerFixture } from "./testFixtures";
let __fx: TestCustomerFixture | null = null;
async function getFixtureCustomer() {
  if (!__fx) __fx = await createTestCustomer();
  return { id: __fx.id, name: __fx.name, customerGroup: __fx.group };
}
afterAll(async () => {
  if (__fx) await cleanupTestCustomer(__fx);
});
"""

for f in pathlib.Path("server").glob("*.test.ts"):
    src = f.read_text()
    if "getFixtureCustomer" in src and "createTestCustomer" not in src:
        m = list(re.finditer(r"^import .*?;$", src, re.M))
        pos = m[-1].end()
        src = src[:pos] + "\n" + HELPER + src[pos:]
        f.write_text(src)
        print("injected:", f)
