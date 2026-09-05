"use client";

import Link from "next/link";
import { useState } from "react";
import { motion, useMotionValueEvent, useScroll } from "motion/react";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "#how", label: "How it works" },
  { href: "#happens", label: "What happens" },
  { href: "#uses", label: "Examples" },
  { href: "#faq", label: "FAQ" },
];

/**
 * The landing header.
 *
 * The scroll-condense is borrowed from Aceternity's resizable-navbar; the layout inside is the
 * same `grid-cols-[auto_1fr_auto]` the dashboard header uses. The original centres its links with
 * `absolute inset-0`, which is exactly the free-floating alignment this project already had a
 * problem with — one grid across both surfaces means neither can drift from the other.
 */
export function LandingNav() {
  const { scrollY } = useScroll();
  const [condensed, setCondensed] = useState(false);
  useMotionValueEvent(scrollY, "change", (y) => setCondensed(y > 80));

  return (
    <motion.header
      animate={{
        backgroundColor: condensed ? "rgba(10,14,19,0.86)" : "rgba(10,14,19,0)",
        borderBottomColor: condensed ? "rgba(30,40,51,1)" : "rgba(30,40,51,0)",
      }}
      transition={{ duration: 0.22 }}
      className="sticky top-0 z-50 border-b backdrop-blur-md"
    >
      <div className="mx-auto grid max-w-[1240px] grid-cols-[auto_1fr_auto] items-center gap-8 px-6 py-3.5">
        <Link href="/" className="text-[17px] font-extrabold tracking-tight text-ink">
          Tollgate
        </Link>
        <nav className="hidden items-center gap-6 md:flex">
          {LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="text-[13.5px] text-muted transition-colors hover:text-ink"
            >
              {l.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2.5">
          <a
            href="https://github.com/Jagadeeshftw/tollgate"
            className="hidden rounded-lg border border-rule px-4 py-2 text-[13.5px] text-muted transition-colors hover:text-ink sm:inline-block"
          >
            GitHub
          </a>
          <Link
            href="/dashboard"
            className={cn(
              "rounded-lg bg-judgment px-4 py-2 text-[13.5px] font-semibold text-ground",
              "transition-opacity hover:opacity-90",
            )}
          >
            Try a live run
          </Link>
        </div>
      </div>
    </motion.header>
  );
}
