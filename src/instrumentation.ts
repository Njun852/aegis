/**
 * Next calls `register` once when the server starts. It is where the one
 * background job in AEGIS begins: Text Blast's reminder timer.
 *
 * Imported lazily and only on the Node runtime, because the timer reaches
 * MongoDB and must never be pulled into an edge bundle.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startTextBlastTimer } = await import("@/lib/sms/timer");
  startTextBlastTimer();
}
