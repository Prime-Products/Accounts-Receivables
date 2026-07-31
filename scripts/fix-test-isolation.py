#!/usr/bin/env python3
"""Codemod: make vitest suites operate on ISOLATED fixture customers.

Replaces the dangerous patterns
    const customers = await db.listCustomers();
    const cust = customers[0];                       (or .find(...))
with
    const cust = await getFixtureCustomer();
where getFixtureCustomer() creates one shared fixture customer per test file
(unique group name) and cleanupTestCustomer() removes it in afterAll.
"""
import re, sys, pathlib

FILES = [
    "server/calls.logCall.test.ts",
    "server/confirmationStatus.test.ts",
    "server/followUpActions.test.ts",
    "server/followUpCleanup.test.ts",
    "server/groupForecast.test.ts",
    "server/monthRollover.test.ts",
    "server/taskCollaboration.test.ts",
    "server/taskReschedule.test.ts",
    "server/team.test.ts",
    "server/watchStatusActivity.test.ts",
]

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

changed = {}
for f in FILES:
    p = pathlib.Path(f)
    src = p.read_text()
    orig = src

    # Pattern A: const customers = await db.listCustomers();\n ... const X = customers[0];
    src = re.sub(
        r"const customers = await db\.listCustomers\(\);\n(\s*)const (\w+) = customers\[0\];",
        r"const \2 = await getFixtureCustomer();",
        src,
    )
    # Pattern B: find with customerGroup filter
    src = re.sub(
        r"const customers = await db\.listCustomers\(\);\n(\s*)const (\w+) = customers\.find\(c => \(c\.customerGroup \?\? \"\"\)\.trim\(\)\);",
        r"const \2 = await getFixtureCustomer();",
        src,
    )
    # Pattern C: monthRollover groupOf variant
    src = re.sub(
        r"const customers = await db\.listCustomers\(\);\n(\s*)const firstGroup = customers\[0\] \? groupOf\(customers\[0\]\) : \"\";",
        r"const __c = await getFixtureCustomer();\n\1const firstGroup = groupOf(__c);",
        src,
    )
    # Pattern D: calls.logCall target
    src = re.sub(
        r"const customers = await db\.listCustomers\(\);\n(\s*)const target = customers\[0\];",
        r"const target = await getFixtureCustomer();",
        src,
    )

    if src != orig:
        # inject helper after the last import line
        m = list(re.finditer(r"^import .*?;$", src, re.M))
        if m:
            pos = m[-1].end()
            src = src[:pos] + "\n" + HELPER + src[pos:]
        p.write_text(src)
        changed[f] = orig.count("listCustomers()") - src.count("listCustomers()")

for f, n in changed.items():
    print(f"{f}: replaced {n} usages")
leftover = 0
for f in FILES:
    c = pathlib.Path(f).read_text().count("listCustomers()")
    if c:
        print(f"LEFTOVER {f}: {c}")
        leftover += c
print("leftover total:", leftover)
