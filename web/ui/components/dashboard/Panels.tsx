import { cn } from "@/lib/utils";
import type { IncompleteScan, Listing } from "@/hooks/useRun";

/** A bare network fact. Deliberately furniture: no fill, no colour, mono throughout. */
export function NetworkLine({ children }: { children: React.ReactNode }) {
  return (
    <div className="font-mono text-[12.5px] leading-relaxed break-all text-muted">{children}</div>
  );
}

/**
 * The outcome.
 *
 * A decline gets the same panel, the same weight and the same real estate as an answer, because
 * refusing to spend is a result and not a failure to produce one.
 */
export function FinalPanel({
  kind,
  heading,
  body,
  footnote,
}: {
  kind: "answer" | "declined" | "failed";
  heading: string;
  body: string;
  footnote: string;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border border-rule border-l-2 bg-raised px-5 py-4",
        kind === "answer" && "border-l-good",
        kind === "declined" && "border-l-bad",
        kind === "failed" && "border-l-judgment",
      )}
    >
      <h3 className="mb-2.5 text-[12.5px] font-semibold text-muted">{heading}</h3>
      <div className="max-w-[72ch] text-[15px] leading-relaxed whitespace-pre-wrap text-ink">
        {body}
      </div>
      <div className="mt-3 border-t border-rule pt-2.5 font-mono text-[12.5px] text-muted">
        {footnote}
      </div>
    </div>
  );
}

/** What is listed on ENS right now, read from the live registry rather than a hard-coded list. */
export function ServiceRail({
  listings,
  parent,
  incomplete,
}: {
  listings: Listing[] | null;
  parent: string;
  incomplete?: IncompleteScan | null;
}) {
  return (
    <aside className="border-rule px-4 pt-5 pb-10 lg:border-r">
      <div className="flex items-center justify-between text-[10.5px] font-semibold tracking-[0.11em] text-dim uppercase">
        <span>Listed on ENS</span>
        <span className="font-mono">{listings?.length ?? "—"}</span>
      </div>

      <div className="mt-2.5 flex gap-2.5 overflow-x-auto lg:flex-col lg:overflow-visible">
        {listings === null ? (
          <p className="text-[12.5px] text-dim">reading the registry…</p>
        ) : listings.length === 0 ? (
          <p className="max-w-[34ch] text-[12.5px] text-dim">
            The catalogue could not be read from Sepolia just now. Archived runs below are
            unaffected.
          </p>
        ) : (
          listings.map((l) => (
            <div
              key={l.label}
              className="min-w-[210px] rounded-[10px] border border-rule bg-surface px-3.5 py-3 lg:min-w-0"
            >
              <div className="flex items-baseline justify-between gap-2.5">
                <span className="font-mono text-[12px] text-ink">{l.label}</span>
                <span className="tnum font-mono text-[12px] whitespace-nowrap text-judgment">
                  {l.unitPrice} / {l.unit}
                </span>
              </div>
              <p className="mt-1.5 text-[12.5px] leading-normal text-muted">{l.context}</p>
              <div className="mt-2.5 border-t border-rule pt-2 font-mono text-[10.5px] text-dim">
                {l.name ?? `${l.label}.${parent}`}
              </div>
            </div>
          ))
        )}
      </div>

      {incomplete ? (
        <p className="mt-3 rounded-lg border border-judgment/35 bg-judgment/8 px-3 py-2.5 text-[11.5px] leading-normal text-muted">
          <span className="font-mono text-[10px] tracking-[0.08em] text-judgment uppercase">
            incomplete event log
          </span>
          <br />
          {incomplete.detail} Listings recovered: {incomplete.recovered.join(", ")}.
        </p>
      ) : null}
    </aside>
  );
}

/** Shown while a run is between events, so an idle screen is never mistaken for a stalled one. */
export function Working({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2.5 pt-3 font-mono text-[12.5px] text-dim">
      <span className="flex gap-[3px]" aria-hidden>
        <i className="h-3 w-[3px] rounded-[1px] bg-rule-lit" />
        <i className="h-3 w-[3px] rounded-[1px] bg-rule-lit" />
        <i className="h-3 w-[3px] rounded-[1px] bg-rule-lit" />
      </span>
      {label}
    </div>
  );
}

/** An archived run must never be mistakable for a live one. */
export function ReplayBanner({ name, note }: { name: string; note?: string }) {
  return (
    <div className="mb-5 rounded-lg border border-judgment/40 bg-judgment/10 px-4 py-3">
      <div className="font-mono text-[11px] tracking-[0.09em] text-judgment uppercase">
        Recorded run — not live
      </div>
      <p className="mt-1.5 max-w-[80ch] text-[13px] leading-normal text-muted">
        {note ??
          "A real run that already happened, replayed from its archive. No payment is being made now."}
      </p>
      <div className="mt-1.5 font-mono text-[11px] text-dim">{name}</div>
    </div>
  );
}
