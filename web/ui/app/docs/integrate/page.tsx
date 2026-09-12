import type { ReactNode } from "react";

import { AppBar, NavTab } from "@/components/AppBar";
import { Sample } from "@/components/docs/Sample";

export const metadata = { title: "Integrate — Tollgate docs" };

const REPO = "https://github.com/Jagadeeshftw/tollgate";
const SDK = `${REPO}/tree/main/packages/sdk`;

const SECTIONS = [
  ["install", "Install"],
  ["quickstart", "Quickstart"],
  ["surface", "The whole API"],
  ["errors", "Errors are typed"],
  ["seams", "Testing against it"],
] as const;

function H2({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h2 id={id} className="mt-14 scroll-mt-20 text-[22px] font-bold tracking-tight text-ink">
      {children}
    </h2>
  );
}
function P({ children }: { children: ReactNode }) {
  return <p className="mt-3 max-w-[68ch] text-[15px] leading-relaxed text-muted">{children}</p>;
}
function C({ children }: { children: ReactNode }) {
  return <code className="font-mono text-[13px] text-ink">{children}</code>;
}
function Pre({ children }: { children: string }) {
  return (
    <pre className="mt-4 overflow-x-auto rounded-lg border border-rule bg-surface px-4 py-3.5 font-mono text-[12.5px] leading-relaxed text-muted">
      {children}
    </pre>
  );
}

