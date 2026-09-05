import { describe, expect, it } from "vitest";

import { MissingModelCredentialsError, type StructuredModel, type StructuredRequest } from "../src/model.js";
import { AnthropicModel, OpenAiModel, selectModel } from "../src/providers/index.js";
import { ModelReasoner } from "../src/reasoner.js";
import { priceOf } from "../src/policy.js";
import { UNISWAP } from "./support.js";

/**
 * A model that returns a canned payload, labelled with a vendor name.
 *
 * The label exists only to prove it has no effect. Two of these returning identical output must
 * produce byte-identical judgments, whatever they claim to be.
 */
function cannedModel(describe: string, payload: unknown): StructuredModel {
  return {
    describe,
    async complete<T>(_request: StructuredRequest<T>): Promise<T> {
      return payload as T;
    },
  };
}

describe("provider selection", () => {
  it("prefers Anthropic when its key is present", () => {
    expect(selectModel({ ANTHROPIC_API_KEY: "x" } as never)).toBeInstanceOf(AnthropicModel);
  });

  it("uses OpenAI when only its key is present", () => {
    expect(selectModel({ OPENAI_API_KEY: "x" } as never)).toBeInstanceOf(OpenAiModel);
  });

  /**
   * The SDKs read only their canonical variable names. Accepting the shorter form matters because
   * the failure it prevents is the worst kind: a key plainly set in .env, silently ignored, with
   * the agent reporting that it has no credentials.
   */
  it("accepts the shorter OPENAI_KEY / ANTHROPIC_KEY spellings", () => {
    expect(selectModel({ OPENAI_KEY: "x" } as never)).toBeInstanceOf(OpenAiModel);
    expect(selectModel({ ANTHROPIC_KEY: "x" } as never)).toBeInstanceOf(AnthropicModel);
  });

  it("honours an explicit provider override", () => {
    const env = { ANTHROPIC_API_KEY: "x", OPENAI_API_KEY: "y", TOLLGATE_MODEL_PROVIDER: "openai" };
    expect(selectModel(env as never)).toBeInstanceOf(OpenAiModel);
  });

  /** No fallback. An agent with no model does not get a hardcoded decision policy. */
  it("throws rather than inventing a decision policy when no key is present", () => {
    expect(() => selectModel({} as never)).toThrow(MissingModelCredentialsError);
  });
});

describe("the verdict shape is provider-independent", () => {
  const plans = [priceOf(UNISWAP, 3), priceOf(UNISWAP, 10)];
  const decision = {
    chosenPlanIndex: 1,
    ceiling: "0.02",
    serviceReasoning: "narrow question, narrow source",
    rejected: [{ label: "dex-pools", because: "3x the price for breadth not asked for" }],
    sizeReasoning: "ten rows is enough to rank",
    worthReasoning: "cheap relative to the budget",
  };

  const decide = (vendor: string) =>
    new ModelReasoner(cannedModel(vendor, decision)).decide({
      question: "top uniswap pools?",
      plans,
      remainingBaseUnits: 5_000_000n,
      alreadyBought: [],
    });

  it("produces identical purchase judgments from identical model output", async () => {
    const [a, b] = await Promise.all([decide("anthropic/claude-opus-5"), decide("openai/gpt-5-mini")]);

    expect(a.plan?.units).toBe(b.plan?.units);
    expect(a.ceilingBaseUnits).toBe(b.ceilingBaseUnits);
    expect(a.ceilingBaseUnits).toBe(2_000_000n); // 0.02 HBAR, parsed identically
    expect(JSON.stringify(a.rejected)).toBe(JSON.stringify(b.rejected));
    expect(a.serviceReasoning).toBe(b.serviceReasoning);
  });

  it("represents a decline the same way whichever provider produced it", async () => {
    const declineFrom = (vendor: string) =>
      new ModelReasoner(cannedModel(vendor, { ...decision, chosenPlanIndex: -1 })).decide({
        question: "q",
        plans,
        remainingBaseUnits: 5_000_000n,
        alreadyBought: [],
      });

    const [a, b] = await Promise.all([declineFrom("anthropic/x"), declineFrom("openai/y")]);
    expect(a.plan).toBeNull();
    expect(b.plan).toBeNull();
  });

  it("maps every verdict value identically across providers", async () => {
    for (const verdict of ["sufficient", "insufficient", "unanswerable"] as const) {
      const payload = { verdict, reasoning: "because", answer: verdict === "sufficient" ? "yes" : "" };
      const assess = (vendor: string) =>
        new ModelReasoner(cannedModel(vendor, payload)).assess({
          question: "q",
          data: {},
          boughtSoFar: [],
          remainingBaseUnits: 0n,
        });

      const [a, b] = await Promise.all([assess("anthropic/x"), assess("openai/y")]);
      expect(a.verdict).toBe(verdict);
      expect(a.verdict).toBe(b.verdict);
      expect(a.answer).toBe(b.answer);
    }
  });

  /** A ceiling we cannot parse must fail closed — "would pay nothing" — on any provider. */
  it("fails a malformed ceiling closed, identically", async () => {
    const bad = (vendor: string) =>
      new ModelReasoner(cannedModel(vendor, { ...decision, ceiling: "about twenty" })).decide({
        question: "q",
        plans,
        remainingBaseUnits: 5_000_000n,
        alreadyBought: [],
      });

    const [a, b] = await Promise.all([bad("anthropic/x"), bad("openai/y")]);
    expect(a.ceilingBaseUnits).toBe(0n);
    expect(b.ceilingBaseUnits).toBe(0n);
  });
});
