"use client";

import { useEffect, useState } from "react";

const EXAMPLES = [
  "what are the top uniswap pools by TVL right now?",
  "compare pool TVL across every DEX you can",
  "what is the current price of ETH?",
];

/**
 * The centre of the page.
 *
 * Asking is the product, so the input is the largest thing on the surface rather than one control
 * in a header row. The budget options are filtered against the server's cap so no control here can
 * offer something the server will refuse.
 */
export function CommandBar({
  onAsk,
  running,
  maxTinybar,
  disabled,
  initialQuestion,
}: {
  onAsk: (question: string, budget: string) => void;
  running: boolean;
  maxTinybar: bigint;
  disabled?: boolean;
  /** A question carried over from the landing page's hero input. */
  initialQuestion?: string | null;
}) {
  const [question, setQuestion] = useState(EXAMPLES[0]!);
  // The handoff arrives after mount, so adopt it once rather than seeding state with it.
  const [adopted, setAdopted] = useState(false);
  useEffect(() => {
    if (initialQuestion && !adopted) {
      setQuestion(initialQuestion);
      setAdopted(true);
    }
  }, [initialQuestion, adopted]);
  const options = [200_000n, 500_000n, 1_000_000n, 2_000_000n, 5_000_000n].filter(
    (o) => o <= maxTinybar,
  );
  const [budget, setBudget] = useState(String(options.at(-1) ?? maxTinybar));

  return (
    <div className="border-b border-rule bg-surface px-6 py-5">
      <form
        className="flex max-w-[1080px] flex-col gap-2.5 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          if (!running && !disabled) onAsk(question, budget);
        }}
      >
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          disabled={disabled}
          aria-label="Ask the agent a question"
          className="min-w-0 flex-1 rounded-lg border border-rule-lit bg-ground px-4 py-3 text-[15px] text-ink placeholder:text-dim disabled:opacity-50"
          placeholder="Ask the agent a question…"
        />
        <div className="flex gap-2.5">
          <select
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
            disabled={disabled}
            aria-label="Budget"
            className="rounded-lg border border-rule-lit bg-ground px-4 py-3 text-[14px] text-ink disabled:opacity-50"
          >
            {options.map((o) => (
              <option key={String(o)} value={String(o)}>
                budget {Number(o) / 1e8} HBAR
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={running || disabled}
            className="rounded-lg bg-judgment px-6 py-3 text-[14px] font-semibold text-ground disabled:opacity-40"
          >
            {running ? "Running…" : "Ask"}
          </button>
        </div>
      </form>

      <div className="mt-3 flex max-w-[1080px] flex-wrap items-center gap-x-4 gap-y-2 text-[12.5px] text-dim">
        <b className="font-medium text-muted">Try:</b>
        {EXAMPLES.map((ex) => (
          <button
            key={ex}
            type="button"
            onClick={() => setQuestion(ex)}
            className="rounded-full border border-rule px-3 py-1 text-[12.5px] text-muted hover:border-rule-lit hover:text-ink"
          >
            {ex}
          </button>
        ))}
      </div>
    </div>
  );
}
