import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * A code sample read from `docs/samples/` at build time — never retyped into the page.
 *
 * The badge is derived from the file's own first-line marker, the same one `pnpm gate:docs` reads:
 * `@executable` samples are run by the gate and must print a result; `@illustrative` ones are never
 * run. So the page cannot claim a sample is verified unless the gate verifies it.
 */
export function Sample({ path, title }: { path: string; title: string }) {
  const src = readFileSync(join(process.cwd(), "..", "..", "docs", "samples", path), "utf8");
  const executable = src.split("\n").slice(0, 3).join("\n").includes("@executable");
  return (
    <figure className="my-5 overflow-hidden rounded-lg border border-rule bg-surface">
      <figcaption className="flex flex-wrap items-center justify-between gap-2 border-b border-rule px-4 py-2.5">
        <span className="text-[13px] font-semibold text-ink">{title}</span>
        <span className="font-mono text-[10.5px] tracking-[0.06em] uppercase">
          {executable ? (
            <span className="text-good">executed by pnpm gate:docs</span>
          ) : (
            <span className="text-dim">illustrative — sends a transaction, not run</span>
          )}
          <span className="ml-3 text-dim normal-case">docs/samples/{path}</span>
        </span>
      </figcaption>
      <div className="overflow-x-auto">
        <pre className="px-4 py-3.5 font-mono text-[12.5px] leading-relaxed text-muted">{src}</pre>
      </div>
    </figure>
  );
}
