"use client";

import { useEffect, useState } from "react";

interface RunSummary {
  id: string;
  question: string;
  status: "answered" | "declined" | "error";
  spentBaseUnits: string;
  transactionId: string | null;
  createdAt: string;
}

function tinybarToHbar(v: string): string {
  const n = BigInt(v);
  const whole = n / 100_000_000n;
  const frac = (n % 100_000_000n).toString().padStart(8, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : `${whole}`;
}

const STATUS_LABEL: Record<RunSummary["status"], string> = {
  answered: "answered",
  declined: "declined",
  error: "error",
};

/**
 * Real live runs, read back from the database after this page has been reloaded — not the archived
 * trace files below, which ship with the build. Hidden entirely when persistence is not configured
 * (a local devnet run with no `DATABASE_URL`, say) rather than showing an empty, misleading panel.
 */
export function RecentRuns() {
  const [runs, setRuns] = useState<RunSummary[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/runs?limit=8")
      .then((r) => r.json())
      .then((body) => {
        if (cancelled) return;
        setRuns(body.configured ? (body.runs as RunSummary[]) : []);
      })
      .catch(() => !cancelled && setRuns([]));
    return () => {
      cancelled = true;
    };
  }, []);

  if (!runs || runs.length === 0) return null;

  return (
    <div className="mt-9 border-t border-rule pt-5">
      <div className="text-[10.5px] font-semibold tracking-[0.11em] text-dim uppercase">
        Recent live runs — persisted, not recorded
      </div>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[520px] border-collapse text-[12.5px]">
          <tbody>
            {runs.map((r) => (
              <tr key={r.id} className="border-b border-rule align-top">
                <td className="py-2 pr-4 text-muted">{r.question}</td>
                <td className="py-2 pr-4 font-mono text-dim">{STATUS_LABEL[r.status]}</td>
                <td className="py-2 pr-4 font-mono text-dim">{tinybarToHbar(r.spentBaseUnits)} HBAR</td>
                <td className="py-2 pr-4 font-mono text-[11px] text-dim">
                  {r.transactionId ? (
                    <a
                      href={`https://hashscan.io/testnet/transaction/${r.transactionId}`}
                      className="underline decoration-rule-lit underline-offset-2 hover:text-ink"
                    >
                      {r.transactionId}
                    </a>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="py-2 font-mono text-[11px] text-dim">
                  {new Date(r.createdAt).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
