# AEGIS — Database & Auth

Reference for the control plane: how accounts, sessions, tenants, and module
entitlements are stored and enforced. Written after Phase 1 of the backend
integration.

**Status:** auth, users, businesses, and entitlements are real and persisted.
Bookings, the revenue ledger, dashboard figures, and Mail still run on static
fixtures in `src/lib/data/*.ts`.

---

## 1. Environment

`.env.local` (see `.env.local.example`):

| Variable | Purpose |
|---|---|
| `MONGODB_URI` | Connection string, e.g. `mongodb://localhost:27017` |
| `MONGODB_DB_NAME` | Database name — `aegis` |
| `AUTH_SECRET` | Signs the session JWT. **NextAuth v5 reads `AUTH_SECRET`**, not the v4 `NEXTAUTH_SECRET`. Generate with `npx auth secret`. |

The old `NEXTAUTH_*` and `GOOGLE_CLIENT_*` variables were removed — the design
has no SSO, so nothing read them.

---

## 2. Database

### Connection

One cached `MongoClient`, exported from `src/lib/db/mongodb.ts`. The promise is
stashed on `globalThis` in development so hot reloads reuse a single connection
pool instead of opening one per module re-evaluation.

`mongoose` was removed. Two data-access libraries for one database is a smell,
and the old `src/lib/db/mongoose.ts` cached a single global connection with
`dbName` pinned to an env var — it could never have supported per-tenant work.

### Isolation model

**One database, `businessId` on every tenant-owned document.** This was chosen
over a database per tenant for simpler operations and cheap cross-tenant admin
queries. The trade-off is explicit: a forgotten filter is a data-leak path.
Section 5 describes the mitigation.

### Collections

All three below are **control plane** — they span tenants and carry no
`businessId`.

#### `users`

```
_id                ObjectId
username           string   lowercased, unique
email              string
name               string
passwordHash       string   "scrypt$<saltHex>$<hashHex>"
role               "aegis_admin" | "member"
defaultBusinessId  string   fallback tenant, e.g. "BIZ-1042"
createdAt          Date
```

Index: `{ username: 1 }` unique.

#### `businesses`

```
_id         ObjectId
businessId  string    "BIZ-1042", the public id used in URLs, unique
name        string
meta        string    "Industry · Plan", the row subtitle
onboarded   string
modules     string[]  granted optional modules: bookings | inventory | crm | fleet
status      "active" | "suspended"
```

Index: `{ businessId: 1 }` unique.

`modules` is the entitlement grant that Business Management edits. Core modules
(Dashboard, Mail, Ads) are **not** stored here — they are constants in
`src/lib/data/businesses.ts` and always on.

#### `memberships`

```
_id         ObjectId
userId      string    stringified users._id
businessId  string
```

Index: `{ userId: 1, businessId: 1 }` unique.

This is what a `member` may switch between. An `aegis_admin` bypasses it and
reaches every business.

### Seeding

```bash
npm run seed
```

Runs `scripts/seed.ts` via `node --env-file=.env.local` (Node 24 strips the
types natively). It creates the indexes and upserts the fixtures from
`src/lib/data/businesses.ts`.

It is **idempotent and non-destructive**: business `modules` and user
`passwordHash` are written with `$setOnInsert`, so re-running never undoes an
entitlement an admin granted in the app or resets a changed password.

Seeded accounts — password `aegis-demo` for both:

| Username | Role | Sees |
|---|---|---|
| `ahmed.ben` | `aegis_admin` | All 5 businesses, Business Management |
| `rosa.marin` | `member` | Harbor Logistics only, no Internal section |

> `src/lib/data/businesses.ts` is **seed input only** — no screen imports the
> `BUSINESSES` array. It still exports `CORE_MODULES`, `OPTIONAL_MODULES`, and
> `ACCOUNT_PAGES`, which are static config legitimately shared with the client.

---

## 3. Authentication

NextAuth v5 (`next-auth@^5.0.0-beta.32`), Credentials provider only.

**No `@auth/mongodb-adapter`.** Two reasons: it peer-requires `mongodb ^6`
against the installed 7.5.0, and Auth.js forces the JWT session strategy when
Credentials is in play — so the adapter would never store a session. The
`users` collection is ours.

### Files

| File | Role |
|---|---|
| `src/auth.ts` | `NextAuth({...})` → exports `handlers`, `signIn`, `signOut`, `auth` |
| `src/app/api/auth/[...nextauth]/route.ts` | Mounts `handlers` as `GET`/`POST` |
| `src/types/next-auth.d.ts` | Adds `role` and `defaultBusinessId` to `User`, `Session`, `JWT` |
| `src/lib/auth/password.ts` | `hashPassword` / `verifyPassword` |
| `src/app/login/page.tsx` | Renders the form; redirects if already signed in |
| `src/app/actions/auth.ts` | `signInAction`, `signOutAction` |

> **Gotcha:** the JWT augmentation must target `@auth/core/jwt`, not
> `next-auth/jwt`. The latter is only `export * from "@auth/core/jwt"` and
> declares no interface, so augmenting it silently creates an unrelated type
> and every custom claim resolves to `unknown`.

### Passwords

`node:crypto` `scrypt` — no dependency and no native build on Windows.
Per-user 16-byte random salt, 64-byte derived key, stored as
`scrypt$<saltHex>$<hashHex>`, compared with `timingSafeEqual`.

### Session

Stateless JWT in an httpOnly cookie — `authjs.session-token`, or
`__Secure-authjs.session-token` over HTTPS. Claims: `sub` (user id), `role`,
`defaultBusinessId`.

