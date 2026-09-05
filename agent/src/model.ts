import type { z } from "zod";

/**
 * The provider seam.
 *
 * @remarks
 * Deliberately narrow: give it a system prompt, a user prompt and a schema, get back a value of
 * that schema's type. Everything above this line — what to ask, how to phrase the options, how a
 * decline is represented — lives in one place and is written once, so a provider swap cannot
 * quietly change what the agent decides or what `unanswerable` means. Adapters below this line do
 * nothing but translate.
 *
 * None of this reaches the trace. Which vendor answered is an implementation detail; the trace
 * distinguishes arithmetic from judgement, and adding a third category for "which model" would
 * confuse an implementation choice with the design's actual claim.
 */
export interface StructuredModel {
  /** For startup logging and errors only. Never emitted as a trace event. */
  readonly describe: string;
  complete<T>(request: StructuredRequest<T>): Promise<T>;
}

export interface StructuredRequest<T> {
  readonly system: string;
  readonly user: string;
  readonly schema: z.ZodType<T>;
  /** Model-visible name for the schema; some providers surface it to the model. */
  readonly schemaName: string;
}

export class MissingModelCredentialsError extends Error {
  constructor() {
    super(
      "No model credentials found. The agent's decisions are made by a model; there is no " +
        "offline fallback, because a hardcoded decision policy pretending to be reasoning would " +
        "be worse than an honest failure.\n" +
        "Set ANTHROPIC_API_KEY or OPENAI_API_KEY in .env — either works.",
    );
    this.name = "MissingModelCredentialsError";
  }
}

export class ModelRefusedError extends Error {
  constructor(readonly provider: string, message: string) {
    super(`${provider} returned no usable decision: ${message}`);
    this.name = "ModelRefusedError";
  }
}
