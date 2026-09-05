# Phase 0 — Gate Findings

**Date run:** 1 September 2026
**Method:** live probes against production endpoints and on-chain bytecode reads. Where a
result is quoted below it was returned by the system named, not read from documentation.
Anything I could not execute is marked ASSUMED or BLOCKED rather than passed.

---

## Summary

| Gate | Subject | Verdict | Blocking? |
|---|---|---|---|
| 1 | Blocky402 x402 on Hedera | **CLOSED — settlement verified on-chain** | no |
| 2 | ENSv2 on Sepolia | **PASS (verified on-chain)** | no |
| 3 | The Graph live data path | **PASS — live query verified** | no |
| 4 | Two networks, one flow | **PASS (by construction)** | no |
| 5 | Starter kit selection | **DECIDED** | no |

No gate failed. No kill criterion in §8 is triggered. The project as specified is buildable.

Gate 1 was closed on 1 September 2026 with a real settled payment, verified against the mirror
node rather than against the resource server's own response. The reclassification history is kept
below rather than overwritten, because how a verdict moved is itself evidence.

---

## Gate 1 — Blocky402 on Hedera — CLOSED

Carries the $6,000 Track A and defines the product spine, so this was run first.

### Status

| Leg | What it proves | State |
|---|---|---|
| 1a — discovery | The facilitator is live and advertises `hedera:testnet` | **PASS** |
| 1b — credentials | Our ECDSA key controls the account we think it does, and it is funded | **PASS** |
| 1c — settlement | Unpaid request 402s, paid request 200s, transfer confirmed on-chain | **PASS** |

All three run on every `pnpm gates`. None is a cached result.

### How this verdict moved, and why that matters

This gate was recorded as **PASS** on 1 September on the strength of leg 1a alone — the facilitator
answered `/supported` and advertised `hedera:testnet`. That verdict was wrong, not factually but in
what it licensed: it let two phases of work proceed as though the payment rail were proven when all
that had been proven was that a service answered an HTTP request.

It was downgraded to **PARTIAL** the same day once the distinction was made explicit, splitting
discovery from settlement, and is now **CLOSED** on evidence of a different kind — an actual
transfer, confirmed against the mirror node.

The lesson is worth keeping: *a reachable dependency is not a working dependency.* Hedera's own
prize wording asks for a completed paid request, not an endpoint that responds, and the two were
one relabelled row apart in this document for several hours.

### Leg 1a — the facilitator answers

`GET https://api.testnet.blocky402.com/supported` returns `HTTP 200` and advertises Hedera testnet
support directly:

```json
{"x402Version":2,"scheme":"exact","network":"hedera:testnet",
 "extra":{"feePayer":"0.0.7162784"}}
```

Signers block confirms `"hedera:*": ["0.0.7162784"]` — the facilitator's fee-payer account.

**Findings that shape the build:**

- **No API key and no registration for testnet.** Blocky402's site states "Testnet MVP Ready —
  Open Access, No API Key Required", and the unauthenticated `/supported` call above confirms it.
  This removes the account-provisioning dependency the spec assumed at §5 Gate 1.
- **Facilitator base URL is `https://api.testnet.blocky402.com`.** Endpoints are `POST /verify`,
  `POST /settle`, `GET /supported`. Mainnet is *not* live ("coming soon"), so we are on testnet —
  which Hedera's own prize requirement explicitly permits ("testnet or mainnet").
- **The facilitator sponsors gas.** Hedera's exact scheme uses partially-signed transactions: the
  client signs a `TransferTransaction` leaving the fee payer unsigned, and the facilitator adds its
  signature and submits. Our agent therefore needs HBAR for the transfer amount only, not for fees.
- **Package family matters.** There are two on npm. The legacy Coinbase line (`x402`, `x402-express`,
  `x402-fetch`) is at `v1.2.0` and has **no Hedera support**. The x402-foundation line
  (`@x402/core`, `@x402/hedera`, `@x402/express`) is at `v2.24.0` and is the one carrying
  `@x402/hedera`. **We use the `@x402/*` v2 family.** Picking the wrong one is a silent dead end.

