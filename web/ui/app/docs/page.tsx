export const metadata = { title: "Docs — Tollgate" };

const SECTIONS = [
  ["/docs/understand", "Understand", "How it works, in five ideas — each linking to the one place it is explained in full."],
  ["/docs/integrate", "Integrate", "For agent builders: install @tollgatehq/sdk and buy data by ENS name, against the shipped API."],
  ["/docs/list-a-service", "List a service", "For operators: what a listing is, what the chain enforces, and what it does not."],
  ["/docs/verify", "Verify", "Every address, account and record key, generated from the deployment record."],
] as const;

export default function Docs() {
  return (
    <>
      <h1 className="text-[clamp(28px,3.6vw,38px)] font-bold tracking-tight text-ink">Docs</h1>
      <p className="mt-3 max-w-[62ch] text-[15px] text-muted">
        You arrive as one of these. None of them needs the other three.
      </p>
      <ul className="mt-8 grid gap-3">
        {SECTIONS.map(([href, title, blurb]) => (
          <li key={href}>
            <a href={href} className="block rounded-xl border border-rule bg-surface p-5 transition-colors hover:border-rule-lit">
              <span className="text-[17px] font-semibold text-ink">{title}</span>
              <span className="mt-1 block text-[14px] text-muted">{blurb}</span>
            </a>
          </li>
        ))}
      </ul>
    </>
  );
}
