import "server-only";

import { emailKey, phoneKey } from "@/lib/crm";
import { InputError, insertWithRef } from "./refs";
import { tenantScope } from "./tenant";
import type {
  Customer,
  CustomerDocument,
  CustomerInput,
  CustomerMatch,
} from "@/types";

/**
 * The customers collection, shared by CRM and Fleet. This file is its only
 * writer; Fleet creates owners through `createCustomer` and CRM edits them
 * through `updateCustomer`, so the match keys are always written the same way.
 */
export const customersCollection = () => tenantScope<CustomerDocument>("customers");

export function toCustomer(doc: CustomerDocument): Customer {
  return {
    ref: doc.ref,
    name: doc.name,
    phone: doc.phone,
    email: doc.email,
    company: doc.company ?? "",
    notes: doc.notes,
  };
}

export async function listCustomers(): Promise<Customer[]> {
  const collection = await customersCollection();
  const docs = await collection.find().sort({ name: 1 }).toArray();
  return docs.map(toCustomer);
}

export async function listCustomerDocuments(): Promise<CustomerDocument[]> {
  const collection = await customersCollection();
  return collection.find().toArray();
}

/** One customer, or null when the ref is not this business's. */
export async function findCustomer(ref: string): Promise<Customer | null> {
  const collection = await customersCollection();
  const doc = await collection.findOne({ ref });
  return doc ? toCustomer(doc) : null;
}

/**
 * Customers who share the phone or email being entered. Families and small
 * companies share both, so this warns rather than forbids; the person decides.
 */
export async function findDuplicates(
  input: { phone: string; email: string },
  exceptRef?: string,
): Promise<CustomerMatch[]> {
  const phone = phoneKey(input.phone);
  const email = emailKey(input.email);
  const either = [
    ...(phone ? [{ phoneKey: phone }] : []),
    ...(email ? [{ emailKey: email }] : []),
  ];
  if (either.length === 0) return [];

  const collection = await customersCollection();
  const docs = await collection
    .find({ $or: either, ...(exceptRef ? { ref: { $ne: exceptRef } } : {}) })
    .limit(5)
    .toArray();

  return docs.map((doc) => ({
    ref: doc.ref,
    name: doc.name,
    reason:
      phone && doc.phoneKey === phone && email && doc.emailKey === email
        ? "same phone and email"
        : phone && doc.phoneKey === phone
          ? "same phone"
          : "same email",
  }));
}

export async function createCustomer(
  input: Partial<CustomerInput> & { name: string },
): Promise<Customer> {
  const collection = await customersCollection();
  const now = new Date();
  const phone = input.phone ?? "";
  const email = input.email ?? "";

  const ref = await insertWithRef(collection, "CU-", 1001, (next) =>
    collection.insertOne({
      ref: next,
      name: input.name,
      phone,
      email,
      company: input.company ?? "",
      notes: input.notes ?? "",
      phoneKey: phoneKey(phone),
      emailKey: emailKey(email),
      createdAt: now,
      updatedAt: now,
    }),
  );
  const created = await collection.findOne({ ref });
  if (!created) throw new Error(`Customer ${ref} was written but could not be read back.`);
  return toCustomer(created);
}

export async function updateCustomer(ref: string, input: CustomerInput): Promise<void> {
  const collection = await customersCollection();
  const result = await collection.updateOne(
    { ref },
    {
      $set: {
        name: input.name,
        phone: input.phone,
        email: input.email,
        company: input.company,
        notes: input.notes,
        phoneKey: phoneKey(input.phone),
        emailKey: emailKey(input.email),
        updatedAt: new Date(),
      },
    },
  );
  if (result.matchedCount === 0) throw new InputError(`${ref} is no longer on file.`);
}
