# Commit plan for 4 September

Work began 1 September under the staff ruling; commits begin on the 4th (§0.1). This plan exists
so that landing several days of work is a rehearsed sequence rather than improvised on the day.

**Status: revised after review. Not executed.**

---

## The rules this has to satisfy

| Requirement | Where it comes from | How this plan meets it |
|---|---|---|
| History spans the event, no single-commit dump | §0.2, enforced across ETHGlobal | **28 commits** in dependency order, across the 4th and 5th |
| Commits carry Jagadeesh's name alone | §0.4 | `user.name` / `user.email` set before commit 1; **no** AI co-author trailer and no "generated with" line, in commits or PR descriptions |
| Spec, AI usage and eligibility present from the first commit | §0.3 | Commit 1 carries `spec/BUILD-SPEC.md`, `AI-USAGE.md`, `ELIGIBILITY.md` |
| No secrets, ever | irreversible if breached | `.env` gitignored; full scan run over every stageable file before staging |
| Every commit builds and passes its stated checks | this plan's own standard | Verified mechanically — see "Verifying the sequence" |

**Never backdate.** Commit dates are the dates the commits are made. `spec/PROMPTS.md` records when
the underlying work actually happened, which is the honest way to represent a start date that
precedes the first commit.

---

## Precondition: the secret scan

Verified against the working tree as it stands:

- `.env` is gitignored. **Every stageable file scanned against every configured secret: zero hits.**
- Four files contain 64-hex strings that are **not** keys, each checked individually: the EAC
  `ALL_ROLES` bitmask (`0x1111…`), the canonical `namehash("eth")` (`0x93cdeb70…`), a zero
  `bytes32`, and anvil's dev key (`0xac0974be…`), which anvil prints in its own startup banner and
  which holds nothing.
- `deployments/*.json` hold account and contract **addresses only** — public by nature, and
  committed deliberately so `pnpm gates` can verify against them rather than against constants.

Re-run immediately before staging, and again before the final push.

---

## Verifying the sequence

A plan that claims per-commit greenness without checking is worse than one that claims less. The
ordering is therefore verified mechanically rather than by eye: `scripts/check-commit-plan.mjs`
maps every file to its commit, resolves each TypeScript import to the commit that first introduces
it, and fails on any file that depends on something landing later.

That check caught three real violations in the first draft, one of which was an architectural
smell rather than a sequencing mistake: `scripts/gates.ts` and `scripts/deploy-ens.ts` — production
paths — imported ENSv2 addresses from `@tollgate/devnet`, a fork-testing harness. The addresses now
live in `@tollgate/ens-config`, a package with no dependencies at all, which both the live scripts
and the test harness consume. The plan is not the reason that is better, but it is how it surfaced.

The check governs **first appearance**, and it does not model files being amended by later commits
— it reads each file as it stands at HEAD. That turned out to be a useful constraint rather than a
limitation: the first draft had the audit trail landing *after* the service that imports it, on the
assumption that "commit 13 amends `app.ts`" would paper over the gap. The checker rejected it, and
the honest fix was to order them properly. `audit.ts` depends on nothing inside the service, so it
lands first and the gate commit wires it — which is also the more sensible reading.

---

## The sequence

"Green" is what actually passes *at that commit*, not at HEAD.

### 4 September — foundations through the payment layer

