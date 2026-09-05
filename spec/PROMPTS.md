# Prompt Log

A record of how the AI was directed. Required by the AI-usage rule — judges are told to look at
how the AI was steered, not only at what it produced. Appended to as the build proceeds.

---

## 1 September 2026 — Phase 0

**Prompt:** "read build spec and start building"

Deliberately minimal. The specification is the real instruction; the intent was to see whether the
agent would follow the spec's own standing orders (§9: investigate and report before writing code;
run the Phase 0 gates before building anything that depends on them) rather than jumping to code.

**What it did:**

1. Read the spec in full, then checked the local toolchain.
2. Ran Gates 1–3 against live infrastructure rather than from model memory — the event postdates
   the model's training cutoff, so nothing about Blocky402, ENSv2 beta or the 2026 prize list
   could be answered from recall.
3. Reported findings before writing dependent code, per §9.

**Verified rather than assumed:**

- Blocky402's `/supported` endpoint queried directly — returned `hedera:testnet` live.
- All ENSv2 Sepolia addresses checked with `eth_getCode` — real bytecode, correct chain id.
- The Graph gateway probed — returned an auth error rather than a 404, proving the route is live.
- npm package versions and GitHub repo activity read from the registries, not recalled.

**Corrections to the spec's assumptions, from what the probes returned:**

- Blocky402 testnet needs **no registration and no API key**. §5 Gate 1 assumed otherwise.
  One fewer blocking dependency.
- Two rival x402 package families exist on npm. Only the `@x402/*` v2 line carries Hedera support;
  the legacy `x402-*` v1 line does not. The spec does not distinguish them, and picking wrong is a
  silent dead end.
- Blocky402's quickstart documents only the client side and states server-side gating is not
  covered — but `@x402/hedera` does ship an `exact/server` entry point. Logged as friction.

**Outcome:** no gate failed, no §8 kill criterion triggered.

---

## 1 September 2026 — Phase 2, ENS registry layer

**Prompt:** (continuation) — proceed with the ENS registry layer.

Chosen over standing up the x402 service first for a dependency reason rather than a preference:
§Phase 3 requires the 402 gate to quote its price *from the ENS record*, so building the service
first would mean building it against a stub and reworking it.

**Investigation before code.** The ENSv2 source was read directly (`ensdomains/contracts-v2`)
rather than worked from documentation, because the beta's published docs turned out to be
incomplete in ways that mattered:

- `PermissionedResolver.setText` is gated by `onlyPartRoles(node, partHash(key), ROLE_SET_TEXT)` —
  permissions are scoped to the individual *record key*. This is what makes the product's core rule
  ("operator may reprice, may not redirect payment") expressible natively rather than in custom
  access-control code. Confirmed against ENS's own test suite before relying on it.
- Registry ids are labelhash-derived; resolver keys are namehash-derived. Different keyspaces,
  both `uint256`-shaped, no revert on confusion.

**Two bugs the agent found and fixed in its own work — both worth recording:**

1. `revoke()` originally passed the namehash to `REGISTRY.unregister()`, which keys by labelhash.
   Caught by reading `_constructTokenId` in the ENS source rather than by a test.
2. The constructor originally took the parent's namehash and its DNS encoding as two independent
   arguments. The fork tests failed — and failed *informatively*: the negative assertions passed
   while the positive ones did not, which is the signature of delegation landing on a resource
   nobody checks. Fixed by deriving the namehash from the DNS encoding so the two cannot disagree.

The second is the more interesting one: the tests caught a real misconfiguration hazard that would
have silently produced a listing the operator could not edit, and the fix removed the whole class
of error rather than the instance.

**Verification stance.** Phase 2 is covered by fork tests against the *real* ENSv2 contracts on
Sepolia, not mocks. The central claim — that EAC refuses the operator the settlement key — is a
claim about ENS's code, so asserting it against a mock would prove nothing. The assertion checks
the exact `EACUnauthorizedAccountRoles` error, resource and role bitmap rather than accepting any
revert.

**Outcome:** 15/15 passing against Sepolia. All five §Phase 2 done-conditions met.

---

## 1 September 2026 — rename to Tollgate, and Phase 3 (x402 payment layer)

**Prompt:** name settled as Tollgate — rename before Phase 3; do not write the deploy script or
buy the parent name until ENS confirms which Sepolia deployment the App beta uses; build the
unpaid→402 path and record Gate 1's open exposure in the repo.

**Rename.** Applied across contracts, workspace, docs and spec; `grep -i tollgate` clean, zero
`kiosk` remaining. Two things a blind find-and-replace got wrong and had to be fixed by hand:

