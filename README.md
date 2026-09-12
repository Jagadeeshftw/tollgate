# Tollgate

A marketplace where AI agents discover data services **by name** and pay for them **per call** —
no signup, no API key, no subscription.

An agent that needs on-chain data resolves an ENS name, reads the service's endpoint, price and
settlement account straight off the name's own resolver, calls the endpoint, gets an HTTP 402 back,
pays in HBAR, and receives live data sourced from The Graph. Then it reasons over the answer.

```
→ resolving uniswap-pools.tollgate.eth on ENS (Sepolia)
→ found: endpoint https://…  price $0.05  settle: 0.0.xxxxx
→ calling endpoint … HTTP 402 Payment Required
→ paying 0.05 USD in HBAR via Blocky402 … tx 0.0.xxxxx@…
→ payment verified
→ endpoint fetching live data from The Graph (Substreams + Subgraph MCP)
→ answer: …
```

> **A note on names.** The project is **Tollgate** — package scope, contracts, and everything in
> this repo. The ENS parent used by the demo is **`tollgatehq.eth`**, because `tollgate.eth` is
> *reserved* on the ENSv2 Sepolia beta: `ETHRegistry.getStatus()` returns `1` for it, with an
> expiry set and a zero owner, so it cannot be registered by anyone. That is a beta artifact, not
> another party holding the name. The ENS label differs from the project name for that reason
> alone.

## Live on Sepolia

The registry is deployed and the parent name is registered. Everything below is independently
verifiable — `pnpm gates` re-reads it all from chain through public entry points rather than
trusting anything this repo says.

