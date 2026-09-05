/**
 * Everything that has to be true for a judge's live run to work.
 *
 * @remarks
 * Checked rather than assumed, and checkable daily through judging. Each item is something that
 * has actually failed or could plausibly fail between now and 13 September: a drained testnet
 * account, an expired key, a facilitator outage, an exhausted cap.
 *
 * `ok` is false if **any** required check fails. Degraded-but-serving is reported as `degraded`,
 * because a demo that can still replay archived runs is not the same as one that is down.
 */
export type CheckState = "pass" | "warn" | "fail";

export interface Check {
  readonly name: string;
  readonly state: CheckState;
  readonly detail: string;
}

export interface Health {
  readonly ok: boolean;
  readonly status: "healthy" | "degraded" | "down";
  readonly checkedAt: string;
  readonly checks: readonly Check[];
}

const MIRROR = process.env.HEDERA_MIRROR_NODE ?? "https://testnet.mirrornode.hedera.com";

async function timed<T>(fn: () => Promise<T>, ms = 15_000): Promise<T> {
  return await Promise.race([
    fn(),
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms)),
  ]);
}

/** The payer must exist, be the account we think, and hold enough for the day's runs. */
async function hederaBalance(accountId: string | undefined): Promise<Check> {
  const name = "hedera payer";
  if (!accountId) return { name, state: "fail", detail: "HEDERA_OPERATOR_ID unset" };
  try {
    const res = await timed(() => fetch(`${MIRROR}/api/v1/accounts/${accountId}`));
    if (!res.ok) return { name, state: "fail", detail: `mirror node HTTP ${res.status} for ${accountId}` };
    const body = (await res.json()) as { balance?: { balance?: number } };
    const hbar = (body.balance?.balance ?? 0) / 1e8;
    // A live run costs at most a few hundredths; 5 HBAR is comfortably a day of them.
    if (hbar < 1) return { name, state: "fail", detail: `${accountId} holds ${hbar} HBAR — too low to serve runs` };
    if (hbar < 5) return { name, state: "warn", detail: `${accountId} holds ${hbar} HBAR — top up soon` };
    return { name, state: "pass", detail: `${accountId} holds ${hbar} HBAR` };
  } catch (err) {
    return { name, state: "fail", detail: (err as Error).message };
  }
}

/** The facilitator has to be up, or nothing settles. */
async function facilitator(url: string): Promise<Check> {
  const name = "x402 facilitator";
  try {
    const res = await timed(() => fetch(`${url}/supported`));
    if (!res.ok) return { name, state: "fail", detail: `${url}/supported → HTTP ${res.status}` };
    const body = (await res.json()) as { kinds?: { network: string }[] };
    const hedera = body.kinds?.some((k) => k.network === "hedera:testnet");
    return hedera
      ? { name, state: "pass", detail: "hedera:testnet advertised" }
      : { name, state: "fail", detail: "no longer advertises hedera:testnet" };
  } catch (err) {
    return { name, state: "fail", detail: (err as Error).message };
  }
}

/** The service must be serving, and its Graph key must still work — a quote proves both. */
async function service(baseUrl: string, label: string): Promise<Check> {
  const name = "data service";
  try {
    const res = await timed(() => fetch(`${baseUrl}/s/${label}/quote?limit=1`), 25_000);
    if (!res.ok) return { name, state: "fail", detail: `${baseUrl} quote → HTTP ${res.status}` };
    const body = (await res.json()) as { quote?: { total?: string } };
    return body.quote?.total
      ? { name, state: "pass", detail: `${baseUrl} quoting ${body.quote.total} HBAR` }
      : { name, state: "fail", detail: "quote returned no total" };
  } catch (err) {
    return { name, state: "fail", detail: (err as Error).message };
  }
}

/** Model credentials present and the provider constructible. Does not spend a token. */
function model(): Check {
  const name = "model provider";
  const has =
    process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_KEY || process.env.ANTHROPIC_AUTH_TOKEN ||
    process.env.OPENAI_API_KEY || process.env.OPENAI_KEY;
  return has
    ? { name, state: "pass", detail: "credentials present" }
    : { name, state: "fail", detail: "no model credentials — live runs cannot reason" };
}

function capacity(status: { remaining: number; runsPerDay: number; resetsAt: string }): Check {
  const name = "daily run capacity";
  if (status.remaining === 0)
    return { name, state: "warn", detail: `0 of ${status.runsPerDay} left; resets ${status.resetsAt}` };
  if (status.remaining < status.runsPerDay * 0.15)
    return { name, state: "warn", detail: `${status.remaining} of ${status.runsPerDay} left` };
  return { name, state: "pass", detail: `${status.remaining} of ${status.runsPerDay} left` };
}

export async function health(options: {
  payerAccountId?: string;
  facilitatorUrl: string;
  serviceBaseUrl: string;
  serviceLabel: string;
  capacity: { remaining: number; runsPerDay: number; resetsAt: string };
}): Promise<Health> {
  const checks = [
    ...(await Promise.all([
      hederaBalance(options.payerAccountId),
      facilitator(options.facilitatorUrl),
      service(options.serviceBaseUrl, options.serviceLabel),
    ])),
    model(),
    capacity(options.capacity),
  ];

  const failed = checks.some((c) => c.state === "fail");
  const warned = checks.some((c) => c.state === "warn");
  return {
    ok: !failed,
    status: failed ? "down" : warned ? "degraded" : "healthy",
    checkedAt: new Date().toISOString(),
    checks,
  };
}
