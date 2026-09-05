import { cn } from "@/lib/utils";
import { STAGES } from "@/lib/trace";

/**
 * Where the run has got to.
 *
 * Driven entirely by events that have actually arrived — never by a timer. A strip that advances
 * on its own would show progress the agent has not made, which is the one thing this project
 * cannot afford to render. It changes state; it does not animate.
 */
export function StateStrip({
  reached,
  done,
  spent,
  budget,
  declined,
}: {
  reached: number;
  done: boolean;
  spent?: string;
  budget?: string;
  declined?: boolean;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-center gap-x-3.5 gap-y-2 rounded-lg border border-rule bg-surface px-4 py-2.5">
      <span className="font-mono text-[11px] tracking-[0.09em] text-dim uppercase">Run</span>
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
        {declined ? (
          <>
            <Stage label="discovered" state="done" />
            <Sep />
            <Stage label="priced" state="done" />
            <Sep />
            <Stage label="declined to buy" state="end" />
          </>
        ) : (
          STAGES.map((s, i) => (
            <span key={s} className="flex items-center gap-1.5">
              {i > 0 ? <Sep /> : null}
              <Stage
                label={s}
                // A finished run still has to say where it finished — marking every stage "done"
                // leaves the strip uniformly grey with nothing to read.
                state={i < reached ? "done" : i === reached ? (done ? "end" : "now") : "todo"}
              />
            </span>
          ))
        )}
      </div>
      {spent ? (
        <span className="tnum ml-auto font-mono text-[12px] text-muted">
          spent {spent}
          {budget ? ` of ${budget}` : ""}
        </span>
      ) : null}
    </div>
  );
}

function Sep() {
  return <span className="text-rule-lit">→</span>;
}

function Stage({ label, state }: { label: string; state: "done" | "now" | "todo" | "end" }) {
  return (
    <span
      className={cn(
        "text-[12px]",
        state === "done" && "text-muted",
        state === "now" && "font-semibold text-judgment",
        state === "end" && "font-semibold text-good",
        state === "todo" && "text-dim",
      )}
    >
      {label}
    </span>
  );
}
