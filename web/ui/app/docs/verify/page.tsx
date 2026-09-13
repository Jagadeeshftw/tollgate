import type { ReactNode } from "react";

import { Sample } from "@/components/docs/Sample";
import { readEns, readHedera, recordKeys } from "@/lib/records";

export const metadata = { title: "Verify — Tollgate docs" };

/**
 * Everything on this page is read at build time from the committed deployment records and the
 * contract source. Nothing is typed in by hand, so it cannot drift from what was actually deployed —
 * and if a record changes, the page changes with the next build.
 */
const ETHERSCAN = "https://sepolia.etherscan.io/address/";
const HASHSCAN = "https://hashscan.io/testnet/";

function Row({ label, value, href, note }: { label: string; value: string; href?: string; note?: string }) {
  return (
    <tr className="border-b border-rule align-top">
      <td className="w-24 py-2.5 pr-4 text-[13.5px] text-muted sm:w-44">{label}</td>
      <td className="py-2.5 pr-4 font-mono text-[12.5px] break-all text-ink">
        {href ? <a href={href} className="underline decoration-rule-lit underline-offset-2 hover:text-judgment">{value}</a> : value}
      </td>
      <td className="py-2.5 text-[12.5px] text-dim">{note ?? ""}</td>
    </tr>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="mt-12 scroll-mt-24">
      <h2 className="text-[20px] font-bold tracking-tight text-ink">{title}</h2>
      <div className="mt-4 overflow-x-auto">{children}</div>
    </section>
  );
}

export default function Verify() {
  const ens = readEns() as Record<string, string | number | string[] | undefined>;
  const hed = readHedera();
  const keys = recordKeys();
  const addr = (k: string) => String(ens[k] ?? "");
  const services = (ens.services as string[] | undefined) ?? [];

  return (
    <>
      <p className="font-mono text-[11px] tracking-[0.13em] text-judgment uppercase">Verify</p>
      <h1 className="mt-3 text-[clamp(28px,3.6vw,38px)] font-bold tracking-tight text-ink">Check it without trusting us</h1>
      <p className="mt-3 max-w-[66ch] text-[15px] text-muted">
        Every address, account and key below is read at build time from{" "}
        <code className="font-mono text-ink">deployments/</code> and{" "}
        <code className="font-mono text-ink">TollgateRecordsLib.sol</code> — nothing on this page is typed by hand.
        Each links to a public explorer, and the commands at the end resolve a listing through ENS&apos;s own
        UniversalResolver with no code from this repository involved.
      </p>

      <Section id="ens" title="On Sepolia (ENS)">
        <table className="w-full table-fixed border-collapse">
          <tbody>
            <Row label="Parent name" value={addr("parentName")} />
            <Row label="Subname registry" value={addr("registry")} href={ETHERSCAN + addr("registry")} />
            <Row label="Resolver" value={addr("resolver")} href={ETHERSCAN + addr("resolver")} note="holds every listing's records" />
            <Row label="Curated registrar" value={addr("registrar")} href={ETHERSCAN + addr("registrar")} note="allowlisted listers only" />
            {ens.openRegistrar ? (
              <Row label="Open registrar" value={addr("openRegistrar")} href={ETHERSCAN + addr("openRegistrar")} note="anyone may list for themselves" />
            ) : null}
            <Row label="Deployer" value={addr("deployer")} href={ETHERSCAN + addr("deployer")} note="retains top-level roles — see List a service" />
            <Row label="Deploy block" value={String(ens.deployBlock ?? "")} note="lower bound for event scans" />
            <Row label="Demo listings" value={services.map((s) => `${s}.${addr("parentName")}`).join("  ")} />
          </tbody>
        </table>
      </Section>

      <Section id="hedera" title="On Hedera testnet">
        <table className="w-full table-fixed border-collapse">
          <tbody>
            <Row label="Network" value={hed.network} />
            <Row label="Service settlement account" value={hed.settlementAccount} href={`${HASHSCAN}account/${hed.settlementAccount}`} note="receives x402 payments" />
            {hed.auditTopic ? (
              <Row label="HCS audit topic" value={hed.auditTopic} href={`${HASHSCAN}topic/${hed.auditTopic}`} note="every settled payment is logged here" />
            ) : null}
            {hed.hosted?.operatorAccount ? (
              <Row label="Hosted demo payer" value={hed.hosted.operatorAccount} href={`${HASHSCAN}account/${hed.hosted.operatorAccount}`} note="funds the dashboard's demo runs" />
            ) : null}
          </tbody>
        </table>
      </Section>

      <Section id="keys" title="Record keys a listing carries">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-rule text-left font-mono text-[10.5px] tracking-[0.08em] text-dim uppercase">
              <th className="py-2 pr-4">Key</th><th className="py-2">Constant in TollgateRecordsLib.sol</th>
            </tr>
          </thead>
          <tbody>
            {keys.map((k) => (
              <tr key={k.constant} className="border-b border-rule">
                <td className="py-2 pr-4 font-mono text-[13px] text-ink">{k.key}</td>
                <td className="py-2 font-mono text-[12.5px] text-dim">{k.constant}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section id="resolve" title="Resolve a listing yourself">
        <Sample path="operator/resolve-listing.sh" title="A listing's price, through the public ENS resolver" />
        <Sample path="operator/check-delegation.sh" title="Who may write which record, asked of the resolver" />
      </Section>
    </>
  );
}
