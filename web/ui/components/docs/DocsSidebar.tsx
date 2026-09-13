"use client";

import { cn } from "@/lib/utils";
import { DOCS_PAGES, normalizeDocsPath } from "@/lib/docs-nav";

/**
 * Persistent left navigation. A page's own sections only appear nested beneath it while that page
 * is active — the sidebar shows where you are, not the whole site's table of contents at once.
 */
export function DocsSidebar({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  const current = normalizeDocsPath(pathname);
  return (
    <div className="space-y-6 text-[13.5px]">
      <div>
        <p className="mb-2 font-mono text-[10.5px] tracking-[0.11em] text-dim uppercase">Welcome</p>
        <a
          href="/docs"
          onClick={onNavigate}
          className={cn(
            "block rounded-md px-2.5 py-1.5 transition-colors",
            current === "/docs" ? "bg-surface text-ink" : "text-muted hover:text-ink",
          )}
        >
          Introduction
        </a>
      </div>

      <div>
        <p className="mb-2 font-mono text-[10.5px] tracking-[0.11em] text-dim uppercase">Docs</p>
        <div className="space-y-1">
          {DOCS_PAGES.filter((p) => p.href !== "/docs").map((page) => {
            const active = current === page.href;
            return (
              <div key={page.href}>
                <a
                  href={page.href}
                  onClick={onNavigate}
                  className={cn(
                    "block rounded-md px-2.5 py-1.5 font-medium transition-colors",
                    active ? "bg-surface text-ink" : "text-muted hover:text-ink",
                  )}
                >
                  {page.label}
                </a>
                {active && page.sections.length > 0 ? (
                  <ul className="mt-1 ml-2.5 space-y-0.5 border-l border-rule pl-3">
                    {page.sections.map((s) => (
                      <li key={s.id}>
                        <a
                          href={`${page.href}#${s.id}`}
                          onClick={onNavigate}
                          className="block py-1 text-[12.5px] text-dim transition-colors hover:text-ink"
                        >
                          {s.label}
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
