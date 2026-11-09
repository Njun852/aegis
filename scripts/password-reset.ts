/**
 * Gives an account a new, generated password.
 *
 *   npm run password:reset -- --user=<username>
 *
 * The way back in when nobody can sign in to reset it from the Users screen —
 * for instance the only administrator forgetting their own password, which the
 * Users screen deliberately refuses to change. The new password is printed
 * once, here, and stored only as a hash; the old one stops working at once.
 *
 * Runs against whatever database .env.local points at, so on the server it
 * changes the live account.
 */
import { MongoClient } from "mongodb";
import { hashPassword } from "@/lib/auth/password";
import { generatePassword } from "@/lib/auth/generate-password";

const prefix = "--user=";
const username = process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length).trim().toLowerCase();

if (!username) {
  console.error("✗ Name the account: npm run password:reset -- --user=<username>");
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
  const users = client.db(dbName).collection("users");

  const password = generatePassword();
  const result = await users.updateOne(
    { username },
    { $set: { passwordHash: await hashPassword(password) } },
  );

  if (result.matchedCount === 0) {
    const known = (await users.find({}, { projection: { username: 1 } }).toArray()).map((doc) => doc.username);
    console.error(`✗ No account named "${username}". Accounts: ${known.join(", ") || "none"}`);
    process.exitCode = 1;
  } else {
    console.log(`✓ New password for ${username} on database "${dbName}":`);
    console.log(`\n    ${password}\n`);
    console.log("  Shown once. Change it in Account Settings after signing in if you prefer your own.");
  }
} finally {
  await client.close();
}
