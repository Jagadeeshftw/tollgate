# Tollgate — ETHOnline 2026 Build Spec

**Event:** ETHOnline 2026 (ETHGlobal, async)
**Hackathon window:** 4–16 September 2026
**Submission deadline:** Sunday 13 September 2026, 12:00 pm EDT — hard, no late entries
**Track:** Start Fresh (Classic / From Scratch)
**Team:** solo
**Partner prizes selected:** Hedera, The Graph, ENS (3 is the maximum; this is fixed)

**Project name: Tollgate.** Settled 1 September 2026 and applied across the tree before Phase 3.
No longer open.

---

## 0. READ THIS FIRST — the rules that void the entry

These are not style preferences. Breaking any one of them removes eligibility for every partner prize.

### 0.1 Build from 1 September, commit from 4 September

**Staff ruling (confirmed by ETHGlobal, Sept 2026):** project work may begin 1 September; commits begin 4 September.

**Therefore:**
- Coding starts **1 September**. Phases 0–2 can run before the event opens.
- `git init` and the first commit land on **4 September**.
- Public starter kits and open-source libraries are permitted throughout: `scaffold-hbar`, `hedera-agent-kit-js`, ENS tutorials, `substreams-evm`.

**Two conditions, both mandatory:**

**(a) The commit-history rule still binds — see §0.2.** The ruling covers *when work may start*. It does not exempt us from ETHGlobal's version-control requirement, and it has no effect at all on partners' own published criteria. Work built 1–3 September must land as a **sequence of real, meaningful commits across the 4th and 5th**, not as one dump. Never backdate.

### 0.2 Commit history is graded

Submissions with large single commits or missing history may be disqualified. 1inch restates this on their own tracks; it is enforced across the event.

- Commit continuously, small and meaningful, across all ten days.
- Never batch a day's work into one commit.
- No single-commit entries on the final day.

### 0.3 AI tool usage must be documented

AI tools are permitted. But:

- Document in the submission **where and how** AI was used — which files, which parts, which assets.
- Submissions relying entirely on AI without meaningful contribution from the team may be ineligible for partner prizes.
- Spec-driven workflows are permitted, but **all spec files, prompts and planning artifacts must be in the submission repository**. Judges are told to look for how the AI was directed, not just its output.

**Therefore:** this spec file goes in the repo at `/spec/BUILD-SPEC.md` from the first commit. Keep a `/spec/PROMPTS.md` log appended as you go. Maintain `AI-USAGE.md` at the root listing which files were AI-assisted and how.

### 0.4 Commit authorship

Commits carry Jagadeesh's name only. No AI co-author trailer, no "generated with" attribution, in commits or PRs.

---

## 1. What we are building

**One sentence:** a marketplace where AI agents discover data services by name and pay for them per call, with no signup and no API key.

### The flow

1. An agent needs onchain data.
2. It resolves a name on ENS — e.g. `uniswap-pools.tollgate.eth` — and reads the service's endpoint, price, and Hedera settlement address from the name's own resolver.
3. It calls the endpoint. The endpoint replies HTTP 402 with a price.
4. The agent pays in HBAR on Hedera via x402, settled through the Blocky402 facilitator.
5. The endpoint verifies settlement and returns the data, which it sourced live from The Graph.
6. The agent reasons over the result and answers the user's question.

### Why these three partners fit

| Layer | Partner | Role |
|---|---|---|
| Discovery | ENS | the phone book — names, prices, permissions, revocation |
| Settlement | Hedera | the till — x402 pay-per-call in HBAR |
| Goods | The Graph | the product being sold — live onchain data |

x402 appears independently in **both** Hedera's and The Graph's prize asks. One payment layer earns credit in two ecosystems. Agent-as-namespace appears in **both** ENS's and Hedera's bonus lists. The overlaps are what make this one project rather than three bolted together.

### Demo script (this is the 2–4 minute video, design toward it)

User types: *"What are the top Uniswap pools right now?"*

