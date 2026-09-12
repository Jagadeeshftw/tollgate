import type { ReactNode } from "react";

import { AppBar, NavTab } from "@/components/AppBar";
import { Sample } from "@/components/docs/Sample";
import { readDeployment } from "@/lib/deployment";

export const metadata = { title: "List a service — Tollgate docs" };

const SECTIONS = [
  ["what", "What a listing is"],
  ["paths", "Two ways to list"],
  ["rules", "What is enforced"],
  ["qualifier", "What it does not protect against"],
  ["endpoint", "What your endpoint must do"],
  ["own", "Running your own registrar"],
  ["lifecycle", "Expiry and revocation"],
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

export default function ListAService() {
  const d = readDeployment();
  const open = d.openRegistrar;

  return (
    <div className="min-h-dvh bg-ground">
      <AppBar
        nav={
          <>
            <NavTab href="/docs/understand">Understand</NavTab>
            <NavTab href="/docs/list-a-service" active>List a service</NavTab>
            <NavTab href="/docs/verify">Verify</NavTab>
          </>
        }
        status={<span>operator guide</span>}
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
          <p className="font-mono text-[11px] tracking-[0.13em] text-judgment uppercase">Sell data</p>
          <h1 className="mt-3 text-[clamp(28px,3.6vw,38px)] font-bold tracking-tight text-ink">List a service</h1>
          <P>
            How a data service gets into the catalogue an agent reads — and, precisely, what the chain enforces once it is
            there. Everything stated as enforced below is backed by a fork test against the live Sepolia contracts or by a
            sample on this page that <C>pnpm gate:docs</C> executes.
          </P>

          <H2 id="what">What a listing is</H2>
          <P>
            A listing is an ENS subname under <C>{d.parentName}</C>, minted as an ERC-1155 token to the operator, pointing at
            a pinned resolver that holds everything an agent needs to find, price and pay for the service:
          </P>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full border-collapse text-[13.5px]">
              <thead>
                <tr className="border-b border-rule text-left font-mono text-[10.5px] tracking-[0.08em] text-dim uppercase">
                  <th className="py-2 pr-4">Record key</th><th className="py-2 pr-4">Holds</th><th className="py-2">Operator may change</th>
                </tr>
              </thead>
              <tbody className="text-muted">
                {[
                  ["agent-context", "What the service sells, written for an agent (ENSIP-26)", "no"],
                  ["agent-endpoint[web]", "The x402-gated URL (ENSIP-26)", "yes"],
                  ["x402:price", "Price per unit, decimal", "yes"],
                  ["x402:unit", "What one unit is", "no"],
                  ["x402:settlement", "Hedera account paid", "no"],
                  ["x402:network", "hedera:testnet", "no"],
                  ["x402:asset", "0.0.0 is native HBAR", "no"],
                  ["x402:schema", "Shape of the response", "no"],
                ].map(([k, v, y]) => (
                  <tr key={k} className="border-b border-rule">
                    <td className="py-2 pr-4 font-mono text-ink">{k}</td>
                    <td className="py-2 pr-4">{v}</td>
                    <td className={`py-2 font-mono ${y === "yes" ? "text-good" : "text-dim"}`}>{y}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <P>Every field is written in the same transaction as the mint, or none are. A listing is never visible half-configured.</P>

          <H2 id="paths">Two ways to list</H2>
          <P>
            <strong className="text-ink">Under {d.parentName}.</strong>{" "}
            {open ? (
              <>
                Anyone may list a service for themselves through the open registrar at <C>{open}</C>. Listings are
                <strong className="text-ink"> self-published and unvetted</strong>: nobody reviews them, and the registry
                enforces what an operator can change, not whether a service is any good. Use the{" "}
                <a href="/operator" className="text-ink underline underline-offset-2">operator console</a> or the sample
                below.
              </>
            ) : (
              <>
                Open listing is <strong className="text-ink">not live on Sepolia yet</strong>. Until it is, listing under
                this name goes through the curated registrar, which only allowlisted listers may call — a stranger's call
                reverts with <C>NotLister</C>. There is no request or approval flow; being allowlisted is a transaction by
                us. Our own scripts (<C>pnpm ens:list</C>) are how the three demo services were listed, and they need that
                role — they are not a third-party path.
              </>
            )}
          </P>
          <P>
            <strong className="text-ink">Under a name you own.</strong> Genuinely independent of us — see{" "}
            <a href="#own" className="text-ink underline underline-offset-2">Running your own registrar</a>. The SDK already
            takes the parent name, registrar, resolver and deploy block as configuration, so an agent can read your
            marketplace with no change to our code.
          </P>
          <Sample path="operator/list-with-cast.sh" title="Listing from the command line" />

          <H2 id="rules">What is enforced</H2>
          <P>
            After listing, the operator is delegated <C>ROLE_SET_TEXT</C> on exactly two record keys — <C>x402:price</C> and{" "}
            <C>agent-endpoint[web]</C> — through the resolver&apos;s per-key authorization. That is ENS Enhanced Access
            Control, not our code. Their token carries only <C>ROLE_RENEW</C>, deliberately withholding the roles to repoint
            the name at another resolver or subregistry — without that, the narrow delegation would be bypassable.
          </P>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full border-collapse text-[13.5px]">
              <thead>
                <tr className="border-b border-rule text-left font-mono text-[10.5px] tracking-[0.08em] text-dim uppercase">
                  <th className="py-2 pr-4">An operator</th><th className="py-2">Proven by</th>
                </tr>
              </thead>
              <tbody className="text-muted">
                {[
                  ["can reprice their listing", "test_operatorCanEditPrice"],
                  ["can repoint their endpoint", "test_operatorCanEditEndpoint"],
                  ["cannot change x402:settlement", "test_operatorCannotMoveSettlementAccount · test_strangerCannotMoveTheirOwnSettlementAccount"],
                  ["cannot redefine the unit being priced", "test_operatorCannotRedefineTheMeteredUnit"],
                  ["cannot edit anyone else's listing", "test_operatorCannotRepriceADifferentName · test_strangerCannotRepriceACuratedListing"],
                  ["cannot take a live name", "test_strangerCannotOverwriteACuratedListing"],
                  ["cannot list in someone else's name", "test_cannotListForSomeoneElse"],
                ].map(([a, t]) => (
                  <tr key={a} className="border-b border-rule">
                    <td className="py-2 pr-4 text-ink">{a}</td>
                    <td className="py-2 font-mono text-[12px]">{t}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <P>
            The settlement refusal is canaried: with <C>x402:settlement</C> deliberately delegated, the test fails with{" "}
            <em>next call did not revert as expected</em>. A test that has never failed has not proved anything.
          </P>

          <H2 id="qualifier">What it does not protect against</H2>
          <P>
            <strong className="text-ink">
              &ldquo;Cannot redirect payment&rdquo; holds against operators. It does not hold against us.
            </strong>{" "}
            The deployer account that set this system up retains top-level roles on the registry and the resolver: it can
            mint names without going through a registrar&apos;s rules, and it can rewrite any record on any listing,
            including <C>x402:settlement</C>. A production deployment would renounce those roles once set up. We have not,
            because renouncing is one-way and we may still need to correct a listing before submission.
          </P>
          <P>
            The three demo listings make this visible: they are owned by the deployer itself, so the sample below shows the
            owner able to write every key — settlement included — and a stranger refused on all of them. For an ordinary
            operator, the rule in the table above applies.
          </P>
          <Sample path="operator/check-delegation.sh" title="Who may write which record, asked of the resolver" />

          <H2 id="endpoint">What your endpoint must do</H2>
          <P>
            Your <C>agent-endpoint[web]</C> is an ordinary HTTPS URL that speaks x402 v2. On an unpaid request it returns{" "}
            <C>402</C> with a <C>PAYMENT-REQUIRED</C> header: scheme <C>exact</C>, network <C>hedera:testnet</C>, asset{" "}
            <C>0.0.0</C>, <C>payTo</C> set to <strong className="text-ink">the same account as your</strong>{" "}
            <C>x402:settlement</C> record, and an amount equal to price × units in tinybars. On a request carrying{" "}
            <C>PAYMENT-SIGNATURE</C> it settles through a facilitator and returns the data. The reference implementation is{" "}
            <C>service/src</C> in the repository, which reads its price from your ENS records rather than from config.
          </P>
          <P>
            This section is prose, not a sample: an endpoint cannot be verified from a docs page. What can be verified is
            that the price your endpoint quotes matches your record — which is what an agent using the SDK checks with{" "}
            <C>challenge()</C> before it pays.
          </P>
          <Sample path="operator/resolve-listing.sh" title="Read a listing's price through the public resolver" />

          <H2 id="own">Running your own registrar</H2>
          <P>
            Nothing about this requires {d.parentName}. Register an ENS name you own, deploy <C>TollgateRegistrar</C>{" "}
            (curated) or <C>OpenTollgateRegistrar</C> (anyone may list) with your name&apos;s DNS encoding, and grant it
            exactly the roles it publishes as <C>REQUIRED_REGISTRY_ROLES</C> and <C>REQUIRED_RESOLVER_ROLES</C>. You are
            then the admin, and the deployer-roles caveat above is yours to resolve.
          </P>
          <P>
            An agent reads your marketplace by passing your addresses to the SDK — <C>parent</C>, <C>registrar</C>,{" "}
            <C>resolver</C>, <C>deployBlock</C>, and <C>openRegistrar</C> with <C>registry</C> if you run an open one.
          </P>

          <H2 id="lifecycle">Expiry and revocation</H2>
          <P>
            Every listing is minted with an expiry; the open registrar caps the first term at 365 days, and the operator may
            renew. A lapsed listing stops being offered to agents — discovery checks the registry reports it live — even
            though its records remain until cleared.
          </P>
          <P>
            On the open registrar, an operator may withdraw their own listing and the admin may remove any; revocation clears
            the records as well as burning the name, so an agent that cached the node cannot keep paying a dead endpoint. On
            the curated registrar, only allowlisted listers may revoke.
          </P>
        </article>
      </div>
    </div>
  );
}
