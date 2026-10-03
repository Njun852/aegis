"use server";

import { revalidatePath } from "next/cache";
import { requireModule } from "@/lib/dal/businesses";
import { InputError } from "@/lib/dal/refs";
import {
  addSupplierItem,
  createSupplier,
  deleteSupplierItem,
  importSuppliers,
  setItemCost,
  setPreferredItem,
  setSupplierActive,
  updateSupplier,
  updateSupplierItemDetails,
} from "@/lib/dal/suppliers";
import { MAX_AMOUNT_CENTS } from "@/lib/quotations";
import type { SupplierInput, SupplierItemInput } from "@/types";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

/** A loose check: enough to catch a name typed into the email box, not RFC 5322. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function refresh() {
  revalidatePath("/suppliers");
  // Price-book costs feed quotation costing.
  revalidatePath("/quotations");
}

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

async function guard<T>(work: () => Promise<Result<T>>): Promise<Result<T>> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof InputError) return { ok: false, error: error.message };
    throw error;
  }
}

function readSupplier(raw: SupplierInput): SupplierInput {
  const name = text(raw.name, 120);
  if (!name) throw new InputError("A supplier needs a name.");
  const email = text(raw.email, 120);
  if (email && !EMAIL.test(email)) throw new InputError("That email address does not look complete.");
  const lead = raw.leadTimeDays;
  if (lead !== null && (typeof lead !== "number" || !Number.isInteger(lead) || lead < 0 || lead > 365)) {
    throw new InputError("Delivery time must be a whole number of days, up to 365.");
  }
  return {
    name,
    contactPerson: text(raw.contactPerson, 120),
    phone: text(raw.phone, 40),
    email,
    terms: text(raw.terms, 80),
    leadTimeDays: lead,
    notes: text(raw.notes, 600),
  };
}

function readCost(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0 || value > MAX_AMOUNT_CENTS) {
    throw new InputError("The cost must be an amount above zero.");
  }
  return value;
}

/** An Inventory link is kept only while the business has Inventory. */
function readSku(value: unknown, inventory: boolean): string | null {
  const sku = text(value, 40);
  return sku && inventory ? sku : null;
}

export async function createSupplierAction(raw: SupplierInput): Promise<Result<{ ref: string }>> {
  await requireModule("suppliers");
  return guard(async () => {
    const ref = await createSupplier(readSupplier(raw));
    refresh();
    return { ok: true, ref };
  });
}

export async function updateSupplierAction(ref: string, raw: SupplierInput): Promise<Result> {
  await requireModule("suppliers");
  return guard(async () => {
    await updateSupplier(ref, readSupplier(raw));
    refresh();
    return { ok: true };
  });
}

export async function setSupplierActiveAction(ref: string, active: boolean): Promise<Result> {
  await requireModule("suppliers");
  return guard(async () => {
    await setSupplierActive(ref, active);
    refresh();
    return { ok: true };
  });
}

export async function addSupplierItemAction(
  supplierRef: string,
  raw: SupplierItemInput,
): Promise<Result<{ ref: string }>> {
  const business = await requireModule("suppliers");
  return guard(async () => {
    const description = text(raw.description, 160);
    if (!description) throw new InputError("Describe the part as the supplier sells it.");
    const ref = await addSupplierItem(supplierRef, {
      description,
      sku: readSku(raw.sku, business.modules.includes("inventory")),
      unit: text(raw.unit, 20),
      costCents: readCost(raw.costCents),
    });
    refresh();
    return { ok: true, ref };
  });
}

export async function setItemCostAction(ref: string, costCents: number): Promise<Result> {
  await requireModule("suppliers");
  return guard(async () => {
    await setItemCost(ref, readCost(costCents));
    refresh();
    return { ok: true };
  });
}

export async function updateSupplierItemAction(
  ref: string,
  raw: { description: string; sku: string | null; unit: string },
): Promise<Result> {
  const business = await requireModule("suppliers");
  return guard(async () => {
    await updateSupplierItemDetails(ref, {
      description: text(raw.description, 160),
      sku: readSku(raw.sku, business.modules.includes("inventory")),
      unit: text(raw.unit, 20),
    });
    refresh();
    return { ok: true };
  });
}

export async function setPreferredItemAction(ref: string, preferred: boolean): Promise<Result> {
  await requireModule("suppliers");
  return guard(async () => {
    await setPreferredItem(ref, preferred === true);
    refresh();
    return { ok: true };
  });
}

export async function deleteSupplierItemAction(ref: string): Promise<Result> {
  await requireModule("suppliers");
  return guard(async () => {
    await deleteSupplierItem(ref);
    refresh();
    return { ok: true };
  });
}

export async function importSuppliersAction(
  names: string[],
  withItems: boolean,
): Promise<Result<{ suppliers: number; items: number }>> {
  const business = await requireModule("suppliers");
  return guard(async () => {
    if (!Array.isArray(names) || names.length === 0) throw new InputError("Pick at least one supplier to add.");
    const result = await importSuppliers(
      names.filter((name): name is string => typeof name === "string").slice(0, 200),
      withItems === true && business.modules.includes("inventory"),
    );
    refresh();
    return { ok: true, ...result };
  });
}
