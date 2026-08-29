/**
 * Seeds the control plane. Idempotent — re-running updates the fixtures in
 * place rather than duplicating them.
 *
 *   node --env-file=.env.local scripts/seed.ts
 */
import { MongoClient, type Db } from "mongodb";
import { randomBytes, scrypt as scryptCb } from "node:crypto";
import { promisify } from "node:util";
import { BUSINESSES } from "../src/lib/data/businesses.ts";
import { BOOKING_SEEDS } from "../src/lib/data/bookings.ts";
import { MESSAGES } from "../src/lib/data/mail.ts";
import {
  INVENTORY_SEEDS,
  MOVE_REASONS,
  STOCK_MOVE_SEEDS,
} from "../src/lib/data/inventory.ts";

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

    // A plain member — the account that proves the switcher and /admin are
    // actually restricted. Scoped to the first seeded business.
    const memberBusinessId = BUSINESSES[0].id;

    const member = await db.collection("users").findOneAndUpdate(
      { username: "rosa.marin" },
      {
        $set: {
          username: "rosa.marin",
          email: "rosa@autoblitz.com",
          name: "Rosa Marín",
          role: "member",
          defaultBusinessId: memberBusinessId,
        },
        $setOnInsert: { passwordHash, createdAt: new Date() },
      },
      { upsert: true, returnDocument: "after" },
    );

    if (member?._id) {
      await db.collection("memberships").updateOne(
        { userId: member._id.toString(), businessId: memberBusinessId },
        { $set: { userId: member._id.toString(), businessId: memberBusinessId } },
        { upsert: true },
      );
    }

    await seedBookings(db, BUSINESSES[0].id);
    await seedInventory(db, BUSINESSES[0].id);
    await seedMail(db, BUSINESSES[0].id);

    console.log("✓ users: ahmed.ben (aegis_admin), rosa.marin (member)");
    console.log(`  password for both: ${DEMO_PASSWORD}`);
    console.log(`  admin id: ${admin?._id?.toString()}`);
  } finally {
    await client.close();
  }
}

/**
 * Bookings are dated relative to the day the seed runs, so the screen is never
 * stuck showing a week in the past. Refs are stable, so re-running updates the
 * same documents in place instead of piling up duplicates.
 */
async function seedBookings(db: Db, businessId: string) {
  await db
    .collection("bookings")
    .createIndex({ businessId: 1, ref: 1 }, { unique: true });
  await db.collection("bookings").createIndex({ businessId: 1, startsAt: 1 });

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let ref = 8241;
  for (const seed of BOOKING_SEEDS) {
    const startsAt = new Date(today);
    startsAt.setDate(startsAt.getDate() + seed.dayOffset);
    startsAt.setHours(seed.hour, seed.minute, 0, 0);

    await db.collection("bookings").updateOne(
      { businessId, ref: `BK-${ref}` },
      {
        $set: {
          businessId,
          ref: `BK-${ref}`,
          customer: seed.customer,
          company: seed.company,
          email: seed.email,
          service: seed.service,
          startsAt,
          durationMinutes: seed.durationMinutes,
          staff: seed.staff,
          valueCents: seed.valueCents,
          status: seed.status,
          channel: seed.channel,
          notes: seed.notes,
        },
        $setOnInsert: { createdAt: new Date() },
      },
      { upsert: true },
    );
    ref += 1;
  }

  console.log(`✓ ${BOOKING_SEEDS.length} bookings for ${businessId}`);
  await seedLedger(db, businessId);
}

/**
 * Backfills the ledger from the bookings just written. Mirrors
 * `reconcileBookings` in `src/lib/dal/ledger.ts`, but runs outside a request so
 * it cannot go through the tenant-scoped DAL.
 */
async function seedLedger(db: Db, businessId: string) {
  await db
    .collection("transactions")
    .createIndex({ businessId: 1, source: 1, sourceRef: 1 }, { unique: true });
  await db
    .collection("transactions")
    .createIndex({ businessId: 1, status: 1, occurredAt: 1 });

  const bookings = await db.collection("bookings").find({ businessId }).toArray();
  const now = new Date();

  for (const booking of bookings) {
    await db.collection("transactions").updateOne(
      { businessId, source: "bookings", sourceRef: booking.ref },
      {
        $set: {
          occurredAt: booking.startsAt,
          amountCents: booking.valueCents,
          description: `${booking.service} · ${booking.customer}`,
          status: booking.status === "Cancelled" ? "void" : "recognised",
          updatedAt: now,
        },
        $setOnInsert: { createdAt: now },
      },
      { upsert: true },
    );
  }

  const recognised = bookings.filter((b) => b.status !== "Cancelled");
  const total = recognised.reduce((sum, b) => sum + b.valueCents, 0);
  console.log(
    `✓ ${bookings.length} ledger entries · recognised $${(total / 100).toLocaleString("en-US")}`,
  );
}

/**
 * Stock levels are seeded as they stand today; the movements are the history
 * that already produced them, dated relative to the day the seed runs so the
 * trail is never stuck in a past week. Refs are stable, so re-running updates
 * the same documents rather than piling up duplicates.
 */
