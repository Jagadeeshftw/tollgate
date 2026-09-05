# Substreams SKILLs challenge — the process, recorded as it happened

The Graph's featured challenge is *prompt to deployed Substreams*. The process is the artifact, so
this file is written **during** the run, not reconstructed afterwards. Every intervention is logged,
including the ones that make the tooling look worse than its own evaluation suggests.

**Kit under test:** [`streamingfast/substreams-skills`](https://github.com/streamingfast/substreams-skills)
@ `2026-08-17`, 11 skills, installed as a Claude Code plugin.
**Their published result:** `EVAL.md` — 14 tasks, 100% build, 100% run, 12/14 byte-correct.
**Toolchain:** substreams CLI 1.22.0, rustc 1.97.1, wasm32-unknown-unknown.

---

## The prompt, verbatim

> Index Uniswap V3 swaps on Ethereum mainnet. For every swap, emit the pool address, the two token
> amounts, the sender, and the block number and timestamp. I want to be able to see which pools are
> most active in a block range.

Nothing else was given: no ABI file, no contract address, no module skeleton, no schema.

---

## Log

### 1 · Pre-flight — the kit interviews you, it does not one-shot

`substreams-dev` mandates a clarification protocol before any code: *"One question per turn — never
batch a questionnaire"*, walking a seven-row table (chain, contracts, data, sink, block range,
filters, sparsity). It permits skipping only when *"the prompt is concrete and complete"*.

**Finding.** "Prompt to deployed" is accurate about the destination, not about the number of turns.
The kit is an expert interviewer, not a one-shot generator. That is the right design — the questions
it asks are the ones that change the output — but it is worth stating plainly, because the challenge
framing implies a single prompt goes in and a deployment comes out.

The prompt above named chain, protocol, event and fields, so the checklist was skipped and the
build started. Output destination came from the operator, not the prompt.

### 2 · Decoding path — chosen without an ABI

The kit offers ABI + `Abigen`, or raw `topic0` decoding. Raw was chosen: one canonical event, no ABI
file to fetch, one fewer dependency in the wasm. The kit supports this explicitly and its own
examples T1.2/T6.1 use it.

`topic0` was computed with `cast keccak` and then cross-checked against the kit's verified constants
table. Both agree:
`c42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67`.

The skill is blunt that inventing one is the classic failure — *"Do not invent topic0 or param
order"* — so it was derived twice rather than recalled.

### 3 · Three interventions the kit's own EVAL.md does not predict

Their evaluation reports 100% build and 100% run across 14 tasks. That is believable for the *code*;
it is not the whole cost of getting there.

| # | What happened | Cost |
|---|---|---|
| 1 | `prost-build` in `build.rs` failed: **`protoc` not installed**. The kit lists it under Prerequisites but the scaffold assumes it. | Switched to `substreams protogen`, the CLI's own path, and deleted `build.rs` entirely. |
| 2 | `substreams protogen` then failed: **`buf` not installed** either. Neither is bundled with the CLI. | Installed `buf` v1.72.0 from its release binary. |
| 3 | With `protogen` generating the bindings, `prost-build` became dead weight. | Removed `[build-dependencies]`. |

None is a defect in the skills' *knowledge* — the Rust they describe compiled first time once the
toolchain existed. All three are the gap between "the agent knows what to write" and "the machine
can build it", which an evaluation harness with a pre-provisioned toolchain will never surface.

**The skill content itself was accurate and unusually specific.** Two examples that would each have
cost real time: `ethabi` must be pinned to `17`, not `18`, or a second copy of the whole stack links
into the wasm; and the crate's own published docs telling you to add `getrandom` and call `init!()`
are stale, with `init!()` registering a handler that *always returns an error*. That is hard-won,
and it is the kind of thing a model would otherwise confabulate.

### 4 · Built and run against live mainnet

```
cargo build --target wasm32-unknown-unknown --release   →  231,210 byte wasm
substreams run -e mainnet.eth.streamingfast.io:443 substreams.yaml map_swaps -s 21000000 -t 21000002
```

Real output, first block:

```json
{"pool":"0x120ffad35bb97a5baf9ab68f9dd7667864530245",
 "amount0":"3376766029478815996372303","amount1":"-1314200147282915139",
 "tick":-147502,"blockNumber":"21000000","blockTimestamp":"1729345547"}
```

The negative `amount1` and negative `tick` are the load-bearing details: `int256` read as unsigned
turns an outflow into an astronomical inflow, and `int24` without sign extension puts every
below-price tick at ~16.7 million.

### 5 · Correctness checked against an independent source, not eyeballed

A plausible-looking decode is not a correct one. Public archive RPCs refused historical `eth_getLogs`
without a paid token — and `cast logs` returned **0 rather than erroring**, the same silent-failure
class this project has been chasing all week — so the check was run against a recent block instead.

Block `25911406`, Swap `topic0`, independent `eth_getLogs` versus the Substreams:

| | Independent RPC | Substreams |
|---|---|---|
| Swap count | 25 | **25** |
| First pool | `0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640` | **identical** |

Amounts are coherent on inspection too — 19,546 USDC in against 7.94 WETH out of the USDC/WETH
0.05% pool. Count and ordering match exactly.

### 6 · Local SQL sink — worked, after two more interventions

`substreams-sql` was followed for the CDC path: a `db_out` module emitting `DatabaseChanges`, a
`schema.sql`, and the sink built into the CLI.

| # | What happened | Cost |
|---|---|---|
| 4 | **Docker daemon would not start** — `colima start` died with `error starting vm`. | `colima delete --force` then a clean `colima start`. Environment, not the kit. |
| 5 | `substreams build` failed: `name conflict over sf.substreams.sink.sql.v1.Service`, from the `sql` protodefs spkg the skill's manifest template tells you to import. Adding it to `excludePaths` does **not** help — the clash is in the packed image, not in codegen. | **Dropped the `sql` import entirely.** The SQL sink is built into the CLI now, so the protodefs import is both unnecessary and actively harmful. The skill's own manifest template still carries it. |

That fifth one is the single genuine defect found in the kit: following its documented manifest
verbatim produces a package that will not build.

Then it worked:

```
substreams sink postgres setup uniswap-v3-swaps-v0.1.0.spkg   →  setup completed successfully
substreams sink postgres uniswap-v3-swaps-v0.1.0.spkg -e mainnet.eth.streamingfast.io:443 \
    --final-blocks-only --stop-block 21000050
```

**490 rows across 50 blocks**, signed amounts and ticks intact through the wasm → protobuf →
`DatabaseChanges` → Postgres `NUMERIC` path:

```
                   pool                    | swaps | first_block | last_block
0xc7bbec68d12a0d1830360f8ec58fa599ba1b0e9b |    36 |    21000001 |   21000049
0x1d8142ad6732f4c818c0bd0a72eabf765b3642f6 |    33 |    21000003 |   21000048
0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640 |    18 |    21000006 |   21000049
```

Which is the prompt's original question — *which pools are most active in a block range* — answered
in SQL from data the pipeline produced.

---

## Verdict

**Prompt to running Substreams: real.** The Rust the kit describes compiled first time and decoded
mainnet correctly, verified against an independent `eth_getLogs` (25 swaps, identical first pool).
Its knowledge is specific and hard-won in exactly the places a model would otherwise confabulate —
`ethabi` pinned to 17 not 18; the crate's own published `getrandom`/`init!()` guidance being stale.

**Prompt to *deployed*: qualified.** Five interventions were needed, none of which their `EVAL.md`
predicts, because an evaluation harness with a pre-provisioned toolchain cannot surface them:

- three were **missing toolchain** (`protoc`, `buf`, a Docker daemon that would not start),
- one was **dead configuration** the kit itself recommends (`prost-build`, superseded by `protogen`),
- one was a **real defect** — the documented SQL manifest does not build.

**Hosted deployment was not attempted.** It needs a The Graph Market account with OWNER/ADMIN, a
device-code browser login, an externally-provisioned database, and it creates billable
infrastructure. The local sink demonstrates the same pipeline without spending anyone's money.

Total: roughly two hours from prompt to rows in Postgres, most of it toolchain rather than code.