**Scheme shape (from the spec + the installed type definitions):**

```
network:  "hedera:testnet"        CAIP-2
asset:    "0.0.0"                 sentinel for native HBAR; HTS token id otherwise
amount:   tinybars                1 HBAR = 10^8 tinybar
payTo:    "0.0.xxxxx"             our settlement account, read from the ENS record
extra:    { feePayer: "0.0.7162784" }
```

### Leg 1b — the credentials are ours

`HEDERA_OPERATOR_ID` = **0.0.10315562**, ECDSA (secp256k1), funded.

The probe does not merely parse the key. It derives the public key, fetches the account from the
mirror node, and asserts the two match — because parsing proves nothing here. A raw Hedera private
key is 32 bytes on either curve, so `PrivateKey.fromStringECDSA` accepts an **ED25519** key without
complaint and derives a secp256k1 public key belonging to no account at all. Verified by feeding it
one. Since most faucets issue ED25519 by default and x402 on Hedera requires ECDSA, the comparison
against the on-chain key is the only thing standing between a wrong key type and a confusing
failure deep inside the payment flow.

No code path prints key material; failures are reported by error class name only.

### Leg 1c — money moves

A trivially gated endpoint, one payment, settled through Blocky402 on Hedera testnet.

**First settled transaction:** `0.0.7162784@1788266158.084149870`
[HashScan](https://hashscan.io/testnet/transaction/0.0.7162784@1788266158.084149870)

Confirmed on the mirror node — `result: SUCCESS`, `CRYPTOTRANSFER`, with the transfers reading
exactly as the design predicts:

```
0.0.10315562   -100000 tinybar   payer (the agent)
0.0.10319209   +100000 tinybar   payee (the service settlement account)
0.0.7162784    -267502 tinybar   facilitator, sponsoring the gas
```

That third line is the fee-payer model working: our agent needed only the 0.001 HBAR it was
spending, not a gas balance.

**Two accounts, not one.** An x402 `exact` transfer debits the payer and credits `payTo`; if they
are the same account the transfer nets to zero and the facilitator's check that `payTo` received
exactly the required amount fails. `scripts/hedera-setup.ts` therefore creates a settlement account
(`0.0.10319209`) under the same key — a genuinely separate account on the network, with no second
secret to manage and any balance still recoverable.

**Verified against the mirror node, not the response.** A 200 proves the resource server released
the goods; it does not prove the payer was debited. The gate polls the mirror node for the
transaction and asserts the payee was credited the exact amount. Polling because mirror nodes lag
consensus by a few seconds — querying immediately reports "not found" for a transaction that
succeeded, which failed the gate spuriously on its first run.

**Re-runnable.** `pnpm gates` settles a fresh payment every invocation rather than replaying a
recorded result. It costs 0.001 HBAR a run, which is the right price for not letting the project's
riskiest claim decay into an assertion about something that was true once.

### Beyond the gate: the ENS-priced paid request

Gate 1c proves the payment rail works between two accounts we control. It does **not** prove the
product works, because nothing in it touches ENS. That is a separate claim with its own test:
`service/test/e2e/paid.e2e.test.ts` forks Sepolia, deploys our registrar, lists a service through
it, and pays the resulting price.

Confirmed on-chain: **300,000 tinybar** — 3 pools x 0.001 HBAR, a figure the service was never
configured with and derived entirely from a string our registrar wrote into a resolver.
Track A's core requirement ("a platform that consumes that service and completes at least one real
paid request end to end") is met by that test, not by Gate 1c.

Still out of scope there: the parent name `tollgate.eth` is not ours, so the registry is not
attached to a real parent and public wildcard resolution is untested. Blocked pending the
`#partner-ens` answer on which ENSv2 deployment the App beta uses.

### Friction log (raw material for Track B, §Phase 7) — genuine issues hit:

1. **Blocky402's quickstart documents the client side only.** It states outright that server-side
   endpoint gating is not covered. In fact `@x402/hedera` *does* ship `./exact/server`, discoverable
   only by reading `package.json` exports in `node_modules`. A newcomer following the quickstart
   would conclude they must hand-roll the 402 gate.
2. **`GET https://api.testnet.blocky402.com/` returns 404**, so the base URL gives no signal that
   you have the right host. Only `/supported` confirms liveness.

3. **A money-denominated price is silently redenominated into USDC.** Returning a bare money
   string from a route's `price` resolves it against `DEFAULT_ASSETS` — USDC on Hedera — even when
   the listing advertises native HBAR. No warning. Full write-up in `FEEDBACK/HEDERA.md`.
4. **`fromStringECDSA` accepts an ED25519 key**, per leg 1b above.
5. **`ALIAS_ALREADY_ASSIGNED`** when creating a second account for the same key with
   `setECDSAKeyWithAlias` — the EVM alias is already held by the first account.
   `setKeyWithoutAlias` is the correct call, which is not obvious from the error.

None is yet a *harness* issue — Phase 7 requires friction in `hedera-dev/hedera-harness`
specifically. Keep logging; do not manufacture a contribution (§8).

---

## Gate 2 — ENSv2 on Sepolia — PASS

**Verified on-chain,** not from the docs table. Each address below was queried with `eth_getCode`
against Sepolia (`eth_chainId` → `0xaa36a7` = 11155111) and returned real bytecode:

| Contract | Address | Bytecode |
|---|---|---|
| ETHRegistry | `0xbdc85dd5b15d7ecb354cd7cb6f2c50b4f2c4f0e2` | ~14.7 KB |
| ETHRegistrar | `0xa88553f454b77203b0d036a05c894d555eaaa2cc` | ~7.5 KB |
| RootRegistry | `0x8115186e8f2e0b0281e86ab91f0f48ba90364354` | ~14.7 KB |
| VerifiableFactory | `0x10dc6333cdfe1fcef624c6e0a8221b91804cd7ef` | ~1.4 KB |
| UniversalResolverV2 | `0x4a1817d13e9cf196f471725176355c1234b63c70` | ~18.5 KB |
| ENSV2Resolver | `0x508cb4e4596429ca98a1bb3112d88d18f92456b5` | ~11.3 KB |
| BatchRegistrar | `0x8b16d15f3e51074d0e06f3cf4a0053f7cb92a7fb` | ~2.2 KB |

ENSv2 beta is genuinely deployed and Sepolia-only, matching the prize requirement.

**Findings that shape the build:**

- **EAC is real and role-based, exactly as the spec's §Phase 2 assumes.** Roles are bit flags —
  `ROLE_REGISTRAR = 1 << 0`, `ROLE_RENEW = 1 << 16` — granted with
  `registry.grantRootRoles(RegistryRolesLib.ROLE_REGISTRAR | ..., address(registrar))`.
  This is the mechanism for "operator may edit price and endpoint but not the settlement address."
- **Own-registry deployment path confirmed:** deploy a `UserRegistry` proxy through the
  `VerifiableFactory`, then attach it to the parent name via `setSubregistry(uint256, address)`
  on the parent registry. That is our subname registry.
- **Each owner gets their own Permissioned Resolver instance**, deployed through the same
  `VerifiableFactory`. This is what lets each subname own its records — the ENS ask at §2.3.
- **Caveat, carried into design:** ENS states the v2 contracts and interfaces are "not yet final
  and may change prior to mainnet deployment." We are building against a moving beta. Pin the
  contract commit we build against and re-verify before submission.

**Outstanding, but no longer blocking.** We do not yet control a Sepolia `.eth` parent name. The
fallback — registering the parent ourselves via `ETHRegistrar` rather than buying through the ENS
App — has been **verified end to end** (`pnpm ens:verify-fallback`): a self-registered parent with
our registry attached resolves through `UniversalResolverV2` and returns live record values. Track
E therefore no longer depends on the `#partner-ens` reply. Full write-up: `docs/ENS-FALLBACK.md`.

---

## Gate 3 — The Graph live data path — PASS pending API key

This gate has no fallback (§8: mocks are explicitly disqualified), so it was probed carefully.

**Verified live:**

- `GET https://subgraphs.mcp.thegraph.com/sse` → `HTTP 200`. The hosted Subgraph MCP server is up.
  Note the path is `/sse`; `/mcp` returns 404.
- `POST https://gateway.thegraph.com/api/subgraphs/id/<id>` → `{"errors":[{"message":"auth error:
  missing authorization header"}]}`. This is the *right* failure: the gateway and the subgraph-id
  route are live and simply want a key. A dead path would 404.
- `https://thegraph.market` → `HTTP 200`. Substreams marketplace reachable.
- Legacy `api.thegraph.com` is dead (connection timeout), as expected — the hosted service is
  long retired. Do not target it.

**Composition for Track C is sound, and The Graph has published a precedent for it.** Their own
blog documents combining Messari standardized subgraphs with an MCP server to query 90 lending
protocol deployments across 15 chains from one query pattern. That confirms the composition
qualifies. It also means we must *differentiate*: our addition is the x402 payment layer and the
ENS discovery layer, which that precedent does not have. Track C's "state what became easier
because of the shared schema" must be written in our own words about our own pipeline.

Messari standardized schemas cover Lending, CDP, **DEX**, Yield Aggregator, NFT Marketplace,
Network, Bridge, Perpetual Futures, Options and Governance. The demo question in §1 is about
Uniswap pools, so the **DEX** schema is our target.

**Key landed 1 September; Gate 3b closed.** A live query against the gateway returns real indexed
data (block 25,883,183 at time of writing), confirmed with real pool rows rather than a `_meta`
ping.

**What is still open, and is Phase 4's first task rather than a gate failure:** the subgraph now
wired into `pnpm gates` is verified *live*, but it is **not** a Messari standardized subgraph —
probing it for `dexAmmProtocols` (the Messari DEX standard's root entity) returns
`Type 'Query' has no field 'dexAmmProtocols'`. Track C needs the standardized schema specifically,
so selecting the right deployment is the first thing Phase 4 does.

Two useful findings for that search:

- The Graph's own network subgraph — `8pVKDwHniAz87CHEQsiz2wgFXGZXrbMDkrxgauVVfMJC` — is queryable
  with our key and indexes the whole registry, so subgraphs can be discovered programmatically
  rather than by hunting through the explorer.
- **Name search is unreliable; schema probing is decisive.** No subgraph on the registry has
  "Messari" in its display name. The dependable test is to ask a candidate for
  `dexAmmProtocols { id name schemaVersion }` and see whether the schema answers.

---

## Gate 4 — Two networks, one flow — PASS by construction

The spec's own framing resolves this: ENS on Sepolia is a **read**, Hedera is a **write**, and they
are never coupled at transaction level. No bridge, no cross-chain message, no shared nonce. The
agent holds two independent clients in one process:

- Sepolia read — `viem` public client, no key required for resolution.
- Hedera write — `@hiero-ledger/sdk` client via `createClientHederaSigner`, ECDSA key from env.

Both are headless and non-interactive, which is the part that actually mattered. Confirmed from the
installed `@x402/hedera` type surface: `createClientHederaSigner(accountId, PrivateKey, {network})`
takes a raw key directly, with no wallet-popup path in between.

---

## Gate 5 — Starter kit selection — DECIDED

Every repo named in the spec was checked for existence and recent activity. All are live:

| Repo | Last push | Decision |
|---|---|---|
| `x402-foundation/x402` | 2026-09-01 | **Adopt** the `@x402/*` v2 packages. Reference the Hedera scheme spec. |
| `hedera-dev/hedera-harness` | 2026-09-01 | Track B target. Actively developed — good sign for a PR landing. |
| `hashgraph/hedera-agent-kit-js` | 2026-08-26 | **Skip for the payment path.** `@x402/hedera` covers it directly with less indirection. Revisit only if HCS logging is easier through it. |
| `hedera-dev/scaffold-hbar` | 2026-08-24 | **Do not adopt wholesale.** It is a full dapp stack; we need a headless service plus an agent. Cherry-pick config only. |
| `hedera-dev/x402-inference-pay-per-request-poc` | 2026-07-15 | **Read as reference.** Closest existing analogue to our payment layer. |
| `ensdomains/contracts-v2` | 2026-09-01 | **Adopt** as the contract dependency. Very active — pin a commit. |
| `ensdomains/ens-cli` | 2026-08-25 | Useful for operator tasks. Self-described "not production-ready" — do not put it in the demo path. |
| `graphprotocol/subgraphs-skills` | 2026-08-08 | Reference for Track D. |
| `streamingfast/substreams-skills` | 2026-08-17 | Needed for the optional one-prompt Substreams challenge. |
| `pinax-network/substreams-evm` | 2026-07-09 | **Substreams starting point.** |

**Stack decision:** pnpm workspaces monorepo, TypeScript throughout. Foundry for contracts
(`forge 1.5.0` present). Express for the service, because `@x402/express` is the officially
maintained middleware and hand-rolling the 402 gate would be gratuitous risk on the highest-value
track.

**Local toolchain verified present:** node 24.11.1, pnpm 10.33.0, forge 1.5.0, cargo 1.97.1,
docker 29.1.2, gh 2.87.3. **Missing:** the `substreams` CLI (needed in Phase 4) and a configured
git identity (needed on 4 September).

---

## Conflicts between this spec and the partners' published pages

§9 says the partner's page wins where they disagree. Three deltas found on the live prizes page:

1. **Hedera has a third track the spec does not mention** — "Tokenization of Anything", up to
   3 teams x $2,000, requiring the Asset Tokenization Studio. Out of scope for our build and not
   worth distorting the project to reach.
2. **The Graph's AI Tooling track is split into two separate listed prizes**, From Scratch and
   Continuity, at $5,000 each. This confirms §2.2's pool note: as net-new we compete only against
   net-new, and we must select the **From Scratch** pool.
3. **Hedera's published requirement reads "Host a live x402-gated service on Hedera testnet or
   mainnet"** — it does not name Blocky402 on the prizes page itself. The spec's insistence on
   Blocky402 is stricter than the published requirement. No action needed: Blocky402 is the
   practical route regardless, and satisfying the stricter reading satisfies both.

**Still unpublished as of today:** Ledger, Privy and Chainlink ($5,000 each). §5 says re-check on
4 September before locking the three partner selections. That check is still outstanding, and this
is a real option worth keeping open — three partner slots are a hard cap and ours are not yet spent.

Also noted: **Uniswap Foundation** has a $5,000 track requiring a public repo and a `FEEDBACK.md`.
Our demo query is literally about Uniswap pools. We cannot select them without dropping one of our
three, and the reach summary at §3 does not justify that — but it is worth a second look on the 4th.

---

## Operator actions — only Jagadeesh can do these

None of this is project work, and all of it is dead time on the 4th if left until then (§5).

- [ ] Register for ETHOnline 2026; check whether a stake is required and complete it.
- [ ] **Subgraph Studio API key** — thegraph.com/studio, connect wallet, API Keys, Create.
      *This is the one item blocking a gate.*
- [ ] The Graph Market access for Substreams.
- [ ] Hedera testnet account, funded, with the **ECDSA** private key to hand (the scheme's
      signer path expects `PrivateKey.fromStringECDSA`).
- [ ] A Sepolia `.eth` name to act as the parent for our subname registry, plus Sepolia ETH.
- [ ] **`ANTHROPIC_API_KEY`** — the agent's four decisions are made by a model, and Track D is
      judged on whether that reasoning is substantive. Without it the agent discovers services and
      prices them, then stops. No offline fallback exists by design.
- [ ] Join the ETHGlobal Discord; find `#partner-hedera` and the Graph and ENS channels.
- [ ] Ask in Discord whether a solo team may submit more than one project (§5 — changes strategy
      materially if yes).
- [x] **Project name settled: Tollgate.** Applied across contracts, workspace, docs and spec on
      1 September, before Phase 3 — while the rename was still one contract and a config file.
- [ ] Set a git identity for commits (§0.4 — Jagadeesh's name only, no AI attribution).

Blocky402 registration is **not** on this list: testnet needs no key. That is one fewer dependency
than the spec anticipated.
