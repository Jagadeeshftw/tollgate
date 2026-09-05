import { cn } from "@/lib/utils";
import { ratioFrom, type PlanView } from "@/lib/trace";

function Pill({ kept }: { kept: boolean }) {
  return (
    <span
      className={cn(
        "inline-block rounded-[3px] border px-1.5 py-0.5 font-mono text-[9.5px] tracking-[0.07em] uppercase whitespace-nowrap",
        kept ? "border-rule-lit text-muted" : "border-rule text-dim",
      )}
    >
      {kept ? "offered" : "excluded"}
    </span>
  );
}

const TH = "border-b border-rule pr-3.5 pb-2 text-left text-[10px] font-semibold tracking-[0.1em] text-dim uppercase whitespace-nowrap";
const TD = "border-b border-rule py-1.5 pr-3.5 align-baseline last:border-0";

/**
 * The decision space, as arithmetic produced it.
 *
 * Excluded rows keep their real cost rather than disappearing, because the claim being made is
 * that the budget is a limit and not a suggestion — and that is only checkable if you can see what
 * the limit removed before the model was ever consulted.
 */
export function PlanTable({
  affordable,
  excluded,
}: {
  affordable: readonly PlanView[];
  excluded: readonly (PlanView & { because: string })[];
}) {
  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr>
              <th className={TH} />
              <th className={TH}>Service</th>
              <th className={TH}>Size</th>
              <th className={TH}>Cost</th>
              <th className={TH}>Why not</th>
            </tr>
          </thead>
          <tbody>
            {affordable.map((p, i) => (
              <tr key={`a${i}`}>
                <td className={TD}><Pill kept /></td>
                <td className={cn(TD, "font-mono")}>{p.label}</td>
                <td className={cn(TD, "tnum font-mono whitespace-nowrap")}>{p.units} {p.unit}</td>
                <td className={cn(TD, "tnum font-mono whitespace-nowrap")}>{p.cost}</td>
                <td className={TD} />
              </tr>
            ))}
            {excluded.map((p, i) => (
              <tr key={`e${i}`} className="text-dim">
                <td className={TD}><Pill kept={false} /></td>
                <td className={cn(TD, "font-mono")}>{p.label}</td>
                <td className={cn(TD, "tnum font-mono whitespace-nowrap")}>{p.units} {p.unit}</td>
                <td className={cn(TD, "tnum font-mono whitespace-nowrap line-through decoration-rule-lit")}>{p.cost}</td>
                <td className={cn(TD, "text-[12.5px] leading-normal text-muted")}>{p.because}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 max-w-[78ch] text-[12px] leading-normal text-dim">
        Excluded by arithmetic, before the model was consulted — never on the menu to be talked
        into. {excluded.length} of {affordable.length + excluded.length} plans removed.
      </p>
    </>
  );
}

/**
 * Rows the data source removed from the ranking, with the figures that removed them.
 *
 * The ratio is lifted into its own column because at 720p nobody divides 9.45e+10 by 5.13e+5 while
 * reading; the full sentence stays because the numbers are the argument, not a summary of it.
 */
export function ExclusionTable({
  rule,
  rows,
}: {
  rule: string;
  rows: readonly { label: string; reported: string; reason: string }[];
}) {
  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr>
              <th className={TH} />
              <th className={TH}>Pool</th>
              <th className={TH}>Reported TVL</th>
              <th className={TH}>Ratio</th>
              <th className={TH}>Why excluded</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="text-dim">
                <td className={TD}><Pill kept={false} /></td>
                <td className={cn(TD, "font-mono text-muted")}>{r.label}</td>
                <td className={cn(TD, "tnum font-mono whitespace-nowrap")}>{r.reported}</td>
                <td className={cn(TD, "tnum font-mono whitespace-nowrap text-muted")}>
                  {ratioFrom(r.reason) ?? "—"}
                </td>
                <td className={cn(TD, "max-w-[46ch] text-[12.5px] leading-normal text-muted")}>
                  {r.reason}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 max-w-[78ch] text-[12px] leading-normal text-dim">{rule}</p>
    </>
  );
}
