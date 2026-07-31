import "dotenv/config";
import { openSoftOneSqlPool } from "../server/lib/softoneSql";

let input = "";
process.stdin.setEncoding("utf8");
for await (const chunk of process.stdin) input += chunk;

let pool: Awaited<ReturnType<typeof openSoftOneSqlPool>> | null = null;
try {
  const payload = JSON.parse(input) as { query?: unknown };
  if (typeof payload.query !== "string" || !payload.query.trim()) {
    throw new Error("SoftOne query worker received no query.");
  }
  pool = await openSoftOneSqlPool();
  const result = await pool.request().query<Record<string, unknown>>(payload.query);
  process.stdout.write(JSON.stringify({ recordset: result.recordset }));
  await Promise.race([
    pool.close().catch(() => undefined),
    new Promise<void>(resolve => setTimeout(resolve, 2_000)),
  ]);
  process.exit(0);
} catch (error) {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code?: unknown }).code ?? "")
      : "";
  process.stderr.write(JSON.stringify({
    message: error instanceof Error ? error.message : String(error),
    code,
  }));
  await pool?.close().catch(() => undefined);
  process.exit(1);
}
