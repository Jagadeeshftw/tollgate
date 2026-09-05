"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Dashed rules crossing the panel, adapted from Aceternity's dashed-grid CTA.
 *
 * The device suits the subject — it reads as a plotted axis, not decoration — and it is the same
 * dashed language the FAQ uses, so the bottom of the page holds together.
 */
function DashedRule({ className, vertical }: { className?: string; vertical?: boolean }) {
  return (
    <div
      style={
        {
          "--color": "rgba(227,233,239,0.13)",
          "--dash": "5px",
          "--thick": "1px",
        } as React.CSSProperties
      }
      className={cn(
        "pointer-events-none absolute",
        vertical
          ? "top-0 h-full w-(--thick) bg-[linear-gradient(to_bottom,var(--color),var(--color)_50%,transparent_0,transparent)] bg-size-[var(--thick)_var(--dash)]"
          : "left-0 h-(--thick) w-full bg-[linear-gradient(to_right,var(--color),var(--color)_50%,transparent_0,transparent)] bg-size-[var(--dash)_var(--thick)]",
        className,
      )}
    />
  );
}

export function Closing() {
  return (
    <section className="mx-auto max-w-[1240px] px-6 pb-20">
      <div className="relative overflow-hidden rounded-2xl border border-rule bg-surface px-6 py-16 text-center md:py-20">
        <DashedRule className="top-8" />
        <DashedRule className="bottom-8" />
        <DashedRule vertical className="left-8" />
        <DashedRule vertical className="right-8" />

        <h2 className="relative mx-auto max-w-[22ch] text-[clamp(26px,3.6vw,40px)] font-bold tracking-tight text-balance text-ink">
          Ask it something and watch it decide.
        </h2>
        <p className="relative mx-auto mt-4 max-w-[52ch] text-[15.5px] text-muted">
          A live run against the real registry and the real endpoint. It spends real HBAR, or it
          tells you why it will not.
        </p>
        <div className="relative mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/dashboard"
            className="rounded-lg bg-judgment px-6 py-3 text-[14px] font-semibold text-ground transition-opacity hover:opacity-90"
          >
            Open the dashboard →
          </Link>
          <Link
            href="/dashboard?replay=answer-with-exclusions"
            className="rounded-lg border border-rule-lit px-6 py-3 text-[14px] text-muted transition-colors hover:text-ink"
          >
            Watch a recorded run
          </Link>
        </div>
      </div>
    </section>
  );
}

const COLS: { h: string; links: { label: string; href: string }[] }[] = [
  {
    h: "Product",
    links: [
      { label: "Live dashboard", href: "/dashboard" },
      { label: "Recorded runs", href: "/dashboard?replay=answer-with-exclusions" },
      { label: "The decline", href: "/dashboard?replay=decline-off-catalogue" },
    ],
  },
  {
    h: "Verify",
    links: [
      {
        label: "tollgatehq.eth",
        href: "https://sepolia.etherscan.io/address/0x78155e1b4cd666244d5bdae73ad4a8c53693c661",
      },
      { label: "A settled payment", href: "https://hashscan.io/testnet" },
      { label: "Source on GitHub", href: "https://github.com/Jagadeeshftw/tollgate" },
    ],
  },
  {
    h: "Built on",
    links: [
      { label: "ENS v2", href: "https://ens.domains" },
      { label: "Hedera · x402", href: "https://hedera.com" },
      { label: "The Graph", href: "https://thegraph.com" },
    ],
  },
];

/**
 * The wordmark footer, adapted from Aceternity's big-text footer.
 *
 * Chosen over the grid footer because that one is built around logo imagery we do not have and
 * would have to fake; this one's whole device is type, which we do have.
 */
export function Footer() {
  return (
    <footer className="border-t border-rule">
      <div className="mx-auto max-w-[1240px] px-6 pt-14">
        <div className="grid gap-10 md:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div>
            <div className="text-[16px] font-extrabold tracking-tight text-ink">Tollgate</div>
            <p className="mt-2.5 max-w-[34ch] text-[13px] text-dim">
              A marketplace where agents discover data services by name and pay per call.
            </p>
          </div>
          {COLS.map((c) => (
            <div key={c.h}>
              <h5 className="text-[10.5px] font-semibold tracking-[0.11em] text-dim uppercase">
                {c.h}
              </h5>
              {c.links.map((l) => (
                <a
                  key={l.label}
                  href={l.href}
                  className="mt-2 block text-[13.5px] text-muted transition-colors hover:text-ink"
                >
                  {l.label}
                </a>
              ))}
            </div>
          ))}
        </div>

        {/* The wordmark, cropped by the viewport edge — the device this footer was picked for. */}
        <div
          aria-hidden
          className="mt-12 -mb-3 select-none bg-gradient-to-b from-rule-lit/70 to-transparent bg-clip-text text-center text-[clamp(56px,16vw,190px)] leading-[0.82] font-extrabold tracking-tighter text-transparent"
        >
          tollgate
        </div>
      </div>
    </footer>
  );
}
