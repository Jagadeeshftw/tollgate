"use client";

/**
 * List a service from your own wallet — then try to break the rule that makes listing safe.
 *
 * This is the one place in Tollgate where a human signs anything. Listing is an on-chain act by the
 * person who owns the listing; the query path stays unsigned, because an agent paying from its own
 * account is the thesis. Nothing here holds a key: every transaction is signed in the visitor's
 * wallet and sent from it.
 *
 * The console is built to end on a refusal. After listing, the operator may reprice and repoint
 * their endpoint — and when they try to change `x402:settlement`, ENS refuses. That refusal is the
 * point of letting strangers list at all, so it is a button, not a paragraph.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  BaseError,
  ContractFunctionRevertedError,
  createPublicClient,
  createWalletClient,
  custom,
  http,
  namehash,
  parseAbi,
  type Address,
  type WalletClient,
} from "viem";
import { sepolia } from "viem/chains";

import type { OperatorDeployment } from "@/lib/deployment";
import { cn } from "@/lib/utils";

const OPEN_ABI = parseAbi([
  "struct Listing { string context; string endpoint; string price; string unit; string settlement; string network; string asset; string schema; }",
  "function list(string label, address operator, Listing listing, uint64 expiry) returns (uint256)",
  "error NotSelf(address caller, address operator)",
  "error InvalidLabel(string label)",
  "error ExpiryInPast(uint64 expiry)",
  "error ExpiryTooFar(uint64 expiry, uint64 latest)",
  "error EmptyRecord(string field)",
  "error LabelAlreadyRegistered(string label)",
]);
const RESOLVER_ABI = parseAbi([
  "function setText(bytes32 node, string key, string value)",
  "function text(bytes32 node, string key) view returns (string)",
  "error EACUnauthorizedAccountRoles(uint256 resource, uint256 roleBitmap, address account)",
]);

type Step = "idle" | "connecting" | "listing" | "listed" | "working";
type Outcome = { tone: "ok" | "refused" | "error"; title: string; detail: string; tx?: string };
/** Which step an outcome belongs to. It renders inside that step, next to the button that caused it. */
type Where = "wallet" | "listing" | "rule";

declare global {
  interface Window {
    ethereum?: { request: (a: { method: string; params?: unknown[] }) => Promise<unknown> };
  }
}

const pub = createPublicClient({
  chain: sepolia,
  transport: http("https://ethereum-sepolia-rpc.publicnode.com"),
});

/** Turn a revert into the sentence a person needs. The EAC refusal gets named precisely. */
function explain(err: unknown): Outcome {
  if (err instanceof BaseError) {
    const reverted = err.walk((e) => e instanceof ContractFunctionRevertedError);
    if (reverted instanceof ContractFunctionRevertedError) {
      const name = reverted.data?.errorName;
      const args = reverted.data?.args ?? [];
      switch (name) {
        case "EACUnauthorizedAccountRoles":
          return {
            tone: "refused",
            title: "Refused by ENS — you cannot move where the money goes",
            detail:
              "Your wallet holds ROLE_SET_TEXT for exactly two keys on this name: x402:price and " +
              "agent-endpoint[web]. x402:settlement was never delegated, so the resolver's per-key " +
              "check falls through to the name-wide check, which you do not pass. This is ENS " +
              "Enhanced Access Control, not Tollgate code.",
          };
        case "LabelAlreadyRegistered":
          return { tone: "error", title: "That name is taken", detail: `"${String(args[0])}" is already a live listing. Live names cannot be overwritten.` };
        case "InvalidLabel":
          return { tone: "error", title: "Label not allowed", detail: "Use a–z, 0–9 and hyphens, 1–63 characters, no hyphen at either end." };
        case "EmptyRecord":
          return { tone: "error", title: "Listing incomplete", detail: `The ${String(args[0])} field is required — a listing is written in full or not at all.` };
        case "ExpiryTooFar":
          return { tone: "error", title: "Term too long", detail: "Listings can run for at most 365 days; renew before they lapse." };
        default:
          return { tone: "error", title: `Reverted: ${name ?? "unknown"}`, detail: reverted.shortMessage };
      }
    }
    return { tone: "error", title: "Transaction failed", detail: err.shortMessage };
  }
  return { tone: "error", title: "Transaction failed", detail: err instanceof Error ? err.message : String(err) };
}

