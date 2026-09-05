import { cn } from "@/lib/utils";

const STEPS = [
  ["Reads the marketplace off the chain", "Replays the registrar's events, then reads each listing's current terms from the resolver. No endpoint list is handed to it."],
  ["Arithmetic decides what is affordable", "Every service crossed with every size, priced, filtered by budget — before the model is consulted."],
  ["The model decides what is worth buying", "Which service, how many units, and the most it would pay. Sometimes the answer is nothing at all."],
  ["Pays, then judges what came back", "A real transfer on Hedera. Then it decides whether the data actually answers the question."],
] as const;

/**
 * What the screen shows before a run.
 *
 * This is the state a judge lands on and the state the recording opens on, so it carries real
 * content rather than an empty column: the archived runs are the primary call to action, and the
 * four steps below say what is about to happen. An idle screen that is mostly blank reads as a
 * page that failed to load.
 */
export function IdleState({
  traces,
  labels,
  onReplay,
}: {
  traces: string[];
  labels: Record<string, { title: string; detail: string }>;
  onReplay: (name: string) => void;
}) {
  return (
    <div className="pt-6">
      <p className="max-w-[68ch] text-[15px] leading-relaxed text-muted">
        Ask a question above and the agent will read the catalogue off ENS, work out what it can
        afford, decide what is worth buying, and pay for it on Hedera — or decide that nothing here
        answers you, and buy nothing.
      </p>

      {traces.length > 0 ? (
        <>
          <div className="mt-8 text-[10.5px] font-semibold tracking-[0.11em] text-dim uppercase">
            Or watch a run that already happened
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {traces.map((t) => {
              const meta = labels[t];
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => onReplay(t)}
                  className={cn(
                    "rounded-xl border border-rule bg-surface p-4 text-left",
                    "transition-colors hover:border-rule-lit",
                  )}
                >
                  <div className="text-[14.5px] font-semibold text-ink">{meta?.title ?? t}</div>
                  <p className="mt-1.5 text-[12.5px] leading-normal text-muted">
                    {meta?.detail ?? "A real run against live infrastructure."}
                  </p>
                  <div className="mt-2.5 font-mono text-[10.5px] text-dim">{t}</div>
                </button>
              );
            })}
          </div>
        </>
      ) : null}

      <div className="mt-9 border-t border-rule pt-5">
        <div className="text-[10.5px] font-semibold tracking-[0.11em] text-dim uppercase">
          What happens when you ask
        </div>
        <ol className="mt-3 grid gap-x-8 gap-y-3 sm:grid-cols-2">
          {STEPS.map(([h, p], i) => (
            <li key={h} className="grid grid-cols-[26px_1fr] items-start gap-2">
              <span className="pt-px font-mono text-[11px] text-judgment">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span>
                <span className="block text-[13.5px] font-medium text-ink">{h}</span>
                <span className="mt-0.5 block max-w-[46ch] text-[12.5px] leading-normal text-muted">
                  {p}
                </span>
              </span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
