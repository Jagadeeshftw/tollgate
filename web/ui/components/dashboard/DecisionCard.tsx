import { cn } from "@/lib/utils";

/**
 * A point where the agent could reasonably have chosen otherwise.
 *
 * Leads with the choice, then the reasoning, then what was turned down and why. The rejected
 * alternatives matter as much as the choice: a card that only shows what was picked is a log line,
 * while one that shows what was passed over is a decision.
 */
export function DecisionCard({
  choice,
  tone = "neutral",
  ledger,
  why,
  rejected,
}: {
  choice: string;
  tone?: "neutral" | "mono" | "yes" | "no";
  ledger?: { label: string; value: string }[];
  why?: string;
  rejected?: readonly { label: string; because: string }[];
}) {
  return (
    <div className="rounded-lg border border-rule border-l-2 border-l-judgment bg-raised px-4 py-4">
      <div
        className={cn(
          "text-[21px] leading-tight font-semibold tracking-tight",
          tone === "mono" && "font-mono text-[19px]",
          tone === "yes" && "text-good",
          tone === "no" && "text-bad",
        )}
      >
        {choice}
      </div>

      {ledger?.length ? (
        <dl className="mt-3 flex flex-wrap gap-x-7 gap-y-2">
          {ledger.map((l) => (
            <div key={l.label} className="flex flex-col gap-0.5">
              <dt className="text-[10.5px] tracking-[0.08em] text-dim uppercase">{l.label}</dt>
              <dd className="tnum font-mono text-[14px] text-ink">{l.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {why ? (
        <p className="mt-2.5 max-w-[68ch] text-[14px] leading-relaxed text-ink">
          <span className="text-dim">&ldquo;</span>
          {why}
          <span className="text-dim">&rdquo;</span>
        </p>
      ) : null}

      {rejected?.length ? (
        <div className="mt-3 grid gap-2 border-t border-rule pt-3">
          {rejected.map((r) => (
            <p key={r.label} className="max-w-[74ch] text-[13px] leading-normal text-muted">
              not <code className="font-mono text-[12.5px] text-ink">{r.label}</code> — {r.because}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}
