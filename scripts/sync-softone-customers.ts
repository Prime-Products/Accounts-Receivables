import "dotenv/config";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { withSoftOneSyncLock } from "../server/lib/softoneSyncLock";

const DEFAULT_IDLE_TIMEOUT_MS = 90_000;

function idleTimeoutMs() {
  const configured = Number(process.env.SOFTONE_SYNC_CHILD_IDLE_TIMEOUT_MS ?? "");
  return Number.isSafeInteger(configured) && configured >= 30_000
    ? configured
    : DEFAULT_IDLE_TIMEOUT_MS;
}

async function runWorker() {
  const workerPath = fileURLToPath(
    new URL("./sync-softone-customers-worker.ts", import.meta.url),
  );
  const timeoutMs = idleTimeoutMs();
  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, ["--import", "tsx", workerPath], {
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let timedOut = false;
    let timer: ReturnType<typeof setTimeout>;
    const refreshWatchdog = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        timedOut = true;
        child.kill("SIGKILL");
      }, timeoutMs);
    };
    child.stdout.on("data", chunk => {
      process.stdout.write(chunk);
      refreshWatchdog();
    });
    child.stderr.on("data", chunk => {
      process.stderr.write(chunk);
      refreshWatchdog();
    });
    child.once("error", error => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("close", code => {
      clearTimeout(timer);
      if (timedOut) {
        reject(
          new Error(
            `SoftOne customer worker produced no output for ${Math.round(timeoutMs / 1_000)} seconds and was terminated.`,
          ),
        );
      } else if (code === 0) {
        resolve();
      } else {
        reject(new Error(`SoftOne customer worker exited with code ${code ?? "unknown"}.`));
      }
    });
    refreshWatchdog();
  });
}

async function main() {
  const execution = await withSoftOneSyncLock(runWorker);
  if (!execution.acquired) throw new Error("SoftOne synchronization is already running.");
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : "SoftOne customer sync failed.");
  process.exitCode = 1;
});
