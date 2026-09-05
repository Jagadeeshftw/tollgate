import { MissingModelCredentialsError, type StructuredModel } from "../model.js";

import { AnthropicModel } from "./anthropic.js";
import { OpenAiModel } from "./openai.js";

export { AnthropicModel } from "./anthropic.js";
export { OpenAiModel } from "./openai.js";

/**
 * Pick a provider from whichever credential is present.
 *
 * @remarks
 * Nothing in Hedera's, The Graph's or ENS's criteria names a model vendor — the judgment layer
 * needs a model that returns structured output, and that is the whole requirement. Being blocked
 * on one vendor's key would be a self-inflicted dependency.
 *
 * There is deliberately no third branch. With no credential this throws, and the agent stops with
 * an actionable error rather than falling back to a hardcoded decision policy dressed up as
 * reasoning.
 */
export function selectModel(env: NodeJS.ProcessEnv = process.env): StructuredModel {
  // Both SDKs read only their canonical variable, so the shorter names people naturally reach for
  // are accepted here and passed through explicitly. Without this an `OPENAI_KEY` that is plainly
  // set in .env is silently ignored, and the agent reports "no credentials" while staring at one.
  const openaiKey = env.OPENAI_API_KEY ?? env.OPENAI_KEY;
  const anthropicKey = env.ANTHROPIC_API_KEY ?? env.ANTHROPIC_KEY;
  const anthropicAvailable = Boolean(anthropicKey || env.ANTHROPIC_AUTH_TOKEN);

  const anthropic = () =>
    new AnthropicModel(anthropicKey ? { apiKey: anthropicKey } : {});
  const openai = () => new OpenAiModel(openaiKey ? { apiKey: openaiKey } : {});

  const preferred = env.TOLLGATE_MODEL_PROVIDER?.toLowerCase();
  if (preferred === "anthropic") return anthropic();
  if (preferred === "openai") return openai();
  if (preferred) throw new Error(`unknown TOLLGATE_MODEL_PROVIDER "${preferred}"`);

  if (anthropicAvailable) return anthropic();
  if (openaiKey) return openai();

  throw new MissingModelCredentialsError();
}