export function OperatorConsole({ deployment }: { deployment: OperatorDeployment }) {
  const [wallet, setWallet] = useState<WalletClient | null>(null);
  const [account, setAccount] = useState<Address | null>(null);
  const [step, setStep] = useState<Step>("idle");
  const [outcome, setOutcomeState] = useState<(Outcome & { where: Where }) | null>(null);
  const outcomeRef = useRef<HTMLDivElement>(null);
  const setOutcome = (o: Outcome | null, where: Where = "listing") =>
    setOutcomeState(o ? { ...o, where } : null);

  // The refusal is the moment this page exists for. It previously rendered at the foot of the page,
  // below the button that caused it, so on a laptop screen a judge clicked and saw nothing happen.
  useEffect(() => {
    if (outcome) outcomeRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [outcome]);
  const [listed, setListed] = useState<{ label: string; node: `0x${string}` } | null>(null);
  const [form, setForm] = useState({
    label: "",
    context: "",
    endpoint: "https://",
    price: "0.001",
    unit: "request",
    settlement: "0.0.",
    schema: "{}",
    days: "30",
  });

  const open = deployment.openRegistrar;
  const fqdn = useMemo(() => (form.label ? `${form.label}.${deployment.parentName}` : ""), [form.label, deployment.parentName]);

  async function connect() {
    if (!window.ethereum) {
      setOutcome({ tone: "error", title: "No wallet found", detail: "Install a browser wallet such as MetaMask, then reload." }, "wallet");
      return;
    }
    setStep("connecting");
    try {
      const w = createWalletClient({ chain: sepolia, transport: custom(window.ethereum) });
      const [addr] = await w.requestAddresses();
      await w.switchChain({ id: sepolia.id }).catch(() => undefined);
      setWallet(w);
      setAccount(addr ?? null);
      setOutcome(null);
    } catch (err) {
      setOutcome(explain(err), "wallet");
    } finally {
      setStep("idle");
    }
  }

  async function submitListing() {
    if (!wallet || !account || !open) return;
    setStep("listing");
    setOutcome(null);
    try {
      const expiry = BigInt(Math.floor(Date.now() / 1000) + Number(form.days) * 86_400);
      const args = [
        form.label,
        account,
        {
          context: form.context,
          endpoint: form.endpoint,
          price: form.price,
          unit: form.unit,
          settlement: form.settlement,
          network: "hedera:testnet",
          asset: "0.0.0",
          schema: form.schema,
        },
        expiry,
      ] as const;
      // Simulate against our own RPC first. A doomed listing is refused here with a decoded reason
      // ("that name is taken") and never reaches the wallet — which matters because how a revert
      // arrives from a wallet's own gas estimation varies by wallet, and one variant rendered only as
      // "Transaction failed". The settlement refusal already worked this way; publishing did not.
      await pub.simulateContract({ account, address: open, abi: OPEN_ABI, functionName: "list", args });
      const hash = await wallet.writeContract({
        account,
        chain: sepolia,
        address: open,
        abi: OPEN_ABI,
        functionName: "list",
        args,
      });
      await pub.waitForTransactionReceipt({ hash });
      const node = namehash(fqdn);
      setListed({ label: form.label, node });
      setStep("listed");
      setOutcome({ tone: "ok", title: `Listed ${fqdn}`, detail: "It resolves through the public ENS path. Now try the two things below.", tx: hash });
    } catch (err) {
      setStep("idle");
      setOutcome(explain(err));
    }
  }

  async function setRecord(key: string, value: string) {
    if (!wallet || !account || !listed) return;
    setStep("working");
    setOutcome(null);
    try {
      // Simulate first: a refusal surfaces as a decoded revert without costing the visitor gas.
      await pub.simulateContract({
        account,
        address: deployment.resolver,
        abi: RESOLVER_ABI,
        functionName: "setText",
        args: [listed.node, key, value],
      });
      const hash = await wallet.writeContract({
        account,
        chain: sepolia,
        address: deployment.resolver,
        abi: RESOLVER_ABI,
        functionName: "setText",
        args: [listed.node, key, value],
      });
      await pub.waitForTransactionReceipt({ hash });
      const now = await pub.readContract({ address: deployment.resolver, abi: RESOLVER_ABI, functionName: "text", args: [listed.node, key] });
      setOutcome({ tone: "ok", title: `${key} is now ${now}`, detail: "Allowed — this key was delegated to your wallet at listing.", tx: hash }, "rule");
    } catch (err) {
      setOutcome(explain(err), "rule");
    } finally {
      setStep("listed");
    }
  }

  const panel = (where: Where) =>
    outcome && outcome.where === where ? (
      <div
        ref={outcomeRef}
        role="status"
        className={cn(
          "mt-4 scroll-mt-24 rounded-xl border border-l-2 bg-raised p-5",
          outcome.tone === "ok" && "border-rule border-l-good",
          outcome.tone === "refused" && "border-rule border-l-judgment",
          outcome.tone === "error" && "border-rule border-l-bad",
        )}
      >
        <p className="text-[15px] font-semibold text-ink">{outcome.title}</p>
        <p className="mt-1.5 max-w-[70ch] text-[13.5px] text-muted">{outcome.detail}</p>
        {outcome.tx ? (
          <a href={`https://sepolia.etherscan.io/tx/${outcome.tx}`} className="mt-2 block font-mono text-[12px] break-all text-dim underline underline-offset-2">
            {outcome.tx}
          </a>
        ) : null}
      </div>
    ) : null;

  const field = (key: keyof typeof form, label: string, hint: string, mono = true) => (
    <label className="block">
      <span className="text-[12.5px] font-semibold text-muted">{label}</span>
      <input
        value={form[key]}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
        className={cn(
          "mt-1.5 w-full rounded-lg border border-rule-lit bg-ground px-3.5 py-2.5 text-[14px] text-ink",
          mono && "font-mono",
        )}
      />
      <span className="mt-1 block text-[11.5px] text-dim">{hint}</span>
    </label>
  );

  return (
    <main className="mx-auto max-w-[880px] px-6 pt-10 pb-24">
      <p className="font-mono text-[11px] tracking-[0.13em] text-judgment uppercase">Sell data</p>
      <h1 className="mt-3 text-[clamp(26px,3.4vw,36px)] font-bold tracking-tight text-ink">List a service under ENS</h1>
      <p className="mt-3 max-w-[64ch] text-[15px] text-muted">
        Your listing is an ENS subname under <span className="font-mono text-ink">{deployment.parentName}</span>, minted to your
        wallet. Price, endpoint and the account you are paid in live on it as records. You keep the right to reprice and
        repoint; you never get the right to change where the money goes, and neither does any other operator.
      </p>
      <p className="mt-3 max-w-[64ch] text-[13px] text-dim">
        Listings here are self-published and unvetted. Nobody reviews them. The registry enforces what an operator can
        change, not whether a service is any good — and the deployer of this system still holds top-level roles that an
        operator does not.{" "}
        <a href="/docs/list-a-service#qualifier" className="text-muted underline underline-offset-2 hover:text-ink">
          What that means
        </a>
        .
      </p>
      <p className="mt-2 max-w-[64ch] font-mono text-[11.5px] text-dim">
        Tested end to end on Sepolia in a desktop browser. Mobile wallet browsers are unverified.
      </p>

      {!open ? (
        <div className="mt-8 rounded-xl border border-rule bg-surface p-5">
          <p className="font-mono text-[11px] tracking-[0.1em] text-dim uppercase">Not live yet</p>
          <p className="mt-2 text-[14px] text-muted">
            Open listing has not been rolled out on Sepolia. Until it is, listing under{" "}
            <span className="font-mono text-ink">{deployment.parentName}</span> is allowlisted, and the self-serve route is
            running your own registrar under a name you own.
          </p>
        </div>
      ) : (
        <>
          <section className="mt-8 rounded-xl border border-rule bg-surface p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-mono text-[11px] tracking-[0.1em] text-dim uppercase">1 · Wallet</p>
                <p className="mt-1 font-mono text-[13px] text-ink">{account ?? "not connected"}</p>
              </div>
              {!account ? (
                <button onClick={connect} disabled={step === "connecting"} className="rounded-lg bg-judgment px-4 py-2.5 text-[13.5px] font-semibold text-ground disabled:opacity-50">
                  {step === "connecting" ? "Connecting…" : "Connect a Sepolia wallet"}
                </button>
              ) : null}
            </div>
            {panel("wallet")}
          </section>

          <section className={cn("mt-4 rounded-xl border border-rule bg-surface p-5", !account && "opacity-50")}>
            <p className="font-mono text-[11px] tracking-[0.1em] text-dim uppercase">2 · Your listing</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {field("label", "Label", fqdn ? `resolves as ${fqdn}` : "a–z, 0–9, hyphens")}
              {field("endpoint", "Endpoint", "your x402-gated URL — you can change this later")}
              {field("price", "Price per unit", "decimal HBAR — you can change this later")}
              {field("unit", "Unit", "what one unit is; fixed at listing")}
              {field("settlement", "Settlement account", "the Hedera account you are paid in — fixed forever")}
              {field("days", "Term (days)", "at most 365")}
            </div>
            <div className="mt-4">{field("context", "What it sells", "written for an agent to read", false)}</div>
            <button
              onClick={submitListing}
              disabled={!account || step !== "idle"}
              className="mt-5 rounded-lg bg-judgment px-5 py-3 text-[14px] font-semibold text-ground disabled:opacity-40"
            >
              {step === "listing" ? "Waiting for the transaction…" : "Publish listing"}
            </button>
            {panel("listing")}
          </section>

          <section className={cn("mt-4 rounded-xl border border-rule bg-surface p-5", !listed && "opacity-50")}>
            <p className="font-mono text-[11px] tracking-[0.1em] text-dim uppercase">3 · Now test the rule</p>
            <p className="mt-2 max-w-[62ch] text-[14px] text-muted">
              You own this name. One of these is yours to change; the other is not.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                onClick={() => setRecord("x402:price", (Number(form.price || "0") * 2).toString())}
                disabled={!listed || step === "working"}
                className="rounded-lg border border-rule-lit px-4 py-2.5 text-[13.5px] font-semibold text-ink disabled:opacity-40"
              >
                Double my price
              </button>
              <button
                onClick={() => setRecord("x402:settlement", "0.0.999999")}
                disabled={!listed || step === "working"}
                className="rounded-lg border border-bad/60 px-4 py-2.5 text-[13.5px] font-semibold text-ink disabled:opacity-40"
              >
                Redirect my settlement to 0.0.999999
              </button>
            </div>
            {panel("rule")}
          </section>
        </>
      )}

    </main>
  );
}
