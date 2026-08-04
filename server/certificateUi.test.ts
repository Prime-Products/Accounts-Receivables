import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

/**
 * Source-level checks pinning the certificate expiry surfaces: what the user can
 * see and reach. They guard against a future edit silently dropping the reminder
 * entry points or reverting the 60/15-day vocabulary back to a 30-day window.
 */
describe("certificate expiry UI", () => {
  it("the certificates page can create, edit and run reminders", () => {
    const src = read("client/src/pages/ops/OpsCertificates.tsx");
    expect(src).toContain("New Certificate");
    expect(src).toContain("Edit Certificate");
    expect(src).toContain("Run reminders");
    expect(src).toContain("opsCertificates.create.useMutation");
    expect(src).toContain("opsCertificates.update.useMutation");
    expect(src).toContain("opsCertificates.runReminders.useMutation");
  });

  it("certificate rows are colour-coded by the shared urgency vocabulary", () => {
    const src = read("client/src/pages/ops/OpsCertificates.tsx");
    for (const urgency of ["expired", "final", "warning", "ok"]) {
      expect(src).toContain(`${urgency}:`);
    }
    expect(src).toContain("@shared/certificateExpiry");
  });

  it("equipment creation can capture the calibration certificate", () => {
    const src = read("client/src/pages/ops/OpsAssets.tsx");
    expect(src).toContain("certificateNumber");
    expect(src).toContain("certificateIssueDate");
    expect(src).toContain("certificateExpiryDate");
    expect(src).toContain("Calibration certificate");
  });

  it("the equipment table shows certificate expiry with its urgency colour", () => {
    const src = read("client/src/pages/ops/OpsAssets.tsx");
    expect(src).toContain("certUrgencyClass");
    expect(src).toContain("certificateDaysLeft");
    expect(src).toContain("No certificate");
  });

  it("the dashboard reports the 15-day final-notice window, not a 30-day one", () => {
    const src = read("client/src/pages/ops/OpsDashboard.tsx");
    expect(src).toContain("expiringCerts15");
    expect(src).not.toContain("expiringCerts30");
    expect(src).toContain("expiringCerts60");
  });
});

describe("certificate reminder scheduling", () => {
  it("exposes a cron-only /api/scheduled/ callback mounted before the SPA fallthrough", () => {
    const handler = read("server/scheduled/certificateReminders.ts");
    expect(handler).toContain("sdk.authenticateRequest");
    expect(handler).toContain("isCron");
    expect(handler).toContain("taskUid");
    expect(handler).toContain("runCertificateReminders");

    const index = read("server/_core/index.ts");
    expect(index).toContain('app.post("/api/scheduled/certificateReminders"');
    // Must be mounted before Vite/static take over the route table.
    expect(index.indexOf("/api/scheduled/certificateReminders")).toBeLessThan(
      index.indexOf("setupVite(app, server)"),
    );
  });

  it("keeps 'Certificate Expiry' as a task type so reminders can be filed", () => {
    const schema = read("drizzle/schema.ts");
    expect(schema).toContain("Certificate Expiry");
  });
});
