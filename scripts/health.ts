/**
 * Daily health check for the public demo.
 *
 *   pnpm health                 # checks the hosted deployment
 *   pnpm health <url>           # or any other instance
 *
 * Run this every day through judging. Each check is something that can fail between now and the
 * deadline without anyone noticing: a drained payer, an expired key, a facilitator outage, an
 * exhausted daily cap. Exits non-zero when the demo cannot serve a live run, so it can be wired to
 * a cron or a reminder rather than remembered.
 */
const DEFAULT_URL = "https://tollgate-web-production.up.railway.app";
const url = (process.argv[2] ?? DEFAULT_URL).replace(/\/$/, "");

interface Check { name: string; state: "pass" | "warn" | "fail"; detail: string }
interface Report { ok: boolean; status: string; checkedAt: string; checks: Check[] }

const MARK = { pass: "\x1b[32m✔\x1b[0m", warn: "\x1b[33m•\x1b[0m", fail: "\x1b[31m✘\x1b[0m" };

async function main() {
  console.log(`\n${url}\n`);

  let report: Report;
  try {
    const res = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(60_000) });
    report = (await res.json()) as Report;
  } catch (err) {
    // Unreachable is its own failure, and a different one from "reachable but unhealthy".
    console.error(`\x1b[31m✘\x1b[0m unreachable — ${(err as Error).message}\n`);
    console.error("  If curl and dig disagree, suspect a stale negative DNS cache locally:");
    console.error("  sudo dscacheutil -flushcache; sudo killall -HUP mDNSResponder\n");
    process.exitCode = 1;
    return;
  }

  for (const c of report.checks) {
    console.log(`  ${MARK[c.state]} ${c.name.padEnd(20)} ${c.detail}`);
  }

  const mode = await fetch(`${url}/api/mode`, { signal: AbortSignal.timeout(20_000) })
    .then((r) => r.json() as Promise<{ mode?: string; capacity?: { remaining: number } }>)
    .catch(() => null);

  console.log(`\n  status ${report.status}${mode?.mode ? ` · mode ${mode.mode}` : ""}`);
  console.log(`  checked ${report.checkedAt}\n`);

  if (!report.ok) {
    console.log("  A judge cannot run a live query right now. The archived runs still work.\n");
    process.exitCode = 1;
  }
}

void main();