- The DNS wire-format constant `hex"056b696f736b0365746800"` encodes a *length prefix*, so
  `\x05kiosk` became `\x08tollgate` — a text substitution would have left the length byte at 5 and
  produced a name that hashes to nothing. Recomputed rather than edited.
- Comments documenting that encoding said `\x05tollgate`, which the rename made false. Corrected.

**Gate 1 exposure recorded.** `spec/PHASE-0-GATES.md` now splits Gate 1 into 1a (discovery,
verified), 1b (credentials, open) and 1c (settlement, open), and states plainly that Phases 2 and 3
both rest on an unverified dependency. Gate 1b's probe was written ahead of the credentials
arriving so that a wrong key type fails at startup rather than mid-payment.

**A probe that did not do what it claimed.** The Gate 1b comment asserted that an ED25519 key
would fail to parse via `fromStringECDSA`. Testing it with a generated ED25519 key showed it parses
fine — a raw Hedera private key is 32 bytes on either curve — and derives a plausible-looking
public key for no account. The real protection is the mirror-node comparison, not the parse. The
comment was corrected to say so, and the error message now names the ED25519 case explicitly.
Worth recording because the probe had been *written* to catch this and would have reported the
wrong reason.

**Phase 3.** The 402 gate resolves price, unit, settlement account, network and asset from the
service's ENS record on every request — `DynamicPrice` and `DynamicPayTo` take the request context,
so none of it is server configuration. Metering is real: 50 pools costs 50x one pool, and the unit
is published on the name so the meter is legible before committing.

**The bug worth recording from this phase.** The first working 402 quoted
`asset: 0.0.429274, amount: 50000` — USDC at 6 decimals — while the ENS record published
`x402:asset = "0.0.0"`, native HBAR at 8. Returning a bare money string hands the amount to the
scheme's default money parser, which resolves against `DEFAULT_ASSETS`; on Hedera that is USDC.
Nothing errored. The 402 was well-formed and the flow looked right.

This was caught by decoding the `PAYMENT-REQUIRED` header rather than trusting that a passing test
meant a correct challenge — the tests at that point asserted on our own advisory JSON body, which
was perfectly correct while the actual challenge was not. The tests now assert against the decoded
header. The lesson generalises: assert on the artifact the counterparty consumes, not on the one
you happen to control.

**Verification stance.** The service's tests run against the real Blocky402 facilitator; the
facilitator handshake is a genuine dependency and mocking it would hide exactly this class of
problem. Listings are injected in tests to avoid depending on a name that is not yet registered —
but the production path is `OnChainListings` and there is deliberately no fallback data source, so
the service cannot be run in a state where it charges for invented data.

---

## 1 September 2026 — closing Gate 1

**Prompt:** Hedera testnet account provisioned. Run the Gate 1b probe first and stop if it fails.
Then close the paid leg minimally — trivially gated endpoint, one payment, one settled transaction.
Record the reclassification visibly. Never print the key.

**Secrets first.** Confirmed `.env` is gitignored and `.env.example` carries names only before
touching anything that reads the key. Then hardened the Gate 1b probe's error path: it had been
interpolating the raw SDK error on a parse failure, and a parser that fails on malformed input is
exactly the code most likely to echo that input back. Failures are now reported by error class
name. A post-hoc sweep confirms the key appears in no file but `.env`.

**Gate 1b — PASS.** `0.0.10315562`, ECDSA, funded. The probe compares the derived public key
against the account's on-chain key rather than trusting the parse, for the reason recorded earlier:
`fromStringECDSA` accepts an ED25519 key and derives a public key for no account.

**Gate 1c — PASS.** Three things had to be got right, none of which was in the docs:

1. **Two accounts are required.** An `exact` transfer debits the payer and credits `payTo`; the
   same account on both sides nets to zero and fails the facilitator's amount check. Added
   `scripts/hedera-setup.ts` to create a settlement account under the same key — separate account,
   no second secret.
2. **`setECDSAKeyWithAlias` fails with `ALIAS_ALREADY_ASSIGNED`** when the key's EVM alias is
   already held by the first account. `setKeyWithoutAlias` is the correct call.
3. **The v2 `PaymentPayload` has no top-level `scheme`/`network`** — they live inside `accepted`.
   The Blocky402 quickstart shows them as siblings.

**Verified against the mirror node, not the response.** A 200 proves the server released the goods,
not that the payer was debited. The mirror node confirms `SUCCESS` and the exact transfers,
including the facilitator absorbing the 267,502 tinybar fee.

