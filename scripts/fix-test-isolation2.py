#!/usr/bin/env python3
"""Second pass: fix remaining real-customer selections in tests."""
import re, pathlib

def sub(f, pattern, repl, flags=0):
    p = pathlib.Path(f)
    src = p.read_text()
    new = re.sub(pattern, repl, src, flags=flags)
    if new != src:
        p.write_text(new)
        return True
    return False

changes = []

# confirmationStatus.test.ts — expect-length variant (x2)
if sub("server/confirmationStatus.test.ts",
       r"const customers = await db\.listCustomers\(\);\n(\s*)expect\(customers\.length\)\.toBeGreaterThan\(0\);\n\1const cust = customers\[0\];",
       r"const cust = await getFixtureCustomer();"):
    changes.append("confirmationStatus expect-variant")

# team.test.ts — expect-length variant
if sub("server/team.test.ts",
       r"const customers = await db\.listCustomers\(\);\n(\s*)expect\(customers\.length\)\.toBeGreaterThan\(0\);\n\1const cust = customers\[0\];",
       r"const cust = await getFixtureCustomer();"):
    changes.append("team expect-variant")

# watchStatusActivity.test.ts:110 — expect-length variant
if sub("server/watchStatusActivity.test.ts",
       r"const customers = await db\.listCustomers\(\);\n(\s*)expect\(customers\.length\)\.toBeGreaterThan\(0\);\n\1const cust = customers\[0\];",
       r"const cust = await getFixtureCustomer();"):
    changes.append("watchStatus expect-variant")

# groupForecast.test.ts — if-length-return variant
if sub("server/groupForecast.test.ts",
       r"const customers = await db\.listCustomers\(\);\n(\s*)if \(customers\.length === 0\) return;\n\1const cust = customers\[0\];",
       r"const cust = await getFixtureCustomer();"):
    changes.append("groupForecast if-variant")

# taskReschedule.test.ts — two createTask usages
if sub("server/taskReschedule.test.ts",
       r"const customers = await db\.listCustomers\(\);\n(\s*)if \(customers\.length === 0\) return;( // empty DB — nothing to verify)?",
       r"const __fxc = await getFixtureCustomer();\n\1const customers = [__fxc];"):
    changes.append("taskReschedule")

# taskCollaboration.test.ts:46 — if-length-return then createTask
if sub("server/taskCollaboration.test.ts",
       r"const customers = await db\.listCustomers\(\);\n(\s*)if \(customers\.length === 0\) return;\n",
       r"const __fxc = await getFixtureCustomer();\n\1const customers = [__fxc];\n"):
    changes.append("taskCollaboration:46")

# monthRollover.test.ts — firstGroup variants use real groups only to pick a DIFFERENT group; replace base with fixture
if sub("server/monthRollover.test.ts",
       r"const customers = await db\.listCustomers\(\);\n(\s*)const groupOf = \(c: \{ customerGroup: string \| null; name: string \}\) => \(c\.customerGroup \?\? \"\"\)\.trim\(\) \|\| c\.name;\n\1const firstGroup = customers\[0\] \? groupOf\(customers\[0\]\) : \"\";",
       r"const __fxc = await getFixtureCustomer();\n\1const customers = [__fxc];\n\1const groupOf = (c: { customerGroup: string | null; name: string }) => (c.customerGroup ?? \"\").trim() || c.name;\n\1const firstGroup = groupOf(__fxc);"):
    changes.append("monthRollover firstGroup")

print("changed:", changes)
for f in ["server/confirmationStatus.test.ts","server/followUpActions.test.ts","server/groupForecast.test.ts","server/monthRollover.test.ts","server/taskCollaboration.test.ts","server/taskReschedule.test.ts","server/team.test.ts","server/watchStatusActivity.test.ts"]:
    c = pathlib.Path(f).read_text().count("listCustomers()")
    if c: print("LEFTOVER", f, c)
