/**
 * Gate 4b — the exact tarball `npm publish` would upload works for a stranger.
 *
 *   pnpm gate:sdk-pack           # build, pack, install, list, quote, prove the refusal
 *   pnpm gate:sdk-pack --pay     # plus one real paid request
 *
 * @remarks
 * Gate 4a proves the SDK's source works outside the workspace. This proves the *published artifact*
 * does: the bundled JavaScript, the generated types, and the dependency list a stranger's `npm i`
 * actually resolves. It fails if the package would install a model client, reference an unpublished
 * workspace package, or ship without its types or licence — each of which would break on install or
 * contradict the package's own claim, and none of which the source-level gate can see.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PAY = process.argv.includes("--pay");
let failed = 0;
const check = (name: string, ok: boolean, detail: string) => {
  if (!ok) failed++;
  console.log(`${ok ? "\x1b[32m✔\x1b[0m" : "\x1b[31m✘\x1b[0m"} ${name.padEnd(30)} ${detail}`);
};
const run = (cmd: string, args: string[], cwd?: string) =>
  execFileSync(cmd, args, { cwd, encoding: "utf8", stdio: "pipe", timeout: 300_000, env: process.env });

const scratch = mkdtempSync(join(tmpdir(), "tollgate-pack-"));
try {
  run("pnpm", ["--filter", "@tollgatehq/sdk", "build"]);
  run("pnpm", ["--filter", "@tollgatehq/sdk", "pack", "--pack-destination", scratch]);
  const tgz = readdirSync(scratch).find((f) => f.endsWith(".tgz"));
  if (!tgz) throw new Error("pack produced no tarball");
  const files = run("tar", ["tzf", join(scratch, tgz)]).split("\n").filter(Boolean).map((f) => f.replace(/^package\//, ""));
  for (const f of ["dist/index.js", "dist/index.d.ts", "LICENSE", "README.md", "package.json"]) {
    check(`ships ${f}`, files.includes(f), files.includes(f) ? "" : "missing from the tarball");
  }

  run("tar", ["xzf", join(scratch, tgz), "-C", scratch, "package/package.json"]);
  const pkg = JSON.parse(readFileSync(join(scratch, "package", "package.json"), "utf8"));
  const deps = Object.keys(pkg.dependencies ?? {});
  check("entry points at the build", JSON.stringify(pkg.exports ?? {}).includes("./dist/index.js"), JSON.stringify(pkg.exports?.["."] ?? {}));
  check("no workspace: ranges", !JSON.stringify(pkg).includes("workspace:"), "");
  check("no private @tollgate/* deps", !deps.some((d) => d.startsWith("@tollgate/")), deps.join(", "));
  check("no model client in deps", !deps.some((d) => d === "openai" || d.startsWith("@anthropic-ai/")), deps.join(", "));

  const app = join(scratch, "app");
  run("mkdir", ["-p", app]);
  writeFileSync(join(app, "package.json"), JSON.stringify({ name: "stranger", private: true, type: "module" }));
  run("npm", ["install", "--no-audit", "--no-fund", "--silent", join(scratch, tgz)], app);
  const nm = (p: string) => existsSync(join(app, "node_modules", p));
  check("installs from a clean project", nm("@tollgatehq/sdk"), "");
  check("installs no model client", !nm("openai") && !nm("@anthropic-ai"), nm("openai") || nm("@anthropic-ai") ? "a model SDK was installed" : "");

  writeFileSync(join(app, "smoke.mjs"), `
import { Tollgate, tinybarsToHbar } from "@tollgatehq/sdk";
const tg = new Tollgate({ budget: "0.02", ...(${PAY} ? { hedera: { accountId: process.env.HEDERA_OPERATOR_ID, privateKey: process.env.HEDERA_OPERATOR_KEY } } : {}) });
const s = await tg.list();
console.log("LIST " + s.length + " " + s.map((x) => x.label).sort().join(","));
const svc = await tg.get("uniswap-pools");
console.log("QUOTE " + tinybarsToHbar(svc.quote({ limit: 3 }).costBaseUnits) + " spent=" + tg.budget.spent);
try { await (await new Tollgate({ budget: "0.000001" }).get("uniswap-pools")).fetch({ limit: 10 }); console.log("REFUSE none"); }
catch (e) { console.log("REFUSE " + e.code); }
if (${PAY}) { const r = await svc.fetch({ limit: 3, maxAmount: "0.01" }); console.log("PAID " + r.payment.transactionId); }
`);
  const out = run("node", ["smoke.mjs"], app);
  const line = (p: string) => out.split("\n").find((l) => l.startsWith(p))?.slice(p.length).trim() ?? "";
  check("catalogue from ENS", Number(line("LIST").split(" ")[0]) >= 3, line("LIST"));
  check("quote spends nothing", line("QUOTE").endsWith("spent=0"), line("QUOTE"));
  check("budget refusal is typed", line("REFUSE") === "budget_exceeded", line("REFUSE"));
  if (PAY) check("real paid request", line("PAID").startsWith("0.0."), line("PAID"));
} catch (err) {
  failed++;
  const e = err as { stderr?: string; message?: string };
  console.log(`\x1b[31m✘\x1b[0m ${"aborted".padEnd(30)} ${(e.stderr || e.message || "").trim().split("\n").slice(-2).join(" ").slice(0, 160)}`);
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
console.log(`\n${failed ? `${failed} failed` : "all passed"}\n`);
if (failed) process.exitCode = 1;
