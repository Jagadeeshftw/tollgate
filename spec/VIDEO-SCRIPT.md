# Video script — draft 1

**Target 3:25.** Bounds are 2:00 and 4:00 with auto-rejection at both, so aiming mid-range leaves
room for a slower read without a re-shoot. Narration is 381 words — about 2:49 at a comfortable
technical pace — leaving roughly 29 seconds of deliberate silence for holds and for letting the
screen be read. If the read runs slow the film lands nearer 3:45, still inside the window. Spoken narration throughout — no voiceover, no music
over text. Intro ends at 0:18.

---

## Allocation, and what it costs

| Beat | Time | Track | Why this much |
|---|---|---|---|
| Intro | 0:18 | — | Hard cap. One sentence on what it is, one on the three layers. |
| **The run** — discovery, four decisions, payment settling, answer | **1:15** | **D + A** | The most time, to the track most at risk. Track D is the only one with a stated rejection for *thin reasoning*, and the only one where screen time directly reduces that risk. Track A's requirement — a paid request executing — happens inside this beat rather than beside it, so the two share the frame. |
| **The refusal** | 0:32 | D | The pair is the argument. One run answering is a demo; the same agent refusing, live, with money available, is evidence it was deciding. |
| **The ENS refusal** | 0:36 | E | Track E's centerpiece, and the only beat that shows a security property being *enforced* rather than described. Four payout slots make it the best odds on the board. |
| **One query, three protocols** | 0:26 | C | Enough to land, because the argument is visual: three protocols, one query, no adapter code. |
| Close | 0:18 | B | Track B is a PR. One sentence. |

**What is sacrificed, deliberately:**

- **The HCS audit trail** — a Track A bonus. Reduced to four words inside the payment beat. It is a
  strong feature and it does not survive triage: it proves record-keeping, not that money moved.
- **The registration UI and the operator flow.** The ENS beat shows the *consequence* of listing
  (delegated rights) rather than listing itself. Showing both would cost 30 seconds to establish a
  premise the refusal already implies.
- **Metering.** One clause. It is visible on screen in the plan table for anyone who pauses.
- **The two-parallel-deployments story.** Cut entirely. It is our best partner feedback and it is
  written up; it is not a product argument.
- **A tour of the trace view.** The interface is shown working, never explained. If it needs
  explaining, it has failed.

---

## Shot list

### 1 — Intro · 0:00–0:18 · **18s**

**On screen:** the trace view at `tollgate-web-production.up.railway.app`, top of page, nothing
running. The context header is visible: the lede, the three layers, the verification links.

**Narration** (~40 words):
> An AI agent needs on-chain data. It finds a service by its ENS name, reads the price off the
> name itself, and pays for it per call in HBAR. No signup. No API key. Nobody signs anything.

**Setup:** page loaded, scrolled to top. Browser chrome hidden or minimal.
**Timing risk:** this is tight. If the read runs long, cut "Nobody signs anything."

---

### 2 — The run · 0:18–1:33 · **75s**

**On screen:** local trace view (live mode), a question typed, then the trace streaming.

**2a · 0:18–0:26** — type the question, hit Ask. Discovery appears: three services resolved from
the registrar's event log.
> I'll ask it for the top Uniswap pools. It doesn't know what services exist — it reads them off
> the chain.

**2b · 0:26–0:42** — the plan table. Hold on it; let the excluded rows be visible.
> First, arithmetic. Every service crossed with every size, priced. Two options cost more than the
> budget, so they're removed *before* the model is asked anything. It never gets the chance to
> talk itself into them.

**2c · 0:42–1:05** — the three decision cards: which service, how much, is it worth paying.
> Then the decisions. Which service — and why not the others. How much to buy. And whether it's
> worth paying at all: it sets its own ceiling, two hundredths of an HBAR, against a price of one.
> Gold is the model deciding. Grey is arithmetic. It could not have come out otherwise.

**2d · 1:05–1:18** — the 402, then the settled payment line with the HashScan transaction id.
> Four hundred and two, payment required. It pays — on Hedera testnet, through the Blocky402
> facilitator. That's a real transaction, and it's on the public audit trail.

**⏱ EDIT POINT.** Settlement takes 3–8 seconds and the model calls take 5–15 seconds each. Cut
between 2c and 2d, and again inside 2d. **Cover:** hold on the decision card being read aloud;
the narration in 2c is long enough to cover one model call.

**2e · 1:18–1:33** — the answer.
> And an answer, from live data on The Graph. It spent one hundredth of an HBAR out of five.

**Setup:** run locally in live mode (`pnpm --filter @tollgate/web dev`), model key present, Hedera
funded, Graph key present.
**⚠ State risk:** see Risk 1 and Risk 2 below.

---

