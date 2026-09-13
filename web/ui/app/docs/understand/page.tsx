import type { ReactNode } from "react";

export const metadata = { title: "Understand — Tollgate docs" };

/**
 * Deliberately short. The landing page and the README already explain the system; restating them here
 * would be a second copy that drifts. This page names the few ideas an integrator must hold, and links
 * to the one place each is explained in full.
 */
const REPO = "https://github.com/Jagadeeshftw/tollgate";

function Idea({ id, n, title, children, link }: { id: string; n: string; title: string; children: ReactNode; link: [string, string] }) {
  return (
    <section id={id} className="scroll-mt-24 border-t border-rule py-7">
      <p className="font-mono text-[11px] tracking-[0.12em] text-judgment">{n}</p>
      <h2 className="mt-2 text-[20px] font-bold tracking-tight text-ink">{title}</h2>
      <div className="mt-2 max-w-[66ch] text-[15px] leading-relaxed text-muted">{children}</div>
      <a href={link[1]} className="mt-3 inline-block font-mono text-[12.5px] text-dim underline underline-offset-2 hover:text-ink">
        {link[0]} →
      </a>
    </section>
  );
}

export default function Understand() {
  return (
    <>
      <p className="font-mono text-[11px] tracking-[0.13em] text-judgment uppercase">Understand</p>
      <h1 className="mt-3 text-[clamp(28px,3.6vw,38px)] font-bold tracking-tight text-ink">Five things to hold in your head</h1>
      <p className="mt-3 mb-4 max-w-[64ch] text-[15px] text-muted">
        Short on purpose. Each idea links to the one place it is explained in full, so there is never a second copy
        to fall out of date.
      </p>

      <Idea id="idea-01" n="01" title="ENS holds the terms, Hedera settles, The Graph is the product" link={["The three layers", "/#how"]}>
        A service&apos;s price, endpoint and settlement account are text records on its ENS name. An agent reads them,
        pays the endpoint over x402 in HBAR, and receives data drawn live from The Graph. The two chains are never
        coupled at transaction level — ENS is a read, Hedera is a write, and nothing bridges them.
      </Idea>

      <Idea id="idea-02" n="02" title="Arithmetic decides what is allowed; the model decides what is worth it" link={["The agent", `${REPO}#the-agent`]}>
        Pricing, affordability and the budget are deterministic and run before the model is consulted: options the
        budget cannot cover are never offered. The model chooses a service, a size, and a ceiling it will not exceed —
        and may decide to buy nothing. The budget is not something it can argue past.
      </Idea>

      <Idea id="idea-03" n="03" title="An operator can reprice, not redirect" link={["What is enforced", "/docs/list-a-service#rules"]}>
        ENS&apos;s per-record access control lets an operator change their price and endpoint and nothing else — not
        where the money goes. That holds against operators; the deployer still holds top-level roles, which the
        operator guide states plainly.
      </Idea>

      <Idea id="idea-04" n="04" title="Discovery runs on resolver recovery" link={["Why, with measurements", `${REPO}#discovery-runs-on-resolver-recovery-not-on-the-event-log`]}>
        Public Sepolia endpoints return incomplete event logs without erroring, and now reject the full range outright.
        So every candidate name is resolved through the public ENS path and kept only if the resolver backs it. That is
        the load-bearing path today, not a fallback, and the dashboard says when the log came back short.
      </Idea>

      <Idea id="idea-05" n="05" title="&ldquo;Paid&rdquo; is a heuristic when settlement fails" link={["The error taxonomy", `${REPO}/tree/main/packages/sdk#errors-are-typed-because-you-have-to-tell-them-apart`]}>
        x402 settles before the data is served and gives the client no receipt it can rely on. If settlement fails
        upstream, whether money moved is an inference, not a guarantee — reconcile against the chain or the HCS audit
        topic before assuming either way.
      </Idea>
    </>
  );
}
