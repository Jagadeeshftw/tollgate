# Feedback — Hedera (x402, Blocky402 facilitator)

Written while building, from `@x402/hedera` v2.24.0 against the Blocky402 testnet facilitator.

## What worked well

**The facilitator is genuinely zero-friction on testnet.** No registration, no API key, no waiting
for approval — `GET https://api.testnet.blocky402.com/supported` returns the supported kinds
immediately and tells you the fee payer account. For a hackathon this removed an entire class of
blocking dependency, and we were able to verify the payment path was viable on day one before
building anything on top of it.

**The fee-payer model is the right call.** Having the facilitator sponsor gas and submit the
partially-signed transaction means a paying agent needs only the transfer amount, not a gas
balance. For agentic payments specifically, one less asset to keep topped up is a real
simplification.

**`extra.feePayer` arriving from `/supported`** and being merged into payment requirements
automatically is a nice touch — the resource server does not have to know or hardcode it.

## Friction

### 1. A money-denominated price is silently redenominated into USDC

This is the one that would have shipped a real bug, and it is silent.

Returning a bare money string from a route's `price` (e.g. `"0.05"`) hands it to the scheme's
default money parser, which resolves it against `DEFAULT_ASSETS` — on Hedera, USDC
(`0.0.429274` on testnet, 6 decimals). Our listing published `x402:asset = "0.0.0"`, the x402
sentinel for native HBAR, and we still got a challenge quoting USDC:

```
"asset": "0.0.429274",   <- USDC, not the HBAR we advertised
"amount": "50000"        <- 6 decimals, not 8
```

Nothing warned us. The 402 was well-formed and the flow looked correct; it was simply denominated
in an asset we had not chosen, at a different scale. We caught it only by decoding the
`PAYMENT-REQUIRED` header and noticing the asset id was not the one we published.

The fix is to return an explicit `{ asset, amount }` rather than a money string, which is
documented — but the failure mode for not doing so is a wrong asset rather than an error.

**Suggestion:** when a route declares an asset anywhere in its configuration and the money parser
resolves to a *different* asset, warn. Better still, let `PaymentOption` carry an explicit
`asset` alongside a money `price`, so "charge $0.05 worth of HBAR" is expressible without the
caller doing its own conversion — at present, pricing in HBAR means pricing *in* HBAR, since there
is no rate source in the path.

### 2. `fromStringECDSA` accepts an ED25519 key and derives a wrong-but-valid-looking public key

A raw Hedera private key is 32 bytes on either curve, so `PrivateKey.fromStringECDSA` parses an
ED25519 key without complaint and returns a secp256k1 public key that corresponds to no account.
Since most Hedera faucets and account-creation flows hand out ED25519 by default, and x402 on
Hedera requires ECDSA, this is a very easy mistake to make — and it does not surface until a
signature is rejected further downstream.

We added a startup probe that compares the derived public key against the account's on-chain key
via the mirror node, specifically to turn this into an immediate, legible failure.

**Suggestion:** either reject keys whose encoding indicates ED25519, or document prominently in
the Hedera x402 quickstart that the account must be ECDSA — ideally in the same place the faucet
is linked.

### 3. The quickstart documents the client side only

Blocky402's quickstart states outright that server-side endpoint gating is not covered, which
reads as "you must implement the 402 yourself". In fact `@x402/hedera` ships `./exact/server`, and
`@x402/express` provides working middleware — but `exact/server` is discoverable only by reading
the `exports` map in `package.json`, since it is not mentioned in the quickstart and the package
has no README on npm.

**Suggestion:** add a server-side section to the quickstart, even a ten-line Express example. This
is the half that resource *operators* need, and they are the side of the market x402 is short of.

### 4. `syncFacilitatorOnStart: false` fails confusingly

Constructing the resource server without syncing produces, on every request:

```
Facilitator does not support exact on hedera:testnet.
Make sure to call initialize() to fetch supported kinds from facilitators.
```

The message is accurate, but it surfaces as a 500 on a route that looks correctly configured, and
the flag that caused it is the fifth positional argument to `paymentMiddleware`. The error names
`initialize()`, which is not the method the middleware user called.

**Suggestion:** name the flag in the error, e.g. "...or pass `syncFacilitatorOnStart: true`".

### 5. Mirror node lag makes naive verification report false failures

Verifying a settlement by querying the mirror node immediately after the resource server returns
200 reports **not found** for a transaction that succeeded. Mirror nodes lag consensus by a few
seconds. Our first automated run of this check failed on a payment we could see on HashScan; an
earlier manual check of the same code path had passed only because minutes had elapsed between
paying and looking.

This is expected behaviour for an eventually-consistent read replica, and the fix is trivial
(poll to a deadline). It is worth flagging anyway because of what the failure *teaches*: a
verification step that reports failure for successful work is worse than no verification at all,
since the rational response to a check that cries wolf is to stop believing it. Anyone wiring
settlement confirmation into CI will hit this on their first green run.