On-screen agent trace:
```
→ resolving uniswap-pools.tollgate.eth on ENS (Sepolia)
→ found: endpoint https://…  price $0.05  settle: 0.0.xxxxx
→ calling endpoint … HTTP 402 Payment Required
→ paying 0.05 USD in HBAR via Blocky402 … tx 0.0.xxxxx@…
→ payment verified
→ endpoint fetching live data from The Graph (Substreams + Subgraph MCP)
→ answer: …
```

---

## 2. Exactly what each partner is asking for

Build to these lists literally. Every line is a judging criterion.

### 2.1 Hedera — $15,000 total

We target two tracks. Both pay flat, no placings.

#### Track A: AI & Agentic Payments on Hedera — $6,000 (up to 3 teams × $2,000) — PRIMARY

Their framing: x402 on Hedera lacks actual services you can pay for. They want a real x402-gated service stood up, plus the platform that consumes it. Wrap an API, sell inference by the call, meter data or compute, then show an agent discovering and paying for it with no API key and no subscription in sight.

**Required:**
- [ ] Live x402-gated service on Hedera testnet or mainnet, settled through the **Blocky402 facilitator**
- [ ] A platform or agent that consumes that service and completes **at least one real paid request end to end**
- [ ] Public GitHub repo with README covering setup, architecture, and the payment flow
- [ ] Demo video ≤ 5 minutes showing the paid request executing

**Extra points (take as many as are cheap):**
- [ ] Pay-per-call metering rather than a flat per-request charge ← **we do this**
- [ ] Multi-agent negotiation/settlement via A2A or ACP
- [ ] Onchain agent identity via **ERC-8004 or HCS-14** ← **bind to the ENS subname; this double-counts with ENS**
- [ ] Agent discovery via UCP, or a directory that makes the service findable ← **this is our ENS registry, exactly**
- [ ] HTS tokens or custom fee schedules in the settlement path
- [ ] Verifiable payment audit trails on **HCS** ← **cheap, take it**
- [ ] Recurring or streamed payments using Scheduled Transactions

**Resources:** Blocky402 (`blocky402.com`), Hedera x402 blog post, `hedera-dev/x402-inference-pay-per-request-poc`, `hashgraph/hedera-agent-kit-js`, `hedera-dev/scaffold-hbar`, `x402-foundation/x402`

#### Track B: Open Source — Improve the Hedera Harness — $2,000 (up to 2 teams × $1,000) — SECONDARY

Rewards contribution over greenfield. Extend service coverage the harness handles thinly, port it to another language/runtime, fix rough edges hit in the first hour, or add a testing/local-dev mode that removes testnet round trips.

**Required:**
- [ ] Either a meaningful contribution to the Hedera Harness (an **open PR is enough — it need not be merged**) or a new harness extending or directly inspired by it
- [ ] Public repo or PR link with README/PR description explaining the problem solved and how to run it
- [ ] Demo video ≤ 5 minutes showing the improvement working

**Extra points:** new service coverage, better ergonomics, fewer lines to a working transaction; tests/docs/examples; a language the current harness doesn't cover; clear before/after developer-experience evidence.

**Why this is nearly free for us:** we will hit real friction integrating x402 on Hedera during Phase 3. Whatever we had to work around becomes the PR. Repo: `hedera-dev/hedera-harness`. **Do not invent a contribution — only file what we genuinely hit.**

### 2.2 The Graph — $15,000 total

Two tracks reachable from one project. Both are $5,000 split $2,500 / $1,500 / $1,000.

#### Track C: Best Use of Composable or Standardized Graph Products — $5,000

Use Standardized Subgraphs (one shared schema across every protocol of a type) to run a single query across many protocols, compose reusable Substreams packages into new pipelines, or layer the Subgraph MCP on top for cross-protocol analysis.

**Required:**
- [ ] Either **compose two or more Graph products**, or build meaningfully on a standardized schema (e.g. Messari Standardized Subgraphs)
- [ ] Consume **live** data from a Graph provider — Subgraph Studio for Subgraphs, The Graph Market for Substreams
- [ ] **Mocked, local-only or static datasets do not qualify.** This is a hard disqualifier.
- [ ] Make the standards leverage explicit: show what became easier because a shared schema or composed product was used
- [ ] Public repo + demo video 2–4 minutes

