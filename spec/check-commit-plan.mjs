/**
 * Verify that the commit sequence in COMMIT-PLAN.md is actually buildable in order.
 *
 *   node spec/check-commit-plan.mjs
 *
 * A plan that claims each commit builds and passes its own tests is only worth something if that
 * has been checked. This maps every file to its commit, resolves each TypeScript import to the
 * commit that first introduces it, and fails on anything that depends on a later commit.
 *
 * It governs **first appearance**: later commits may freely amend files introduced earlier, which
 * is normal and is how the audit-trail commit wires itself into the service.
 */
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

/** Ordered exactly as COMMIT-PLAN.md. Patterns are regexes matched against repo-relative paths. */
const PLAN = [
  [1, ["^\\.gitignore$", "^\\.env\\.example$", "^README\\.md$", "^spec/BUILD-SPEC\\.md$", "^AI-USAGE\\.md$", "^ELIGIBILITY\\.md$"]],
  [2, ["^package\\.json$", "^pnpm-workspace\\.yaml$", "^tsconfig\\.base\\.json$", "^pnpm-lock\\.yaml$"]],
  [3, ["^packages/ens-config/"]],
  [4, ["^scripts/(env-check|paidRequest|gates)\\.ts$"]],
  [5, ["^spec/PHASE-0-GATES\\.md$"]],
  [6, ["^contracts/(foundry\\.toml|\\.gitignore)$", "^contracts/src/(interfaces|libraries|config)/"]],
  [7, ["^contracts/src/TollgateRegistrar\\.sol$"]],
  [8, ["^contracts/test/", "^contracts/remappings\\.txt$", "^\\.gitmodules$", "^contracts/lib/forge-std/?$"]],
  [9, ["^\\.github/"]],
  [10, ["^packages/x402-client/"]],
  [11, ["^packages/graph/"]],
  [12, ["^service/(package\\.json|tsconfig\\.json)$", "^service/src/audit\\.ts$"]],
  [13, ["^service/src/"]],
  [14, ["^service/test/(?!e2e)", "^service/vitest\\.config\\.ts$"]],
  [15, ["^packages/devnet/"]],
  [16, ["^service/test/e2e/", "^service/vitest\\.e2e\\.config\\.ts$"]],
  [17, ["^agent/(package\\.json|tsconfig\\.json)$", "^agent/src/(types|budget|policy)\\.ts$"]],
  [18, ["^agent/src/(model|reasoner)\\.ts$", "^agent/src/providers/"]],
  [19, ["^agent/src/", "^agent/test/", "^agent/vitest"]],
  // Patterns are matched in order and the first hit wins, so the narrow web/ui rules must precede
  // the broad ones. `web/src/trace-contract.ts` is deliberately pulled forward to the dashboard
  // commit: it typechecks the browser's copy of the trace union against the agent's and cannot
  // compile before `web/ui/lib/trace.ts` exists.
  [22, ["^web/src/trace-contract\\.ts$"]],
  [20, ["^web/(package\\.json|tsconfig\\.json)$", "^web/src/", "^web/public/"]],
  [21, [
    "^web/ui/(package\\.json|tsconfig\\.json|next\\.config\\.mjs|postcss\\.config\\.mjs|components\\.json)$",
    "^web/ui/app/(globals\\.css|layout\\.tsx)$",
    "^web/ui/lib/utils\\.ts$",
    "^web/ui/block/",
  ]],
  [22, [
    "^web/ui/lib/trace\\.ts$",
    "^web/ui/hooks/",
    "^web/ui/components/AppBar\\.tsx$",
    "^web/ui/components/dashboard/",
    "^web/ui/app/dashboard/",
  ]],
  [23, ["^web/ui/components/(landing|ui)/", "^web/ui/app/page\\.tsx$", "^web/ui/public/"]],
  [24, ["^Dockerfile(\\.web)?$", "^\\.dockerignore$", "^\\.railwayignore$"]],
  [25, ["^scripts/"]],
  [26, ["^deployments/"]],
  [27, ["^FEEDBACK/"]],
  [28, ["^docs/", "^spec/", "^submission/"]],
  // Work that landed after the planned sequence. The plan describes how the repository was built to
  // commit 28; everything since is ordinary development and is numbered past the end rather than
  // retrofitted into it, so the original sequence stays readable as the record it is.
  [29, ["^substreams/", "^packages/sdk/", "^scripts/gate-sdk\\.ts$"]],
];

