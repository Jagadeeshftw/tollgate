/**
 * Every code sample the docs show is either executed here or explicitly marked as not executable.
 *
 *   pnpm gate:docs
 *
 * @remarks
 * A sample that looks verified and is not is worse than no sample. So each file under
 * `docs/samples/` must declare itself on its first comment line: `@executable` samples are run and
 * must exit zero; `@illustrative` samples — ones that send transactions or need a funded wallet — are
 * never run, and the gate only asserts the label is present. A sample with neither fails the gate,
 * so nothing can quietly drift into the docs looking tested.
 */
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = "docs/samples";
const files: string[] = [];
(function walk(dir: string) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p);
    else files.push(p);
  }
})(ROOT);

let failed = 0;
for (const file of files.sort()) {
  const head = readFileSync(file, "utf8").split("\n").slice(0, 3).join("\n");
  const executable = head.includes("@executable");
  const illustrative = head.includes("@illustrative");
  if (executable === illustrative) {
    console.log(`\x1b[31m✘\x1b[0m ${file.padEnd(46)} must declare exactly one of @executable / @illustrative`);
    failed++;
    continue;
  }
  if (illustrative) {
    console.log(`\x1b[33m•\x1b[0m ${file.padEnd(46)} illustrative — marked, not run`);
    continue;
  }
  try {
    const out = execFileSync("bash", [file], { encoding: "utf8", timeout: 90_000, env: process.env });
    // Exit zero is not enough: a sample that prints nothing proved nothing. An earlier version of
    // resolve-listing.sh "passed" this way — a trailing `|| true` swallowed a decode that had never
    // been given its input.
    const last = out.trim().split("\n").slice(-1)[0] ?? "";
    if (!last) throw Object.assign(new Error("exited zero but printed nothing"), { stderr: "exited zero but printed nothing" });
    console.log(`\x1b[32m✔\x1b[0m ${file.padEnd(46)} ${last.slice(0, 70)}`);
  } catch (err) {
    const e = err as { stderr?: string; message?: string };
    console.log(`\x1b[31m✘\x1b[0m ${file.padEnd(46)} ${(e.stderr ?? e.message ?? "").trim().split("\n")[0]?.slice(0, 80)}`);
    failed++;
  }
}
console.log(`\n${files.length - failed} ok, ${failed} failed`);
if (failed) process.exitCode = 1;
