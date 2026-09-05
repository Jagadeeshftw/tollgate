# The Graph — submission answers

Tracks entered: **Best Use of Composable or Standardized Graph Products** and **Best AI Tooling or
AI Use Case (From Scratch pool)**.

---

## How we used The Graph

**The Graph is what the agent buys.** It is not a lookup on the side — it is the product being sold
per call, and the whole business model is a wrapper around it.

### Standardized subgraphs — the leverage, and how to check it

Open `packages/graph/`. It is four files, and **none of them contains per-protocol code.** No
Uniswap adapter, no Curve adapter, no `if (protocol === …)`. That absence is the argument and it
takes about thirty seconds to verify.

What is there instead is one query, in `gateway.ts`, sent unmodified to three protocols whose AMM
designs have nothing in common:

| Protocol | Design | Messari schema |
|---|---|---|
| Curve Finance | stableswap invariant | 1.3.0 |
| Uniswap V3 | concentrated liquidity | 4.0.0 |
| SushiSwap | constant product | 1.3.2 |

Three different mechanisms for pricing a swap, three independent subgraph codebases, one field
selection — `dexAmmProtocols`, `liquidityPools`, `totalValueLockedUSD`, `inputTokens`.

**The leverage, stated plainly:** our `dex-pools` service — pools ranked across every indexed DEX —
exists *only because* the query written for Uniswap already worked against Curve and SushiSwap.
Cross-protocol ranking is then a sort, because the shared schema already agrees on field names and
units. Without standardization that service is three adapters plus a normalisation layer, and every
new protocol is more of both. Adding one here is an entry in a map from service label to subgraph
id; the query does not change.

**The honest limit.** These deployments sit on schema versions 1.3.0 through 4.0.1. Standardized
means the core entities and field names agree, not that every field exists everywhere, so our
queries stay inside the intersection deliberately. Still a large win over three bespoke schemas —
but not a single frozen contract, and we would rather say so.

**All data is live** from the decentralized network via the gateway. There is deliberately **no
fallback**: the service fails loudly when it cannot reach The Graph rather than serving something
plausible. There is no offline mode to leave switched on by accident.

### AI use case — an agent that reasons over the data

The agent takes a natural-language question and makes four decisions it could reasonably resolve
either way: which service, how much to buy, whether the price is justified, and whether what came
back is good enough. Each is emitted to a trace with its reasoning.

**The reasoning is real, and here is the evidence rather than the claim.** Asked something the
marketplace cannot answer well, with budget untouched and six affordable options on the table, the
agent buys nothing — three runs, three declines, zero spent:

> "that is worth only a trivial amount to me and should be obtained from a live weather API or a
> web search, not from on-chain DEX data. Spending HBAR on these datasets would be wasteful."

And in an archived run against an earlier build whose data source was a placeholder, it bought the
data, read it, saw it was marked placeholder, and **refused to answer on it** rather than
producing a confident-looking ranking. Both traces are in `docs/traces/` and replayable in the
interface.

The structural reason this is not a router: the affordable plan set — every service crossed with
every size, priced, filtered by budget — is computed **deterministically before the model is
consulted**, and it is the only menu the model sees. The budget is arithmetic and cannot be argued
with. The model decides what something is *worth*; policy decides what is *permitted*. The trace
labels every line as one or the other.

### Verify it yourself

- **Live service:** `https://tollgate-service-production.up.railway.app/s/uniswap-pools/quote?limit=5`
- **Trace view:** `https://tollgate-web-production.up.railway.app`
- **`pnpm gates`** runs a live gateway query on every invocation.

---

## Feedback

Full detail in `FEEDBACK/GRAPH.md`.

**1. Standardized subgraphs are effectively undiscoverable by name — the one that cost us most.**
The Composable/Standardized track recommends building on standardized schemas, so we went looking.
Querying the network subgraph for `displayName_contains_nocase: "messari"` returns an **empty
set** — no subgraph advertises the standard it implements, and no metadata field records one, so
there is nothing to filter on. Documentation references them by protocol but not by the id you
need, and several ids that do surface are no longer queryable.

The method that works is **schema probing**: a subgraph's schema cannot lie about what it
implements, so ask it directly for `dexAmmProtocols`. A standardized subgraph answers; a bespoke
one returns `Type 'Query' has no field 'dexAmmProtocols'`. Combined with the network subgraph for
enumeration and `_meta.block` for liveness, that is a discovery loop needing no prior knowledge —
and it is how we found and qualified the three ids we use. Of twelve candidates, ten were live.

*Suggestions, in order of how much they would have helped:* add a schema-standard field to subgraph
metadata; publish a maintained index of live standardized deployments with current indexing status;
document the schema-probe technique, which is the reliable method and is not written down anywhere
we could find.

**2. Stale ids are indistinguishable from wrong ones.** `subgraph not found` covers "never existed",
"not signalled", and "superseded" alike, so there is no signal about whether to keep looking or fix
the id you have.

**3. Data quality in standardized deployments.** Ranking by `totalValueLockedUSD` — the schema's own
natural ordering — surfaces garbage. `WETH/YES` reports **$94.5B locked against $513K of lifetime
volume**; the genuine top pool, `USDC/WETH`, reports $108M against **$605B**. Tokens with unusual
decimals produce TVL wrong by orders of magnitude and sort straight to the top, which makes the
obvious query actively misleading. We filter on an internal-consistency test — a pool cannot hold
far more value than has ever traded through it — and return every excluded row with its figures
rather than hiding the filter. But a builder taking the natural ordering at face value gets a
plausible-looking, wrong answer.

## Comments

The gateway's failure modes are honest in a way we came to appreciate: an unauthenticated request
returns `auth error: missing authorization header` rather than a 404, which let us verify the route
was correct *before* we had a key and gate the whole Graph dependency on day one. The network
subgraph turned out to be the most useful endpoint we touched — being able to query the registry
itself is what made discovery tractable at all once name search failed.