The active business is deliberately **not** a JWT claim; putting it there would
force a token re-issue on every switch. See section 4.

### Sign-in flow

1. `login-screen.tsx` submits to `signInAction` via `useActionState`.
2. The action calls `signIn("credentials", { redirect: false })`.
3. `authorize()` in `src/auth.ts` calls `authenticate()` from
   `src/lib/dal/users.ts`, which looks the user up and verifies the hash.
4. On success the action calls `redirect("/dashboard")` — **outside** the
   try/catch, because `redirect()` signals by throwing and the catch would
   swallow it.
5. On failure it returns one deliberately vague message. Distinguishing "no
   such user" from "wrong password" would tell an attacker which usernames
   exist.

---

## 4. Authorization

### Roles

- **`aegis_admin`** — AEGIS staff. Sees every business in the switcher, sees
  the sidebar's Internal section, and can reach `/admin/*`.
- **`member`** — a customer. Sees only the businesses they hold a membership
  for. No Internal section, no admin row in the switcher, and `/admin/*`
  redirects to `/dashboard`.

### Active business

Held in an httpOnly cookie, `aegis.active_business`:

```
httpOnly: true, sameSite: "lax", path: "/",
secure: NODE_ENV === "production", maxAge: 30 days
```

Written **only** by `switchBusinessAction` (`src/app/actions/business.ts`),
which checks membership before writing.

Because a cookie is attacker-controlled input, it is checked **again on every
request** in `resolveActiveBusiness` (`src/lib/dal/session.ts`) against
`allowedBusinessIds()`, falling back to `defaultBusinessId` when it does not
hold up. A tampered cookie therefore grants nothing — verified by minting a
member session and replaying a request carrying another tenant's id.

### Two layers of route protection

```mermaid
flowchart LR
  A[Request] --> B{src/proxy.ts}
  B -- no session cookie --> C[302 to /login]
  B -- cookie present --> D[Server Component]
  D --> E[verifySession in DAL]
  E -- invalid --> C
  E -- valid --> F{requireAdmin?}
  F -- member on /admin --> G[302 to /dashboard]
  F -- allowed --> H[Render]
```

**`src/proxy.ts`** — Next 16 renamed `middleware.ts` to `proxy.ts`. This is an
*optimistic* check only: it tests for the presence of the session cookie so
signed-out visitors bounce without a database round trip. It does **not**
verify the token. The matcher excludes `api/auth`, `login`, and static assets.

**The DAL** — where every real decision is made, as the Next docs recommend.
Hiding a link is not access control: `/admin/businesses` calls `requireAdmin()`
server-side regardless of what the sidebar renders.

---

## 5. The DAL contract

`src/lib/dal/` — every file marked `server-only`. **This is the only code that
touches the database.**

| File | Exports |
|---|---|
| `db.ts` | `getDb()`, typed collection accessors. Not imported outside `src/lib/dal`. |
| `session.ts` | `verifySession()`, `optionalSession()`, `requireAdmin()`, `allowedBusinessIds()` |
| `users.ts` | `authenticate()`, `findUserById()`, `membershipBusinessIds()` |
| `businesses.ts` | `listBusinessesForUser()`, `getBusinessForUser()`, `setModuleGrants()` |
| `tenant.ts` | `tenantScope()` — see below |

`verifySession()` is wrapped in React `cache()`, so a layout and the page inside
it share one session lookup per render pass instead of two.

### Rules when adding data access

1. **Never import `mongodb` or `getDb()` from a screen.** Add a DAL function.
2. **Call `verifySession()` first** in every DAL read. `authenticate()` is the
   one exception — there is no session yet during sign-in.
3. **Assert the role for privileged writes.** `setModuleGrants()` calls
   `requireAdmin()` before it writes.
4. **Reach tenant-owned collections only through `tenantScope()`.**
5. **Return DTOs, not documents.** `_id` and `passwordHash` never leave the DAL.

### `tenantScope()`

The mitigation for the single-database choice. Given a collection name it
returns a wrapper that merges `{ businessId }` into every filter, stamps it onto
inserts, and prepends a `$match` to aggregations that callers cannot opt out of.

```ts
const bookings = await tenantScope<BookingDocument>("bookings");
await bookings.find({ status: "Confirmed" }).toArray(); // scoped automatically
```

**Nothing uses it yet** — the three control-plane collections legitimately span
tenants. It exists so that when `bookings` and `transactions` land in Phase 2
there is one obvious right way to query them, rather than trusting every call
site to remember the filter.

---

## 6. Local runbook

```bash
npm install
```

Populate `.env.local` from `.env.local.example`, then:

```bash
npm run seed
```

```bash
npm run dev
```

Sign in at `/login` with `ahmed.ben` / `aegis-demo`.

To inspect what is stored, open a Mongo shell against `MONGODB_URI` and read the
`businesses` collection — `businessId` and `modules` are the two fields that
show entitlement state.

---

## 7. Known gaps

- **No password reset, MFA, invitations, or rate limiting on sign-in.**
- **No Add Business flow** — the button exists but is inert.
- **`status: "suspended"` is stored but never enforced.** A suspended business
  still resolves and renders.
- **Sessions cannot be revoked.** JWTs are stateless, so a stolen token stays
  valid until it expires. Server-side revocation needs a sessions collection.
- **Entitlement changes apply on next request, not next sign-in.** The admin
  screen's copy still says "at next sign-in", which is now more conservative
  than the actual behaviour — `revalidatePath` pushes it through immediately.
- **No audit trail** on entitlement changes.
