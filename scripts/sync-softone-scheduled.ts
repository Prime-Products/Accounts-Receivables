import "dotenv/config";
import { spawn } from "node:child_process";

type ScheduleName = "financials" | "master-data";

type SyncStep = {
  name: string;
  packageScript: string;
  enabledBy: string;
};

const schedules: Record<ScheduleName, SyncStep[]> = {
  financials: [
    {
      name: "customer financials",
      packageScript: "sync:softone-customers",
      enabledBy: "SOFTONE_SQL_SYNC_ENABLED",
    },
    {
      name: "invoices",
      packageScript: "sync:softone-invoices",
      enabledBy: "SOFTONE_SQL_INVOICE_SYNC_ENABLED",
    },
    {
      name: "credit notes",
      packageScript: "sync:softone-credit-notes",
      enabledBy: "SOFTONE_SQL_CREDIT_NOTE_SYNC_ENABLED",
    },
  ],
  "master-data": [
    {
      name: "customers",
      packageScript: "sync:softone-customers",
      enabledBy: "SOFTONE_SQL_SYNC_ENABLED",
    },
    {
      name: "vessels",
      packageScript: "sync:softone-vessels",
      enabledBy: "SOFTONE_SQL_VESSEL_SYNC_ENABLED",
    },
  ],
};

function timestamp() {
  return new Date().toISOString();
}

function packageManagerCommand() {
  const execPath = process.env.npm_execpath;
  if (execPath) {
    return { command: process.execPath, args: [execPath] };
  }
  return {
    command: process.platform === "win32" ? "pnpm.cmd" : "pnpm",
    args: [],
  };
}

async function runStep(step: SyncStep) {
  const packageManager = packageManagerCommand();
  console.log(`[${timestamp()}] Starting SoftOne ${step.name} sync.`);

  const code = await new Promise<number>((resolve, reject) => {
    const child = spawn(
      packageManager.command,
      [...packageManager.args, "run", step.packageScript],
      {
        env: process.env,
        stdio: "inherit",
        windowsHide: true,
      },
    );
    child.once("error", reject);
    child.once("close", value => resolve(value ?? 1));
  });

  if (code !== 0) {
    throw new Error(`SoftOne ${step.name} sync exited with code ${code}.`);
  }
  console.log(`[${timestamp()}] Completed SoftOne ${step.name} sync.`);
}

async function main() {
  const schedule = process.argv[2] as ScheduleName | undefined;
  if (!schedule || !(schedule in schedules)) {
    throw new Error("Usage: sync-softone-scheduled.ts <financials|master-data>");
  }

  const enabledSteps = schedules[schedule].filter(
    step => process.env[step.enabledBy] === "true",
  );
  const skippedSteps = schedules[schedule].filter(
    step => process.env[step.enabledBy] !== "true",
  );

  for (const step of skippedSteps) {
    console.log(
      `[${timestamp()}] Skipping SoftOne ${step.name}: ${step.enabledBy} is not true.`,
    );
  }
  if (enabledSteps.length === 0) {
    throw new Error(`No SoftOne ${schedule} synchronization step is enabled.`);
  }

  const failures: string[] = [];
  for (const step of enabledSteps) {
    try {
      await runStep(step);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push(message);
      console.error(`[${timestamp()}] ${message}`);
    }
  }

  if (failures.length > 0) {
    throw new Error(
      `Scheduled SoftOne ${schedule} synchronization completed with ${failures.length} failure(s).`,
    );
  }
  console.log(`[${timestamp()}] Scheduled SoftOne ${schedule} synchronization completed.`);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
