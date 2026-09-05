/**
 * The legend is load-bearing, not decoration.
 *
 * Without it the colour on a decision card reads as emphasis. With it, colour means "this could
 * have gone the other way" — which is the single claim the whole trace exists to support.
 */
export function Legend() {
  return (
    <div className="flex flex-wrap gap-x-6 gap-y-2 border-b border-rule pb-4 text-[12.5px] text-muted">
      <div className="flex items-center gap-2.5">
        <span className="size-3 flex-none rounded-[2px] border border-rule-lit" />
        <span>
          <b className="font-semibold text-ink">Arithmetic</b> — could not have come out otherwise
        </span>
      </div>
      <div className="flex items-center gap-2.5">
        <span className="size-3 flex-none rounded-[2px] bg-judgment" />
        <span>
          <b className="font-semibold text-ink">Model decided</b> — could have gone the other way
        </span>
      </div>
      <div className="flex items-center gap-2.5">
        <span className="size-3 flex-none rounded-[2px] bg-dim opacity-55" />
        <span>Network</span>
      </div>
    </div>
  );
}