**Explicit non-qualifier:** simply querying one Subgraph with no composition or standardization. We must compose.

**Our composition:** Substreams (streaming pipeline) + Subgraph MCP (natural-language query layer) = two products. Plus we query a Messari Standardized Subgraph so one query pattern spans many protocols — that is the "leverage of standards" they ask us to demonstrate.

#### Track D: Best AI Tooling or AI Use Case with The Graph (From Scratch) — $5,000

Rewards either tooling that makes The Graph easier to use from AI environments (MCP servers, agent SKILLs, x402 payment tooling, A2A integrations, framework plugins) **or** agents/apps using The Graph as their live blockchain data source.

Note their own phrasing: *let your agent pay per query autonomously with x402.* Our Hedera payment layer is directly on-ask here.

**Required:**
- [ ] The Graph is **load-bearing** — either our tooling targets Graph products, or our agent uses Graph as its data source
- [ ] Live data from a Graph provider. Again: no mocks.
- [ ] **Do meaningful work with the data** — reasoning, decisions, automation, or a natural-language interface. Not printing a raw query result. This is a stated rejection criterion.
- [ ] Open source with a clear `README` or `SKILL.md` so judges can run it
- [ ] Public repo + demo video 2–4 minutes
- [ ] **Select the Start Fresh pool**, not Continuity

**Featured challenge (optional, high value):** use the Substreams SKILLs to go from a single natural-language prompt to a working, deployed Substreams pipeline. If time allows in Phase 6, demonstrate this — it is a named challenge inside a $5,000 track.

**Pool note:** this track is judged in two pools. Net-new competes only against net-new. We are net-new.

**Resources:** Subgraph MCP docs, `graphprotocol/subgraphs-skills`, `streamingfast/substreams-skills`, `streamingfast/substreams-chain-modules`, `pinax-network/substreams-evm`, Messari standard subgraph docs, Agent0/ERC-8004 subgraph docs.

### 2.3 ENS — $5,000 total

#### Track E: Best Use of ENSv2 — $4,500 — four payouts: $1,500 / $1,500 / $1,000 / $500

ENSv2 beta is live on **Sepolia only**. They are explicitly asking for early builders. Four payout slots into a likely-thin field is the best odds on the board.

They name these features:
- Hierarchical registry structure; resolve subnames off a parent's resolver with **wildcard resolution**
- Deploy **your own subname registry** to tokenize and manage subnames under your own rules
- **Enhanced Access Control (EAC)** — shared role-based permissions across registries and resolvers; delegate specific rights, e.g. letting an account edit only certain text records
- Give subnames their own **Permissioned Resolver** so they fully own their data
- Record aliasing at resolver level, or namespace aliasing via a shared registry
- Subname setups that are expiring, revocable, non-transferable vs transferable, or forever names with no parent control

**Their stated bonus:** bring AI agents into the mix — *agents as namespaces, each with their own identity and permissions.* This is precisely our product.

**Required:**
- [ ] Built on **ENSv2, Sepolia**
- [ ] ENSv2 features **central to the product, not a cosmetic add-on**
- [ ] Demo functional — **not hard-coded values**. Hard disqualifier.
- [ ] Showcase must have a video recording or live demo link (ideally both)
- [ ] Open source on GitHub

**Resources:** Permissioned Registry docs, Permissioned Resolver docs, Enhanced Access Control docs, Guide for Contract Developers, ENSIP-25 (AI agent registry ENS name verification), ENSIP-26 (agent text records), `ensdomains/ens-cli`.

**Note ENSIP-25 and ENSIP-26 specifically** — agent identity and agent text records. These are ENS's own standards for exactly what we're doing. Use them rather than inventing our own record schema.

---

## 3. Reach summary

| # | Partner | Track | Prize | Structure |
|---|---|---|---|---|
| A | Hedera | AI & Agentic Payments | $6,000 | 3 teams × $2,000, flat |
| B | Hedera | Improve the Harness | $2,000 | 2 teams × $1,000, flat |
| C | The Graph | Composable/Standardized | $5,000 | 2,500 / 1,500 / 1,000 |
| D | The Graph | AI Tooling or Use Case | $5,000 | 2,500 / 1,500 / 1,000 |
| E | ENS | Best Use of ENSv2 | $4,500 | 1,500 / 1,500 / 1,000 / 500 |

