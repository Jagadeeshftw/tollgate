"use client";

import { useEffect, useMemo, useState } from "react";
import { AppBar, HealthPip, NavTab } from "@/components/AppBar";
import { CommandBar } from "@/components/dashboard/CommandBar";
import { Legend } from "@/components/dashboard/Legend";
import { IdleState } from "@/components/dashboard/IdleState";
import { ReplayBanner, ServiceRail, Working } from "@/components/dashboard/Panels";
import { StateStrip } from "@/components/dashboard/StateStrip";
import { TraceView } from "@/components/dashboard/TraceView";
import { useListings, useMode, useRun, useTraces } from "@/hooks/useRun";
import { isDecline, stageOf } from "@/lib/trace";

/** What each archived run demonstrates, so a card says what it shows rather than its filename. */
const ARCHIVE_LABELS: Record<string, { title: string; detail: string }> = {
  "answer-with-exclusions": {
    title: "A completed purchase",
    detail:
      "Buys 10 pools for 0.01 HBAR and answers. Shows both exclusion tables — the plans arithmetic removed, and the pools whose reported TVL contradicts their own traded volume.",
  },
  "decline-off-catalogue": {
    title: "A decline",
    detail:
      "Six plans were affordable and it bought none of them: the catalogue sells pool TVL and the question asked for a price. Nothing was spent.",
  },
  "answer-on-live-graph-data": {
    title: "Live Graph data",
    detail: "An earlier run answering from data indexed to the chain head.",
  },
  "refusal-on-placeholder-data": {
    title: "Refusing bad data",
    detail:
      "The data source returned placeholder values and the agent refused to answer from them, after paying.",
  },
};

export default function Dashboard() {
  const { events, running, replayOf, ask, replay } = useRun();
  const { mode, healthy } = useMode();
  const { listings, parent, incomplete } = useListings();
  const traces = useTraces();

  // Deep links: ?replay=<name> reaches any archived state without spending, and ?q=<question>
  // carries a question over from the landing page's hero input.
  const [handoff, setHandoff] = useState<string | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const name = params.get("replay");
    if (name) {
      replay(name);
      return;
    }
    const q = params.get("q");
    if (q) setHandoff(q);
  }, [replay]);

  const { reached, done } = useMemo(() => stageOf(events), [events]);
  const declined = useMemo(() => isDecline(events), [events]);
  const spent = useMemo(() => {
    const last = [...events].reverse().find((e) => e.type === "answer" || e.type === "declined");
    return last && "spent" in last ? last.spent : undefined;
  }, [events]);
  const budget = useMemo(() => {
    const q = events.find((e) => e.type === "question");
    return q && "budget" in q ? q.budget : undefined;
  }, [events]);
  const replayNote = useMemo(() => {
    const r = events.find((e) => e.type === "replay");
    return r && "note" in r ? r.note : undefined;
  }, [events]);

  const maxTinybar = BigInt(mode?.maxBudgetTinybar ?? "2000000");
  const liveDisabled = mode !== null && !mode.liveRuns;
  const capacity = mode?.capacity;

  return (
    <div className="min-h-dvh bg-ground">
      <AppBar
        nav={
          <>
            <NavTab href="/dashboard" active>Run</NavTab>
            <NavTab href="/#how">How it works</NavTab>
            <NavTab href="/#verify">Verify</NavTab>
          </>
        }
        status={
          <>
            <HealthPip healthy={healthy} />
            {capacity?.remaining !== undefined ? (
              <span className="hidden sm:inline">
                {capacity.remaining} / {capacity.runsPerDay ?? "—"} runs left today
              </span>
            ) : null}
          </>
        }
      />

      <CommandBar
        onAsk={ask}
        running={running}
        maxTinybar={maxTinybar}
        disabled={liveDisabled}
        initialQuestion={handoff}
      />

      <div className="grid items-start lg:grid-cols-[290px_minmax(0,1fr)]">
        <ServiceRail listings={listings} parent={parent} incomplete={incomplete} />

        <section className="max-w-[1020px] px-6 pt-5 pb-24">
          {replayOf ? <ReplayBanner name={replayOf} note={replayNote} /> : null}

          {events.length > 0 ? (
            <StateStrip
              reached={reached}
              done={done}
              spent={spent}
              budget={budget}
              declined={declined}
            />
          ) : null}

          <Legend />

          {events.length === 0 ? (
            <IdleState traces={traces} labels={ARCHIVE_LABELS} onReplay={replay} />
          ) : (
            <>
              <div className="pt-5">
                <TraceView events={events} />
                {running ? <Working label="waiting for the next decision…" /> : null}
              </div>

              {!running && traces.length > 0 ? (
                <div className="mt-10 border-t border-rule pt-5">
                  <div className="text-[10.5px] font-semibold tracking-[0.11em] text-dim uppercase">
                    Other recorded runs
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2.5">
                    {traces
                      .filter((t) => t !== replayOf)
                      .map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => replay(t)}
                          className="rounded-lg border border-rule bg-surface px-3.5 py-2 text-left text-[12.5px] text-muted hover:border-rule-lit hover:text-ink"
                        >
                          {ARCHIVE_LABELS[t]?.title ?? t}
                          <span className="mt-0.5 block font-mono text-[10.5px] text-dim">{t}</span>
                        </button>
                      ))}
                  </div>
                </div>
              ) : null}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