**A false failure worth recording.** The first `pnpm gates` run reported Gate 1c FAIL — "not found
on mirror node" — for a payment that had in fact settled. Mirror nodes lag consensus by seconds and
the check queried immediately. The earlier manual verification had passed only because minutes had
elapsed. Now polls to a deadline. A verification step that reports failure for successful work is
worse than no verification, because it trains you to disbelieve it.

**Reclassification kept visible.** Gate 1 had been recorded as PASS on leg 1a alone. That verdict
was wrong in what it licensed — it let two phases proceed as though the payment rail were proven
when only an HTTP response had been. `spec/PHASE-0-GATES.md` keeps the PASS → PARTIAL → CLOSED
history rather than overwriting it.

---

## 1 September 2026 — ENS-priced paid request, and the HCS audit trail

**Prompt:** wire the service's ENS-priced paid→200 path end to end before HCS, because the paid
request is Track A's stated core requirement and HCS is a bonus. Look specifically at the seam
between an operator-authored price string and the facilitator's exact amount check.

**The seam was where it was predicted to be, and the bug was worse than a rounding error.** A unit
price with more decimal places than the asset supports — 9 on HBAR, which has 8 — is *sometimes*
payable, because multiplying by the right number of units lands back on a whole tinybar.
`0.000000001` HBAR/pool throws a 500 at `?limit=1` and succeeds at `?limit=50`. A listing whose
payability depends on how much of it you buy is broken in a way that no single test case reveals.
Fixed by validating the unit price at its *smallest* purchasable quantity — one unit — when the
listing is read, and rejecting it as a 502 rather than failing per-request. Thirteen tests now
cover that seam.

**Deployment approach.** The parent name is on hold, so the end-to-end test forks Sepolia with
anvil and deploys the resolver, registry and registrar onto the fork. The ENSv2 contracts are real
deployed bytecode and the records are written by the real registrar, so every seam between Phase 2
and Phase 3 is exercised; what is *not* proven is public wildcard resolution, which needs the
parent name. Stated in the test's own docstring rather than left implicit.

**A fork-testing trap worth remembering.** The first `list()` reverted with `ERC1155InvalidReceiver`
naming anvil's default account. Anvil's dev keys are public, so people use those addresses on real
chains — and on Sepolia today the first two both carry an EIP-7702 delegation designator
(`0xef0100…`). A fork inherits that code, `to.code.length > 0` becomes true, and the registry's
ERC1155 mint fails its receiver check. Nothing in the error mentions forks, delegation or ENS. The
harness now derives an operator address from an unused seed and asserts it is code-free at startup,
with the reason recorded where the next person will hit it.

**HCS.** Hooked to `onAfterSettle` rather than to the route handler, so the trail records
settlement rather than request completion — those differ exactly when a handler throws after the
money moved. Writes are best-effort and never block the response: the payment has already settled,
so failing the request over an audit write converts a logging outage into a customer who paid and
got nothing. Asserted by reading the topic back from the mirror node, not by trusting our own write.

**Presentation note taken.** The README now states plainly that the same-key settlement account is
a local test convenience and not the model — the operator's inability to redirect payment is an ENS
guarantee (`test_operatorCannotMoveSettlementAccount`), and one key holding both sides of a test
transfer says nothing about it.

---

## 1 September 2026 — Phase 5, the consumer agent

**Prompt:** take Phase 5. Guard against building a router — parse, pick, pay, print — which is the
shape Track D rejects and the one that emerges by default. Make the agent face decisions it could
reasonably resolve either way, surface all four in the trace, stub a second listing now so service
selection is written against real choice, and keep the data layer behind an interface.

**The structural answer to the router problem** was to split *policy* from *judgment*. The
affordable plan set — every service crossed with every quantity, priced, filtered by budget — is
computed deterministically before the model is consulted, and it is the only menu the model gets to
choose from. `Budget` is arithmetic and cannot be argued with. So the model decides what something
is **worth** while the policy decides what is **permitted**, and neither can be talked past the
other. That also makes the guard rails unit-testable without a key: seventeen tests assert that a
budget stops a purchase the model approved, that a ceiling below the quoted price declines, and
that an "unanswerable" verdict is never padded into an answer.

**Two services from the start, per the instruction.** One narrow and cheap (Uniswap only, 0.001
HBAR/pool), one broad and 3x dearer (all DEXs under a standardized schema). The correct choice
genuinely depends on the question, and the e2e test asserts the two diverge — a narrow question
must pick the narrow service and a cross-protocol one the broad service, or selection is decoration.