**Five chances, ~$22,500 in reach, three partner-prize slots used.**

Ledger, Privy, Chainlink and Bazantic ($18,000 combined) had no published prize details as of 1 Sept. **Re-check the prizes page on 4 September before locking the three selections** — if Privy publishes something cheap to satisfy, reconsider the mix.

---

## 4. Architecture

```
┌──────────────────────────────────────────────────────┐
│  Consumer Agent  (TypeScript, LLM-driven)            │
│  resolves → pays → consumes → reasons                │
└───────────┬──────────────────────┬───────────────────┘
            │                      │
   resolve  │                      │  HTTP + x402
            ▼                      ▼
┌───────────────────────┐   ┌──────────────────────────┐
│  ENS Registry (v2)    │   │  Tollgate Service Endpoint  │
│  Sepolia              │   │  402 gate → data         │
│                       │   │                          │
│  • subname registry   │   │  ┌────────────────────┐  │
│  • permissioned       │   │  │ Blocky402 verify   │──┼──► Hedera
│    resolver per name  │   │  └────────────────────┘  │    testnet
│  • EAC roles          │   │  ┌────────────────────┐  │    + HCS log
│  • expiry/revocation  │   │  │ Graph data layer   │──┼──► Substreams
│  • ENSIP-25/26 records│   │  │ Substreams + MCP   │  │    + Subgraph
└───────────────────────┘   │  └────────────────────┘  │      MCP
                            └──────────────────────────┘
┌──────────────────────────────────────────────────────┐
│  Registration UI — operator lists a service,          │
│  mints a subname, sets records, sets price            │
└──────────────────────────────────────────────────────┘
```

**Networks:** ENS on Sepolia, payments on Hedera testnet. These are deliberately **not coupled at transaction level** — no bridge, no cross-chain messaging. ENS is a read (the phone book), Hedera is a write (the payment). The agent reads from one and writes to the other in sequence. This must feel like one flow in the demo with no manual step between them.

**Stack:** TypeScript throughout. Solidity for the ENS registry/resolver contracts. Rust only if a Substreams module is authored (Phase 5).

**Repo layout:**
```
/spec              BUILD-SPEC.md, PROMPTS.md      ← required, see §0.3
/contracts         ENSv2 subname registry + permissioned resolver
/service           the x402-gated data service
/agent             the consumer agent
/web               registration UI + demo trace UI
/packages/graph    Substreams + Subgraph MCP data layer
AI-USAGE.md        required, see §0.3
README.md          setup, architecture, payment flow
FEEDBACK/          per-partner feedback notes, written as we go
```

---

## 5. Phase 0 — Gates and early build (1–3 September)

Under the staff ruling (§0.1), this is real build time. But **the gates still run first.** Each is a third-party dependency we cannot fix, and discovering a broken one after two days of building on it is the expensive failure. Gates 1–3 in the first day, then build.

Nothing is committed until the 4th. Keep the work in the real project tree, not a scratch directory — it is going into the repo.

The purpose is to answer five questions. Report findings as prose before writing dependent code.

### Gate 1 — Blocky402 on Hedera (CRITICAL, do first)

Carries $6,000 and defines the product's spine.

- Register with Blocky402. Read their docs and the Hedera x402 blog post.
- Clone `hedera-dev/x402-inference-pay-per-request-poc` and run it as-is.
- **Can we stand up a trivially gated endpoint and complete one real paid request on Hedera testnet through the facilitator, today?**
- Record: what worked, what the friction was, what the docs got wrong. This friction is the raw material for Hedera Track B.

**If Gate 1 fails:** the Hedera Track A leg is unbuildable. Stop and report. The project reshapes around Graph + ENS with a different third partner, and this spec is rewritten.

### Gate 2 — ENSv2 on Sepolia

