import "server-only";

import { createHash } from "node:crypto";
import {
  readCachedOutput,
  recordUsage,
  tokensUsedThisMonth,
  writeCachedOutput,
} from "@/lib/dal/ai";
import { AI_MONTHLY_TOKEN_BUDGET, getOpenAI } from "./client";
import type { AiFailure, AiKind, AiResult } from "@/types";

/**
 * Every model call in the app goes through `generate`. Nothing else imports the
 * OpenAI client.
 *
 * Centralising it is what makes the spend controls real rather than a
 * convention: the cache lookup, the monthly budget check, the output-token
 * ceiling and the usage log all live here, so a new surface cannot forget them.
 */

/** Deterministic key for a set of inputs — object key order must not matter. */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`);
  return `{${entries.join(",")}}`;
}

export function cacheKeyFor(value: unknown): string {
  return createHash("sha256").update(stableStringify(value)).digest("hex").slice(0, 32);
}

function classify(error: unknown): AiFailure {
  const status = (error as { status?: number })?.status;
  if (status === 429) return "rate-limited";

  const name = (error as { name?: string })?.name ?? "";
  if (name.includes("Timeout") || name === "AbortError") return "timeout";

  return "error";
}

export interface GenerateArgs<T> {
  kind: AiKind;
  /**
   * Hash of the exact inputs, from `cacheKeyFor`. Identical inputs are served
   * from Mongo and never reach the API.
   */
  cacheKey: string;
  /** Bump by hand when the prompt changes, to invalidate old output. */
  promptVersion: number;
  model: string;
  instructions: string;
  input: string;
  /** Hard ceiling. A truncated answer is discarded, so keep real headroom. */
  maxOutputTokens: number;
  schemaName: string;
  schema: Record<string, unknown>;
  /** Narrows the parsed JSON. Returning `null` rejects the generation. */
  parse: (raw: unknown) => T | null;
}

export async function generate<T>(args: GenerateArgs<T>): Promise<AiResult<T>> {
  // 1. Cache first, before anything else — a hit costs one indexed lookup.
  const cached = await readCachedOutput<T>(
    args.kind,
    args.cacheKey,
    args.promptVersion,
  );
  if (cached !== null) return { ok: true, data: cached, cached: true };

  const client = getOpenAI();
  if (!client) return { ok: false, reason: "not-configured" };

  // 2. Budget, before spending rather than after.
  const used = await tokensUsedThisMonth();
  if (used >= AI_MONTHLY_TOKEN_BUDGET) {
    return { ok: false, reason: "over-budget" };
  }

  const startedAt = Date.now();
  let inputTokens = 0;
  let outputTokens = 0;

  const finish = async (outcome: "ok" | AiFailure) => {
    await recordUsage({
      kind: args.kind,
      model: args.model,
      inputTokens,
      outputTokens,
      latencyMs: Date.now() - startedAt,
      outcome,
    });
  };

  try {
    const response = await client.responses.create({
      model: args.model,
      instructions: args.instructions,
      input: args.input,
      max_output_tokens: args.maxOutputTokens,
      text: {
        format: {
          type: "json_schema",
          name: args.schemaName,
          schema: args.schema,
          strict: true,
        },
      },
    });

    inputTokens = response.usage?.input_tokens ?? 0;
    outputTokens = response.usage?.output_tokens ?? 0;

    // An incomplete response ran into `max_output_tokens`, so the JSON is cut
    // off. Those tokens are already billed — log them, then discard the answer
    // rather than caching half of one.
    if (response.status === "incomplete") {
      await finish("unusable");
      return { ok: false, reason: "unusable" };
    }

    let raw: unknown;
    try {
      raw = JSON.parse(response.output_text);
    } catch {
      await finish("unusable");
      return { ok: false, reason: "unusable" };
    }

    const data = args.parse(raw);
    if (data === null) {
      await finish("unusable");
      return { ok: false, reason: "unusable" };
    }

    // 3. Cache before returning, so this input is never paid for again.
    await writeCachedOutput(
      args.kind,
      args.cacheKey,
      args.promptVersion,
      data,
      args.model,
    );
    await finish("ok");

    return { ok: true, data, cached: false };
  } catch (error) {
    const reason = classify(error);
    await finish(reason);
    return { ok: false, reason };
  }
}
