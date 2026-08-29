"use server";

import { revalidatePath } from "next/cache";
import { requireModule } from "@/lib/dal/businesses";
import { recordStockMove } from "@/lib/dal/inventory";
import { MOVE_REASONS } from "@/lib/data/inventory";
import { parseCents } from "@/lib/format";
import type { StockMoveKind, StockMoveReason } from "@/types";

export interface StockMoveFormState {
  error: string | null;
  /** Set once the server confirms the write, so the dialog can close. */
  createdRef?: string;
  /** Which item ended up moving — a stock in may have created it. */
  sku?: string;
}

function isReason(value: string): value is StockMoveReason {
  return Object.hasOwn(MOVE_REASONS, value);
}

/**
 * Records one stock in or stock out. Every rule the dialog enforces to grey out
 * its button is re-checked here: the dialog is a convenience, this is the
 * boundary.
 */
export async function recordStockMoveAction(
  _previous: StockMoveFormState,
  formData: FormData,
): Promise<StockMoveFormState> {
  await requireModule("inventory");

  const text = (key: string) => String(formData.get(key) ?? "").trim();

  const name = text("name");
  if (!name) {
    return { error: "Name the item this move applies to." };
  }

  const kind = text("kind") as StockMoveKind;
  if (kind !== "in" && kind !== "out") {
    return { error: "That movement direction could not be read." };
  }

  const reason = text("reason");
  if (!isReason(reason) || MOVE_REASONS[reason].kind !== kind) {
    return { error: "Pick what kind of movement this is." };
  }

  const quantity = Number(text("quantity"));
  if (!Number.isInteger(quantity) || quantity < 1) {
    return { error: "Quantity must be a whole number of units, at least 1." };
  }

  const meta = MOVE_REASONS[reason];
  let unitAmountCents = 0;
  let party = "";

  if (meta.transaction) {
    party = text("party");
    if (!party) {
      return {
        error: `Record who this was ${kind === "out" ? "billed to" : "bought from"}.`,
      };
    }

    const parsed = parseCents(text("unitAmount"));
    if (parsed === null) {
      return { error: "Unit amount must be a figure like 118 or 118.00." };
    }
    if (parsed <= 0) {
      return { error: "A business transaction needs a unit amount above zero." };
    }
    unitAmountCents = parsed;
  }

  try {
    const move = await recordStockMove({
      name,
      kind,
      quantity,
      reason,
      documentRef: text("documentRef"),
      party,
      unitAmountCents,
    });

    revalidatePath("/inventory");
    // A sale posts to the ledger, which is what the dashboard's revenue reads.
    if (meta.side === "price") revalidatePath("/dashboard");

    return { error: null, createdRef: move.ref, sku: move.sku };
  } catch (cause) {
    return {
      error:
        cause instanceof Error
          ? cause.message
          : "That movement could not be recorded.",
    };
  }
}