async function seedInventory(db: Db, businessId: string) {
  await db
    .collection("inventoryItems")
    .createIndex({ businessId: 1, sku: 1 }, { unique: true });
  await db
    .collection("stockMoves")
    .createIndex({ businessId: 1, ref: 1 }, { unique: true });
  await db
    .collection("stockMoves")
    .createIndex({ businessId: 1, sku: 1, occurredAt: -1 });

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Refs must ascend with time, and the fixture is written newest-first for
  // readability — so date them all, then order by when they happened.
  const dated = STOCK_MOVE_SEEDS.map((seed) => {
    const occurredAt = new Date(today);
    occurredAt.setDate(occurredAt.getDate() + seed.dayOffset);
    occurredAt.setHours(seed.hour, seed.minute, 0, 0);
    return { seed, occurredAt };
  }).sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());

  const lastTouched = new Map<string, Date>();
  for (const { seed, occurredAt } of dated) {
    lastTouched.set(seed.sku, occurredAt);
  }

  const now = new Date();
  for (const seed of INVENTORY_SEEDS) {
    await db.collection("inventoryItems").updateOne(
      { businessId, sku: seed.sku },
      {
        $set: {
          businessId,
          sku: seed.sku,
          name: seed.name,
          category: seed.category,
          icon: seed.icon,
          onHand: seed.onHand,
          target: seed.target,
          reorder: seed.reorder,
          unit: seed.unit,
          location: seed.location,
          supplier: seed.supplier,
          unitCostCents: seed.unitCostCents,
          updatedAt: lastTouched.get(seed.sku) ?? now,
        },
        $setOnInsert: { createdAt: now },
      },
      { upsert: true },
    );
  }

  const items = new Map(INVENTORY_SEEDS.map((seed) => [seed.sku, seed]));
  let ref = 1001;
  let posted = 0;

  for (const { seed, occurredAt } of dated) {
    const meta = MOVE_REASONS[seed.reason];
    const amountCents = meta.transaction
      ? seed.quantity * seed.unitAmountCents
      : 0;
    const moveRef = `MV-${ref}`;

    await db.collection("stockMoves").updateOne(
      { businessId, ref: moveRef },
      {
        $set: {
          businessId,
          ref: moveRef,
          sku: seed.sku,
          kind: seed.kind,
          quantity: seed.quantity,
          reason: seed.reason,
          documentRef: seed.documentRef,
          party: meta.transaction ? seed.party : "",
          unitAmountCents: meta.transaction ? seed.unitAmountCents : 0,
          amountCents,
          createdItem: false,
          occurredAt,
        },
        $setOnInsert: { createdAt: now },
      },
      { upsert: true },
    );

    // Only a sale is revenue. Purchases, credits and write-offs are costs and
    // stay off the revenue ledger — see src/lib/dal/inventory.ts.
    if (meta.side === "price" && amountCents > 0) {
      const item = items.get(seed.sku);
      await db.collection("transactions").updateOne(
        { businessId, source: "inventory", sourceRef: moveRef },
        {
          $set: {
            occurredAt,
            amountCents,
            description: `${item?.name ?? seed.sku} × ${seed.quantity} · ${seed.party}`,
            status: "recognised",
            updatedAt: now,
          },
          $setOnInsert: { createdAt: now },
        },
        { upsert: true },
      );
      posted += 1;
    }

    ref += 1;
  }

  console.log(
    `✓ ${INVENTORY_SEEDS.length} inventory items · ${dated.length} movements · ${posted} posted to the ledger`,
  );
}

/**
 * Loads the sample inbox into the `messages` collection. Gmail replaces this
 * step later; nothing above `src/lib/dal/mail.ts` changes when it does.
 *
 * The AI fields are seeded through `$setOnInsert`, so re-running the script
 * refreshes the correspondence but never overwrites a summary a model actually
 * produced — re-seeding must not silently throw away tokens already spent.
 * `aiPromptVersion: null` is what marks a message as still awaiting triage.
 */
async function seedMail(db: Db, businessId: string) {
  await db
    .collection("messages")
    .createIndex({ businessId: 1, messageId: 1 }, { unique: true });
  await db.collection("messages").createIndex({ businessId: 1, receivedAt: -1 });

  // Also index what the AI surfaces read, so the cache lookup and the monthly
  // spend rollup are both single-index operations.
  await db
    .collection("aiOutputs")
    .createIndex({ businessId: 1, kind: 1, cacheKey: 1 }, { unique: true });
  await db.collection("aiUsage").createIndex({ businessId: 1, period: 1 });

  const now = Date.now();
  let index = 0;

  for (const message of MESSAGES) {
    // The fixture is ordered newest first; space them an hour apart so the
    // list keeps that order without inventing dates that contradict the
    // display strings already on each message.
    const receivedAt = new Date(now - index * 3_600_000);

    await db.collection("messages").updateOne(
      { businessId, messageId: message.id },
      {
        $set: {
          businessId,
          messageId: message.id,
          from: message.from,
          email: message.email,
          label: message.label,
          subject: message.subject,
          time: message.time,
          date: message.date,
          unread: message.unread,
          body: message.body,
          receivedAt,
        },
        $setOnInsert: {
          priority: message.priority,
          aiSummary: message.aiSummary,
          actionItems: message.actionItems,
          replies: message.replies,
          aiGeneratedAt: null,
          aiPromptVersion: null,
          createdAt: new Date(),
        },
      },
      { upsert: true },
    );
    index += 1;
  }

  const analysed = await db
    .collection("messages")
    .countDocuments({ businessId, aiPromptVersion: { $ne: null } });

  console.log(
    `✓ ${MESSAGES.length} messages for ${businessId} · ${analysed} already analysed, ${MESSAGES.length - analysed} awaiting triage`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
