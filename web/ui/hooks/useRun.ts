"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { UiEvent } from "@/lib/trace";

/** In production the Express app serves this bundle, so the API is same-origin. */
const API = process.env.NEXT_PUBLIC_API_BASE ?? "";

export interface RunState {
  events: UiEvent[];
  running: boolean;
  /** Set while replaying an archived run, so the banner can never be missed. */
  replayOf: string | null;
}

export function useRun() {
  const [state, setState] = useState<RunState>({ events: [], running: false, replayOf: null });
  const source = useRef<EventSource | null>(null);

  const stop = useCallback(() => {
    source.current?.close();
    source.current = null;
    setState((s) => ({ ...s, running: false }));
  }, []);

  const open = useCallback((url: string, replayOf: string | null) => {
    source.current?.close();
    setState({ events: [], running: true, replayOf });
    const es = new EventSource(`${API}${url}`);
    source.current = es;
    es.onmessage = (m) => {
      let event: UiEvent;
      try {
        event = JSON.parse(m.data) as UiEvent;
      } catch {
        return;
      }
      setState((s) => ({ ...s, events: [...s.events, event] }));
      if (event.type === "answer" || event.type === "declined" || event.type === "fatal") {
        es.close();
        source.current = null;
        setState((s) => ({ ...s, running: false }));
      }
    };
    // A dropped stream must not leave the UI claiming to still be working.
    es.onerror = () => {
      es.close();
      source.current = null;
      setState((s) => ({ ...s, running: false }));
    };
  }, []);

  const ask = useCallback(
    (question: string, budget: string) =>
      open(`/api/ask?q=${encodeURIComponent(question)}&budget=${budget}`, null),
    [open],
  );

  const replay = useCallback(
    (name: string) => open(`/api/replay/${encodeURIComponent(name)}`, name),
    [open],
  );

  useEffect(() => () => source.current?.close(), []);

  return { ...state, ask, replay, stop };
}

export interface ModeInfo {
  mode: "live" | "devnet" | "replay";
  liveRuns: boolean;
  maxBudgetTinybar: string;
  /** Shape mirrors `Limiter.status` in `web/src/limits.ts`. */
  capacity?: { runsToday?: number; runsPerDay?: number; remaining?: number; resetsAt?: string };
}

export function useMode() {
  const [mode, setMode] = useState<ModeInfo | null>(null);
  const [healthy, setHealthy] = useState<boolean | null>(null);
  useEffect(() => {
    void fetch(`${API}/api/mode`)
      .then((r) => r.json())
      .then(setMode)
      .catch(() => setMode(null));
    void fetch(`${API}/api/health`)
      .then((r) => setHealthy(r.ok))
      .catch(() => setHealthy(false));
  }, []);
  return { mode, healthy };
}

export interface Listing {
  label: string;
  unitPrice: string;
  unit: string;
  context: string;
  name?: string;
}

export interface IncompleteScan {
  fromLogs: number;
  recovered: string[];
  detail: string;
}

export function useListings() {
  const [listings, setListings] = useState<Listing[] | null>(null);
  const [parent, setParent] = useState<string>("");
  const [incomplete, setIncomplete] = useState<IncompleteScan | null>(null);
  useEffect(() => {
    void fetch(`${API}/api/listings`)
      .then((r) => r.json())
      .then((d: { services?: Listing[]; parent?: string; incompleteScan?: IncompleteScan }) => {
        setListings(d.services ?? []);
        setParent(d.parent ?? "");
        setIncomplete(d.incompleteScan ?? null);
      })
      .catch(() => setListings([]));
  }, []);
  return { listings, parent, incomplete };
}

export function useTraces() {
  const [traces, setTraces] = useState<string[]>([]);
  useEffect(() => {
    void fetch(`${API}/api/traces`)
      .then((r) => r.json())
      .then((d: { traces?: string[] }) => setTraces(d.traces ?? []))
      .catch(() => setTraces([]));
  }, []);
  return traces;
}
