import type { AiFailure } from "@/types";

/**
 * How a failed generation is worded for the person looking at the screen.
 *
 * Pure and client-safe, unlike the rest of `src/lib/ai` — a `"use server"`
 * module may only export async functions, so this cannot live beside the
 * actions that use it.
 */
export function explainFailure(reason: AiFailure): string {
  switch (reason) {
    case "not-configured":
      return "AI is not switched on for this workspace.";
    case "over-budget":
      return "This month's AI allowance is used up.";
    case "rate-limited":
      return "The AI service is busy — try again shortly.";
    case "timeout":
      return "The AI service did not respond in time.";
    default:
      return "That could not be generated just now.";
  }
}
