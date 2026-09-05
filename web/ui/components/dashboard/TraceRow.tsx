import { cn } from "@/lib/utils";
import { ACTOR_LABEL, type Actor } from "@/lib/trace";

/**
 * One move in the run, with its attribution in the gutter.
 *
 * The gutter is the spine of the view: every row is answerable for who made it. On narrow
 * viewports the gutter cannot survive, so the same attribution becomes a labelled strip above the
 * body — same three categories, same colour rule, a third of the horizontal cost.
 */
export function TraceRow({
  actor,
  heading,
  children,
}: {
  actor: Actor;
  heading?: string;
  children: React.ReactNode;
}) {
  const judged = actor === "judgment";
  return (
    <div className="grid grid-cols-1 gap-x-5 md:grid-cols-[128px_minmax(0,1fr)]">
      {/* Mobile: attribution as a rule-and-label strip. */}
      <div
        className={cn(
          "mb-2 border-l-2 pl-2 font-mono text-[10px] uppercase tracking-[0.09em] md:hidden",
          judged ? "border-judgment text-judgment" : "border-rule-lit text-dim",
        )}
      >
        {ACTOR_LABEL[actor]}
      </div>

      {/* Desktop: the gutter. */}
      <div className="relative hidden border-r border-rule pt-[18px] pr-3.5 text-right md:block">
        <span
          className={cn(
            "font-mono text-[10px] uppercase tracking-[0.09em]",
            judged ? "text-judgment" : "text-dim",
          )}
        >
          {ACTOR_LABEL[actor]}
        </span>
        <span
          aria-hidden
          className={cn(
            "absolute top-[22px] -right-[4px] size-[7px] rounded-full border",
            judged ? "border-judgment bg-judgment" : "border-rule-lit bg-ground",
          )}
        />
      </div>

      <div className="min-w-0 pt-1 pb-5">
        {heading ? (
          <h3 className="mb-2.5 text-[12.5px] font-semibold text-muted">{heading}</h3>
        ) : null}
        {children}
      </div>
    </div>
  );
}
