/**
 * Gate 4a — the SDK works from a clean install, outside the workspace.
 *
 *   pnpm gate:sdk            # discovery + quote only, spends nothing
 *   pnpm gate:sdk --pay      # adds one real paid request
 *
 * @remarks
 * A package that works in the repository that built it has proved nothing a judge cares about. The
 * failure this exists to catch is the one they would hit first: a missing dependency, an export the
 * package forgot to declare, a path that only resolves because a sibling directory happened to be
 * there. So the package is deployed to a scratch directory with its workspace dependencies resolved,
 * and driven from a script that has no relationship to this repository beyond the tarball.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PAY = process.argv.includes("--pay");
const results: { step: string; ok: boolean; detail: string }[] = [];

function record(step: string, ok: boolean, detail: string) {
  results.push({ step, ok, detail });
  console.log(`${ok ? "\x1b[32m✔\x1b[0m" : "\x1b[31m✘\x1b[0m"} ${step.padEnd(26)} ${detail}`);
}

const scratch = mkdtempSync(join(tmpdir(), "tollgate-sdk-"));

try {
  // 1 · Deploy the package with workspace dependencies resolved into it. `pnpm deploy` is the
  //     supported way to get a self-contained tree out of a workspace; `npm pack` would produce a
  //     tarball whose `workspace:*` dependencies cannot resolve anywhere.
  const pkg = join(scratch, "pkg");
  const app = join(scratch, "app");
  try {
    // `--legacy` because this workspace does not use injected dependencies; without it pnpm v10
    // refuses and emits only a `src/` directory with no `node_modules`, which would then fail at
    // import time for a reason unrelated to the package.
    execFileSync("pnpm", ["--filter", "@tollgatehq/sdk", "deploy", "--prod", "--legacy", pkg], {
      stdio: "pipe",
      encoding: "utf8",
    });
    record("deploy package", true, "workspace deps resolved into a self-contained tree");
  } catch (err) {
    record("deploy package", false, String((err as { stderr?: string }).stderr ?? err).slice(0, 160));
    throw new Error("cannot continue without a deployed package");
  }

  // Install it as a dependency of an unrelated project — the shape a third party actually gets.
  mkdirSync(app, { recursive: true });
  writeFileSync(
    join(app, "package.json"),
    JSON.stringify({ name: "consumer", private: true, type: "module", dependencies: { "@tollgatehq/sdk": `file:${pkg}` } }, null, 2),
  );
  try {
    execFileSync("npm", ["install", "--silent", "--no-audit", "--no-fund"], { cwd: app, stdio: "pipe", encoding: "utf8", timeout: 180_000 });
    record("install as a dependency", true, "npm install from a clean directory");
  } catch (err) {
    record("install as a dependency", false, String((err as { stderr?: string }).stderr ?? err).slice(0, 200));
    throw new Error("cannot continue without an installed package");
  }

  // 2 · Drive it from a consumer script that imports the package by name, as a third party would.
  const consumer = join(app, "consume.mts");
  writeFileSync(
    consumer,
    `import { Tollgate, tinybarsToHbar, ServiceNotFoundError } from "@tollgatehq/sdk";

const pay = ${PAY};
const tollgate = new Tollgate({
  budget: "0.02",
  ...(process.env.SEPOLIA_RPC_URL ? { sepoliaRpc: process.env.SEPOLIA_RPC_URL } : {}),
  ...(pay && process.env.HEDERA_OPERATOR_ID && process.env.HEDERA_OPERATOR_KEY
    ? { hedera: { accountId: process.env.HEDERA_OPERATOR_ID, privateKey: process.env.HEDERA_OPERATOR_KEY } }
    : {}),
});

const services = await tollgate.list();
console.log("LIST " + services.length + " " + services.map((s) => s.label).sort().join(","));
console.log("SCAN fromLogs=" + tollgate.lastDiscovery.fromLogs + " recovered=" + tollgate.lastDiscovery.recovered.length);

const svc = await tollgate.get("uniswap-pools");
const q = svc.quote({ limit: 3 });
console.log("QUOTE " + tinybarsToHbar(q.costBaseUnits) + " affordable=" + q.affordable + " spent=" + tollgate.budget.spent);

// The refusal is a guarantee, so prove it rather than assume it.
const tiny = new Tollgate({ budget: "0.000001" });
const t = await tiny.get("uniswap-pools");
try {
  await t.fetch({ limit: 10 });
  console.log("REFUSE none");
} catch (e) {
  console.log("REFUSE " + (e && (e as { code?: string }).code));
}

if (pay) {
  const res = await svc.fetch({ limit: 3, maxAmount: "0.01" });
  console.log("PAID " + tinybarsToHbar(res.payment.amountBaseUnits) + " tx=" + res.payment.transactionId);
}
`,
  );

  const env = { ...process.env };
  let out = "";
  try {
    out = execFileSync("npx", ["--yes", "tsx", consumer], {
      cwd: app,
      encoding: "utf8",
      env,
      timeout: 180_000,
    });
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string };
    out = e.stdout ?? "";
    record("run from clean install", false, String(e.stderr ?? err).slice(0, 200));
  }

  const line = (p: string) => out.split("\n").find((l) => l.startsWith(p))?.slice(p.length).trim() ?? "";

  const list = line("LIST");
  const count = Number(list.split(" ")[0] ?? 0);
  record("catalogue from ENS", count >= 3, count ? `${count} services: ${list.split(" ")[1]}` : "none discovered");

  record("discovery reporting", Boolean(line("SCAN")), line("SCAN") || "no scan report");

  const quote = line("QUOTE");
  record("quote without spending", quote.includes("spent=0"), quote || "no quote");

  const refusal = line("REFUSE");
  record("budget refusal", refusal === "budget_exceeded", refusal || "no refusal seen");

  if (PAY) {
    const paid = line("PAID");
    record("real paid request", paid.includes("tx=0.0."), paid || "no payment");
  } else {
    console.log("\x1b[33m•\x1b[0m payment                    skipped — re-run with --pay to spend");
  }
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length} passed, ${failed.length} failed\n`);
if (failed.length) process.exitCode = 1;