### 3 — The refusal · 1:33–2:05 · **32s** · **filmed live**

**On screen:** same interface, budget left at 0.05 HBAR. Type **"what is the current price of
ETH?"** and hit Ask. Hold on the plan table showing six affordable options, then cut to the decline.

**Narration:**
> Now a fair question. DEX pool data sounds like where you'd find an ETH price, the budget is
> untouched, and six options are affordable. It could buy any of them.
> *(beat, on the decline card)*
> It works out the pools give total value locked, not prices — and that a price feed would answer
> this for free. So it buys nothing. An agent that always spends isn't deciding anything.

**⏱ EDIT POINT.** One model call, 5–15 seconds. **Cover:** hold on the plan table while reading
the first line — the six affordable options are the point of that shot anyway.

**Why this question:** measured, not guessed. **Six runs, six declines, zero spent**, six
affordable plans on the table every time. The question is on-topic and the data plausibly relevant,
which is what makes the decline hard to dismiss as pattern-matching — the agent has to work out
that pool data carries TVL rather than prices. Its own words:

> "I value a reliable current ETH price at up to 0.01 HBAR if it came from a source that actually
> provides prices or reserves. None of these offers provide that, and public price APIs are
> available free."

Live, no mock anywhere, no banner to explain. See Risk 3.

---

### 4 — The ENS refusal · 2:05–2:41 · **36s**

**On screen:** terminal, `pnpm ens:demo-delegation`, output appearing.

**4a · 2:05–2:17**
> Every service listing is an ENS name. The price and the endpoint live on it, and so does the
> account that gets paid.

**4b · 2:17–2:29** — step 1 succeeds.
> The operator owns their listing. They can move their endpoint — that's their business.

**4c · 2:29–2:41** — step 2 is refused; hold on `REFUSED by ENS Enhanced Access Control`.
> They cannot change where the money goes. That refusal isn't our code. It's ENS Enhanced Access
> Control, refusing a transaction from an account that was never given that permission.

**⏱ EDIT POINT.** Step 1 is a real Sepolia transaction: 12–20 seconds to confirm. **Cover:** cut
on the word "endpoint" in 4b, resume on the printed result.

**Setup:** terminal at repo root, `.env` loaded, operator funded. Font large enough to read at
720p — 16pt minimum in a dark terminal.

---

### 5 — One query, three protocols · 2:41–3:07 · **26s**

**On screen:** split or cut between `packages/graph/src/gateway.ts` (the `POOLS_QUERY` constant)
and `dataSource.ts` (the `BY_LABEL` map), then the trace view's left rail showing three listed
services.

**Narration:**
> Curve is a stableswap. Uniswap is concentrated liquidity. Completely different designs.
> This is the only query, and it's the same one for both. There is no per-protocol adapter code
> anywhere in this repo — Messari's standardized schema means there doesn't need to be.

**Setup:** editor open with both files, large font, syntax highlighting on a dark theme.
**⚠ Weakness:** see Risk 4.

---

### 6 — Close · 3:07–3:25 · **18s**

**On screen:** the trace view, or the Etherscan page for `tollgatehq.eth`.

**Narration:**
> Everything here is live and verifiable: the names on Sepolia, the payments on Hedera, the data
> from The Graph. We also filed what we learned building it — including a fix back to the Hedera
> harness.

---

## Risks — read this first

**Risk 1 · The live run needs several takes.**
The model takes 5–15 seconds per call and makes two to four calls. Expect the whole run to take
60–120 seconds of wall clock for 75 seconds of screen time. Record three or four runs and cut the
best. The decisions differ slightly each time — that is fine and arguably good, but it means the
narration must not quote a number the run might not produce. **The script avoids exact figures
except the ceiling and the spend, which should be checked against the take used.**

**Risk 2 · Settlement fails roughly one run in thirty.**
Observed and written up. If it fails on camera the agent declines and the take is unusable. It is
also cheap to retry. **Mitigation:** record extra takes; do not attempt to film this beat once.

**Risk 3 · Resolved — the refusal is filmed live after all.**

The placeholder refusal cannot be reproduced: the placeholder is gone from every code path because
mocked data is disqualifying on both Graph tracks. Filming its archived replay was the plan.

A better option was tested instead and it holds: **"what is the current price of ETH?"** — six
runs, six declines, zero spent, six affordable plans on the table every time.

Two candidates were tried. An off-topic question (the weather in Tokyo) declined 3/3 but makes the
decision look easy — a sceptical judge reads it as pattern-matching. The ETH-price question is
strictly stronger because it is **on-topic and the data is plausibly relevant**: DEX pool data
sounds exactly like where a price would live. The agent has to establish that it is not, and it
does:

> "I value a reliable current ETH price at up to 0.01 HBAR if it came from a source that actually
> provides prices or reserves. None of these offers provide that, and public price APIs are
> available free."

> "Paying on-chain for pool TVL data that doesn't include prices is not worth any of the budget."

That is a judgment decline with money available, not an arithmetic one, and it exercises the *is it
worth paying* decision rather than *is the answer good enough*. It is also a cleaner pairing than
the original: **the same agent, two reasonable questions, opposite outcomes, both live**, with
nothing on screen needing a caveat.

*Rejected: the tight-budget variant.* Two runs, two different failures — one purchase error, one
spend-then-decline on data quality. Not reliable enough to film.

*The placeholder trace stays in the repo* and remains linked from the interface. It is good
evidence; it is simply no longer what we film.

**Risk 4 · Resolved by changing the claim to the one the screen proves.**
The map already contains every entry, so there is no diff showing a protocol being added, and
saying "one line" invites a judge to look for evidence that is not there — which discounts the
rest. The narration now claims what is visible and checkable in thirty seconds: **no per-protocol
adapter code exists anywhere in the repo**, three protocol families, one query. That is the actual
Track C argument and it is the stronger one.

**Risk 5 · Terminal legibility at 720p.**
Beats 4 and 5 are terminal and editor shots. 16pt minimum, high-contrast theme, window cropped to
the relevant region. Test one frame at 720p before recording the whole thing.

---

## Recording setup — do these in order

Beats 2 and 3 need the **local** UI in live mode; the hosted one is replay-only by design. Beats 4
and 5 are terminal and editor. The hosted URL appears only if you want it in the intro shot.

### 1 · Before opening anything

```bash
cd <repo>
pnpm gates                    # must be all green — do not record against a broken dependency
```

Expect `Gate 1c` to settle a real payment. If it fails, run it again — roughly one in thirty fails
transiently (Risk 2). Two failures in a row means something is actually wrong; stop.

Check in the same output:
- `Gate 0 Deployer` — Sepolia balance above 0.02 ETH
- `Gate 1b` — Hedera balance above 1 HBAR
- `Gate 2c` — reports 3 services and resolves `x402:price`

### 2 · Warm the model and confirm the beats reproduce

```bash
pnpm --filter @tollgate/agent demo "what are the top uniswap pools by TVL right now?"
```

Should answer. This also warms caches so the filmed run is not the first call of the session.

### 3 · Start the local UI in live mode

```bash
pnpm --filter @tollgate/web dev
```

Wait for `service listening on :<port>` **and** `reasoning with openai/gpt-5-mini`. Booting forks
Sepolia and takes 40–60 seconds. Open `http://127.0.0.1:8500`.

**Confirm on screen before recording:**
- left rail lists **uniswap-pools** and **dex-pools** (the fork lists two; the live registry has
  three — this is expected and not worth explaining on camera)
- budget selector reads **0.05 HBAR**
- question box contains the beat-2 question

### 4 · Windows, in the order you will need them

| Beat | Window | Set up |
|---|---|---|
| 1 | Browser, hosted URL | `tollgate-web-production.up.railway.app`, scrolled to top, chrome minimal |
| 2, 3 | Browser, `127.0.0.1:8500` | live mode, budget 0.05 HBAR |
| 4 | Terminal, repo root | `.env` loaded, **16pt minimum**, dark, cropped |
| 5 | Editor | `packages/graph/src/gateway.ts` (the `POOLS_QUERY` constant) and `dataSource.ts` (the `BY_LABEL` map), both open, 16pt+ |

### 5 · Test one frame at 720p

Record ten seconds of the terminal and the editor, export at 720p, and read it back. Fixing type
size after recording everything is the expensive mistake.

### 6 · Read the script aloud once, timed

Target 3:25. If the read lands over 3:45, cut the second sentence of beat 5 first — it is the most
compressible.

---

## During recording

- **Beat 2 and 3 questions are different.** Beat 2: *"what are the top uniswap pools by TVL right
  now?"* Beat 3: *"what is the current price of ETH?"* Reset the budget to 0.05 between them.
- **Record beat 2 three or four times** and cut the best. Decisions vary slightly between runs —
  that is fine, but check the take you use against the figures you say aloud.
- **Beat 4 runs `pnpm ens:demo-delegation`.** It sends a real Sepolia transaction and restores the
  endpoint afterwards, so it is safe to run repeatedly.
- **Never say a number the take did not produce.** The only figures in the narration are the
  ceiling and the spend; check both against the footage.

## Known state you cannot produce on demand

- The **placeholder refusal** — archived only, and no longer filmed (Risk 3).
- **Settlement failure** — cannot be forced, and roughly one run in thirty. If it appears in a
  take, that take is unusable; it is not a filmable beat.
