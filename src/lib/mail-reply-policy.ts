import type { MailCategory } from "@/types";

/**
 * Whether a message should get a generated reply draft at all.
 *
 * The acceptance checklist requires a Suggested Reply on *every* message,
 * including the spam one in the owner's five-email test — so the field is
 * always populated. It does not require that every value cost tokens. For mail
 * nobody replies to, the correct suggested reply is "do not reply", and that is
 * a fact about the category rather than something a model needs to be paid to
 * work out.
 *
 * Derived from the category rather than stored, so a message re-classified by a
 * later triage run gets the right answer automatically instead of keeping a
 * stale one.
 *
 * Pure and free of `server-only`: the sweep decides what to spend on with it,
 * and the screen decides what to render with it. They must not disagree.
 */

export type ReplyRecommendation =
  | { kind: "draft" }
  | { kind: "none"; reason: string };

export function replyPolicy(category: MailCategory): ReplyRecommendation {
  switch (category) {
    case "Spam":
      return {
        kind: "none",
        reason:
          "No reply recommended. This message is spam — do not respond, and do not open anything in it.",
      };
    case "Marketing":
      return {
        kind: "none",
        reason:
          "No reply recommended. This is marketing, not correspondence that needs an answer.",
      };
    default:
      return { kind: "draft" };
  }
}

/** The categories the sweep skips, for the database query that selects work. */
export const NO_DRAFT_CATEGORIES: MailCategory[] = ["Spam", "Marketing"];