export default function Integrate() {
  return (
    <div className="min-h-dvh bg-ground">
      <AppBar
        nav={
          <>
            <NavTab href="/docs/understand">Understand</NavTab>
            <NavTab href="/docs/integrate" active>Integrate</NavTab>
            <NavTab href="/docs/list-a-service">List a service</NavTab>
            <NavTab href="/docs/verify">Verify</NavTab>
          </>
        }
        status={<span>@tollgatehq/sdk</span>}
      />
      <div className="mx-auto grid max-w-[1180px] gap-10 px-6 pt-10 pb-24 lg:grid-cols-[210px_minmax(0,1fr)]">
        <nav aria-label="On this page" className="hidden lg:block">
          <div className="sticky top-8">
            <p className="font-mono text-[10.5px] tracking-[0.11em] text-dim uppercase">On this page</p>
            <ul className="mt-3 space-y-2">
              {SECTIONS.map(([id, label]) => (
                <li key={id}>
                  <a href={`#${id}`} className="text-[13.5px] text-muted hover:text-ink">{label}</a>
                </li>
              ))}
            </ul>
          </div>
        </nav>

        <article className="min-w-0">
          <p className="font-mono text-[11px] tracking-[0.13em] text-judgment uppercase">Build with it</p>
          <h1 className="mt-3 text-[clamp(28px,3.6vw,38px)] font-bold tracking-tight text-ink">Integrate</h1>
          <P>
            An agent discovers data services by ENS name and pays for them per call. This page describes the shipped
            API — the real install command, run against the real published package, not a snapshot of the source.
          </P>

          <H2 id="install">Install</H2>
          <Pre>{"npm i @tollgatehq/sdk"}</Pre>
          <P>
            ESM-only, Node 22+. Ships one bundled <C>dist/index.js</C> with three runtime dependencies —{" "}
            <C>@x402/core</C>, <C>@x402/hedera</C>, <C>viem</C> — and nothing else. It never calls a model and takes
            no model credentials, so it never installs one either; <C>gate:sdk-pack</C> in the repository asserts
            this on every change, against the exact tarball a publish produces.
          </P>
          <Sample path="integrate/quote-with-sdk.sh" title="npm install @tollgatehq/sdk, then list and quote — nothing simulated, nothing spent" />

          <H2 id="quickstart">Quickstart</H2>
          <P>
            The one design decision worth knowing: <strong className="text-ink">the SDK owns arithmetic, you own
            judgment.</strong> Pricing, affordability and budget enforcement are deterministic and live here.{" "}
            <em>Which</em> service to buy from, and whether an answer is worth paying for, stay with the caller —
            which is why this package never calls a model, and works the same for an agent that reasons nothing
            like ours.
          </P>
          <Pre>{`import { Tollgate } from "@tollgatehq/sdk";

const tollgate = new Tollgate({
  hedera: { accountId: "0.0.12345", privateKey: process.env.HEDERA_KEY! },
  budget: "0.02",                                  // hard ceiling, arithmetic, not advice
});

const svc = await tollgate.get("uniswap-pools");
const quote = svc.quote({ limit: 10 });            // never spends, never calls the service
if (!quote.affordable) return;

const res = await svc.fetch({ limit: 10, maxAmount: "0.015" });
res.data;                    // the response body, parsed
res.status;                  // the server's HTTP status for this call
res.challenge;               // the 402 the server actually issued — its own quote
res.payment.hashscanUrl;     // proof the transfer happened`}</Pre>

          <H2 id="surface">The whole API</H2>
          <P>
            Kept short here on purpose — the README is the one place it is written out in full, so there is no
            second copy to fall out of date with what actually shipped.
          </P>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full border-collapse text-[13.5px]">
              <thead>
                <tr className="border-b border-rule text-left font-mono text-[10.5px] tracking-[0.08em] text-dim uppercase">
                  <th className="py-2 pr-4">Call</th><th className="py-2">Spends</th>
                </tr>
              </thead>
              <tbody className="text-muted">
                {[
                  ["tollgate.list() / .get(label)", "no — reads ENS"],
                  ["tollgate.priceAll(units)", "no — arithmetic over records already read"],
                  ["service.quote({ limit })", "no — ENS records alone, no request to the service"],
                  ["service.challenge({ limit })", "no — reads the server's live 402, does not pay it"],
                  ["service.fetch({ limit, maxAmount })", "yes — the only call that spends"],
                ].map(([k, v]) => (
                  <tr key={k} className="border-b border-rule">
                    <td className="py-2 pr-4 font-mono text-ink">{k}</td>
                    <td className="py-2">{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <P>
            Full constructor options — <C>knownLabels</C>, <C>openRegistrar</C>, <C>corroborateWith</C>, overriding
            the deployment to run against your own registrar — and every field <C>fetch()</C> resolves to, are in{" "}
            <a href={SDK} className="text-ink underline underline-offset-2">the package README</a>.
          </P>

          <H2 id="errors">Errors are typed</H2>
          <P>
            Every error carries a stable <C>code</C> and extends <C>TollgateError</C>, because a caller has to be
            able to tell a refusal that spent nothing from one where the money already moved.
          </P>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full border-collapse text-[13.5px]">
              <thead>
                <tr className="border-b border-rule text-left font-mono text-[10.5px] tracking-[0.08em] text-dim uppercase">
                  <th className="py-2 pr-4">code</th><th className="py-2 pr-4">Meaning</th><th className="py-2">Money moved?</th>
                </tr>
              </thead>
              <tbody className="text-muted">
                {[
                  ["catalogue_unavailable", "ENS could not be read", "no"],
                  ["service_not_found", "no live listing — never listed, revoked, or expired", "no"],
                  ["budget_exceeded", "would breach the instance budget", "no"],
                  ["no_payer", "fetch() without a configured wallet", "no"],
                  ["over_quote", "server asked above maxAmount", "no — refused before signing"],
                  ["unpriceable_service", "records cannot be turned into a price", "no"],
                  ["service_failed_after_payment", "settled, then the service failed to serve", "yes — budget is charged"],
                  ["settlement_failed", "signed and submitted; server still would not serve", "unknown"],
                ].map(([k, v, m]) => (
                  <tr key={k} className="border-b border-rule">
                    <td className="py-2 pr-4 font-mono text-ink">{k}</td>
                    <td className="py-2 pr-4">{v}</td>
                    <td className={`py-2 font-mono ${m === "yes — budget is charged" ? "text-good" : "text-dim"}`}>{m}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <P>
            <C>settlement_failed</C> is the honest row. x402 settles before the resource is served and gives a
            client no receipt it can rely on — a transfer may reach consensus while the response is lost, and no
            client can tell that apart from a payment that never landed. Reconcile against the chain, or the HCS
            audit topic, before assuming either way; that gap is filed upstream, not something this package can
            close alone.
          </P>

          <H2 id="seams">Testing against it</H2>
          <P>
            <C>directory</C>, <C>budget</C> and <C>purchase</C> are all constructor options, not just defaults —
            pass a scripted directory to assert against a fixed catalogue with no network call, share one{" "}
            <C>Budget</C> across more than one <C>Tollgate</C>, or stand in for the purchase mechanics to assert on
            the guard rails without spending real money on every test. Accepted structurally, not by class identity
            — a budget built against a different copy of the underlying arithmetic still works, which matters the
            moment your bundler gives you one.
          </P>
        </article>
      </div>
    </div>
  );
}
