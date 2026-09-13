/**
 * Walks every internal link and anchor reachable from a known set of pages and reports any that
 * 404 or point at an anchor id that does not exist.
 *
 *   pnpm check-links                                 # against the deployed site
 *   BASE_URL=http://127.0.0.1:8500 pnpm check-links   # against a local server
 *
 * @remarks
 * Exists because a nav map that looks right in the source can still resolve wrong once rendered —
 * `/dashboard`'s "Verify" tab pointed at `/#verify`, an anchor that has never existed on the
 * landing page, and "the class was checked" turned out not to hold on the second report. This
 * reads the actual rendered HTML of each page — the same thing a browser would follow a link
 * against — rather than reasoning from the component source a second time.
 *
 * Anchor ids are checked from the static HTML directly: this project's docs and dashboard pages
 * are statically exported, so an element's `id` is present in the markup before any client-side
 * hydration runs, and a plain fetch sees exactly what a browser's initial paint would.
 */
const BASE = process.env.BASE_URL ?? "https://tollgate-web-production.up.railway.app";

/** Every page reachable without already knowing an internal link — the crawl's starting set. */
const ROOTS = [
  "/",
  "/dashboard/",
  "/docs/",
  "/docs/understand/",
  "/docs/integrate/",
  "/docs/list-a-service/",
  "/docs/verify/",
  "/operator/",
];

interface PageInfo {
  readonly html: string;
  readonly ids: ReadonlySet<string>;
}

async function fetchWithRetry(url: string, attempts = 6): Promise<Response | null> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fetch(url, { signal: AbortSignal.timeout(15_000) });
    } catch (err) {
      last = err;
      await new Promise((r) => setTimeout(r, 2_000));
    }
  }
  console.error(`  (could not reach ${url}: ${(last as Error)?.message ?? last})`);
  return null;
}

const pageCache = new Map<string, Promise<PageInfo | null>>();

function loadPage(path: string): Promise<PageInfo | null> {
  const cached = pageCache.get(path);
  if (cached) return cached;
  const promise = (async (): Promise<PageInfo | null> => {
    const res = await fetchWithRetry(BASE + path);
    if (!res || res.status >= 400) return null;
    const html = await res.text();
    const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]!));
    return { html, ids };
  })();
  pageCache.set(path, promise);
  return promise;
}

function normalizePath(path: string): string {
  return path.length > 1 ? `${path.replace(/\/+$/, "")}/` : "/";
}

type Status = "ok" | "404" | "missing-anchor" | "unreachable" | "external";
interface CheckResult {
  readonly source: string;
  readonly href: string;
  readonly status: Status;
  readonly detail?: string;
}

async function checkHref(sourcePage: string, href: string): Promise<CheckResult> {
  if (/^https?:\/\//.test(href)) {
    // Reported, never failed on: a third party's bot-blocking (HashScan's SPA routes 404 a plain
    // fetch that a real browser resolves fine) is not evidence our link is wrong, and we do not
    // control the target well enough to assert against it the way we can our own pages.
    const res = await fetchWithRetry(href, 2);
    return {
      source: sourcePage,
      href,
      status: "external",
      detail: res ? String(res.status) : "unreachable from here",
    };
  }
  if (href.startsWith("mailto:") || href.startsWith("tel:")) {
    return { source: sourcePage, href, status: "ok" };
  }
  if (href.startsWith("#")) {
    const page = await loadPage(sourcePage);
    if (!page) return { source: sourcePage, href, status: "unreachable" };
    const id = href.slice(1);
    return page.ids.has(id)
      ? { source: sourcePage, href, status: "ok" }
      : { source: sourcePage, href, status: "missing-anchor", detail: `no id="${id}" on ${sourcePage}` };
  }

  const [pathAndQuery, hash] = href.split("#");
  const path = normalizePath((pathAndQuery ?? href).split("?")[0]!);
  const page = await loadPage(path);
  if (!page) return { source: sourcePage, href, status: "404" };
  if (hash) {
    return page.ids.has(hash)
      ? { source: sourcePage, href, status: "ok" }
      : { source: sourcePage, href, status: "missing-anchor", detail: `no id="${hash}" on ${path}` };
  }
  return { source: sourcePage, href, status: "ok" };
}

async function main() {
  const results: CheckResult[] = [];

  for (const root of ROOTS) {
    const page = await loadPage(root);
    if (!page) {
      results.push({ source: root, href: root, status: "404" });
      continue;
    }
    // Only <a href> — a real navigation link a visitor could click. <link href> (stylesheets,
    // preloaded fonts, the manifest) is a build asset reference, not navigation, and checking it
    // the same way this checker validates page routes is a category error: those paths are never
    // meant to survive the app's own trailingSlash rewrite this checker applies to real routes.
    const hrefs = [...page.html.matchAll(/<a\b[^>]*\shref="([^"]+)"/g)]
      .map((m) => m[1]!)
      .filter((h) => h && h !== "#");
    for (const href of new Set(hrefs)) {
      results.push(await checkHref(root, href));
    }
  }

  const bad = results.filter((r) => r.status !== "ok" && r.status !== "external");
  const external = results.filter((r) => r.status === "external");
  for (const r of results) {
    const mark =
      r.status === "ok" ? "\x1b[32m✔\x1b[0m" : r.status === "external" ? "\x1b[33m•\x1b[0m" : "\x1b[31m✘\x1b[0m";
    console.log(
      `${mark} ${r.source.padEnd(24)} ${r.href.padEnd(52)} ${r.status}${r.detail ? ` — ${r.detail}` : ""}`,
    );
  }
  console.log(
    `\n${results.length - bad.length - external.length} ok, ${external.length} external (not asserted), ` +
      `${bad.length} failed (against ${BASE})\n`,
  );
  if (bad.length) process.exitCode = 1;
}

void main();
