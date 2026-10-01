import type { Booking } from "./bookings";
import type { Vehicle } from "./fleet";
import type { MailPriority } from "./mail";

/**
 * A customer, in the one shape CRM and Fleet share. Fleet writes it when a car
 * needs an owner; CRM owns the screens that list, edit and profile it.
 */
export interface Customer {
  ref: string;
  name: string;
  phone: string;
  email: string;
  company: string;
  notes: string;
}

/** Stored shape. `businessId` is stamped on by `tenantScope`. */
export interface CustomerDocument {
  businessId: string;
  ref: string;
  name: string;
  phone: string;
  email: string;
  /** Absent on records Fleet wrote before CRM existed. */
  company?: string;
  notes: string;
  /**
   * Digits only, with a leading 63 read as 0, so "+63 917…" and "0917…" are
   * one number. What duplicate warnings match on. Absent on records written
   * before CRM; filled on their next edit.
   */
  phoneKey?: string;
  /** Lower case. Absent on records written before CRM. */
  emailKey?: string;
  createdAt: Date;
  updatedAt?: Date;
}

export interface CustomerInput {
  name: string;
  phone: string;
  email: string;
  company: string;
  notes: string;
}

/** One row of the CRM list: the customer plus what their bookings add up to. */
export interface CustomerSummary extends Customer {
  vehicleCount: number;
  bookingCount: number;
  /** Minor units. Linked bookings that were not cancelled. */
  bookedValueCents: number;
  /** ISO 8601 of the latest linked booking, any status but Cancelled. */
  lastActivityAt: string | null;
  /** "Aug 24, 2026", the latest completed booking. */
  lastVisitDay: string | null;
  /** ISO 8601. */
  createdAt: string;
}

/** An email whose sender address is the customer's. Nothing from the AI beyond what Mail already stored. */
export interface CustomerEmail {
  id: string;
  subject: string;
  date: string;
  priority: MailPriority;
  unread: boolean;
}

export interface MonthValue {
  /** "Sep" */
  label: string;
  /** "2026-09" */
  key: string;
  valueCents: number;
}

/** Everything the customer drawer shows, loaded on the server for one customer. */
export interface CustomerProfile {
  customer: Customer;
  bookings: Booking[];
  /** Empty when Fleet is off. */
  vehicles: Vehicle[];
  emails: CustomerEmail[];
  months: MonthValue[];
}

/** A customer that shares a phone or email with one being created. */
export interface CustomerMatch {
  ref: string;
  name: string;
  /** What matched, in words: "same phone", "same email". */
  reason: string;
}
