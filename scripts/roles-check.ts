/**
 * User roles rehearsal.
 *
 *   npm run roles:check
 *
 * Proves the role table says what the business asked for, screen by screen,
 * that a role only ever narrows what a business has bought, that each role
 * lands somewhere it can open, and that the owner's powers stay with owners,
 * accounting and administrators as intended.
 *
 * Pure: nothing touches the database. The server checks are the same
 * functions, called from `requireModule` and `requireCapability`.
 */
import assert from "node:assert/strict";
import {
  BUSINESS_ROLES,
  DEFAULT_BUSINESS_ROLE,
  can,
  modulesHiddenByRole,
  roleAllowsModule,
  type Capability,
  type RoleHolder,
} from "@/lib/business-roles";
import { homePath, isModuleEnabled } from "@/lib/businesses";
import { normalizeModules } from "@/lib/data/businesses";
import type { Business, BusinessRole, ModuleKey, OptionalModuleKey } from "@/types";

const ALL: ModuleKey[] = ["dashboard", "mail", "ads", "finance", "bookings", "crm", "quotes", "suppliers", "inventory", "sms"];

/** The lists as the business wrote them, in the app's module names. */
const WANTED: Record<BusinessRole, ModuleKey[]> = {
  // email, quotation, supplier, fleet (now customers and their cars, CRM), accounting, inventory
  service_advisor: ["mail", "quotes", "suppliers", "crm", "finance", "inventory"],
  // email, ads, finance, booking, fleet (now CRM), account (money accounts, in Finance)
  accounting: ["mail", "ads", "finance", "bookings", "crm"],
  // dashboard, email, ads, finance, booking, customer, records (Finance reports),
  // quotation, supplier, text blasting, fleet (folded into CRM, 11 Nov 2026)
  marketing_admin: ["dashboard", "mail", "ads", "finance", "bookings", "crm", "quotes", "suppliers", "sms"],
  // all, and the owner dashboard
  owner: ALL,
};

const POWERS: Record<BusinessRole, Capability[]> = {
  service_advisor: [],
  accounting: ["financeReports", "financeBooks"],
  marketing_admin: ["financeReports"],
  owner: ["financeReports", "financeBooks", "approvePricing", "ownerBoard"],
};

const member = (businessRole: BusinessRole | null): RoleHolder => ({ role: "member", businessRole });
const admin: RoleHolder = { role: "aegis_admin", businessRole: null };

// ---- Screens and powers, role by role --------------------------------------------

for (const role of BUSINESS_ROLES) {
  const holder = member(role.key);
  for (const key of ALL) {
    assert.equal(
      roleAllowsModule(holder, key),
      WANTED[role.key].includes(key),
      `${role.label} and ${key}`,
    );
  }
  for (const capability of ["financeReports", "financeBooks", "approvePricing", "ownerBoard"] as Capability[]) {
    assert.equal(can(holder, capability), POWERS[role.key].includes(capability), `${role.label} and ${capability}`);
  }
  console.log(`  ok    ${role.label}: ${WANTED[role.key].join(", ")}${POWERS[role.key].length ? ` · ${POWERS[role.key].join(", ")}` : ""}`);
}

// An administrator: everything. A member whose stored role is missing: read as the
// default role, never as more access.
for (const key of ALL) {
  assert.equal(roleAllowsModule(admin, key), true);
  assert.equal(
    roleAllowsModule(member(null), key),
    roleAllowsModule(member(DEFAULT_BUSINESS_ROLE), key),
    "a member without a stored role reads as the default role",
  );
}
for (const capability of ["financeReports", "financeBooks", "approvePricing", "ownerBoard"] as Capability[]) {
  assert.equal(can(admin, capability), true);
  assert.equal(
    can(member(null), capability),
    can(member(DEFAULT_BUSINESS_ROLE), capability),
    "a member without a stored role gets the default role's powers",
  );
}
console.log("  ok    Administrator: everything · member with no stored role: read as the default role");

// ---- A role narrows what was bought; it never adds to it ----------------------------

/** What `toBusiness` in the DAL builds, for one sold set and one holder. */
function asSeenBy(sold: OptionalModuleKey[], holder: RoleHolder): Business {
  const hidden = modulesHiddenByRole(holder);
  const core: ModuleKey[] = ["dashboard", "mail", "ads", "finance"];
  return {
    id: "BIZ-CHECK",
    name: "Check",
    meta: "",
    onboarded: "",
    modules: sold.filter((key) => roleAllowsModule(holder, key)),
    roleHidden: hidden.filter((key) => core.includes(key) || sold.includes(key as OptionalModuleKey)),
  };
}

const sold: OptionalModuleKey[] = ["bookings", "quotes", "crm"];

const advisor = asSeenBy(sold, member("service_advisor"));
assert.equal(isModuleEnabled(advisor, "quotes"), true);
assert.equal(isModuleEnabled(advisor, "crm"), true, "customers and their cars");
assert.equal(isModuleEnabled(advisor, "inventory"), false, "in the role, but never bought");
assert.equal(isModuleEnabled(advisor, "bookings"), false, "bought, but not in the role");
assert.equal(isModuleEnabled(advisor, "dashboard"), false, "a core screen the role leaves out");
assert.equal(isModuleEnabled(advisor, "ads"), false);
assert.equal(isModuleEnabled(advisor, "mail"), true);
assert.deepEqual(advisor.roleHidden.sort(), ["ads", "bookings", "dashboard"], "only what the business has is reported as hidden");

const owner = asSeenBy(sold, member("owner"));
assert.deepEqual(owner.modules, sold, "an owner sees exactly what was bought");
assert.deepEqual(owner.roleHidden, []);
assert.equal(isModuleEnabled(owner, "inventory"), false, "not even an owner gets a module that was never bought");
console.log("  ok    a role narrows the business's modules and never adds one");

// ---- Fleet was folded into CRM: an old stored grant still reads right ------------------

assert.deepEqual(normalizeModules(["bookings", "fleet", "sms"]), ["bookings", "crm", "sms"], "a stored Fleet grant reads as CRM");
assert.deepEqual(normalizeModules(["fleet", "crm"]), ["crm"], "Fleet and CRM together read as CRM once");
assert.deepEqual(normalizeModules(["finance", "inventory"]), ["inventory"], "a module that became core is dropped");
assert.deepEqual(normalizeModules(undefined), []);
console.log("  ok    a stored Fleet grant reads as CRM, once");

// ---- Where each role lands -----------------------------------------------------------

assert.equal(homePath(asSeenBy(sold, member("owner"))), "/dashboard");
assert.equal(homePath(asSeenBy(sold, member("marketing_admin"))), "/dashboard");
assert.equal(homePath(asSeenBy(sold, member("service_advisor"))), "/mail");
assert.equal(homePath(asSeenBy(sold, member("accounting"))), "/mail");
for (const role of BUSINESS_ROLES) {
  const business = asSeenBy(["bookings", "inventory", "crm", "sms", "quotes", "suppliers"], member(role.key));
  const landing = homePath(business);
  const key = landing.slice(1) as ModuleKey;
  assert.equal(isModuleEnabled(business, key), true, `${role.label} lands on ${landing}, which it can open`);
}
console.log("  ok    every role lands on a screen it can open (no Dashboard: Mail)");

console.log("\nAll role checks passed.");
