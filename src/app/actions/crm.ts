"use server";

import { revalidatePath } from "next/cache";
import { requireModule } from "@/lib/dal/businesses";
import { createCustomer, findDuplicates, updateCustomer } from "@/lib/dal/customers";
import { InputError } from "@/lib/dal/refs";
import type { CustomerInput, CustomerMatch } from "@/types";

function refresh() {
  revalidatePath("/crm");
  // Customers appear in the Fleet owner picker and on bookings.
  revalidatePath("/fleet");
  revalidatePath("/bookings");
}

/** A loose check: enough to catch a name typed into the email box, not RFC 5322. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function readInput(get: (key: string) => string): { value: CustomerInput } | { error: string } {
  const value: CustomerInput = {
    name: get("name"),
    phone: get("phone"),
    email: get("email"),
    company: get("company"),
    notes: get("notes"),
  };
  if (!value.name) return { error: "A customer needs a name." };
  if (value.email && !EMAIL.test(value.email)) {
    return { error: "That email address does not look complete." };
  }
  if (value.phone && value.phone.replace(/\D/g, "").length < 7) {
    return { error: "That phone number looks too short." };
  }
  return { value };
}

export interface CustomerFormState {
  error: string | null;
  /** Customers sharing the phone or email. The form asks before creating another. */
  duplicates?: CustomerMatch[];
  createdRef?: string;
}

export async function createCustomerAction(
  _previous: CustomerFormState,
  formData: FormData,
): Promise<CustomerFormState> {
  await requireModule("crm");

  const input = readInput((key) => String(formData.get(key) ?? "").trim());
  if ("error" in input) return { error: input.error };

  // Families and small firms share a phone or an inbox, so a match is a
  // question for the person, not a refusal.
  if (formData.get("confirmDuplicate") !== "1") {
    const duplicates = await findDuplicates(input.value);
    if (duplicates.length > 0) return { error: null, duplicates };
  }

  const customer = await createCustomer(input.value);
  refresh();
  return { error: null, createdRef: customer.ref };
}

export async function updateCustomerAction(
  ref: string,
  fields: CustomerInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireModule("crm");

  const input = readInput((key) => String(fields[key as keyof CustomerInput] ?? "").trim());
  if ("error" in input) return { ok: false, error: input.error };

  try {
    await updateCustomer(ref, input.value);
  } catch (error) {
    if (error instanceof InputError) return { ok: false, error: error.message };
    throw error;
  }
  refresh();
  return { ok: true };
}
