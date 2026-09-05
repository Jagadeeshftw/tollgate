# Substreams — The Graph SKILLs challenge

A Substreams that decodes **Uniswap V3 swaps on Ethereum mainnet**, built from one plain-English
prompt using [`streamingfast/substreams-skills`](https://github.com/streamingfast/substreams-skills).

**This is standalone.** It is not wired into the agent, the three ENS-listed services, or the
dashboard — those are the demo path and were frozen for filming. Listing a Substreams-backed service
on ENS beside the others is the obvious next step and deliberately not taken yet.

[`PROMPT.md`](PROMPT.md) is the artifact: the verbatim prompt, every intervention, and the
correctness check, written during the run rather than reconstructed after it.

## Run it

```bash
export SUBSTREAMS_API_TOKEN=...        # substreams auth → thegraph.market; NOT a Subgraph Studio key
cd uniswap-v3-swaps
substreams protogen ./substreams.yaml --exclude-paths="sf/substreams,google"
cargo build --target wasm32-unknown-unknown --release
substreams run -e mainnet.eth.streamingfast.io:443 substreams.yaml map_swaps -s 21000000 -t +2 -o jsonl
```

Needs the `substreams` CLI, `buf`, and a Rust toolchain with `wasm32-unknown-unknown`. `pnpm gates`
checks the token is a live JWT the endpoint accepts (Gate 3d) — a Subgraph Studio key is a different
credential and is rejected with `invalid JWT token`.

## What it emits

One `Swap` message per event, with `amount0`/`amount1` as **signed decimal strings** — `int256` read
as unsigned turns an outflow into an astronomical inflow — and `tick` sign-extended from `int24`.

Verified against an independent `eth_getLogs` on block `25911406`: **25 swaps both ways, identical
first pool**.
