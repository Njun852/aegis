/**
 * Seeds the control plane. Idempotent — re-running updates the fixtures in
 * place rather than duplicating them.
 *
 *   npm run seed                                  businesses and sample data only
 *   npm run seed -- --demo                        also the two demo accounts
 *   npm run seed -- --admin=maria.santos --name="Maria Santos"
 *                                                 the first administrator on a
 *                                                 fresh database
 *
 * No user accounts are created by default. The demo accounts share a published
 * password, so they exist only when asked for, for local development.
 */
import { MongoClient, type Db } from "mongodb";
import { randomBytes, scrypt as scryptCb } from "node:crypto";
import { promisify } from "node:util";
import { generatePassword } from "../src/lib/auth/generate-password.ts";
import { BUSINESSES } from "../src/lib/data/businesses.ts";
import { BOOKING_SEEDS } from "../src/lib/data/bookings.ts";
import { AD_ROW_SEEDS } from "../src/lib/data/ads.ts";
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

const args = process.argv.slice(2);
const DEMO = args.includes("--demo");

/** `--name=value` or `--name="two words"` (the shell strips the quotes). */
function flag(name: string): string | null {
  const hit = args.find((arg) => arg.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3).trim() || null : null;
}

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

    if (DEMO) {
      const passwordHash = await hashPassword(DEMO_PASSWORD);

      await db.collection("users").findOneAndUpdate(
        { username: "ahmed.ben" },
        {
          $set: {
            username: "ahmed.ben",
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
      console.log("✓ demo users: ahmed.ben (aegis_admin), rosa.marin (member)");
      console.log(`  password for both: ${DEMO_PASSWORD}  (development only)`);
    }

    await bootstrapAdmin(db);

    await seedBookings(db, BUSINESSES[0].id);
    await seedInventory(db, BUSINESSES[0].id);
    await seedMail(db, BUSINESSES[0].id);
    await seedAds(db, BUSINESSES[0].id);

    // Without an administrator nobody can sign in to create one, so say so
    // plainly rather than leaving a fresh install unusable and silent.
    const admins = await db
      .collection("users")
      .countDocuments({ role: "aegis_admin" });
    if (admins === 0) {
      console.log("");
      console.log("! No administrator exists, so nobody can sign in yet. Create the first one:");
      console.log('  npm run seed -- --admin=<username> --name="Full Name"');
    }
  } finally {
    await client.close();
  }
}

/**
 * Creates the first administrator on a database that has none of its own.
 *
 * The one account that cannot be made through the Users screen, because nobody
 * can sign in to open it yet. Never touches an existing account: if the username
 * is taken it says so and changes nothing, so re-running the command can never
 * reset someone's password.
 */
async function bootstrapAdmin(db: Db) {
  const username = flag("admin")?.toLowerCase();
  if (!username) return;

  if (!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(username)) {
    console.error("✗ Usernames are 3 to 32 characters: lowercase letters, numbers, dots, dashes or underscores.");
    process.exitCode = 1;
    return;
  }

  const users = db.collection("users");
  if (await users.findOne({ username })) {
    console.log(`• ${username} already exists — left unchanged.`);
    return;
  }

  const password = generatePassword();
  await users.insertOne({
    username,
    name: flag("name") ?? username,
    passwordHash: await hashPassword(password),
    role: "aegis_admin",
    defaultBusinessId: BUSINESSES[0].id,
    createdAt: new Date(),
  });

  console.log(`✓ administrator ${username} created`);
  console.log(`  password: ${password}`);
  console.log("  Shown once and never stored in the clear. Change it in Account Settings.");
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
  // One sync-state document per business; the upserts in src/lib/dal/mailbox.ts
  // rely on this being unique.
  await db
    .collection("mailSync")
    .createIndex({ businessId: 1 }, { unique: true });

  /**
   * No sample inbox is seeded any more.
   *
   * Mail arrives from the mailbox connected in Business Management, so seeding
   * invented messages would put fictional correspondence in front of the owner
   * beside real mail with no way to tell them apart. An empty inbox until a
   * mailbox is connected is the honest state, and the screens say so.
   */
  const held = await db.collection("messages").countDocuments({ businessId });
  console.log(
    `✓ messages for ${businessId}: ${held} held (none seeded — connect a mailbox to retrieve)`,
  );
}

/**
 * Loads the Meta ad account into `adRows`. Nothing authenticates against Meta
 * yet, so this is the account's shape rather than a live pull.
 *
 * `enabled` goes in through `$setOnInsert`: it is the one field a person can
 * actually change on this screen, and re-running the seed must not silently
 * switch their campaigns back on.
 */
async function seedAds(db: Db, businessId: string) {
  await db
    .collection("adRows")
    .createIndex({ businessId: 1, id: 1 }, { unique: true });
  await db.collection("adRows").createIndex({ businessId: 1, level: 1 });

  const now = new Date();

  for (const seed of AD_ROW_SEEDS) {
    const { enabled, ...rest } = seed;
    await db.collection("adRows").updateOne(
      { businessId, id: seed.id },
      {
        $set: { businessId, ...rest, updatedAt: now },
        $setOnInsert: { enabled, createdAt: now },
      },
      { upsert: true },
    );
  }

  const live = await db
    .collection("adRows")
    .countDocuments({ businessId, level: "campaigns", enabled: true });

  console.log(
    `✓ ${AD_ROW_SEEDS.length} ad rows for ${businessId} · ${live} campaigns switched on`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