**Discovery is real.** The agent is handed no endpoints. It reads `ServiceListed` / `ServiceRevoked`
from the registrar's own event log, replays them in order so revoked listings disappear, then reads
each survivor's terms from the resolver rather than from the event — because the event records what
was true at listing time and the resolver records what is true now. An operator who repriced should
be quoted their current price.

**Model integration was written against the bundled Claude API reference, not from memory**, which
corrected three things I would have got wrong: the model id (`claude-opus-5`), adaptive thinking
(`{type: "adaptive"}` — `budget_tokens` is now rejected outright), and structured output via
`client.messages.parse()` with `zodOutputFormat` rather than the deprecated `output_format`. The
Zod major version also had to move to 4; the SDK helper's types are incompatible with Zod 3.

**A fork gotcha, second of its kind.** Event discovery from block 0 fails on a forked chain —
anvil proxies pre-fork blocks upstream and trips a 50,000-block range cap. The registrar cannot
have events before it existed, so the devnet now reports its deployment block and discovery starts
there. Correct on a real chain too, where scanning from genesis is merely slow.

**Blocked, and not worked around.** `ANTHROPIC_API_KEY` is unset and no `ant` profile exists, so
the judgment layer cannot run. The agent discovers both services, prices them, and stops with an
explicit error. There is deliberately no offline decision policy standing in for reasoning: a
hardcoded router presented as judgement is precisely what Track D rejects, and it would be harder
to notice than an honest failure.

---

## 1 September 2026 — Phase 6, the trace view

**Prompt:** build the trace view to show decisions, not steps — the demo video is where a judge
decides whether the reasoning is real, and four decisions buried in logs read as a router however
good the architecture underneath is. Make the policy/judgment boundary visible. Registration UI
matters less; do not let it eat the trace view's time.

**The trace could not carry the narrative as it stood**, so it was extended before anything was
built to render it. Two additions:

1. A `policy:plans` event carrying the whole decision space — every service crossed with every
   size, priced — *and the options the budget excluded, with the arithmetic that excluded them*.
   The excluded half is the important one: an option the model never saw is a much stronger
   statement about the budget than an option it declined.
2. An `ACTOR` map attributing every event type to `policy`, `judgment` or `network`. The claim
   that the model decides what something is *worth* while arithmetic decides what is *permitted*
   is only checkable if you can see which is which, so the attribution is data rather than styling.

Three tests now pin this: that the plan set is emitted *before* the model is consulted (an
ordering, not a comment), that exclusions carry their reasons, and that all four decisions are
attributed to `judgment` while the plan set is attributed to `policy`.

**Verified against a live run.** With a 0.05 HBAR budget the stream carries six affordable plans
and two excluded — `dex-pools` at 25 and 50 units, "costs 0.075 HBAR, budget has 0.05". Those two
were priced and removed by arithmetic; the model was never offered them.

**Registration UI kept deliberately small**, per the instruction: a single panel listing what the
operator minted, with each name's price, unit and asset read live from its ENS records. It is the
operator story in one screen and it did not compete with the trace for time.

**Still blocked on `ANTHROPIC_API_KEY`.** The view streams the question, live on-chain discovery of
both services, and the full priced decision space, then stops with the actionable credential error
rendered in place. Everything downstream of the first model call is written and untested against a
live model.

---

## 2 September 2026 — Track B PR, and two small tooling frictions

**Prompt:** file the Track B skill PR, then set up for the 4th.

**Reading before writing changed the premise for the second time.** The plan was a new
`x402-payments` skill for the Hedera harness, on the finding that `402` appears nowhere in the
harness's `src/`, `prompts/` or `skeletons/` and its `skills-index.json` lists seven skills, none
of them x402. Cloning `hedera-dev/hedera-skills` — which the instruction to read their conventions
first required — showed the skill already exists there. It sits in the harness index's
`unmerged-skills` list rather than `skills`, which is why it looked absent from the harness side.

The contribution became a Failure Modes section added to the existing skill: five ways an x402
integration on Hedera fails *without erroring*, each one we hit. That is a better PR than a
duplicate skill would have been, and the absences were confirmed by grep across `SKILL.md` and both
reference files rather than by reading impression — which is stated in the PR so the claim is
auditable. Filed as `hedera-dev/hedera-skills#28`.

This is the second time a public claim about another project was wrong until the source was
checked — first the ENS docs deployments table, now the skills index. The habit is now explicit:
before any public claim about what another project does or does not have, check the actual source,
and say in the artifact how it was checked.

