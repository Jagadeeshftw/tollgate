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
          <p className="mx-auto mt-5 max-w-[58ch] text-[17px] text-muted">
            An AI agent finds a data service by its ENS name, reads the price off the name itself,
            and pays for it in HBAR — one request at a time. No signup, no API key, no subscription,
            nobody signing anything.
          </p>

          <form
            className="mx-auto mt-8 flex max-w-[620px] flex-col gap-2.5 sm:flex-row"
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
              className="rounded-lg bg-judgment px-5 py-3 text-[14px] font-semibold whitespace-nowrap text-ground transition-opacity hover:opacity-90"
            >
              Ask it →
            </button>
          </form>

          <div className="mt-6 flex flex-wrap justify-center gap-x-5 gap-y-2 font-mono text-[11.5px] text-dim">
            <span>3 services live on Sepolia</span>
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
