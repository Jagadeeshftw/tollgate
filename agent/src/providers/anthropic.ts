import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

import {
  MissingModelCredentialsError,
  ModelRefusedError,
  type StructuredModel,
  type StructuredRequest,
} from "../model.js";

/**
 * Claude via the Anthropic SDK.
 *
 * Adaptive thinking is on: every call here is a judgement the agent is graded on, not glue.
 */
export class AnthropicModel implements StructuredModel {
  readonly describe: string;
  private readonly client: Anthropic;
  private readonly model: string;

  constructor(options: { apiKey?: string; model?: string } = {}) {
    this.model = options.model ?? process.env.TOLLGATE_MODEL ?? "claude-opus-5";
    this.describe = `anthropic/${this.model}`;
    this.client = options.apiKey ? new Anthropic({ apiKey: options.apiKey }) : new Anthropic();
  }

  async complete<T>(request: StructuredRequest<T>): Promise<T> {
    try {
      const response = await this.client.messages.parse({
        model: this.model,
        max_tokens: 16000,
        thinking: { type: "adaptive" },
        system: request.system,
        messages: [{ role: "user", content: request.user }],
        output_config: { format: zodOutputFormat(request.schema as never) },
      });

      const parsed = response.parsed_output as T | null;
      if (!parsed) throw new ModelRefusedError(this.describe, "no parseable output");
      return parsed;
    } catch (err) {
      throw translate(err, this.describe);
    }
  }
}

function translate(err: unknown, provider: string): Error {
  if (err instanceof ModelRefusedError) return err;
  const message = (err as Error)?.message ?? "";
  if (
    err instanceof Anthropic.AuthenticationError ||
    /could not resolve authentication|x-api-key|authentication_error/i.test(message)
  ) {
    return new MissingModelCredentialsError();
  }
  return err as Error;
}
