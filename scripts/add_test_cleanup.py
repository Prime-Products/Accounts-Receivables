import re

files_to_patch = [
    "server/callListContacted.test.ts",
    "server/confirmationTaskLink.test.ts",
    "server/followUpContact.test.ts",
    "server/groupForecast.test.ts",
    "server/monthRollover.test.ts",
    "server/promiseConfirmationSync.test.ts",
    "server/tasksCreate.test.ts",
    "server/watchStatusActivity.test.ts",
]

hook = """  let __snap: IdSnapshot;
  beforeAll(async () => {
    __snap = await snapshotIds();
  });
  afterAll(async () => {
    await cleanupSince(__snap);
  });
"""

for path in files_to_patch:
    with open(path) as f:
        src = f.read()
    if "snapshotIds" in src:
        print(f"skip (already has): {path}")
        continue
    m = re.search(r'import \{ ([^}]*) \} from "vitest";', src)
    if m:
        names = set(n.strip() for n in m.group(1).split(","))
        names.update(["beforeAll", "afterAll"])
        order = ["describe", "it", "expect", "beforeAll", "afterAll", "beforeEach", "afterEach"]
        sorted_names = [n for n in order if n in names] + sorted(n for n in names if n not in order)
        src = src.replace(m.group(0), f'import {{ {", ".join(sorted_names)} }} from "vitest";')
    lines = src.split("\n")
    for i, ln in enumerate(lines):
        if 'from "vitest"' in ln:
            lines.insert(i + 1, 'import { snapshotIds, cleanupSince, type IdSnapshot } from "./testCleanup";')
            break
    src = "\n".join(lines)
    # match: describe("name", () => {   (arrow function body opening)
    dm = re.search(r'describe\(\s*"[^"]*"\s*,\s*(?:async\s*)?\(\)\s*=>\s*\{', src)
    if not dm:
        print(f"NO DESCRIBE FOUND: {path}")
        continue
    insert_pos = dm.end()
    src = src[:insert_pos] + "\n" + hook + src[insert_pos:]
    with open(path, "w") as f:
        f.write(src)
    print(f"patched: {path}")
