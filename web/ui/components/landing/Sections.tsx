"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/lib/utils";
import { Reveal } from "./Reveal";

export function Band({
  id,
  children,
  className,
}: {
  id?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className={cn("mx-auto max-w-[1240px] px-6 py-16 md:py-24", className)}>
      {children}
    </section>
  );
}

export function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-mono text-[11px] tracking-[0.13em] text-judgment uppercase">{children}</p>
  );
}

export function Heading({ children, lede }: { children: React.ReactNode; lede?: string }) {
  return (
    <>
      <h2 className="text-[clamp(25px,3.2vw,34px)] font-bold tracking-tight text-balance text-ink">
        {children}
      </h2>
      {lede ? <p className="mt-3 max-w-[62ch] text-[16px] text-muted">{lede}</p> : null}
    </>
  );
}

/** The three layers. Numbered because they genuinely are a sequence: read, pay, receive. */
export function Layers() {
  const layers = [
    {
      n: "01 — DIRECTORY",
      title: "ENS holds the terms",
      body: "Price, unit, endpoint and the account that gets paid all live on the service's own name. The operator can reprice. They cannot change where the money goes.",
      foot: "uniswap-pools.tollgatehq.eth",
    },
    {
      n: "02 — PAYMENT",
      title: "Hedera settles it",
      body: "The endpoint answers HTTP 402 with a price. The agent pays in HBAR through the Blocky402 facilitator, and the endpoint releases the data once it clears.",
      foot: "0.001 HBAR · one pool",
    },
    {
      n: "03 — GOODS",
      title: "The Graph is the product",
      body: "Live pool data from Messari standardized subgraphs. One query answers Uniswap, Curve and SushiSwap alike — there is no per-protocol adapter code.",
      foot: "indexed to the chain head",
    },
  ];
  return (
    <div className="mt-9 grid gap-4 md:grid-cols-3">
      {layers.map((l, i) => (
        <Reveal key={l.n} delay={i * 0.07}>
          <div className="h-full rounded-xl border border-rule bg-surface p-5">
            <div className="font-mono text-[11px] tracking-[0.1em] text-judgment">{l.n}</div>
            <h3 className="mt-3 text-[18px] font-semibold text-ink">{l.title}</h3>
            <p className="mt-2 text-[14px] text-muted">{l.body}</p>
            <div className="mt-3.5 font-mono text-[11.5px] text-dim">{l.foot}</div>
          </div>
        </Reveal>
      ))}
    </div>
  );
}

