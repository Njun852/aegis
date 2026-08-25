/**
 * Seeds the control plane. Idempotent — re-running updates the fixtures in
 * place rather than duplicating them.
 *
 *   node --env-file=.env.local scripts/seed.ts
 */
import { MongoClient } from "mongodb";
import { randomBytes, scrypt as scryptCb } from "node:crypto";
import { promisify } from "node:util";
import { BUSINESSES } from "../src/lib/data/businesses.ts";

const scrypt = promisify(scryptCb) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

// Duplicated from src/lib/auth/password.ts rather than imported: that module
// is marked `server-only`, which throws outside a React Server Component.
async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB_NAME;

if (!uri || !dbName) {
  console.error("Missing MONGODB_URI or MONGODB_DB_NAME.");
  console.error("Run with: node --env-file=.env.local scripts/seed.ts");
  process.exit(1);
}

const DEMO_PASSWORD = "aegis-demo";

async function main() {
  const client = await new MongoClient(uri!).connect();
  const db = client.db(dbName);

  try {
    await db.collection("users").createIndex({ username: 1 }, { unique: true });
    await db
      .collection("businesses")
      .createIndex({ businessId: 1 }, { unique: true });
    await db
      .collection("memberships")
      .createIndex({ userId: 1, businessId: 1 }, { unique: true });

    for (const business of BUSINESSES) {
      await db.collection("businesses").updateOne(
        { businessId: business.id },
        {
          $set: {
            businessId: business.id,
            name: business.name,
            meta: business.meta,
            onboarded: business.onboarded,
            status: "active",
          },
          // Entitlements are only seeded on first insert, so re-running the
          // script never undoes a grant an admin made in the app.
          $setOnInsert: { modules: business.modules },
        },
        { upsert: true },
      );
    }
    console.log(`✓ ${BUSINESSES.length} businesses`);

    const passwordHash = await hashPassword(DEMO_PASSWORD);

    const admin = await db.collection("users").findOneAndUpdate(
      { username: "ahmed.ben" },
      {
        $set: {
          username: "ahmed.ben",
          email: "ahmed.ben@aegis.ai",
          name: "Ahmed Ben",
          role: "aegis_admin",
          defaultBusinessId: BUSINESSES[0].id,
        },
        $setOnInsert: { passwordHash, createdAt: new Date() },
      },
      { upsert: true, returnDocument: "after" },
    );

    // A plain member on one business only — this is the account that proves
    // the switcher and /admin are actually restricted.
    const member = await db.collection("users").findOneAndUpdate(
      { username: "rosa.marin" },
      {
        $set: {
          username: "rosa.marin",
          email: "rosa@harborlogistics.com",
          name: "Rosa Marín",
          role: "member",
          defaultBusinessId: "BIZ-1058",
        },
        $setOnInsert: { passwordHash, createdAt: new Date() },
      },
      { upsert: true, returnDocument: "after" },
    );

    if (member?._id) {
      await db.collection("memberships").updateOne(
        { userId: member._id.toString(), businessId: "BIZ-1058" },
        { $set: { userId: member._id.toString(), businessId: "BIZ-1058" } },
        { upsert: true },
      );
    }

    console.log("✓ users: ahmed.ben (aegis_admin), rosa.marin (member)");
    console.log(`  password for both: ${DEMO_PASSWORD}`);
    console.log(`  admin id: ${admin?._id?.toString()}`);
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