**Suggestion:** say so in the x402-on-Hedera docs, next to wherever settlement verification is
described — one sentence that the mirror node is eventually consistent and confirmation should
poll rather than read once.

### 6. The facilitator's base URL 404s

`https://api.testnet.blocky402.com/` returns 404, so there is no way to confirm you have the right
host short of hitting `/supported`. A tiny index response naming the service and its supported
networks would make misconfiguration obvious.

### 7. Settlement fails transiently, and the failure is indistinguishable from a pricing bug

Our settlement gate runs a full paid request on every invocation. Over roughly 30 runs across a
day, **one failed** — and it failed in a way that took a while to attribute correctly.

Symptom: a request carrying a valid `PAYMENT-SIGNATURE` came back **402 with an empty JSON body**,
rather than 200. Same account, same amount (100,000 tinybar), same facilitator, same code. The
identical call succeeded on the next run minutes later with no change. The account was funded
throughout (~997 HBAR).

What makes this expensive to diagnose is the *shape* of the failure. A second 402 in response to a
payment is the same response the server gives when no payment was supplied at all, so from the
client it looks like the payment was never attached — which sends you to inspect your signing and
header construction, the two things that are working. Nothing in the response distinguishes
"you did not pay" from "your payment was fine but settlement did not complete".

**Why it matters beyond our own debugging:** a judge or a new developer running the demo has a
1-in-30 chance of hitting this on their first attempt, and what they will see is a payment layer
that appears not to work.

**What we did about it**, in case it is useful: the payment client now raises a distinct
`SettlementFailedError` on a second 402, carrying what was attempted, and the agent renders it as
its own trace state that says plainly this is upstream of the client. One retry is permitted and
is *announced in the trace* rather than silent, so the failure rate stays visible instead of being
smoothed away.

**Suggestions:**

1. **Distinguish "unpaid" from "settlement failed" in the response.** A different status (502/503
   would both be defensible, since the failure is upstream of the resource server) or even a
   populated error body on the second 402 would let a client tell the two apart. As it stands the
   protocol gives the resource server no way to say "your payment was valid but I could not settle
   it", which seems like a gap worth raising with the x402 spec rather than only with Blocky402.
2. **Publish whatever is known about facilitator availability** on testnet. A transient failure is
   entirely reasonable for a testnet MVP; being able to expect it is what turns it from a bug hunt
   into a retry.

We have not been able to pin down conditions beyond frequency — it did not correlate with amount,
timing, or account balance in anything we observed. Happy to share our gate output if the numbers
would help.

### 8. Fork-testing against a public chain inherits EIP-7702 delegations on well-known dev keys

Not Hedera-specific, but it cost us an hour and the error names none of the three things involved,
so it is worth recording somewhere a builder will find it.

Deploying our ENS registrar onto an anvil fork of Sepolia, minting a name to anvil's default
account reverted with `ERC1155InvalidReceiver(0xf39F…2266)`. The cause: anvil's dev private keys
are published, so people use those addresses on real chains — and on Sepolia today the first two
both carry an **EIP-7702 delegation designator** (`0xef0100…`). A fork inherits that code,
`to.code.length > 0` becomes true, and ERC-1155's receiver-acceptance check treats the EOA as a
contract that does not implement `onERC1155Received`.

Nothing in the revert mentions forks, delegation, or that the address is a default. The failure
will become more common as 7702 adoption grows, and it silently affects any fork test that mints a
token, transfers an NFT, or otherwise calls a receiver hook against a default account.

**Mitigation:** derive test accounts from a project-specific seed and assert `getCode(...) === "0x"`
at harness startup, so the failure names its own cause.


## Status of this feedback

All of the above were hit in the first day of building.

**On the Hedera Harness track (§Phase 7).** `hedera-dev/hedera-harness` was cloned and read
(HEAD `2026-08-16`). Two findings:

1. **It has no fork-test scaffolding**, so item 7 above is *not* a harness contribution. The
   `anvil` / `foundry` matches in that repo are inside PRD documents, not test infrastructure.
   Recording this explicitly because the temptation is to file it anyway; §8 says do not
   manufacture a contribution.
2. **It does contain `docs/prds/x402-metered-api.md`** — a PRD for an "x402 Keyless Metered API
   Demo Template": a scaffold-hbar template exposing a free endpoint and an x402-paywalled one,
   settled through Blocky402, with each paid unlock logged to an HCS topic as a public receipt.

   That is, to a close approximation, what this project's service layer already is. Items 1–6 above
   are precisely the rough edges anyone implementing that PRD would hit, in the order they would hit
   them. A contribution here would be genuine rather than invented — most plausibly a gotchas
   section or a hardening of the template's payment path, rather than the whole Next.js template.

   **Not committed to.** Revisit in Phase 7 with real time remaining, and only if the overlap still
   looks honest then.
