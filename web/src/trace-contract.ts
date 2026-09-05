/**
 * Compile-time check that the browser's copy of the trace contract still matches the agent's.
 *
 * `web/ui/lib/trace.ts` redeclares the trace union so the static bundle does not have to pull in
 * the agent's dependency graph for types it only reads. That mirror is a liability the moment it
 * drifts: a new event would arrive at a UI that silently renders nothing, and nobody would notice
 * until a recording. This file imports both and asserts assignability, so drift fails `typecheck`
 * instead of failing on camera.
 *
 * Nothing imports this module — its only job is to be typechecked.
 */
import type { TraceEvent } from "@tollgate/agent";
import type { UiTraceEvent } from "../ui/lib/trace.js";

/** Every event the agent can emit must be renderable by the UI. */
type AgentEventsAreRenderable = TraceEvent extends UiTraceEvent ? true : never;

export const _contractHolds: AgentEventsAreRenderable = true;
