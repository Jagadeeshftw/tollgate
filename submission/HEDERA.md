# Hedera — submission answers

Tracks entered: **AI & Agentic Payments** (primary) and **Open Source — Improve the Hedera Harness**.

---

## How we used Hedera

**We stood up an x402-gated service and a platform that pays it, and the payments are real.**

Tollgate is a marketplace where AI agents buy on-chain data per call. An agent finds a service by
its ENS name, reads the price off the name itself, and pays in HBAR — no signup, no API key,
nobody signing anything.

**The gated service** (`service/`) uses `@x402/hedera` v2.24.0 with `@x402/express`, settling
through the **Blocky402** facilitator on Hedera testnet. The 402 challenge is built per request:

```
scheme   exact          network  hedera:testnet
asset    0.0.0          amount   500000 tinybar
payTo    0.0.10319209   extra    { feePayer: 0.0.7162784 }
```

Live now at `https://tollgate-service-production.up.railway.app/s/uniswap-pools` — a `GET` returns
a real 402 with a real challenge.

**Price and settlement account are read from ENS at request time**, not from server config. We use
`DynamicPrice` and `DynamicPayTo` so the figure quoted is the figure published on the service's
name. If the price lived in the service, the published record would be advertising rather than a
commitment.

**Metering, not flat rate.** The listing publishes a price *per unit* and what a unit is. Three
pools costs three times one pool. Both figures are on the ENS record, so the meter is legible to a
buyer before they commit rather than being service-side policy.

**Payments settle in HBAR, not the default asset.** Worth stating because it was a bug we had to
find: returning a money string hands the amount to the scheme's default money parser, which
resolves to USDC on Hedera. Our listings publish `x402:asset = 0.0.0`, so we return an explicit
`{ asset, amount }` and the transfer is native HBAR at 8 decimals.

**HCS audit trail.** Every settled payment is written to topic
[`0.0.10319381`](https://hashscan.io/testnet/topic/0.0.10319381) — service, units, amount, payer,
payee, transaction id. Hooked to `onAfterSettle` rather than to the route handler, so the trail
records *settlement* rather than request completion; those differ exactly when a handler throws
after the money moved. Writes are best-effort and never block the response: the payment has
already settled, so failing the request over a logging outage would leave a caller who paid and
got nothing.

**The agent pays autonomously.** It decides whether a purchase is justified, sets its own price
ceiling, and pays without a human in the loop. `packages/x402-client` is the paying half —
partially signing a `TransferTransaction` and leaving the fee payer to the facilitator.

### Verify it yourself

- **A settled payment:** [`0.0.7162784@1788278442.283807208`](https://hashscan.io/testnet/transaction/0.0.7162784@1788278442.283807208)
- **The audit topic:** [`0.0.10319381`](https://hashscan.io/testnet/topic/0.0.10319381)
- **`pnpm gates`** settles a *fresh* payment on every run and verifies it against the mirror node,
  so the claim cannot decay into something that was true once.

## Open Source — the Harness

`hedera-dev/hedera-harness` ships `docs/prds/x402-metered-api.md`, a PRD asking a coding agent to
build an x402-gated API with HCS receipts through Blocky402. It has skills for HCS, HTS and the
system contracts — and **no skill for x402**. The string `402` appears nowhere in `src/`,
`prompts/` or `skeletons/`.

We are contributing an **`x402-payments` skill**, written from the six things that actually cost us
time building exactly what that PRD describes. Not invented friction — every item below is
something we hit, in the order we hit it.

---

## Feedback

Full detail in `FEEDBACK/HEDERA.md`. The three that would have saved us the most:

**1. A money-denominated price is silently redenominated into USDC.** Returning `"0.05"` from a
route's `price` resolves against `DEFAULT_ASSETS` — USDC on Hedera — even when the listing
advertises native HBAR. No warning; the 402 is well-formed and simply denominated in an asset we
did not choose, at a different scale. We caught it only by decoding the `PAYMENT-REQUIRED` header
and noticing the asset id. *Suggestion:* warn when a route declares an asset and the money parser
resolves to a different one.

**2. A second 402 is indistinguishable from a never-paid 402.** Roughly one settlement in thirty
failed transiently — a request carrying a valid `PAYMENT-SIGNATURE` came back 402 with an empty
body, and the identical call succeeded minutes later unchanged. From the client that looks exactly
like the payment was never attached, which sends you to inspect signing and headers, the two
things that are working. The protocol gives a resource server no way to say *"your payment was
valid, I could not settle it."* We think this is worth raising at the x402 spec level and not only
with Blocky402. *Suggestion:* a distinct status or a populated error body on the second 402.

**3. `fromStringECDSA` accepts an ED25519 key.** A raw Hedera private key is 32 bytes on either
curve, so it parses without complaint and derives a secp256k1 public key belonging to no account.
Most faucets issue ED25519 by default and x402 on Hedera requires ECDSA, so this is easy to hit
and surfaces far from its cause. We now compare the derived public key against the account's
on-chain key at startup.

## Comments

The fee-payer model is the right call for agentic payments specifically — a paying agent needs
only the transfer amount, not a gas balance, which is one less asset to keep topped up. Blocky402
requiring no registration or API key on testnet removed an entire blocking dependency and let us
verify the payment path was viable on day one, before building anything on top of it. That mattered
more than it sounds: it is the difference between discovering a dead end on day one and on day six.
