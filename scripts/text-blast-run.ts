/**
 * One Text Blast pass, from the command line.
 *
 *   npm run sms:run
 *
 * Does exactly what the in-server timer does every fifteen minutes: the
 * reminder sweep for each business that has Text Blast switched on. It is for
 * a host where the server does not stay running, so an external scheduler
 * (Windows Task Scheduler, cron) can call this instead.
 *
 * Safe to run alongside the timer, or twice: a car gets one text per due date.
 */
import { sweepAllBusinesses } from "@/lib/sms/timer";
import clientPromise from "@/lib/db/mongodb";

await sweepAllBusinesses();
console.log("✓ Text Blast sweep finished");
await (await clientPromise).close();
