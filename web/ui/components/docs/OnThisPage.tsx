"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import type { DocsSection } from "@/lib/docs-nav";

/**
 * The current page's own headings, with the one currently in view highlighted.
 *
 * @remarks
 * Reads the section ids from `docs-nav.ts` rather than scanning the DOM for headings — the page's
 * `<h2 id="...">` elements are the source of truth for anchoring, this is only asked to agree with
 * them. An `IntersectionObserver` over those same elements drives the highlight; the top margin is
 * negative on both edges so a heading counts as "current" once it has cleared the sticky header,
 * not only when it is exactly centred.
 */
export function OnThisPage({ sections }: { sections: readonly DocsSection[] }) {
  const [active, setActive] = useState<string | null>(sections[0]?.id ?? null);

  useEffect(() => {
    if (sections.length === 0) return;
    const elements = sections
      .map((s) => document.getElementById(s.id))
      .filter((el): el is HTMLElement => el !== null);
    if (elements.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).map((e) => e.target.id);
        if (visible.length > 0) setActive(visible[0]!);
      },
      { rootMargin: "-96px 0px -70% 0px", threshold: 0 },
    );
    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [sections]);

  if (sections.length === 0) return null;

  return (
    <div>
      <p className="font-mono text-[10.5px] tracking-[0.11em] text-dim uppercase">On this page</p>
      <ul className="mt-3 space-y-2">
        {sections.map((s) => (
          <li key={s.id}>
            <a
              href={`#${s.id}`}
              className={cn(
                "text-[13px] transition-colors",
                active === s.id ? "text-ink" : "text-muted hover:text-ink",
              )}
            >
              {s.label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
