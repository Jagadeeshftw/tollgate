import { ACTOR, type UiEvent } from "@/lib/trace";
import { TraceRow } from "./TraceRow";
import { DecisionCard } from "./DecisionCard";
import { ExclusionTable, PlanTable } from "./Tables";
import { FinalPanel, NetworkLine } from "./Panels";

/**
 * Renders the run.
 *
 * Every branch is exhaustive over the trace contract — an event the agent can emit that this does
 * not handle is a compile error, not a blank space on screen during a recording.
 */
export function TraceView({ events }: { events: readonly UiEvent[] }) {
  return (
    <div>
      {events.map((e, i) => {
        const node = render(e);
        if (!node) return null;
        const actor = e.type === "fatal" || e.type === "replay" ? "network" : ACTOR[e.type];
        return (
          <TraceRow key={i} actor={actor} heading={headingFor(e)}>
            {node}
          </TraceRow>
        );
      })}
    </div>
  );
}

function headingFor(e: UiEvent): string | undefined {
  switch (e.type) {
    case "policy:plans": return "The decision space — computed before the model was asked";
    case "decision:select": return "Which service?";
    case "decision:size": return "How much to buy?";
    case "decision:authorize": return "Is it worth paying?";
    case "data:excluded": return "Rows excluded from the ranking — the data contradicting itself";
    case "decision:assess": return "Is this answer good enough?";
    case "discovered": return "Services found on ENS";
    default: return undefined;
  }
}

function render(e: UiEvent): React.ReactNode {
  switch (e.type) {
    case "replay":
      return null; // surfaced as a banner above the trace, not as a row

    case "question":
      return (
        <p className="max-w-[70ch] text-[15px] text-ink">
          {e.question}
          <span className="tnum ml-3 font-mono text-[12.5px] text-dim">budget {e.budget}</span>
        </p>
      );

    case "resolving":
      return <NetworkLine>resolving {e.name} on ENS (Sepolia)</NetworkLine>;

    case "discovered":
      return (
        <NetworkLine>
          {e.candidates.length} service{e.candidates.length === 1 ? "" : "s"} —{" "}
          {e.candidates.map((c) => c.label).join(", ")}
        </NetworkLine>
      );

    case "policy:plans":
      return <PlanTable affordable={e.affordable} excluded={e.excluded} />;

    case "decision:select":
      return <DecisionCard choice={e.chose} tone="mono" why={e.reasoning} rejected={e.rejected} />;

    case "decision:size":
      return (
        <DecisionCard choice={`${e.units} ${e.unit}${e.units === 1 ? "" : "s"}`} why={e.reasoning} />
      );

    case "decision:authorize":
      return (
        <DecisionCard
          choice={e.approved ? "Approved" : "Declined"}
          tone={e.approved ? "yes" : "no"}
          ledger={[
            { label: "Price", value: e.cost },
            { label: "Its own ceiling", value: e.ceiling },
            { label: "Budget left", value: e.remaining },
          ]}
          why={e.reasoning}
        />
      );

    case "quote":
      return (
        <NetworkLine>
          HTTP 402 · {e.amount} to <span className="text-dim">{e.payTo}</span>
        </NetworkLine>
      );

    case "payment":
      return (
        <NetworkLine>
          settled {e.amount} · {e.transactionId}
          <br />
          <a
            href={e.hashscanUrl}
            target="_blank"
            rel="noreferrer"
            className="text-dim underline underline-offset-2 hover:text-muted"
          >
            view on HashScan
          </a>
        </NetworkLine>
      );

    case "received":
      return (
        <NetworkLine>
          payment verified · {e.units} unit{e.units === 1 ? "" : "s"} returned ({e.bytes} bytes)
        </NetworkLine>
      );

    case "data:excluded":
      return <ExclusionTable rule={e.rule} rows={e.rows} />;

    case "settlement:retry":
      return (
        <NetworkLine>
          settlement attempt {e.attempt} did not complete — retrying ({e.reason})
        </NetworkLine>
      );

    case "settlement:failed":
      return (
        <FinalPanel
          kind="failed"
          heading="Settlement failed upstream"
          body={`The payment was signed and submitted and the resource server still would not serve, after ${e.attempts} attempt${e.attempts === 1 ? "" : "s"}. This is the payment rail, not the agent.\n\n${e.detail}`}
          footnote={`attempted ${e.attempted} to ${e.payTo}`}
        />
      );

    case "decision:assess": {
      // Three verdicts, not two — "unanswerable" means the question cannot be answered by anything
      // on the catalogue, which is a different statement from the data being thin.
      const VERDICT = {
        sufficient: { label: "Sufficient", tone: "yes" },
        insufficient: { label: "Insufficient", tone: "no" },
        unanswerable: { label: "Unanswerable from this catalogue", tone: "no" },
      } as const;
      const v = VERDICT[e.verdict];
      return <DecisionCard choice={v.label} tone={v.tone} why={e.reasoning} />;
    }

    case "answer":
      return (
        <FinalPanel
          kind="answer"
          heading="Answer"
          body={e.text}
          footnote={`spent ${e.spent} · settled on Hedera testnet`}
        />
      );

    case "declined":
      return (
        <FinalPanel
          kind="declined"
          heading="Declined — buying nothing is a valid outcome"
          body={e.reason}
          footnote={`spent ${e.spent} · no purchase made`}
        />
      );

    case "error":
      return <NetworkLine>{e.message}</NetworkLine>;

    case "fatal":
      return (
        <FinalPanel
          kind="failed"
          heading="This run could not start"
          body={e.message}
          footnote="nothing was spent"
        />
      );
  }
}