| | |
|---|---|
| Parent name | [`tollgatehq.eth`](https://sepolia.etherscan.io/address/0xF6A97d82885628b68DC2AdCFaBA936578AffeF8F) — owned by the deployer |
| Subname registry | [`0x45BF1E3d…d78e`](https://sepolia.etherscan.io/address/0x45BF1E3da54d9747Eb12D260fC76C3F5dc35d78e) |
| Permissioned resolver | [`0xeb22a41C…0B0C`](https://sepolia.etherscan.io/address/0xeb22a41C9b5f979385A045faaE72E730BF9d0B0C) |
| Registrar | [`0x78155e1b…c661`](https://sepolia.etherscan.io/address/0x78155e1b4cd666244d5bdae73ad4a8c53693c661) |
| Deployer | [`0xF6A97d82…eF8F`](https://sepolia.etherscan.io/address/0xF6A97d82885628b68DC2AdCFaBA936578AffeF8F) |

Verify a listing resolves through the public resolver, with nothing from this repo involved:

```bash
NAME=uniswap-pools.tollgatehq.eth
DNS=$(python3 -c "import sys; n=sys.argv[1]; print('0x' + b''.join(bytes([len(l)]) + l.encode() for l in n.split('.')).hex() + '00')" "$NAME")
RESULT=$(cast call 0x4A1817d13E9cF196f471725176355C1234b63C70 \
  "resolve(bytes,bytes)(bytes,address)" "$DNS" \
  "$(cast calldata "text(bytes32,string)" "$(cast namehash "$NAME")" "x402:price")" \
  --rpc-url https://ethereum-sepolia-rpc.publicnode.com | head -1)
cast --abi-decode "text()(string)" "$RESULT"     # → "0.001"
```

The version previously shown here did not work: `cast --to-hex` takes a number, not raw bytes, so
it failed before reaching the chain. This one was run against live Sepolia before it was committed.

### Discovery runs on resolver recovery, not on the event log

Public Sepolia RPC endpoints return **incomplete `eth_getLogs` results without erroring** — a
different subset of matching events on different calls. As of 5 September the endpoint this project
reads returns **zero** of the registrar's three `ServiceListed` events, repeatably. `eth_call`
against the resolver is correct throughout: only historical log indexing is broken, and it fails
quietly.

So the catalogue you see is not being assembled from the event log. It is assembled by resolving
every candidate name through the **public ENS resolution path** and keeping the ones the resolver
actually backs. That is the load-bearing path today, not a fallback:

- Discovery corroborates the log scan across several endpoints on a hard deadline.
- Every candidate — from the log or not — is read from the resolver and **dropped unless the chain
  backs it**, so nothing can conjure a service that is not really listed, and a revoked one stays
  revoked.
- If **every** endpoint fails the log query, discovery treats that as zero events and rebuilds from
  resolver records rather than aborting. `eth_getLogs` and `eth_call` fail independently, and a node
  that serves state while erroring on logs should not take the catalogue down with it.
- When the log scan comes back short, the dashboard says so — a panel in the service rail reads
  `INCOMPLETE EVENT LOG` and names what it recovered. **You will probably see it.** It is the system
  reporting its dependency failing, not a fault in the catalogue; the three services are correct
  either way.

Two gates hold this honest, and both hit live systems:

| | |
|---|---|
| `Gate 2d` | fails if discovery finds fewer services than the deployment recorded |
| `Gate 2e` | proxies a node that serves `eth_call` and errors every `eth_getLogs`, and fails unless all three are still recovered |

The measured numbers — chunking at six block sizes, per-endpoint behaviour, and what each fix bought
— are in [`FEEDBACK/ENS.md`](FEEDBACK/ENS.md#5-public-rpc-endpoints-silently-return-an-incomplete-eth_getlogs-result),
reported upstream to ENS.

## The three layers

| Layer | Built on | Role |
|---|---|---|
| **Discovery** | ENS v2 (Sepolia) | the phone book — names, prices, permissions, revocation |
| **Settlement** | Hedera + x402 | the till — pay-per-call in HBAR via the Blocky402 facilitator |
| **Goods** | The Graph | the product being sold — live on-chain data |

The two networks are deliberately **not coupled at transaction level**. There is no bridge and no
cross-chain message. ENS is a read; Hedera is a write. The agent does one then the other.

## Status

Phases 2 and 3 complete. A price written into an ENS record by our registrar is read back off
chain, metered, quoted as an HTTP 402, paid in HBAR through Blocky402, recorded on HCS, and
answered with data — verified end to end against real infrastructure.

Dependency gates — see [`spec/PHASE-0-GATES.md`](spec/PHASE-0-GATES.md):

```
✔ Gate 1a Blocky402      hedera:testnet live, feePayer 0.0.7162784
✔ Gate 1b Hedera keys    0.0.10315562 controlled, funded
✔ Gate 1c Settlement     402->200, 100000 tinybar settled and confirmed on-chain
✔ Gate 2  ENSv2 Sepolia  6 contracts carry bytecode
✔ Gate 3a Subgraph MCP   HTTP 200
• Gate 3b Graph query    blocked on GRAPH_API_KEY
```

**Payment settles.** First confirmed transaction:
[`0.0.7162784@1788266158.084149870`](https://hashscan.io/testnet/transaction/0.0.7162784@1788266158.084149870)
— 0.001 HBAR from the agent to the service, with Blocky402 sponsoring the gas.

`pnpm gates` settles a *fresh* payment on every run and verifies it against the mirror node, so
this claim cannot decay into something that was true once.

> **On the test settlement account.** `pnpm hedera:setup` creates the receiving account under the
> *same key* as the payer. That is a local convenience so a single provisioned account can play
> both sides of a transfer — an x402 `exact` transfer that debits and credits one account nets to
> zero and fails the facilitator's amount check, so proving settlement needs two.
>
> **It is not the model, and it is not what the product claims.** In the real shape the payer is
> the agent's own account and the settlement account belongs to the service operator, who is a
> different party entirely. The operator's inability to *redirect* payment is enforced on the ENS
> side — the settlement record is written at listing time and not delegated to the operator, so
> they can reprice but cannot change who is paid (`test_operatorCannotMoveSettlementAccount`).
> One key holding both sides of the local test transfer says nothing about that guarantee; it just
> means we did not provision two testnet accounts to demonstrate a transfer.

Re-run them yourself at any time:

```bash
pnpm gates
```

## Setup

**Requires** node ≥ 22, pnpm, and [Foundry](https://getfoundry.sh) for the contracts.

```bash
pnpm install
cp .env.example .env      # then fill it in — see the comments in that file
pnpm gates                # confirm the live dependencies are reachable
```

The one credential you cannot proceed without is a **Subgraph Studio API key**
(thegraph.com/studio → API Keys → Create). Mocked data is disqualifying for this project's
purposes, so there is deliberately no offline fallback.

Blocky402's testnet facilitator needs **no API key** — open access, confirmed 1 September 2026.

## Repository layout

```
spec/          the build specification and prompt log directing this project
contracts/     ENSv2 subname registry + permissioned resolver (Foundry)
service/       the x402-gated data service
agent/         the consumer agent
web/           registration UI + agent trace view
packages/graph Substreams + Subgraph MCP data layer
scripts/       gates.ts — re-runnable dependency checks
FEEDBACK/      per-partner feedback notes
```

## Architecture

Four pieces, and the seams between them are where the design lives.

```
  ┌──────────────────────────────────────────────────────────────────────┐
  │  agent/                                                              │
  │                                                                      │
  │   policy  ──────────────────────►  judgment                          │
  │   arithmetic, deterministic        a model, via @tollgate/x402-client│
  │   • what is affordable             • which service                   │
  │   • what each plan costs           • how many units                  │
  │   • hard budget ceiling            • is it worth paying              │
  │                                    • is the answer good enough       │
  └───────────┬──────────────────────────────────────┬───────────────────┘
              │ resolve (read)                       │ HTTP + x402 (write)
              ▼                                      ▼
  ┌───────────────────────────┐        ┌─────────────────────────────────┐
  │  ENS v2 · Sepolia         │        │  service/  — the x402 gate      │
  │  tollgatehq.eth           │        │                                 │
  │  • UserRegistry           │◄───────┤  price/settlement read from ENS │
  │  • PermissionedResolver   │ quote  │  ├─ Blocky402 → Hedera testnet  │
  │  • per-key EAC delegation │        │  ├─ HCS audit topic 0.0.10319381│
  │  • TollgateRegistrar      │        │  └─ packages/graph → The Graph  │
  └───────────────────────────┘        └─────────────────────────────────┘
```

**The two networks are never coupled at transaction level.** There is no bridge and no cross-chain
message. ENS is a read and Hedera is a write; the agent does one, then the other, in the same
process. That is the whole integration, and it is deliberately boring — a bridge would be a much
larger surface to defend for no benefit the product needs.

### The seams, and why each one is where it is

**Price lives on the name, not in the service.** The 402 quotes a figure it read from
`x402:price` on the ENS record at request time — `DynamicPrice` and `DynamicPayTo` take the
request context, so nothing about pricing is server configuration. If the price lived in the
service, the ENS record would be advertising rather than a commitment: an operator could publish
one number and charge another.

**Policy runs before judgment, and the ordering is a test, not a convention.** The affordable plan
set is computed deterministically — every service crossed with every size, priced, filtered by
budget — and it is the only menu the model is shown. `Budget` is arithmetic and cannot be argued
with. So the model decides what something is *worth*; policy decides what is *permitted*. Neither
can be talked past the other, and `agent/test/agent.test.ts` asserts the ordering directly.

**The provider sits below the judgment boundary, not at it.** `StructuredModel` takes a prompt and
a schema and returns typed output; one `ModelReasoner` owns every prompt and every schema. A
provider swap therefore *cannot* change what the agent is asked or what `unanswerable` means —
that guarantee is structural rather than maintained by discipline, and it is asserted by feeding
identical output through both adapters and comparing.

**The data source has no fallback, by design.** Mocked or static data is an explicit disqualifier
on both Graph tracks, so `service/` fails loudly when it cannot reach The Graph rather than
serving something plausible. There is no offline mode to leave switched on by accident.

**Contracts are fork-tested, not mock-tested.** The claim that an operator cannot move the
settlement account is a claim about *ENS's* access control, not ours. Asserting it against a mock
resolver would only prove our mock behaves as we assumed, so the suite forks Sepolia and runs
against the deployed ENSv2 beta — and asserts the exact `EACUnauthorizedAccountRoles` error,
resource and role bitmap rather than accepting any revert.

### Package map

| Package | What it is | Depends on |
|---|---|---|
| `contracts/` | `TollgateRegistrar` — mints a listing as a subname and delegates per-key rights | ENSv2 (fork-tested) |
| `packages/ens-config` | ENSv2 Sepolia addresses. **Zero dependencies** | — |
| `packages/x402-client` | The paying half of x402 on Hedera | `@x402/hedera` |
| `packages/graph` | Messari standardized subgraphs, and the plausibility filter | — |
| `packages/devnet` | Forked-Sepolia harness for tests. **Test-only** | `ens-config` |
| `service/` | The x402 gate, priced from ENS, audited to HCS | `graph` |
| `agent/` | Policy, judgment, discovery, trace | `x402-client` |
| `web/` | Trace view. Replay-only when hosted | `agent`, `service` |

`ens-config` exists as its own package because the deploy script — production code that sends real
transactions — was importing ENSv2 addresses from `devnet`, a fork-testing harness. That was
backwards, and a mechanical check of the commit ordering is what surfaced it.

## Payment flow

Every figure in the challenge below is resolved from the service's ENS name at request time. None
of it is server configuration — that is what makes the published record binding rather than
advertising.

```
GET /s/uniswap-pools?limit=50
      │
      ├─ resolve uniswap-pools.tollgate.eth        (Sepolia, PermissionedResolver)
      │    x402:price      0.001    per unit
      │    x402:unit       pool
      │    x402:settlement 0.0.7326075
      │    x402:asset      0.0.0     (native HBAR)
      │
      ├─ meter: 50 pools x 0.001 HBAR = 0.05 HBAR = 5,000,000 tinybar
      │
      ▼
HTTP 402  PAYMENT-REQUIRED:
  { "scheme": "exact", "network": "hedera:testnet",
    "asset": "0.0.0", "amount": "5000000",
    "payTo": "0.0.7326075",
    "extra": { "feePayer": "0.0.7162784" } }   <- facilitator sponsors gas
```

**Metered, not flat.** `?limit=1` is quoted at 100,000 tinybar; `?limit=50` at 5,000,000. The unit
is published on the name, so an agent can read what it is being charged *per* before committing.

`GET /s/<label>/quote` returns the same terms without the 402, so an agent can price a call for
free before deciding whether it is worth making.

**Every settled payment is recorded on HCS.** The trail is consensus-timestamped, publicly
readable and not ours to revise — a service that takes the money and keeps the only record of
having taken it is asking to be trusted twice. Topic
[`0.0.10319381`](https://hashscan.io/testnet/topic/0.0.10319381):

```json
{"v":1,"at":"2026-09-01T12:54:38.597Z","service":"uniswap-pools","units":2,"unit":"pool",
 "amount":"200000","asset":"0.0.0","payTo":"0.0.10319209","payer":"0.0.10315562",
 "transactionId":"0.0.7162784@1788267272.387054562"}
```

Recording is best-effort and never blocks the response: the payment has already settled by then, so
failing the request over an audit write would turn a logging outage into a customer who paid and
got nothing.

## What the standardized schema actually bought us

Open `packages/graph/`. It is four files, and **none of them contains per-protocol code.** There is
no Uniswap adapter, no Curve adapter, no `if (protocol === …)`. That absence is the argument, and
it is checkable in about thirty seconds.

What is there instead is one query, in `gateway.ts`:

```graphql
query Pools($first: Int!) {
  _meta { block { number } }
  dexAmmProtocols { name slug schemaVersion }
  liquidityPools(first: $first, orderBy: totalValueLockedUSD, orderDirection: desc) {
    id name totalValueLockedUSD cumulativeVolumeUSD
    inputTokens { symbol }
  }
}
```

That exact string is sent, unmodified, to three protocols whose AMM designs have nothing in common:

| Protocol | Design | Messari schema | Answers the query |
|---|---|---|---|
| Curve Finance | stableswap invariant | 1.3.0 | yes |
| Uniswap V3 | concentrated liquidity | 4.0.0 | yes |
| SushiSwap | constant product | 1.3.2 | yes |

Three different mechanisms for pricing a swap, three independent subgraph codebases, one field
selection. Adding a protocol is an entry in a map from service label to subgraph id — the query
does not change, and no code is written to accommodate it.

**The leverage, stated plainly:** the `dex-pools` service exists *only because* the query written
for Uniswap already worked against Curve and SushiSwap. Cross-protocol ranking is then a sort,
because the shared schema already agrees on field names and units. Without standardization that
service is three adapters and a normalisation layer, and each new protocol is more of both.

**The honest limit.** These deployments sit on schema versions 1.3.0 through 4.0.1. Standardized
means the core entities and field names agree — `dexAmmProtocols`, `liquidityPools`,
`totalValueLockedUSD`, `inputTokens` — not that every field exists everywhere. Our queries stay
inside the intersection deliberately. That is still a large win over three bespoke schemas, but it
is not a single frozen contract and claiming otherwise would overstate it.

### Finding them was the hard part

Worth recording because it is the one place the standardized route is genuinely difficult, and it
is written up for The Graph in `FEEDBACK/GRAPH.md`.

**Searching the registry by name returns nothing.** No subgraph on the network advertises the
schema standard it implements — querying the network subgraph for `displayName_contains: "messari"`
gives an empty set, and no metadata field records a schema standard, so there is nothing to filter
on.

**Schema probing is the reliable method.** A subgraph's schema cannot lie about what it implements,
so ask it directly:

```graphql
{ dexAmmProtocols { id name schemaVersion totalValueLockedUSD } }
```

A standardized subgraph answers. A bespoke one returns `Type 'Query' has no field
'dexAmmProtocols'`. Combined with the network subgraph for enumeration and a `_meta.block` check
for liveness, that is a discovery loop needing no prior knowledge — which is how the three ids in
`subgraphs.ts` were found and qualified. Of twelve candidates on Ethereum and Arbitrum, ten were
live; the ids in documentation were mostly stale.

### One thing the live data forced

Ranking by `totalValueLockedUSD` — the schema's own natural ordering — surfaces garbage. At the
time of writing, `WETH/YES` reports **$94.5B locked against $513K of lifetime volume**, while the
genuine top pool, `USDC/WETH`, reports $108M against **$605B**. Tokens with unusual decimals
produce TVL figures wrong by orders of magnitude, and they sort straight to the top.

The filter is internal to the data rather than an opinion about which tokens matter: a pool cannot
plausibly hold far more value than has ever traded through it. Pools whose TVL exceeds ten times
their lifetime volume are **excluded from the ranking and returned in full**, with their own
figures and the reason, so a caller can see exactly what was removed and disagree. Nothing is
rewritten. Real pools sit orders of magnitude the other side of that line, so the threshold is not
delicate — `packages/graph/test/plausibility.test.ts` pins it with the real observed figures.

## The agent

The agent is given a budget and a question, not a list of endpoints. It discovers what exists by
reading the registrar's events, reads each service's terms off its ENS name, and then makes four
decisions it could reasonably resolve either way:

| Decision | Why it is a decision |
|---|---|
| **Which service?** | Two services can answer a pool question — one narrow and cheap, one broad at 3x the price. Which is right depends on what was asked. |
| **How much to buy?** | `?limit=` is a cost/quality dial with a price attached. |
| **Is it worth paying?** | The agent sets its own ceiling — what *this answer* is worth — and compares it to the quote. Sometimes the answer is no. |
| **Is this good enough?** | Sparse data may justify a second purchase, or an honest "I cannot answer this well". |

Every one is emitted to the trace with its reasoning, because a decision nobody can see is
indistinguishable from a hardcoded branch.

Two guards sit outside the model's reach. `Budget` is arithmetic and cannot be argued with, and
the affordable-plan set is computed *before* the model is consulted, so a plan the budget cannot
cover is never on the menu to be talked into. The model decides what a thing is **worth**; the
policy decides what is **permitted**.

### Watching it decide

```bash
pnpm --filter @tollgate/web dev      # then open http://127.0.0.1:8500
```

The trace view shows the **reasoning** narrative rather than the step narrative. A trace reading
*resolve → pay → fetch* would describe a router; what it actually shows is:

- the decision space — every service crossed with every size, priced, with the options the budget
  removed **before the model was consulted**, and the arithmetic that removed them
- which service was chosen, and why this one rather than the other
- the ceiling the agent set for itself, and why there
- how much it bought, against the question asked
- whether the answer held up — including the decline, said plainly

Every line is attributed. `arithmetic` lines could not have come out differently; `model decided`
lines could have. That separation is the design's whole claim, so it is on screen rather than in
the architecture diagram.

There is also a headless version:

```bash
pnpm --filter @tollgate/agent demo "what are the top uniswap pools right now?"
```

That spins a forked Sepolia, lists both services through the real registrar, starts the service,
and hands the agent 0.05 HBAR. Needs `ANTHROPIC_API_KEY` — there is deliberately no offline
fallback, because a hardcoded decision policy presented as reasoning would be worse than an honest
failure.

## Running the tests

```bash
pnpm gates                      # live dependency checks, settles a real 0.001 HBAR payment
pnpm --filter @tollgate/service test      # unit + integration, no credentials needed
pnpm --filter @tollgate/service test:e2e  # full paid path — forks Sepolia, spends real HBAR
forge test --root contracts     # ENS registry layer, forked against real ENSv2 on Sepolia
pnpm --filter @tollgate/agent test        # decision policy + loop guard rails, no credentials
pnpm --filter @tollgate/agent test:e2e    # live agent — real model, real HBAR
```

The end-to-end suite forks Sepolia with anvil, deploys the registrar, lists a service, and pays for
it on Hedera testnet. It is separate from the unit suite because it spends money and should be a
deliberate choice. It skips rather than fails without credentials.

## AI usage

See [`AI-USAGE.md`](AI-USAGE.md). This project is spec-driven; the directing specification and the
full prompt log are in [`spec/`](spec/).

## License

MIT
