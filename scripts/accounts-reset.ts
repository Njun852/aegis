/**
 * Leaves one account standing: the owner, as the sole administrator.
 *
 *   npm run accounts:reset -- --keep=<username>            # dry run: prints the plan
 *   npm run accounts:reset -- --keep=<username> --apply    # does it
 *
 * The kept account becomes (or stays) the administrator — the only role that
 * opens the Users screen, so it is the one that can create everyone else. Every
 * other account is deleted with its memberships, exactly as the Users screen's
 * own delete would. An administrator holds no memberships, so afterwards none
 * are left — including the old role-less ones the Users screen read as
 * "no role yet".
 *
 * Nothing changes without --apply, and the kept account's password is left
 * alone.
 */
import { MongoClient } from "mongodb";

function flag(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

const keep = flag("keep")?.trim().toLowerCase();
const apply = process.argv.includes("--apply");

if (!keep) {
  console.error("✗ Name the account to keep: npm run accounts:reset -- --keep=<username> [--apply]");
  process.exit(1);
}

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB_NAME;
if (!uri || !dbName) {
  console.error("✗ MONGODB_URI and MONGODB_DB_NAME must be set.");
  process.exit(1);
}

const client = new MongoClient(uri);
try {
  await client.connect();
  const db = client.db(dbName);
  const users = db.collection("users");
  const memberships = db.collection("memberships");

  const all = await users.find({}, { projection: { passwordHash: 0 } }).toArray();
  const kept = all.find((doc) => doc.username === keep);
  if (!kept) {
    console.error(`✗ No account named "${keep}". Accounts: ${all.map((doc) => doc.username).join(", ") || "none"}`);
    process.exit(1);
  }

  const removed = all.filter((doc) => doc.username !== keep);

  const membershipCount = await memberships.countDocuments();

  console.log(`${apply ? "Applying" : "Dry run"} on database "${dbName}"`);
  console.log(`  keep     ${kept.username} (${kept.name}) as administrator${kept.role === "aegis_admin" ? "" : ` — was ${kept.role}`}`);
  for (const doc of removed) console.log(`  delete   ${doc.username} (${doc.name}, ${doc.role})`);
  console.log(`  memberships: all ${membershipCount} removed (an administrator needs none)`);

  if (!apply) {
    console.log("\nNothing changed. Re-run with --apply to do it.");
  } else {
    // Promote first, so an interrupted run never leaves zero administrators.
    // Then the others' memberships go before the accounts themselves, as the
    // Users screen's delete orders it. The administrator's own memberships go
    // too: they reach every business and need none.
    await users.updateOne({ _id: kept._id }, { $set: { role: "aegis_admin" } });
    await memberships.deleteMany({});
    if (removed.length > 0) {
      await users.deleteMany({ _id: { $in: removed.map((doc) => doc._id) } });
    }
    console.log(`\n✓ ${kept.username} is the only account. ${removed.length} removed.`);
  }
} finally {
  await client.close();
}
