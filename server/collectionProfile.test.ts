import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { appRouter } from "./routers";
import { getDb } from "./db";
import { groupCollectionProfile } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import { snapshotIds, cleanupSince, type IdSnapshot } from "./testCleanup";

const TEST_GROUP = "__TEST_COLLECTION_PROFILE_GROUP__";

function makeCaller() {
  return appRouter.createCaller({
    user: { id: 1, openId: "test", name: "Test User", email: "t@t.t", role: "admin" as const },
  } as any);
}

let snap: IdSnapshot;
beforeAll(async () => {
  snap = await snapshotIds();
});
afterAll(async () => {
  const dbi = await getDb();
  if (dbi) {
    await dbi.delete(groupCollectionProfile).where(eq(groupCollectionProfile.groupName, TEST_GROUP));
  }
  await cleanupSince(snap);
});

describe("collection profile", () => {
  it("set + get roundtrip", async () => {
    const caller = makeCaller();
    await caller.customers.setCollectionProfile({
      group: TEST_GROUP,
      notes: "Call Tue-Thu 10:00-13:00, ask for accounting.",
    });
    const profile = await caller.customers.getCollectionProfile({ group: TEST_GROUP });
    expect(profile).not.toBeNull();
    expect(profile!.notes).toBe("Call Tue-Thu 10:00-13:00, ask for accounting.");
    expect(typeof profile!.updatedAt).toBe("number");
  });

  it("upsert overwrites existing notes", async () => {
    const caller = makeCaller();
    await caller.customers.setCollectionProfile({ group: TEST_GROUP, notes: "Updated preference." });
    const profile = await caller.customers.getCollectionProfile({ group: TEST_GROUP });
    expect(profile!.notes).toBe("Updated preference.");
  });

  it("returns null for a group with no profile", async () => {
    const caller = makeCaller();
    const profile = await caller.customers.getCollectionProfile({ group: "__NO_SUCH_GROUP__" });
    expect(profile).toBeNull();
  });
});