/**
 * Files that are edited again after the commit where they first land.
 *
 * One file, one commit is the right default and catches real ordering mistakes, but it cannot
 * express a file that grows across the sequence — and `scripts/gates.ts` genuinely does. Gates 0-3
 * exist from commit 4 and are that commit's green criterion; Gate 2d checks that discovery finds
 * every listed service and cannot import the agent before the agent exists. Recording the later
 * commit keeps the check honest rather than silencing it: imports are validated against the commit
 * where they are actually introduced, and anything added beyond that still fails.
 */
const TOUCHED_LATER = { "scripts/gates.ts": 26 };

const files = execSync(
  "find . -type f -not -path '*/node_modules/*' -not -path './.git/*' " +
    "-not -path './contracts/out/*' -not -path './contracts/cache/*' -not -path './contracts/lib/*' " +
    "-not -path './web/ui/.next/*' -not -path './web/ui/out/*' -not -path './scripts/tmp/*' " +
    "-not -path '*/target/*' " +
    "-not -name 'next-env.d.ts' -not -name '*.tsbuildinfo' " +
    "-not -name '.env' -not -name '.substreams.env' -not -name '*.log' -not -name '.DS_Store'",
  { encoding: "utf8" },
).trim().split("\n").map((f) => f.replace(/^\.\//, ""));

const commitOf = (file) => {
  for (const [n, patterns] of PLAN) for (const p of patterns) if (new RegExp(p).test(file)) return n;
  return null;
};

const assigned = new Map(files.map((f) => [f, commitOf(f)]));
const unassigned = files.filter((f) => assigned.get(f) === null);

const packageCommit = {};
for (const f of files) {
  if (!/^(packages\/[^/]+|service|agent|web)\/package\.json$/.test(f)) continue;
  try {
    packageCommit[JSON.parse(readFileSync(f, "utf8")).name] = assigned.get(f);
  } catch {
    /* not our concern here */
  }
}

const problems = new Set();
for (const file of files) {
  if (!/\.tsx?$/.test(file)) continue;
  const at = TOUCHED_LATER[file] ?? assigned.get(file);
  if (at === null) continue;
  const source = readFileSync(file, "utf8");

  for (const m of source.matchAll(/from\s+"(@tollgate\/[a-z-]+)"|import\("(@tollgate\/[a-z-]+)"\)/g)) {
    const pkg = m[1] ?? m[2];
    const dep = packageCommit[pkg];
    if (dep != null && dep > at) problems.add(`${file} (commit ${at}) needs ${pkg} — lands at ${dep}`);
  }

  for (const m of source.matchAll(/from\s+"(\.[^"]+)"|import\("(\.[^"]+)"\)/g)) {
    const dir = file.replace(/\/[^/]+$/, "");
    const target = new URL((m[1] ?? m[2]).replace(/\.js$/, ".ts"), `file:///${dir}/`).pathname.slice(1);
    if (!existsSync(target)) continue;
    const dep = assigned.get(target);
    if (dep != null && dep > at) problems.add(`${file} (commit ${at}) needs ${target} — lands at ${dep}`);
  }
}

const distinct = new Set(PLAN.map(([n]) => n)).size;
console.log(`${files.length} files across ${distinct} commits`);
if (unassigned.length) {
  console.log(`\nUNASSIGNED — these would never be committed:`);
  for (const f of unassigned) console.log(`  ${f}`);
}
if (problems.size) {
  console.log(`\nORDERING VIOLATIONS:`);
  for (const p of problems) console.log(`  ✘ ${p}`);
} else {
  console.log(`\nno ordering violations — every commit's imports land at or before it`);
}
process.exitCode = problems.size || unassigned.length ? 1 : 0;
