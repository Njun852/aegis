import { feeKindLabel } from "@/lib/finance";
import { formatMoney } from "@/lib/format";
import type { Payment } from "@/types";

/**
 * Gross / Fee / Net under a payment that had a fee: what settled the invoice
 * or bill, what the fee took, and what actually reached or left the account.
 */
export function PaymentFeeLine({ payment }: { payment: Pick<Payment, "amountCents" | "direction" | "fee"> }) {
  if (!payment.fee || payment.fee.cents <= 0) return null;
  const fee = payment.fee.cents;
  const net = payment.direction === "in" ? payment.amountCents - fee : payment.amountCents + fee;
  return (
    <span style={{ fontSize: "11px", color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>
      Gross {formatMoney(payment.amountCents)} · {feeKindLabel(payment.fee.kind)} {formatMoney(fee)} ·{" "}
      {payment.direction === "in" ? "Net deposited" : "Total out"} {formatMoney(net)}
    </span>
  );
}