/** Four steps, genuinely ordered — each depends on the one before it. */
export function Steps() {
  const steps = [
    {
      h: "It reads the marketplace off the chain",
      p: "No endpoint list is handed to it. It replays the registrar's events, then reads each listing's current terms from the resolver.",
    },
    {
      h: "Arithmetic decides what is affordable",
      p: "Every service crossed with every size, priced, filtered by budget — before the model is consulted. Options it cannot afford are never on the menu to be talked into.",
    },
    {
      h: "The model decides what is worth buying",
      p: "Which service, how many units, and the most it would pay. Sometimes the answer is nothing at all — public price APIs are available free, and it says so.",
    },
    {
      h: "It pays, then judges what came back",
      p: "A real transfer on Hedera, logged to a public HCS topic. Then it decides whether the data actually answers the question, and tells you when it does not.",
    },
  ];
  return (
    <div className="mt-8 overflow-hidden rounded-xl border border-rule">
      {steps.map((s, i) => (
        <div
          key={s.h}
          className={cn(
            "grid grid-cols-[42px_1fr] items-start gap-4 bg-surface px-5 py-5 md:grid-cols-[54px_1fr] md:gap-5",
            i > 0 && "border-t border-rule",
          )}
        >
          <div className="pt-0.5 font-mono text-[12px] text-judgment">
            {String(i + 1).padStart(2, "0")}
          </div>
          <div>
            <h4 className="text-[16px] font-semibold text-ink">{s.h}</h4>
            <p className="mt-1.5 max-w-[76ch] text-[14px] text-muted">{s.p}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

export function UseCases() {
  const cases = [
    {
      h: "Agents that need occasional on-chain data",
      p: "A research agent needs pool liquidity once an hour. A monthly plan is the wrong shape for that; a fraction of a cent per call is the right one.",
      q: "“what are the top uniswap pools by TVL right now?”",
    },
    {
      h: "Data providers who want to sell without onboarding",
      p: "List a service, set a price, get paid per request. No accounts to issue, no keys to rotate, no billing to run.",
      q: "curve-pools.tollgatehq.eth · 0.002 HBAR / pool",
    },
    {
      h: "Comparing sources before committing",
      p: "One protocol or every indexed DEX, at different prices. The agent picks against the question rather than against a contract.",
      q: "“compare pool TVL across every DEX you can”",
    },
    {
      h: "Spend that has to stay bounded",
      p: "A hard budget the model cannot talk past, and a ceiling it sets for itself per purchase. Refusing to spend is a valid outcome.",
      q: "budget 0.02 HBAR · spent 0.01 · answered",
    },
  ];
  return (
    <div className="mt-8 grid gap-4 md:grid-cols-2">
      {cases.map((c, i) => (
        <Reveal key={c.h} delay={i * 0.05}>
          <div className="h-full rounded-xl border border-rule bg-surface p-5">
            <h4 className="text-[16px] font-semibold text-ink">{c.h}</h4>
            <p className="mt-2 text-[14px] text-muted">{c.p}</p>
            <div className="mt-3.5 border-t border-rule pt-3 font-mono text-[12.5px] text-judgment">
              {c.q}
            </div>
          </div>
        </Reveal>
      ))}
    </div>
  );
}

const FAQS = [
  {
    q: "Is anything here simulated?",
    a: "No. The names are registered on Sepolia and resolve through the public UniversalResolver. Payments settle on Hedera testnet and appear on HashScan. Data comes live from The Graph's decentralized network — there is deliberately no offline mode, because a service that invents data when its source is unreachable is worse than one that fails.",
  },
  {
    q: "Do I need a wallet?",
    a: "No, and that is the point. The agent holds its own account and pays autonomously — there is no user in the payment path to sign anything.",
  },
  {
    q: "What stops the agent overspending?",
    a: "Two things, and they are different. A hard budget, which is arithmetic and cannot be argued with. And a ceiling the agent sets for itself per purchase — its own judgement of what an answer is worth, which it will decline to exceed.",
  },
  {
    q: "Can a service operator redirect my payment?",
    a: "No, and this is enforced by ENS rather than by us. An operator is delegated permission over exactly two record keys — their price and their endpoint. Attempting to change the settlement account is refused on chain by Enhanced Access Control.",
  },
  {
    q: "Why HBAR and not a stablecoin?",
    a: "Because the listing says so. The asset is a record on the name, and the payment is denominated in whatever that record specifies. HBAR is what these services publish.",
  },
];

/**
 * The dashed rule between rows is the device this section was chosen for — it reads as a technical
 * drawing rather than a card stack, which suits a page whose subject is machine-readable records.
 */
export function Faq() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div className="mt-8 border-t border-dashed border-rule-lit">
      {FAQS.map((f, i) => (
        <div key={f.q} className="border-b border-dashed border-rule-lit">
          <button
            type="button"
            onClick={() => setOpen(open === i ? null : i)}
            aria-expanded={open === i}
            className="flex w-full items-center justify-between gap-6 py-4 text-left"
          >
            <span className="text-[16px] font-medium text-ink">{f.q}</span>
            <span className="font-mono text-[16px] text-dim">{open === i ? "−" : "+"}</span>
          </button>
          <AnimatePresence initial={false}>
            {open === i ? (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.24, ease: "easeOut" }}
                className="overflow-hidden"
              >
                <p className="max-w-[80ch] pb-4 text-[14.5px] text-muted">{f.a}</p>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      ))}
    </div>
  );
}