- Is the ENSv2 beta actually deployed on Sepolia, and at which addresses?
- Can we deploy a subname registry under a parent name we control?
- Do we control a `.eth` name on Sepolia to be the parent? If not, acquire one now — this is account setup, not project work.
- Confirm Enhanced Access Control and Permissioned Resolver are live and usable, not docs-only. Beta means deployment can lag documentation.

**If Gate 2 fails:** ENS becomes unqualifiable ("must be built on ENSv2"). Swap to a different third partner.

### Gate 3 — The Graph live data path

- Obtain a **Subgraph Studio API key**. Obtain **The Graph Market** access for Substreams.
- Confirm a live query returns real data end to end.
- Confirm the Subgraph MCP works from the agent environment.
- Identify which **Messari Standardized Subgraph** we will use, and confirm it is live.
- Confirm the exact composition we intend satisfies "two or more products".

**If Gate 3 fails:** both Graph tracks are unqualifiable, since mocks are explicitly disqualified. This one has no workaround.

### Gate 4 — Two networks, one flow

- Confirm the agent can hold a Sepolia read path and a Hedera payment path in one process without a manual step between them.
- Confirm wallet/key handling for both is workable headlessly.

### Gate 5 — Starter kit selection

Public starter kits and open-source libraries **are explicitly permitted** and may be used from day one. Identifying and vetting them now is legitimate preparation and is worth a full day.

- Run `hedera-dev/scaffold-hbar` end to end. Decide whether we adopt it or start plainer.
- Evaluate `hashgraph/hedera-agent-kit-js` — how much of the agent does it give us for free?
- Evaluate the ENS Guide for Contract Developers scaffold and `ensdomains/ens-cli`.
- Evaluate `pinax-network/substreams-evm` and `streamingfast/substreams-chain-modules` as Substreams starting points.
- Pick the agent framework. Get an opinion on it by using it on something unrelated.

**Deliverable:** a chosen kit list with the reasoning. On the 4th we clone and go, instead of spending a day comparing.

### Getting the most out of 1–3 September

Code written now is kept, so the old throwaway framing is gone. What remains true is that the non-code preparation is worth as much as the code, and it is the part most likely to get skipped:

**Front-load the API learning inside the gates.** Gates 1–3 are where you meet Blocky402, ENSv2 and the Graph providers for the first time. Treat them as learning exercises, not box-ticking — where the sharp edges are, which calls are slow, what the error shapes look like, which docs lie. This is also the raw material for the Hedera harness PR in Phase 7, so keep the friction log from the first hour.

**Read the reference implementations properly.** `x402-inference-pay-per-request-poc` is the closest existing thing to our payment layer. Read it until you could re-derive it. Same for the ENSv2 tutorials.

**Get every account and key provisioned.** Subgraph Studio key, The Graph Market access, Blocky402 registration, Hedera testnet account funded, a Sepolia `.eth` parent name acquired, Sepolia ETH in hand. None of this is project work and all of it is a day of dead time if left to the 4th.

**Learn what you don't know yet.** If Substreams authoring is unfamiliar, spend part of 1 September on it before Phase 4 depends on it.

**Do the event admin.** Register for ETHOnline; check whether a stake is required and complete it. Join the ETHGlobal Discord and find the partner channels — `#partner-hedera`, and the Graph and ENS equivalents. Ask your integration questions there now; partner engineers answer, and the answers are knowledge you keep.

**Confirm the multi-submission question.** Ask in Discord whether a solo team may submit more than one project. The rules page states only the 3-prize cap per submission and is silent on this. If more than one is allowed, that changes strategy materially.

**Re-read the prizes page on the 4th** for Ledger, Privy, Chainlink and Bazantic before locking partner selections.

### What still is not allowed

- **Backdating commits**, or splitting the 1–3 September work across invented commit dates to simulate a history that did not happen. The ruling permits early work; it does not permit fabricated evidence, in a repo where prompt logs and spec files are also submitted for judges to read.
- **One giant first commit.** See §0.2 — this is an ETHGlobal disqualifier independent of the ruling, and partners apply their own history criteria.

### Revised timeline