**Two tooling frictions, both cheap and both badly timed if hit live:**

- `hedera-dev/hedera-skills` defaults to **`master`**, not `main`. `gh pr create --base main`
  fails with "Base ref must be a branch", which does not say the branch does not exist.
- `gh repo fork --remote --remote-name fork` created the fork but **did not add the remote**, and
  the subsequent push failed with `could not read Username for 'https://github.com'` despite `gh`
  being authenticated. Adding the remote by hand with a token-authenticated URL worked.

## 3 September 2026 — a credential printed, and the rule that should have prevented it

**Prompt:** re-platform `web/` to Next.js with paid Aceternity components; fix the dashboard
reporting one service when the chain holds three; replace the hero.

**A live private key and an API key were printed to the transcript.** `railway variables --service
tollgate-web` prints variable *values*. Only the names were needed. The exposure was reported
immediately, both credentials were rotated, and the Hedera pair was replaced rather than re-keyed —
an `AccountUpdateTransaction` has to be signed by the key being retired, so the compromised key
stays valid until the update lands and whoever else holds it can re-key first.

The failure was not ignorance of the hazard. A `sed` redaction filter had been written earlier in
the same session for `shadcn` output, *specifically because* tool output can carry credentials.
Knowing a hazard in one place did not generalise to the next command.

**Standing rule, applied without deciding case by case:**

> Any command that can print a credential is redacted or silenced before it is run — never
> case-by-case judgement about whether this particular invocation will emit one.

In practice: prefer the form that cannot emit the secret at all (`--json` parsed for keys only,
output to `/dev/null`) over a filter that has to be correct. Verify by digest — hash the local value
and the remote value and compare the first bytes — rather than by reading either back.

This sits alongside the rule from 2 September: before any public claim about what another project
does or does not have, check the actual source and say how it was checked. Both are the same shape.
A habit that fires only when the hazard is salient is not a habit.

**`eth_getLogs` on a public Sepolia endpoint silently returns a subset of matching events.** No
error, and a different subset per call — three listings yesterday, one today, from unchanged code.
`eth_call` against the resolver was correct throughout. Measured and written up in `FEEDBACK/ENS.md`;
discovery now corroborates across endpoints and verifies every candidate through the public ENS
resolution path, and `pnpm gates` fails if discovery finds fewer services than the deployment listed.

## 3 September 2026 — rotating a key that had not rotated

**Prompt:** rotate the exposed credentials, deploy, split commit 20.

**The rotation had not happened.** `.env` held a new `HOSTED_HEDERA_OPERATOR_KEY` and every upstream
signal reported the key as rotated. The chain disagreed: there was no `CRYPTOUPDATEACCOUNT` on the
account, and the public key derived from the "new" `.env` value matched the key already on chain —
so the exposed key still controlled the account. This is the worse failure mode. The original
exposure was visible and acted on; this one looked resolved.

It had compounded, too. `scripts/hedera-setup.ts` creates the settlement account under the
*operator's own key*, so one exposure took both the hosted payer and the hosted settlement account.

**Two rules from it:**

> **Verify a rotation against the chain, never against the file that claims it.** Derive the public
> key from the stored private key and compare it to what the account actually carries. A new value
> in a config file is a claim about a rotation, not evidence of one.

> **Replace rather than re-key.** An `AccountUpdateTransaction` must be signed by the key being
> retired, so the compromised key stays valid until the update lands — and whoever else holds it can
> re-key first and lock you out. A fresh keypair has no such window, and on a testnet there is
> nothing in the old account worth the race.

The same principle covers the update path: the Railway values were confirmed by hashing the local
and remote values and comparing digests, never by reading either back. Verification must not
re-expose the thing being verified.

**Test the capability, not the string.** `RAILWAY_TOKEN` was set the whole time and simply invalid;
presence checks passed and the only symptom was "Unauthorized", which reads as a permissions problem
rather than a wrong value. Every credential gate now spends a request proving the credential is
live: Railway authenticates a project, the model credential lists models, the hosted Hedera key is
proved against the account it names — and against the retired-account record, because a valid key on
a compromised account is still compromised. Gate 1b already did this for the main operator; the
hosted pair had no gate at all, which is precisely why the failed rotation went unnoticed.

**A gate that fails at random is a gate nobody trusts.** Gate 2d first asserted raw event-log
discovery, which depends on a public RPC that under-reports at random, so it failed intermittently
on a correct deployment. It now asserts the invariant that matters — the catalogue a visitor sees
matches the deployment — and *reports* the degraded log scan as detail rather than failing on it.
