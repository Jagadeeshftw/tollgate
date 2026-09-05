# @tollgatehq/sdk

Discover data services by **ENS name** and pay for them **per call** over x402 on Hedera.

No signup, no API key, no subscription. Your agent reads a marketplace off the chain, prices it,
and buys what it decides is worth buying.

```ts
import { Tollgate } from "@tollgatehq/sdk";

const tollgate = new Tollgate({
  hedera: { accountId: "0.0.12345", privateKey: process.env.HEDERA_KEY! },
  budget: "0.02",                                  // hard ceiling, arithmetic, not advice
});

const svc = await tollgate.get("uniswap-pools");
const quote = svc.quote({ limit: 10 });            // never spends, never calls the service
if (!quote.affordable) return;

const res = await svc.fetch({ limit: 10, maxAmount: "0.015" });
res.data;                    // the response body, verbatim
res.payment.hashscanUrl;     // proof the transfer happened
```

## The one design decision worth knowing

**The SDK owns arithmetic. You own judgment.**

Pricing, affordability and budget enforcement live in here and are deterministic. *Which* service to
buy from, and whether an answer was worth paying for, stay with you.

So this package **never calls a model and takes no model credentials.** That is what makes it usable
by an agent that reasons nothing like ours — and it is why `quote()` tells you a cost and an
`affordable` boolean rather than a recommendation.

## Install

```bash
npm i @tollgatehq/sdk
```

Three environment variables get you to a paid request:

| | |
|---|---|
| `HEDERA_OPERATOR_ID` | the account you pay from, e.g. `0.0.12345` |
| `HEDERA_OPERATOR_KEY` | **ECDSA (secp256k1)**. An ED25519 key parses and then signs for no account |
| `SEPOLIA_RPC_URL` | optional; defaults to a public endpoint — see *Discovery* below |

A runnable end-to-end script is in [`examples/paid-request.ts`](examples/paid-request.ts).

## API

### `new Tollgate(options)`

| Option | Meaning |
|---|---|
| `hedera` | account to pay from. Omit to discover and quote without a wallet |
| `budget` | total spend across the instance's lifetime, decimal HBAR |
| `parent` · `registrar` · `resolver` · `deployBlock` | override the deployment; defaults are the live Sepolia one |
| `knownLabels` | labels to resolve even when the event log misses them — see *Discovery* |
| `corroborateWith` | extra RPCs to cross-check discovery against; `[]` disables |

`tollgate.list()` · `tollgate.get(label)` · `tollgate.priceAll(units)` · `tollgate.budget` ·
`tollgate.lastDiscovery`

### `ServiceHandle`

- **`quote({ limit })`** — cost, unit price and affordability from the ENS records alone. **No
  request to the service and nothing spent.**
- **`challenge({ limit })`** — the server's *live* 402, without paying it. Should agree with
  `quote()`; a divergence means the operator repriced, and the server's number is what you'll be
  charged.
- **`fetch({ limit, maxAmount })`** — buys it. Two independent ceilings: `maxAmount` is what *this
  call* will pay, checked against the server's quote **before anything is signed**; the instance
  budget is what *every call together* may spend, and is checked first — a purchase that would
  breach it never contacts the service.

## Errors are typed, because you have to tell them apart

Every error carries a stable `code` and extends `TollgateError`.

| `code` | Meaning | Money moved? |
|---|---|---|
| `catalogue_unavailable` | ENS could not be read | no |
| `service_not_found` | no live listing — never listed, revoked, or expired | no |
| `budget_exceeded` | would breach the instance budget | no |
| `no_payer` | `fetch()` without a configured wallet | no |
| `over_quote` | server asked above `maxAmount` | no — refused before signing |
| `unpriceable_service` | records cannot be turned into a price | no |
| `settlement_failed` | signed and submitted; server still would not serve | **unknown** |

That last row is the honest one. **x402 has no settlement receipt a client can rely on**: the
transfer may have reached consensus while the response was lost, and a client cannot distinguish
that from a payment that never landed. `SettlementFailedError.paid` is this SDK's best inference,
not a protocol guarantee — reconcile against the chain before assuming either way. We reported the
gap upstream; until the spec closes it, no client can do better honestly.

## Discovery, and a caveat that is currently the normal case

Services are found by replaying the registrar's `ServiceListed` events and then reading each
listing's **current** terms from the resolver — the event says what was true at listing time, the
resolver says what is true now.

Public Sepolia RPC endpoints return **incomplete `eth_getLogs` results without erroring**. At the
time of writing ours returns *zero* of three events, repeatably, while `eth_call` against the
resolver is correct throughout. So discovery also resolves `knownLabels` directly and drops anything
the chain does not back — a stale hint cannot invent a service, and a revoked one stays revoked.

**It tells you when this happens.** `tollgate.lastDiscovery.recovered` names the listings the log
scan missed. If you are running your own registrar, set `knownLabels` to your own; set `[]` to trust
the log alone, knowing what that costs.

```ts
const scan = tollgate.lastDiscovery;
if (scan.recovered.length) {
  console.warn(`RPC returned an incomplete log; recovered ${scan.recovered.join(", ")} from ENS`);
}
```

## Status

ESM-only, Node 22+. Ships TypeScript source and is consumed through `tsx` or any TS-aware runner;
a compiled build lands with the extraction described below.

`pnpm gate:sdk --pay` in the parent repository installs this package into a scratch directory as a
third party would, then lists the catalogue, quotes, proves the budget refusal, and completes one
real paid request. A package that works only in the repository that built it has proved nothing.

**Known limitation.** It currently imports discovery and pricing from `@tollgate/agent`, which
transitively pulls in `openai` and `@anthropic-ai/sdk` — about 1.2s of import cost for a package
that never calls a model. That is temporary and unpublishable as-is: the four model-free modules
(`directory`, `policy`, `budget`, `types` — 473 lines, no coupling) are being extracted into their
own package, and this depends on that instead. Publication waits for it, because shipping an SDK
that installs two LLM SDKs while claiming it never touches a model is the artifact arguing against
itself.