| # | Commit | Contents | Green at this commit |
|---|---|---|---|
| 1 | `chore: initialise repository` | `.gitignore`, `.env.example`, README skeleton, `spec/BUILD-SPEC.md`, `AI-USAGE.md`, `ELIGIBILITY.md` | — required artifacts present from the first commit |
| 2 | `build: pnpm workspace and toolchain` | root `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, lockfile | `pnpm install` |
| 3 | `feat(ens-config): ENSv2 Sepolia deployment addresses` | `packages/ens-config/` | `typecheck` |
| 4 | `feat(gates): live dependency checks` | `scripts/env-check.ts`, `scripts/paidRequest.ts`, `scripts/gates.ts` | `pnpm gates` — Gate 0/1/2/3 run; Gate 2c reports *not deployed* rather than erroring |
| 5 | `docs: phase 0 gate findings` | `spec/PHASE-0-GATES.md` | — |
| 6 | `feat(contracts): ENSv2 interfaces and record schema` | `contracts/foundry.toml`, `src/interfaces/`, `src/libraries/`, `src/config/` | `forge build` |
| 7 | `feat(contracts): Tollgate subname registrar` | `src/TollgateRegistrar.sol` | `forge build` |
| 8 | `test(contracts): fork tests against live ENSv2` | `contracts/test/`, `remappings.txt`, forge-std submodule | `forge test` — 16 pass |
| 9 | `ci: typecheck, unit tests and contract fork tests` | `.github/workflows/ci.yml` | CI green — this is the first commit at which it can be |
| 10 | `feat(x402): Hedera payment client` | `packages/x402-client/` | `typecheck` |
| 11 | `feat(graph): standardized subgraph data layer` | `packages/graph/` incl. tests | 7 pass |
| 12 | `feat(service): HCS payment audit trail` | `service/src/audit.ts`, package config | `typecheck` |
| 13 | `feat(service): x402 gate priced from ENS records` | rest of `service/src/`, wiring the audit log and the Graph data source | `typecheck` |
| 14 | `test(service): metering, asset and ENS-price seam` | `service/test/*.test.ts`, `vitest.config.ts` | 40 pass |
| 15 | `feat(devnet): forked-Sepolia harness` | `packages/devnet/` | `typecheck` |
| 16 | `test(service): end-to-end paid request` | `service/test/e2e/`, `vitest.e2e.config.ts` | 5 pass *with credentials*; skips cleanly without |

### 5 September — agent, surface, deployment

| # | Commit | Contents | Green at this commit |
|---|---|---|---|
| 17 | `feat(agent): budget and pricing policy` | `agent/src/{types,budget,policy}.ts`, package config | `typecheck` |
| 18 | `feat(agent): model-agnostic judgment layer` | `agent/src/{model,reasoner}.ts`, `agent/src/providers/` | `typecheck` |
| 19 | `feat(agent): discovery, trace and decision loop` | `agent/src/{directory,trace,agent,index,demo}.ts`, `agent/test/` | 29 pass |
| 20 | `feat(web): trace API over the live registry` | `web/src/{server,limits,health}.ts`, `web/public/`, package config | `typecheck` |
| 21 | `build(web): next.js, tailwind and the Aceternity registry` | `web/ui/` config, `app/{layout.tsx,globals.css}`, `lib/utils.ts`, `block/` | `typecheck` |
| 22 | `feat(web): dashboard` | `web/ui/{hooks,lib/trace.ts,components/{AppBar,dashboard}}`, `app/dashboard/`, `web/src/trace-contract.ts` | `build` — exports `/dashboard` |
| 23 | `feat(web): landing page` | `web/ui/components/{landing,ui}`, `app/page.tsx`, `public/` | `build` — exports `/` and `/dashboard` |
| 24 | `chore(deploy): container images for service and web` | `Dockerfile`, `Dockerfile.web`, `.dockerignore`, `.railwayignore` | images build |
| 25 | `feat(ens): deployment, listing and setup scripts` | `scripts/{deploy-ens,list-service,verify-ens-fallback,hedera-setup,hedera-rotate-hosted,hcs-topic}.ts` | dry runs pass |
| 26 | `chore(deployments): record live Sepolia and Hedera addresses` | `deployments/*.json` | `pnpm gates` — Gates 2c and 2d verify public resolution and catalogue completeness |
| 27 | `docs(feedback): partner feedback for ENS, Hedera and The Graph` | `FEEDBACK/` | — |
| 28 | `docs: prompt log, archived traces and fallback analysis` | `docs/`, `spec/PROMPTS.md`, `spec/COMMIT-PLAN.md`, `spec/check-commit-plan.mjs` | plan checker passes |

**Commit 20 was split four ways on 3 September.** `web/` stopped being one 452-line page when the
front end was re-platformed onto Next.js and Tailwind; landing it as a single commit would have been
the dump this plan exists to prevent. The split follows the dependency order rather than the file
tree: the Express API typechecks with no front end present, the scaffold typechecks with no pages,
the dashboard builds and exports `/dashboard` before a landing page exists, and the landing page
completes the export. `web/src/trace-contract.ts` travels with the **dashboard**, not the API,
because it asserts the browser's copy of the trace union against the agent's and cannot compile
until `web/ui/lib/trace.ts` exists.

The split across two days follows the dependency order — nothing can be built on the payment layer
before it exists — rather than being padding to look busy.

---

## Decisions taken deliberately

**CI is included, at commit 9.** The spec's Phase 1 asked for it and it is cheap, but it lands
*after* the contract tests rather than early, because that is the first commit at which it can
actually be green: a CI workflow that runs `forge test` before any contracts exist is a red badge
advertising that the plan was not thought through. It runs typecheck, the unit suites, and the
contract fork tests. It deliberately does **not** run the e2e suites — those spend real HBAR and
need credentials, so they cannot run on a public PR.

**`FEEDBACK/` gets its own commit (23).** They are partner-facing artifacts that judges from three
different organisations will read; bundling them with the prompt log and archived traces made a
grab-bag of the one commit most likely to be looked at directly.

**`spec/PROMPTS.md` lands at commit 24, not commit 1.** It is a log. One that appears fully-formed
at a repository's first commit is less credible than one that accumulates, and the rule requires it
in the submission rather than in the initial commit.

**forge-std becomes a git submodule at commit 8.** It is currently a plain clone under a gitignored
`contracts/lib/`, so a fresh checkout would have no forge-std and `forge test` would fail. CI also
installs it defensively if absent — a dependency that exists only on one machine is not a
dependency.

---

## Execution — run this in order on 4 September

Nothing below has been run. `git init` waits for the 4th (§0.1) and it is 2 September.

### Step 0 · Identity and inheritance — before commit 1, not after 25

```bash
cd <repo>
git init
git config user.name  "Jagadeesh B"
git config user.email "jagadeesh26062002@gmail.com"     # local to this repo, never --global
```

Then verify, and read the output rather than assuming it:

```bash
git config user.name; git config user.email             # must be exactly the two values above
git config --get commit.template                        # must be empty
git config --get core.hooksPath                         # must be empty
git config --get commit.gpgsign                         # must be empty
```

Checked on 2 September: **nothing global is set** — no `user.name`, `user.email`,
`commit.template`, `commit.gpgsign`, `core.hooksPath` or `init.templateDir`, no `~/.gitmessage`,
no `~/.git-template`, and this directory is not inside another repository. So nothing can be
inherited. Re-check anyway; the cost is four commands and the failure is 28 commits carrying
someone else's identity.

**No AI attribution in any commit.** No `Co-Authored-By`, no "generated with". Verify after the
first commit and again at the end:

```bash
git log --format='%an <%ae>%n%(trailers)' | sort -u
```

### Step 1 · Secret scan, against the tree as it stands

Re-run rather than trusting the earlier pass — files change.

```bash
grep -nx '\.env' .gitignore                             # must match
git add -A && git status --porcelain | wc -l            # what would be committed
git ls-files -o --exclude-standard                       # untracked and not ignored
git reset                                                # unstage; this was a dry run
```

Then check every configured secret against every stageable file. The scan run on 2 September
covered 113 files and found **all eleven secrets absent**. It also surfaced two things worth
knowing, both benign and both now understood:

- `DEPLOYER_ADDRESS` appears in `README.md`, `submission/ENS.md`, `deployments/ens-sepolia.json`
  and `web/public/index.html` — it is a **public address**, published deliberately so a judge can
  verify the registration. Not a leak.
- Three 64-hex strings: the canonical `namehash("eth")`, and two copies of anvil's dev key, which
  anvil prints in its own startup banner and which holds nothing. One copy had been case-mangled
  by an earlier checksum sweep that mistook its first 40 characters for an address; hex is
  case-insensitive so it still worked, and it has been restored to match the other copy.

### Step 2 · forge-std as a submodule

`contracts/lib/` is gitignored and forge-std is currently a plain clone, so a fresh checkout would
have no forge-std and `forge test` would fail. Convert it at commit 8:

```bash
rm -rf contracts/lib/forge-std
git submodule add https://github.com/foundry-rs/forge-std contracts/lib/forge-std
forge test --root contracts        # must still be 16 passing
```

### Step 3 · The 28 commits

Follow the table above in order. After each, run that commit's stated check. The plan claims
per-commit greenness and `node spec/check-commit-plan.mjs` verifies the import ordering, but the
checks themselves are run by hand — a claim nobody executed is not evidence.

### Step 4 · The repository

Create it only once the commits exist locally, so nothing is public before it is complete:

```bash
gh repo create Jagadeeshftw/tollgate --public \
  --description "Agents discover data services by ENS name and pay per call over x402" \
  --source . --remote origin --push
```

### Step 5 · Verify what actually landed

```bash
git log --oneline | wc -l                                # 25
git log --format='%an <%ae>' | sort -u                   # one identity, no other
git log --format='%(trailers)' | grep -c .               # 0
gh repo view Jagadeeshftw/tollgate --json isPrivate      # false
```

Then re-clone into a scratch directory and confirm it builds from nothing — the working tree
hides missing files, which is exactly how the forge-std problem stayed invisible.

## After the 4th

Commits continue as the work does: the hosted deployment, the endpoint-update demo beat, the
Track B contribution, the video and the README. The history should look like a project being
built, because it is one.
