"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Closing, Footer } from "@/components/landing/Closing";
import { LandingNav } from "@/components/landing/LandingNav";
import { Reveal } from "@/components/landing/Reveal";
import { Band, Eyebrow, Faq, Heading, Layers, Steps, UseCases } from "@/components/landing/Sections";

export default function Landing() {
  const router = useRouter();
  const [question, setQuestion] = useState("what are the top uniswap pools by TVL right now?");

  return (
    <div className="min-h-dvh bg-ground">
      <LandingNav />

      {/*
        The hero is the product, not an effect behind it. This is a real live run captured
        mid-flight — the state strip is on "chose", the catalogue is the three services actually
        listed on Sepolia, and the run counter is one lower because taking the shot spent 0.01 HBAR.
        Framing device adapted from Aceternity's centered-image hero: a double-nested rounded frame
        with the image fading into the page, so the screenshot reads as inset rather than pasted on.
      */}
      <section className="relative px-6 pt-16 pb-4 md:pt-24">
        <div className="mx-auto max-w-[1240px] text-center">
          <Eyebrow>ENS · Hedera x402 · The Graph</Eyebrow>
          <h1 className="mx-auto mt-4 max-w-[24ch] text-[clamp(32px,4.9vw,54px)] leading-[1.06] font-extrabold tracking-tight text-balance text-ink">
            Agents buy data <span className="whitespace-nowrap text-judgment">by name</span>, and pay
            per call.
          </h1>
          {/*
            The subject of every claim below is the agent, not the visitor. "No signup, no API key"
            previously read as a promise about the person on this page; it is a statement about
            what the provider does not require of an agent paying from its own account.
          */}
          <p className="mx-auto mt-5 max-w-[60ch] text-[17px] text-muted">
            An AI agent finds a data service by its ENS name, reads the price off the name itself,
            and pays per call in HBAR from its own account. The provider issues it no API key, runs
            no signup, and sells it no subscription — and no human signs anything in the loop.
          </p>

          {/*
            Two real paths, because the product is the SDK and the registry — not the dashboard.
            The dashboard is a demo playground funded by us; presenting it as the main event made
            three hand-listed services read as a ceiling rather than an example.
          */}
          <div className="mx-auto mt-10 grid max-w-[980px] gap-4 text-left md:grid-cols-2">
            <a
              href="https://github.com/Jagadeeshftw/tollgate/tree/main/packages/sdk"
              className="group rounded-xl border border-rule bg-surface p-6 transition-colors hover:border-rule-lit"
            >
              <p className="font-mono text-[11px] tracking-[0.12em] text-judgment uppercase">Buy data</p>
              <h2 className="mt-3 text-[20px] font-bold tracking-tight text-ink">Build an agent that pays per call</h2>
              <p className="mt-2 text-[14.5px] text-muted">
                <span className="font-mono text-ink">@tollgatehq/sdk</span> discovers services by ENS name, quotes
                without spending, and pays over x402 under a hard budget. It does the arithmetic; your agent
                makes the calls. It never touches a model.
              </p>
              <p className="mt-4 font-mono text-[12px] text-dim">
                source on GitHub · npm release follows the discovery extraction
                <span className="ml-1 text-muted transition-transform group-hover:translate-x-0.5">→</span>
              </p>
            </a>
            <a
              href="https://github.com/Jagadeeshftw/tollgate/blob/main/contracts/src/TollgateRegistrar.sol"
              className="group rounded-xl border border-rule bg-surface p-6 transition-colors hover:border-rule-lit"
            >
              <p className="font-mono text-[11px] tracking-[0.12em] text-judgment uppercase">Sell data</p>
              <h2 className="mt-3 text-[20px] font-bold tracking-tight text-ink">List a service under an ENS name</h2>
              <p className="mt-2 text-[14.5px] text-muted">
                Price, endpoint and settlement account live on your own subname. You can reprice and
                repoint it; ENS stops you redirecting the money. Listing under{" "}
                <span className="font-mono text-ink">tollgatehq.eth</span> is allowlisted today — the
                registrar is open source, so you can run your own under a name you own.
              </p>
              <p className="mt-4 font-mono text-[12px] text-dim">
                registrar source · the rules it enforces
                <span className="ml-1 text-muted transition-transform group-hover:translate-x-0.5">→</span>
              </p>
            </a>
          </div>

          <div className="mx-auto mt-12 max-w-[620px]">
            <p className="font-mono text-[11px] tracking-[0.12em] text-dim uppercase">
              Or try it — a live demo paid from our testnet account
            </p>
            <form
              className="mt-3 flex flex-col gap-2.5 sm:flex-row"
              onSubmit={(e) => {
                e.preventDefault();
                router.push(`/dashboard?q=${encodeURIComponent(question)}`);
              }}
            >
              <input
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                aria-label="Ask the agent a question"
                className="min-w-0 flex-1 rounded-lg border border-rule-lit bg-surface px-4 py-3 text-[14.5px] text-ink placeholder:text-dim"
              />
              <button
                type="submit"
                className="rounded-lg border border-rule-lit px-5 py-3 text-[14px] font-semibold whitespace-nowrap text-ink transition-colors hover:border-judgment"
              >
                Ask it →
              </button>
            </form>
          </div>

          <div className="mt-6 flex flex-wrap justify-center gap-x-5 gap-y-2 font-mono text-[11.5px] text-dim">
            <span>3 demo services, listed by us</span>
            <span>·</span>
            <span>settled on Hedera testnet</span>
            <span>·</span>
            <span>data from The Graph</span>
          </div>
        </div>

        <div className="relative mx-auto mt-14 max-w-[1180px] rounded-[26px] border border-rule bg-surface p-2.5 md:p-3">
          <div className="overflow-hidden rounded-[19px] border border-rule bg-ground p-1.5">
            <Image
              src="/dashboard-live.png"
              alt="The Tollgate dashboard during a live run: the agent has chosen uniswap-pools and is about to pay, with the decision space it was offered shown beneath."
              width={1920}
              height={1200}
              priority
              className="rounded-[14px]"
            />
          </div>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-36 rounded-b-[26px] bg-gradient-to-b from-transparent to-ground" />
        </div>
      </section>

      <Band id="how">
        <Reveal>
          <Heading lede="The two networks are never coupled at transaction level. There is no bridge. ENS is a read, Hedera is a write, and the agent does one then the other.">
            Three layers, one flow
          </Heading>
        </Reveal>
        <Layers />
      </Band>

      <Band id="happens" className="border-t border-rule">
        <Reveal>
          <Heading lede="Four decisions the agent could reasonably resolve either way, and two guards it cannot argue with.">
            What actually happens when you ask
          </Heading>
        </Reveal>
        <Reveal delay={0.06}>
          <Steps />
        </Reveal>
      </Band>

      <Band id="uses" className="border-t border-rule">
        <Reveal>
          <Heading lede="Any case where software needs data it cannot justify a subscription for.">
            What it is for
          </Heading>
        </Reveal>
        <UseCases />
      </Band>

      <Band id="faq" className="border-t border-rule">
        <Reveal>
          <Heading>Questions</Heading>
        </Reveal>
        <Reveal delay={0.06}>
          <Faq />
        </Reveal>
      </Band>

      <Closing />
      <Footer />
    </div>
  );
}
