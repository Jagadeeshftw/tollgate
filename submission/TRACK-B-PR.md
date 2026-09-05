# Track B — PR to `hedera-dev/hedera-skills`

**Status: FILED.** [hedera-dev/hedera-skills#28](https://github.com/hedera-dev/hedera-skills/pull/28) — open, one file, +92 lines.

**Target:** `plugins/native-services-js/skills/x402-payments/SKILL.md` — +92 lines, one file.

---

## What changed from the original plan, and why

The plan was to contribute a new `x402-payments` skill, on the finding that `hedera-harness` ships
a PRD for an x402 metered API while `402` appears nowhere in its `src/`, `prompts/` or `skeletons/`.

**That finding was incomplete.** The harness's `skills-index.json` lists seven skills and none is
x402 — but skills live in a *separate* repo, `hedera-dev/hedera-skills`, and there **is** an
`x402-payments` skill there. It sits in the harness index's `unmerged-skills` list rather than
`skills`, which is why it did not appear.

Reading it changed the contribution for the better. The existing skill is good — it covers the
fee-payer model, tinybar denomination, the resource-server and client flows, and
`server.initialize()`. Writing a second one would have duplicated work someone had already done
well.

What it does not cover is the ways an integration fails **silently**. Confirmed by grep across
`SKILL.md` and both reference files, not by reading impression — none of `DEFAULT_ASSETS`, `USDC`,
`ED25519`, `fromStringECDSA`, `mirror`, `ALIAS`, or any phrasing of the payer/payee constraint
appears anywhere in the skill.

So the PR adds a **Failure Modes** section, and four checklist items. Five traps, each one we hit.

---

## PR title

```
skill(x402-payments): document five silent failure modes
```

## PR description

> ### The gap
>
> The `x402-payments` skill covers the happy path well — fee payer, tinybars, the resource-server
> and client flows. What it does not cover is the ways an x402 integration on Hedera fails
> *without erroring*, and those are what actually cost time: each one produces a well-formed
> response, a plausible-looking 402, or a valid signature, and none produces a stack trace
> pointing at the cause.
>
> An agent following this skill today writes code that looks right and is wrong in five specific
> ways.
>
> ### The change
>
> One new section, five items, and four checklist entries. Every item is something we hit building
> a production pay-per-call service on Hedera testnet — an x402-gated data marketplace where
> autonomous agents pay per request in HBAR through the Blocky402 facilitator. Nothing is
> speculative and nothing was added to round the list out.
>
> | Failure | Why it is silent |
> |---|---|
> | A money-denominated `price` is redenominated into USDC via `DEFAULT_ASSETS` | The 402 is well-formed; only the `asset` field in the decoded header shows the substitution |
> | `PrivateKey.fromStringECDSA` accepts an ED25519 key | A raw key is 32 bytes on either curve, so it parses and derives a public key for no account |
> | Payer and payee must differ | A self-transfer nets to zero and fails the facilitator's amount check — easy to miss when the first test uses one funded operator |
> | Mirror node lags consensus | Confirming settlement immediately reports "not found" for a transaction that succeeded |
> | A second 402 is byte-identical to a never-paid 402 | Looks like the payment header was never attached, so you debug signing — the part that works |
>
> The first is the one that would have shipped a real bug: our listings advertised native HBAR and
> the challenge quoted USDC at a different scale, and nothing warned us. We found it by decoding
> the `PAYMENT-REQUIRED` header and noticing the asset id was not the one we published.
>
> Each item states the symptom, why it is invisible, and the fix, in the skill's existing voice.
> The `ALIAS_ALREADY_ASSIGNED` note under the payer/payee item is included because it is the next
> thing you hit when you go to create the second account.
>
> ### One discoverability note, if it is useful
>
> We nearly wrote a second x402 skill from scratch, because from the harness side this one looks
> absent: `hedera-harness`'s `skills-index.json` lists it under `unmerged-skills` rather than
> `skills`, and `402` appears nowhere in the harness's own `src/`, `prompts/` or `skeletons/`. We
> found it only by cloning this repo and reading the tree. If moving it into `skills` is intended
> eventually, doing so would make it discoverable from the place an agent-builder starts.
>
> ### Related, filed separately
>
> The second-402 ambiguity is arguably a protocol-level gap rather than a Hedera one — x402 gives a
> resource server no way to say *"your payment was valid, I could not settle it."* We are raising
> that with `x402-foundation/x402` on its own merits. This PR documents how to live with it today.
>
> ### Scope
>
> One file, +92 lines, no changes to existing content. Built and used against `@x402/hedera`
> v2.24.0 and the Blocky402 testnet facilitator.

---

## Notes on filing

- **An open PR is sufficient for Track B** — it does not need to be merged, and we are not holding
  the submission on one.
- The skills repo takes plugin skills under `plugins/<plugin>/skills/<skill>/SKILL.md` with YAML
  frontmatter. This change touches only the body of an existing file, so no
  `.claude-plugin/marketplace.json` or `skills-index.json` registration is needed.
- Eight of twenty-one skills carry an `evals/` directory. This change adds prose to an existing
  skill rather than a new capability, so no evals are added — adding evals for a skill we did not
  write would be a larger and less welcome change.