| Dates | Work | Commits |
|---|---|---|
| 1 Sept | Gates 1–3, accounts and keys, starter-kit selection | none |
| 2–3 Sept | Phase 1 scaffold, Phase 2 ENS registry layer | none |
| 4 Sept | `git init`, `ELIGIBILITY.md`, land 1–3 Sept work as a real commit sequence | begin |
| 4–7 Sept | Phase 3 Hedera x402 payment layer | continuous |
| 7–9 Sept | Phase 4 Graph data layer | continuous |
| 9–10 Sept | Phase 5 consumer agent | continuous |
| 10–11 Sept | Phase 6 UI + demo surface | continuous |
| 11 Sept | Phase 7 harness PR | continuous |
| 11–12 Sept | Video, README, feedback docs, submission | continuous |
| 13 Sept, 12:00 EDT | **deadline** | — |

The three extra days buy the Substreams one-prompt challenge (Track D), a second registered service (§Phase 6), and a real video instead of a rushed one. Spend them there, not on scope.

**Phase 0 deliverable:** five gates answered pass/fail, starter-kit list chosen, all accounts and keys provisioned, and Phases 1–2 built and working locally — uncommitted.

---

## 6. Build phases (4–13 September)

Order is dependency-driven, not calendar-driven. Each phase ends in something demonstrable.

### Phase 1 — Foundations
`git init`. Repo skeleton per §4. `/spec/BUILD-SPEC.md` committed in the **first commit**. `AI-USAGE.md` stub. README skeleton. Toolchain, both networks configured, keys in env, CI running lint + build.

**Done when:** repo builds clean, both networks reachable from code, first several commits landed.

### Phase 2 — ENS registry layer
Subname registry contract on Sepolia under our parent name. Permissioned Resolver per subname. EAC roles: an operator may edit price and endpoint records but **not** the settlement address — that separation is the concrete demonstration of delegated rights ENS asks for. Expiry and revocation on subnames. Records follow **ENSIP-26** for agent text records; agent identity per **ENSIP-25**.

Record schema on each subname: `endpoint`, `price`, `settlement` (Hedera account), `capability` (what the service sells), `schema` (response shape).

**Done when:** a subname can be minted, its records read by an external resolver call, its price edited by the operator, its settlement address refused to the operator, and the name revoked.

**Guard:** no hard-coded values anywhere in the read path. ENS explicitly disqualifies hard-coded demos.

### Phase 3 — Hedera x402 payment layer
The 402 gate. Price quoted from the ENS record, not from config. Settlement through Blocky402 on Hedera testnet. Verification before data release. **Per-call metering, not flat rate.** HCS audit trail for each settled payment.

**Done when:** an unpaid request gets 402, a paid request gets 200, and the payment is visible on HashScan and logged to HCS.

**Also:** keep the friction log running. It feeds Phase 7.

### Phase 4 — The Graph data layer
Live Substreams pipeline plus Subgraph MCP layered on top — the two-product composition Track C requires. Query a Messari Standardized Subgraph so one query pattern spans multiple protocols. Live provider data only.

Write down explicitly, for the README, **what became easier because of the shared schema** — Track C asks for this in words, not just in code.

**Done when:** the service returns real live data, sourced through a composition of two Graph products, with no mock anywhere in the path.

### Phase 5 — The consumer agent
LLM-driven agent that: takes a natural-language question → resolves the right service via ENS → reads price → pays autonomously on Hedera → consumes → **reasons over the result** → answers.

The reasoning step is load-bearing for Track D, which explicitly rejects printing raw query results. The agent must decide something: which service to use, whether the price is worth paying against a budget, how to interpret conflicting data.

Give the agent its own ENS subname and identity. That satisfies ENS's agents-as-namespaces bonus and Hedera's onchain-agent-identity bonus simultaneously.

**Done when:** one typed question produces the full trace end to end, unattended.

### Phase 6 — Registration UI + demo surface
Operator flow: list a service, mint the subname, set records and price. Agent trace view for the demo — the on-screen sequence in §1.

Second service registered to prove the marketplace is a marketplace and not one hard-coded endpoint. This matters: a single service makes the ENS registry look decorative, and "cosmetic add-on" is an ENS disqualifier.

