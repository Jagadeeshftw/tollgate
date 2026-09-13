/**
 * The docs site's own map of itself: one entry per page, each carrying the section ids and labels
 * that page's headings actually use.
 *
 * @remarks
 * Single source shared by the left sidebar (which shows a page's sections only while that page is
 * active) and the right "on this page" column (which scroll-spies against the same ids). A page's
 * headings still carry their own `id` attributes — this file only has to agree with them, not
 * generate them, so a page's content stays exactly what it was.
 */
export interface DocsSection {
  readonly id: string;
  readonly label: string;
}

export interface DocsPage {
  readonly href: string;
  readonly label: string;
  readonly sections: readonly DocsSection[];
}

export const DOCS_PAGES: readonly DocsPage[] = [
  { href: "/docs", label: "Welcome", sections: [] },
  {
    href: "/docs/understand",
    label: "Understand",
    sections: [
      { id: "idea-01", label: "ENS, Hedera, The Graph" },
      { id: "idea-02", label: "Arithmetic vs. the model" },
      { id: "idea-03", label: "Reprice, not redirect" },
      { id: "idea-04", label: "Resolver recovery" },
      { id: "idea-05", label: "“Paid” is a heuristic" },
    ],
  },
  {
    href: "/docs/integrate",
    label: "Integrate",
    sections: [
      { id: "install", label: "Install" },
      { id: "quickstart", label: "Quickstart" },
      { id: "surface", label: "The whole API" },
      { id: "errors", label: "Errors are typed" },
      { id: "seams", label: "Testing against it" },
    ],
  },
  {
    href: "/docs/list-a-service",
    label: "List a service",
    sections: [
      { id: "what", label: "What a listing is" },
      { id: "paths", label: "Two ways to list" },
      { id: "rules", label: "What is enforced" },
      { id: "qualifier", label: "What it does not protect against" },
      { id: "endpoint", label: "What your endpoint must do" },
      { id: "own", label: "Running your own registrar" },
      { id: "lifecycle", label: "Expiry and revocation" },
    ],
  },
  {
    href: "/docs/verify",
    label: "Verify",
    sections: [
      { id: "ens", label: "On Sepolia (ENS)" },
      { id: "hedera", label: "On Hedera testnet" },
      { id: "keys", label: "Record keys" },
      { id: "resolve", label: "Resolve it yourself" },
    ],
  },
] as const;

/**
 * Strips a trailing slash for comparison against `href`.
 *
 * @remarks
 * `next.config.mjs` sets `trailingSlash: true` — the static export needs `dashboard/index.html`,
 * not `dashboard.html` — so `usePathname()` at runtime returns `/docs/integrate/`, not the
 * `/docs/integrate` this file's `href`s are written as. An exact-match comparison against the raw
 * pathname would never find the active page at all, silently disabling every highlight and every
 * nested section list. Exported so every place that compares a pathname to a `href` — the sidebar
 * included — normalizes the same way.
 */
export function normalizeDocsPath(pathname: string): string {
  return pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
}

export function docsPageFor(pathname: string): DocsPage {
  const normalized = normalizeDocsPath(pathname);
  return DOCS_PAGES.find((p) => p.href === normalized) ?? DOCS_PAGES[0]!;
}
