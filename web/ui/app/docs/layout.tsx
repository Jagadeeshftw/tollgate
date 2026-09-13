"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { AppBar, NavTab } from "@/components/AppBar";
import { DocsSidebar } from "@/components/docs/DocsSidebar";
import { OnThisPage } from "@/components/docs/OnThisPage";
import { docsPageFor } from "@/lib/docs-nav";

/**
 * The shared shell every docs page renders inside — one continuous surface, not four pages behind
 * a menu. A page itself contributes only its content; navigation, the breadcrumb and the "on this
 * page" column all come from here, driven by `docs-nav.ts`.
 *
 * No search, no ask box: out of scope at four pages, and the second is a product this is not.
 */
export default function DocsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const page = docsPageFor(pathname);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="min-h-dvh bg-ground">
      <AppBar
        nav={
          <>
            <NavTab href="/dashboard">Run</NavTab>
            <NavTab href="/docs" active>Docs</NavTab>
          </>
        }
        status={<span>docs</span>}
      />

      {/* Mobile: the sidebar collapses behind a toggle rather than staying permanently open and
          pushing the content below the fold on a phone. The right-hand "on this page" column is
          folded into the same disclosure — a phone reader does not have room for three columns. */}
      <div className="border-b border-rule px-6 py-2.5 lg:hidden">
        <button
          type="button"
          onClick={() => setMobileNavOpen((v) => !v)}
          className="flex w-full items-center justify-between font-mono text-[12px] text-muted"
          aria-expanded={mobileNavOpen}
        >
          <span>
            Docs · <span className="text-ink">{page.label}</span>
          </span>
          <span aria-hidden>{mobileNavOpen ? "▲" : "▼"}</span>
        </button>
        {mobileNavOpen ? (
          <div className="mt-3 border-t border-rule pt-3">
            <DocsSidebar pathname={pathname} onNavigate={() => setMobileNavOpen(false)} />
            {page.sections.length > 0 ? (
              <div className="mt-5 border-t border-rule pt-4">
                <OnThisPage sections={page.sections} />
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="mx-auto grid max-w-[1320px] gap-10 px-6 pt-8 pb-24 lg:grid-cols-[200px_minmax(0,1fr)_190px]">
        <nav aria-label="Docs" className="hidden lg:block">
          <div className="sticky top-8">
            <DocsSidebar pathname={pathname} />
          </div>
        </nav>

        <article className="min-w-0">
          <p className="mb-6 font-mono text-[11.5px] text-dim">
            <a href="/docs" className="hover:text-ink">
              Docs
            </a>
            {page.href !== "/docs" ? (
              <>
                {" "}
                / <span className="text-muted">{page.label}</span>
              </>
            ) : null}
          </p>
          {children}
        </article>

        <nav aria-label="On this page" className="hidden lg:block">
          <div className="sticky top-8">
            <OnThisPage sections={page.sections} />
          </div>
        </nav>
      </div>
    </div>
  );
}
