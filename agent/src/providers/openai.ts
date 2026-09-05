import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";

import {
  MissingModelCredentialsError,
  ModelRefusedError,
  type StructuredModel,
  type StructuredRequest,
} from "../model.js";

/**
 * OpenAI via the Responses API.
 *
 * @remarks
 * Defaults to `gpt-5-mini` rather than the largest available model: this workload is structured
 * judging against a pre-priced, pre-filtered option set, which is the shape small reasoning models
 * do well at, and the policy layer has already removed everything unaffordable before the model is
 * asked anything.
 */
export class OpenAiModel implements StructuredModel {
  readonly describe: string;
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(options: { apiKey?: string; model?: string } = {}) {
    this.model = options.model ?? process.env.TOLLGATE_MODEL ?? "gpt-5-mini";
    this.describe = `openai/${this.model}`;
    this.client = options.apiKey ? new OpenAI({ apiKey: options.apiKey }) : new OpenAI();
  }

  async complete<T>(request: StructuredRequest<T>): Promise<T> {
    try {
      const response = await this.client.responses.parse({
        model: this.model,
        instructions: request.system,
        input: request.user,
        text: { format: zodTextFormat(request.schema as never, request.schemaName) },
      });

      const parsed = response.output_parsed as T | null;
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
    err instanceof OpenAI.AuthenticationError ||
    /api key|authentication|OPENAI_API_KEY/i.test(message)
  ) {
    return new MissingModelCredentialsError();
  }
  return err as Error;
}
