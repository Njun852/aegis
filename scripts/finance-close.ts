/**
 * The month-end close, from the command line.
 *
 *   npm run finance:close
 *
 * Does exactly what the in-server timer does every half hour: for each
 * business with Finance, writes Revision 1 of both monthly reports, with
 * their PDFs, for every month that has ended and has none. For a host where
 * the server does not stay running, so an external scheduler (Windows Task
 * Scheduler, cron) can call it shortly after midnight on the 1st.
 *
 * Safe to run alongside the timer, or twice: each revision is written once.
 */
import { closeAllBusinesses } from "@/lib/finance-timer";
import clientPromise from "@/lib/db/mongodb";

await closeAllBusinesses();
console.log("✓ Finance month-end close finished");
await (await clientPromise).close();