**Optional if time:** the Substreams SKILLs one-prompt deployment challenge (named inside Track D).

### Phase 7 — Hedera Harness contribution (Track B)
Take the real friction from Phases 0 and 3 and turn it into a PR against `hedera-dev/hedera-harness`. An open PR is sufficient; it does not need to be merged. Include a README/PR description stating the problem solved and how to run it. Add tests or examples alongside.

**Do not manufacture a contribution.** If nothing genuine surfaced, drop Track B rather than submit filler.

### Phase 8 — Submission
See §7.

---

## 7. Submission checklist

**Deadline: Sunday 13 September, 12:00 pm EDT. Build to be finished by the 11th.**

### Partner prize selection
- [ ] Select exactly three: **Hedera, The Graph, ENS**
- [ ] For The Graph AI track, select the **Start Fresh pool**
- [ ] Selecting a partner is the only way that partner can assess the project — do not leave a slot empty
- [ ] For each, explain how their tools were used, give feedback, add comments

### Video
- [ ] 2–4 minutes. Under 2 or over 4 is auto-rejected at upload. (Hedera's own tracks say ≤5; 2–4 satisfies both.)
- [ ] ≥ 720p or upload fails
- [ ] Not sped up to fit
- [ ] Spoken narration — **no AI voiceover / text-to-speech, no music-with-text-only**
- [ ] Not recorded on a phone
- [ ] Intro under 20 seconds; show the product working; edit out waiting
- [ ] Slides max 4 bullets each
- [ ] Shows the paid request actually executing (Hedera requirement)

### Repo
- [ ] Public, open source
- [ ] README: setup, architecture, **payment flow** (Hedera asks for this by name)
- [ ] `/spec/BUILD-SPEC.md` and `/spec/PROMPTS.md` present
- [ ] `AI-USAGE.md` present and accurate
- [ ] `SKILL.md` or clear README so judges can run it (Graph Track D)
- [ ] Commit history spans the full event, no single-commit dumps
- [ ] No hard-coded values in demo paths (ENS)
- [ ] Contracts verified where applicable
- [ ] Feedback notes per partner

### Per-track final verification
- [ ] **A:** live x402 service on Hedera via Blocky402 + ≥1 real paid request completed
- [ ] **B:** open PR to hedera-harness with description + demo of the improvement
- [ ] **C:** ≥2 Graph products composed, or standardized schema used; live data; leverage stated in words
- [ ] **D:** Graph load-bearing; live data; agent does real reasoning; Start Fresh pool selected
- [ ] **E:** ENSv2 on Sepolia; central not cosmetic; functional demo; no hard-coded values

---

## 8. Kill criteria and fallbacks

| Failure | When known | Response |
|---|---|---|
| Blocky402 unusable | Phase 0, Gate 1 | Stop. Reshape without Hedera Track A. Re-pick third partner. |
| ENSv2 not deployed / unusable | Phase 0, Gate 2 | Drop ENS, swap partner (Arc is next-best, but its prizes split evenly among all qualifiers — unknown denominator). |
| Graph live data unobtainable | Phase 0, Gate 3 | Fatal to two tracks. Mocks are explicitly disqualified — no workaround. |
| Payment layer slips past 8 Sept | Phase 3 | Ship Graph + ENS tracks only. Three chances instead of five. |
| Agent reasoning too thin | Phase 5 | Track D at risk. Deepen the decision logic; a data-printer does not qualify. |
| No genuine harness friction | Phase 7 | Drop Track B. Do not manufacture a PR. |

---

## 9. Standing instructions for the agent

- **Investigate and report before writing code.** Every phase opens with a findings report, not a commit.
- State what you verified versus what you assumed. Never present an assumption as a check.
- If a partner requirement and this spec disagree, **the partner's page wins** — flag the conflict.
- Commit continuously and in Jagadeesh's name only. No AI attribution in commits or PRs.
- Append to `/spec/PROMPTS.md` as you go. It is a submission artifact, not a scratch file.
- Run the Phase 0 gates before building anything that depends on them.
- Nothing is committed before 4 September; when commits begin, they are a real sequence, never a dump (§0.1, §0.2).