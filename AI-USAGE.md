# AI Usage

Required by ETHOnline rules: AI tools are permitted, but where and how they were used must be
documented, and the direction given to the AI must be in the repository for judges to read.

## Tool

Claude (Opus) via Claude Code, used as a pair programmer throughout.

## How it was directed

This project is spec-driven. The full build specification was written first, by hand, and the AI
was directed against it rather than prompted freehand.

- [`spec/BUILD-SPEC.md`](spec/BUILD-SPEC.md) — the specification the whole build is written to.
  Architecture, per-partner requirements, phase order and kill criteria.
- [`spec/PROMPTS.md`](spec/PROMPTS.md) — running log of what was asked of the AI and what came back.
- [`spec/PHASE-0-GATES.md`](spec/PHASE-0-GATES.md) — the pre-build dependency verification.

## Per-area breakdown

This table is updated as the build proceeds. "Assisted" means AI wrote a first draft that was then
read, corrected and tested by hand. "Hand-written" means no AI involvement.

| Area | AI involvement | Notes |
|---|---|---|
| `spec/BUILD-SPEC.md` | Hand-written | The specification directing everything else. |
| `spec/PHASE-0-GATES.md` | Assisted | AI ran the live probes and drafted the findings. Every result in it is reproducible via `pnpm gates`. |
| `scripts/gates.ts` | Assisted | Turns the Phase 0 probes into a re-runnable check. |
| Repo scaffold | Assisted | Workspace layout, tsconfig, env template. |

## Verification stance

Findings produced with AI assistance were not taken on trust. The Phase 0 gates in particular are
re-runnable against live infrastructure (`pnpm gates`) precisely so that no claim in this repo
rests on something the model asserted from memory — contract addresses are confirmed by reading
bytecode on Sepolia, and the payment facilitator is confirmed by querying it.
