/**
 * Next calls `register` once when the server starts. It is where the
 * background jobs in AEGIS begin: Text Blast's reminder timer and Finance's
 * month-end close.
 *
 * Imported lazily and only on the Node runtime, because the timers reach
 * MongoDB and must never be pulled into an edge bundle.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startTextBlastTimer } = await import("@/lib/sms/timer");
  startTextBlastTimer();
  const { startFinanceCloseTimer } = await import("@/lib/finance-timer");
  startFinanceCloseTimer();
}
