"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { deleteQuotationAction, saveQuotationAction } from "@/app/actions/quotations";
import { useToast } from "@/components/layout/toast-provider";
import { Badge, Button, Icon } from "@/components/ui";
import { phoneKey } from "@/lib/crm";
import { parseWholeNumber, plateKey } from "@/lib/fleet";
import {
  QUOTE_SECTIONS,
  addDays,
  amountInput,
  defaultQuoteEmail,
  emptyLine,
  formatPeso,
  hasLeftShop,
  parseAmount,
  parseQty,
  pricingCleared,
  quoteStatusTone,
  quoteTotals,
  specialPricingReason,
} from "@/lib/quotations";
import { Field, INPUT, Notice, Panel, SELECT } from "@/components/forms/form-kit";
import { LinkedNote, MatchList, matchKeys, type MatchOption } from "@/components/forms/match-list";
import { QuoteLines, type EditorLine } from "./quote-lines";
import { QuoteActions } from "./quote-actions";
import { QuoteHistory } from "./quote-history";
import { QuoteProgress } from "./quote-workflow";
import type {
  Customer,
  Quotation,
  QuotationInput,
  QuotationRevisionSummary,
  QuotationSettings,
  QuoteBillTo,
  QuoteBookingOption,
  QuoteCostSource,
  QuoteEvent,
  QuoteLine,
  QuotePhotoView,
  QuotePriceItem,
  QuoteSection,
  StoredQuoteStatus,
  VehicleOption,
} from "@/types";

/** What a new quotation started from a booking is filled in with, worked out on the server. */
export interface QuoteEditorPrefill {
  bookingRef: string;
  billTo: QuoteBillTo;
  vehicleRef: string | null;
  plate: string;
  makeModel: string;
}

export interface QuoteEditorProps {
  /** Null for a new quotation. */
  quotation: Quotation | null;
  /** The photo a draft was read from, shown beside it for checking. */
  photo: QuotePhotoView | null;
  /** Where a new quotation starts: today's date, its validity, the default notes, and a booking when started from one. */
  defaults: { quoteDate: string; validUntil: string; notes: string; prefill?: QuoteEditorPrefill | null };
  settings: QuotationSettings;
  priceItems: QuotePriceItem[];
  /** What parts cost now, from Inventory and Suppliers. Empty when neither module is on. */
  costSources: QuoteCostSource[];
  /** Empty when CRM is off. */
  customers: Customer[];
  /** Empty when Fleet is off. */
  vehicles: VehicleOption[];
  /** Bookings a quotation can be for. Empty when Bookings is off. */
  bookings: QuoteBookingOption[];
  bookingsEnabled: boolean;
  crmEnabled: boolean;
  fleetEnabled: boolean;
  mailConnected: boolean;
  businessName: string;
  /** Administrators approve discounts and prices below cost. */
  isAdmin: boolean;
  /** Superseded versions, newest first. */
  revisions: QuotationRevisionSummary[];
  /** The change log, newest first. */
  events: QuoteEvent[];
}

interface Draft {
  quoteDate: string;
  validUntil: string;
  drNumber: string;
  bookingRef: string | null;
  billTo: QuoteBillTo;
  vehicleRef: string | null;
  plate: string;
  makeModel: string;
  odometer: string;
  serviceAdvisor: string;
  technician: string;
  lines: EditorLine[];
  discount: string;
  discountReason: string;
  notes: string;
}

function toEditorLine(line: QuoteLine): EditorLine {
  return {
    ...line,
    qtyText: String(line.qty),
    priceText: amountInput(line.unitPriceCents),
    costText: amountInput(line.costCents),
  };
}

function blankEditorLine(section: QuoteSection): EditorLine {
  return toEditorLine(emptyLine(section));
}

function initialDraft(quotation: Quotation | null, defaults: QuoteEditorProps["defaults"]): Draft {
  if (!quotation) {
    const prefill = defaults.prefill ?? null;
    return {
      quoteDate: defaults.quoteDate,
      validUntil: defaults.validUntil,
      drNumber: "",
      bookingRef: prefill?.bookingRef ?? null,
      billTo: prefill?.billTo ?? { customerRef: null, name: "", company: "", address: "", phone: "", email: "" },
      vehicleRef: prefill?.vehicleRef ?? null,
      plate: prefill?.plate ?? "",
      makeModel: prefill?.makeModel ?? "",
      odometer: "",
      serviceAdvisor: "",
      technician: "",
      lines: [blankEditorLine("parts"), blankEditorLine("labor")],
      discount: "",
      discountReason: "",
      notes: defaults.notes,
    };
  }
  const lines = quotation.lines.map(toEditorLine);
  // Each section keeps a row to type into, so a quotation with no labor yet
  // still shows where labor goes.
  for (const { key } of QUOTE_SECTIONS) {
    if (!lines.some((line) => line.section === key)) lines.push(blankEditorLine(key));
  }
  return {
    quoteDate: quotation.quoteDate,
    validUntil: quotation.validUntil,
    drNumber: quotation.drNumber,
    bookingRef: quotation.bookingRef,
    billTo: quotation.billTo,
    vehicleRef: quotation.vehicle.vehicleRef,
    plate: quotation.vehicle.plate,
    makeModel: quotation.vehicle.makeModel,
    odometer: quotation.vehicle.odometerKm === null ? "" : String(quotation.vehicle.odometerKm),
    serviceAdvisor: quotation.serviceAdvisor,
    technician: quotation.technician,
    lines,
    discount: quotation.discountCents ? amountInput(quotation.discountCents) : "",
    discountReason: quotation.discountReason,
    notes: quotation.notes,
  };
}

/**
 * The typed text read back into numbers. A line whose text cannot be read
 * comes back with the error rather than a guess, and the save is refused.
 */
function readLines(lines: EditorLine[]): { lines: QuoteLine[]; error: string | null } {
  let error: string | null = null;
  const parsed = lines.map((line): QuoteLine => {
    const { qtyText, priceText, costText, ...rest } = line;
    const qty = parseQty(qtyText);
    const price = parseAmount(priceText);
    const cost = parseAmount(costText);
    const label = line.description.trim() || "A line";
    if (!error && line.description.trim()) {
      if (qty === undefined) error = `${label}: the quantity is not a number above zero.`;
      else if (price === undefined) error = `${label}: the unit price is not an amount.`;
      else if (cost === undefined) error = `${label}: the cost is not an amount.`;
    }
    return {
      ...rest,
      qty: qty ?? 1,
      unitPriceCents: price ?? null,
      costCents: cost ?? null,
    };
  });
  return { lines: parsed, error };
}

export function QuoteEditor({
  quotation,
  photo,
  defaults,
  settings,
  priceItems,
  costSources,
  customers,
  vehicles,
  bookings,
  bookingsEnabled,
  crmEnabled,
  fleetEnabled,
  mailConnected,
  businessName,
  isAdmin,
  revisions,
  events,
}: QuoteEditorProps) {
  const router = useRouter();
  const toast = useToast();
  const [draft, setDraft] = useState<Draft>(() => initialDraft(quotation, defaults));
  // A quotation started from a booking has unsaved details from the first moment.
  const [dirty, setDirty] = useState(Boolean(!quotation && defaults.prefill));
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  const [deleting, startDeleting] = useTransition();
  /** Once a job order is made from it, the quotation is the record of what was agreed. */
  const locked = Boolean(quotation?.jobOrderRef);
  const storedStatus: StoredQuoteStatus | null = quotation
    ? quotation.status === "Expired"
      ? "Sent"
      : quotation.status
    : null;
  const savedOnce = useRef(false);

  // The server sends a fresh copy after each save; the editor adopts it so the
  // ref, the status and the cleaned lines are the stored ones.
  useEffect(() => {
    if (!savedOnce.current) return;
    setDraft(initialDraft(quotation, defaults));
    setDirty(false);
    // Only a new server copy should reset the editor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quotation?.updatedAt]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const update = (patch: Partial<Draft>) => {
    setDraft((current) => ({ ...current, ...patch }));
    setDirty(true);
  };
  const updateBillTo = (patch: Partial<QuoteBillTo>) => {
    setDraft((current) => ({ ...current, billTo: { ...current.billTo, ...patch } }));
    setDirty(true);
  };

  const parsed = useMemo(() => readLines(draft.lines), [draft.lines]);
  const discountCents = parseAmount(draft.discount);
  const totals = useMemo(
    () => quoteTotals(parsed.lines, typeof discountCents === "number" ? discountCents : 0),
    [parsed.lines, discountCents],
  );

  /** The field being typed in, which decides what the matches are matched on. */
  const [customerField, setCustomerField] = useState<"name" | "company" | "phone" | null>(null);
  const [customerActive, setCustomerActive] = useState(-1);
  const [carField, setCarField] = useState<"plate" | "model" | null>(null);
  const [carActive, setCarActive] = useState(-1);
  const MAX_MATCHES = 6;

  // Customers on file matching the field being typed in. Nothing is offered
  // once one is linked, or before there is enough to match on.
  const customerMatches = useMemo(() => {
    if (!crmEnabled || draft.billTo.customerRef || !customerField) return [];
    const typed = draft.billTo[customerField].trim().toLowerCase();
    if (customerField === "phone") {
      const digits = phoneKey(typed);
      if (digits.length < 4) return [];
      return customers.filter((entry) => phoneKey(entry.phone).includes(digits)).slice(0, MAX_MATCHES);
    }
    if (typed.length < 2) return [];
    return customers
      .filter((entry) => (customerField === "name" ? entry.name : entry.company).toLowerCase().includes(typed))
      .slice(0, MAX_MATCHES);
  }, [crmEnabled, customers, customerField, draft.billTo]);

  // Cars on file by plate, however it is spaced, or by make and model.
  const carMatches = useMemo(() => {
    if (!fleetEnabled || draft.vehicleRef || !carField) return [];
    if (carField === "plate") {
      const typed = plateKey(draft.plate);
      if (typed.length < 2) return [];
      return vehicles.filter((entry) => plateKey(entry.plate).includes(typed)).slice(0, MAX_MATCHES);
    }
    const typed = draft.makeModel.trim().toLowerCase();
    if (typed.length < 3) return [];
    return vehicles.filter((entry) => entry.label.toLowerCase().includes(typed)).slice(0, MAX_MATCHES);
  }, [fleetEnabled, vehicles, carField, draft.vehicleRef, draft.plate, draft.makeModel]);

  const customerOptions: MatchOption[] = customerMatches.map((entry) => ({
    key: entry.ref,
    icon: "users",
    title: entry.name,
    detail: [entry.phone, entry.company].filter(Boolean).join(" · ") || undefined,
    tag: entry.ref,
  }));
  const carOptions: MatchOption[] = carMatches.map((entry) => ({
    key: entry.ref,
    icon: "car",
    title: entry.plate,
    detail: [entry.label, entry.ownerName].filter(Boolean).join(" · ") || undefined,
    tag: entry.ref,
  }));

  const closeCustomerMatches = () => {
    setCustomerField(null);
    setCustomerActive(-1);
  };
  const closeCarMatches = () => {
    setCarField(null);
    setCarActive(-1);
  };
  const customerKeys = matchKeys({
    count: customerOptions.length,
    active: customerActive,
    setActive: setCustomerActive,
    onPick: (index) => {
      pickCustomer(customerMatches[index].ref);
      closeCustomerMatches();
    },
    onClose: closeCustomerMatches,
  });
  const carKeys = matchKeys({
    count: carOptions.length,
    active: carActive,
    setActive: setCarActive,
    onPick: (index) => {
      pickVehicle(carMatches[index].ref);
      closeCarMatches();
    },
    onClose: closeCarMatches,
  });

  const pickCustomer = (ref: string) => {
    if (!ref) {
      updateBillTo({ customerRef: null });
      return;
    }
    const customer = customers.find((entry) => entry.ref === ref);
    if (!customer) return;
    updateBillTo({
      customerRef: customer.ref,
      name: customer.name,
      company: customer.company,
      phone: customer.phone,
      email: customer.email,
    });
  };

  const pickVehicle = (ref: string) => {
    if (!ref) {
      update({ vehicleRef: null });
      return;
    }
    const vehicle = vehicles.find((entry) => entry.ref === ref);
    if (!vehicle) return;
    const patch: Partial<Draft> = {
      vehicleRef: vehicle.ref,
      plate: vehicle.plate,
      makeModel: vehicle.label,
    };
    // A quotation for a car is usually for its owner. Fill the owner in when
    // nobody has been chosen yet, never over a choice already made.
    if (!draft.billTo.customerRef && !draft.billTo.name.trim()) {
      const owner = customers.find((entry) => entry.ref === vehicle.customerRef);
      patch.billTo = owner
        ? {
            ...draft.billTo,
            customerRef: owner.ref,
            name: owner.name,
            company: owner.company,
            phone: owner.phone,
            email: owner.email,
          }
        : { ...draft.billTo, name: vehicle.ownerName, email: vehicle.ownerEmail };
    }
    update(patch);
  };

  /**
   * Links the booking and fills in its customer and car where nothing has
   * been typed yet, never over details already chosen.
   */
  const pickBooking = (ref: string) => {
    if (!ref) {
      update({ bookingRef: null });
      return;
    }
    const booking = bookings.find((entry) => entry.ref === ref);
    if (!booking) return;
    const patch: Partial<Draft> = { bookingRef: booking.ref };
    if (!draft.billTo.customerRef && !draft.billTo.name.trim()) {
      const customer = customers.find((entry) => entry.ref === booking.customerRef);
      patch.billTo = customer
        ? {
            ...draft.billTo,
            customerRef: customer.ref,
            name: customer.name,
            company: customer.company,
            phone: customer.phone,
            email: customer.email,
          }
        : { ...draft.billTo, name: booking.customer, phone: booking.phone, email: booking.email };
    }
    if (!draft.vehicleRef && !draft.plate.trim()) {
      const car = vehicles.find((entry) => entry.ref === booking.vehicleRef);
      if (car) Object.assign(patch, { vehicleRef: car.ref, plate: car.plate, makeModel: car.label });
    }
    update(patch);
  };

  const buildInput = (): QuotationInput | string => {
    if (parsed.error) return parsed.error;
    if (discountCents === undefined) return "The discount is not an amount.";
    if (discountCents && !draft.discountReason.trim()) return "Say why the discount is given.";
    const odometer = parseWholeNumber(draft.odometer);
    if (odometer === undefined) return "The odometer reading must be a whole number of km.";
    return {
      quoteDate: draft.quoteDate,
      validUntil: draft.validUntil,
      drNumber: draft.drNumber,
      bookingRef: draft.bookingRef,
      billTo: draft.billTo,
      vehicle: {
        vehicleRef: draft.vehicleRef,
        plate: draft.plate,
        makeModel: draft.makeModel,
        odometerKm: odometer,
      },
      serviceAdvisor: draft.serviceAdvisor,
      technician: draft.technician,
      lines: parsed.lines,
      discountCents: discountCents ?? 0,
      discountReason: discountCents ? draft.discountReason : "",
      notes: draft.notes,
    };
  };

  /** Saves, and resolves with the ref once the server has it, or null on refusal. */
  const save = (): Promise<string | null> =>
    new Promise((resolve) => {
      const input = buildInput();
      if (typeof input === "string") {
        setError(input);
        resolve(null);
        return;
      }
      setError(null);
      startSaving(async () => {
        const result = await saveQuotationAction(quotation?.ref ?? null, input);
        if (!result.ok) {
          setError(result.error);
          toast({ tone: "error", title: "Quotation not saved", description: result.error, key: "quote-save" });
          resolve(null);
          return;
        }
        savedOnce.current = true;
        setDirty(false);
        toast({
          tone: "success",
          title: result.revised
            ? `${result.ref} revision ${result.revision} started`
            : quotation
              ? `${result.ref} saved`
              : `${result.ref} created`,
          description: [
            result.revised ? `Revision ${result.revision - 1} stays on file as it was given to the customer.` : "",
            totals.unpricedCount
              ? `${totals.unpricedCount} ${totals.unpricedCount === 1 ? "line still needs" : "lines still need"} a price.`
              : `Total ${formatPeso(totals.totalCents)}.`,
          ]
            .filter(Boolean)
            .join(" "),
          key: "quote-save",
        });
        if (quotation) router.refresh();
        else router.replace(`/quotations/${result.ref}`);
        resolve(result.ref);
      });
    });

  const remove = () => {
    if (!quotation) return;
    if (!window.confirm(`Delete ${quotation.ref}? This cannot be undone.`)) return;
    startDeleting(async () => {
      const result = await deleteQuotationAction(quotation.ref);
      if (!result.ok) {
        toast({ tone: "error", title: "Not deleted", description: result.error });
        return;
      }
      setDirty(false);
      toast({ tone: "success", title: `${quotation.ref} deleted` });
      router.push("/quotations");
    });
  };

  // Special pricing is judged on the saved copy, which is what the approval
  // and the send both work on; the progress strip offers the approval.
  const draftPricingReason = specialPricingReason(parsed.lines, totals.discountCents);
  const savedCleared = quotation ? pricingCleared(quotation) : true;

  /** Only a first draft nobody outside the shop has seen. */
  const deletable =
    quotation !== null && quotation.status === "Draft" && quotation.revision === 1 && !quotation.sent && !locked;

  const linkedBooking = draft.bookingRef ? bookings.find((entry) => entry.ref === draft.bookingRef) : null;

  const customerOnFile = draft.billTo.customerRef
    ? customers.find((entry) => entry.ref === draft.billTo.customerRef)
    : null;

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/quotations"
          className="inline-flex items-center gap-1.5"
          style={{ fontSize: "12.5px", color: "var(--text-secondary)", textDecoration: "none" }}
        >
          <Icon name="arrow-left" size={14} />
          Quotations
        </Link>
        <h2
          style={{
            margin: 0,
            fontFamily: "var(--font-display)",
            fontSize: "22px",
            lineHeight: "28px",
            fontWeight: 700,
            letterSpacing: "-.02em",
          }}
        >
          {quotation ? quotation.ref : "New quotation"}
        </h2>
        {quotation && (
          <Badge tone={quoteStatusTone(quotation.status)}>
            {quotation.status}
            {quotation.revision > 1 ? ` · rev ${quotation.revision}` : ""}
          </Badge>
        )}
        {quotation?.source === "photo" && <Badge tone="accent" icon="image">From photo</Badge>}
        {dirty && <span style={{ fontSize: "12px", color: "var(--status-warning)" }}>Unsaved changes</span>}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {deletable && (
            <Button variant="ghost" icon="trash-2" onClick={remove} disabled={deleting || saving}>
              {deleting ? "Deleting…" : "Delete"}
            </Button>
          )}
          {quotation && (
            <QuoteActions
              quotation={quotation}
              dirty={dirty}
              unpricedCount={totals.unpricedCount}
              mailConnected={mailConnected}
              pricingBlocked={!savedCleared || (dirty && draftPricingReason !== null)}
              email={defaultQuoteEmail(quotation, businessName, settings.contact)}
              save={save}
            />
          )}
          {/* Once the stored copy matches the screen there is nothing to save,
              and the button says so instead of inviting a click. */}
          {locked ? (
            <Button variant="secondary" icon="lock" disabled>
              Locked
            </Button>
          ) : quotation && !dirty && !saving ? (
            <Button variant="secondary" icon="check" disabled>
              Saved
            </Button>
          ) : (
            <Button icon="check" onClick={() => void save()} disabled={saving || deleting}>
              {saving
                ? "Saving…"
                : storedStatus && hasLeftShop(storedStatus)
                  ? `Save as revision ${(quotation?.revision ?? 1) + 1}`
                  : "Save"}
            </Button>
          )}
        </div>
      </div>

      {quotation && (
        <QuoteProgress quotation={quotation} dirty={dirty} isAdmin={isAdmin} bookingsEnabled={bookingsEnabled} />
      )}

      {locked && quotation && (
        <Notice tone="info">Locked: this is what the customer approved for {quotation.jobOrderRef}.</Notice>
      )}
      {!locked && quotation && storedStatus && hasLeftShop(storedStatus) && dirty && (
        <Notice tone="warning">
          Saving starts revision {quotation.revision + 1}. Revision {quotation.revision} stays on file as it was sent.
        </Notice>
      )}
      {error && <Notice tone="error">{error}</Notice>}

      <fieldset
        disabled={locked}
        style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}
        className="grid gap-3.5 min-[1440px]:grid-cols-[minmax(0,1fr)_300px]"
      >
        <div className="flex min-w-0 flex-col gap-3.5">
          <div className="grid gap-3.5 wide:grid-cols-2">
            <Panel title="Bill to" icon="user">
              <div className="relative">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Customer name">
                    <input
                      style={INPUT}
                      value={draft.billTo.name}
                      maxLength={120}
                      autoComplete="off"
                      placeholder={crmEnabled ? "Type to find a customer" : undefined}
                      onChange={(event) => {
                        // A different name is someone else; the link no longer holds.
                        updateBillTo({
                          name: event.target.value,
                          ...(customerOnFile && event.target.value !== customerOnFile.name ? { customerRef: null } : {}),
                        });
                        setCustomerField("name");
                        setCustomerActive(-1);
                      }}
                      onFocus={() => setCustomerField("name")}
                      onBlur={closeCustomerMatches}
                      onKeyDown={customerKeys}
                    />
                  </Field>
                  <Field label="Company name">
                    <input
                      style={INPUT}
                      value={draft.billTo.company}
                      maxLength={120}
                      autoComplete="off"
                      onChange={(event) => {
                        updateBillTo({ company: event.target.value });
                        setCustomerField("company");
                        setCustomerActive(-1);
                      }}
                      onFocus={() => setCustomerField("company")}
                      onBlur={closeCustomerMatches}
                      onKeyDown={customerKeys}
                    />
                  </Field>
                </div>
                {customerField !== "phone" && (
                  <MatchList
                    id="quote-customer-matches"
                    label="Customers on file"
                    options={customerOptions}
                    active={customerActive}
                    onHover={setCustomerActive}
                    onPick={(index) => {
                      pickCustomer(customerMatches[index].ref);
                      closeCustomerMatches();
                    }}
                  />
                )}
              </div>
              <Field label="Street address">
                <input
                  style={INPUT}
                  value={draft.billTo.address}
                  maxLength={200}
                  onChange={(event) => updateBillTo({ address: event.target.value })}
                />
              </Field>
              <div className="relative grid grid-cols-2 gap-3">
                <Field label="Contact number">
                  <input
                    style={INPUT}
                    type="tel"
                    value={draft.billTo.phone}
                    maxLength={40}
                    autoComplete="off"
                    onChange={(event) => {
                      updateBillTo({ phone: event.target.value });
                      setCustomerField("phone");
                      setCustomerActive(-1);
                    }}
                    onFocus={() => setCustomerField("phone")}
                    onBlur={closeCustomerMatches}
                    onKeyDown={customerKeys}
                  />
                </Field>
                <Field label="Email address">
                  <input
                    style={INPUT}
                    type="email"
                    value={draft.billTo.email}
                    maxLength={120}
                    onChange={(event) => updateBillTo({ email: event.target.value })}
                  />
                </Field>
                {customerField === "phone" && (
                  <MatchList
                    id="quote-customer-matches"
                    label="Customers on file"
                    options={customerOptions}
                    active={customerActive}
                    onHover={setCustomerActive}
                    onPick={(index) => {
                      pickCustomer(customerMatches[index].ref);
                      closeCustomerMatches();
                    }}
                  />
                )}
              </div>
              {crmEnabled &&
                (customerOnFile ? (
                  <LinkedNote onUnlink={() => updateBillTo({ customerRef: null })}>
                    Linked to {customerOnFile.name} · {customerOnFile.ref} in CRM. Edits here stay on this quotation.
                  </LinkedNote>
                ) : (
                  <span style={{ fontSize: "11.5px", color: "var(--text-muted)" }}>
                    Start typing a name, company or number to fill this in from CRM.
                  </span>
                ))}
            </Panel>

            <Panel title="Vehicle and job" icon="car">
              <div className="relative grid grid-cols-2 gap-3">
                <Field label="Plate number">
                  <input
                    style={{ ...INPUT, fontFamily: "var(--font-mono)" }}
                    value={draft.plate}
                    maxLength={12}
                    autoComplete="off"
                    placeholder={fleetEnabled ? "Type to find a car" : undefined}
                    onChange={(event) => {
                      const plate = event.target.value.toUpperCase();
                      const linkedCar = vehicles.find((entry) => entry.ref === draft.vehicleRef);
                      // Another plate is another car; the link no longer holds.
                      update({
                        plate,
                        ...(linkedCar && plateKey(plate) !== plateKey(linkedCar.plate) ? { vehicleRef: null } : {}),
                      });
                      setCarField("plate");
                      setCarActive(-1);
                    }}
                    onFocus={() => setCarField("plate")}
                    onBlur={closeCarMatches}
                    onKeyDown={carKeys}
                  />
                </Field>
                <Field label="Model / make">
                  <input
                    style={INPUT}
                    value={draft.makeModel}
                    maxLength={80}
                    autoComplete="off"
                    placeholder="Fortuner 2015"
                    onChange={(event) => {
                      update({ makeModel: event.target.value });
                      setCarField("model");
                      setCarActive(-1);
                    }}
                    onFocus={() => setCarField("model")}
                    onBlur={closeCarMatches}
                    onKeyDown={carKeys}
                  />
                </Field>
                <MatchList
                  id="quote-car-matches"
                  label="Cars on file"
                  options={carOptions}
                  active={carActive}
                  onHover={setCarActive}
                  onPick={(index) => {
                    pickVehicle(carMatches[index].ref);
                    closeCarMatches();
                  }}
                />
              </div>
              {fleetEnabled &&
                (draft.vehicleRef ? (
                  <LinkedNote onUnlink={() => update({ vehicleRef: null })}>
                    Linked to {draft.plate} in Fleet.
                  </LinkedNote>
                ) : (
                  <span style={{ fontSize: "11.5px", color: "var(--text-muted)" }}>
                    Start typing a plate or model to fill this in from Fleet.
                  </span>
                ))}
              {bookingsEnabled && (
                <Field
                  label="Booking"
                  hint={
                    linkedBooking ? (
                      <Link
                        href={`/bookings?booking=${encodeURIComponent(linkedBooking.ref)}`}
                        style={{ color: "var(--accent-primary)", textDecoration: "none" }}
                      >
                        Open {linkedBooking.ref}
                      </Link>
                    ) : undefined
                  }
                >
                  <select
                    style={SELECT}
                    value={draft.bookingRef ?? ""}
                    onChange={(event) => pickBooking(event.target.value)}
                  >
                    <option value="">None</option>
                    {draft.bookingRef && !linkedBooking && <option value={draft.bookingRef}>{draft.bookingRef}</option>}
                    {bookings.map((entry) => (
                      <option key={entry.ref} value={entry.ref}>
                        {entry.ref} · {entry.day} · {entry.customer} · {entry.service}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              <div className="grid grid-cols-2 gap-3">
                <Field label="Odometer (km)">
                  <input
                    style={INPUT}
                    inputMode="numeric"
                    value={draft.odometer}
                    maxLength={10}
                    onChange={(event) => update({ odometer: event.target.value })}
                  />
                </Field>
                <Field label="Date" required>
                  <input
                    style={INPUT}
                    type="date"
                    value={draft.quoteDate}
                    onChange={(event) => {
                      const quoteDate = event.target.value;
                      // A validity nobody changed moves with the date; one typed by hand stays.
                      const untouched =
                        draft.quoteDate && draft.validUntil === addDays(draft.quoteDate, settings.validDays);
                      update({
                        quoteDate,
                        ...(untouched && quoteDate ? { validUntil: addDays(quoteDate, settings.validDays) } : {}),
                      });
                    }}
                  />
                </Field>
                <Field label="Valid until" required>
                  <input
                    style={INPUT}
                    type="date"
                    value={draft.validUntil}
                    min={draft.quoteDate}
                    onChange={(event) => update({ validUntil: event.target.value })}
                  />
                </Field>
                <Field label="Service advisor">
                  <input
                    style={INPUT}
                    value={draft.serviceAdvisor}
                    maxLength={80}
                    onChange={(event) => update({ serviceAdvisor: event.target.value })}
                  />
                </Field>
                <Field label="Technician">
                  <input
                    style={INPUT}
                    value={draft.technician}
                    maxLength={80}
                    onChange={(event) => update({ technician: event.target.value })}
                  />
                </Field>
                <Field label="D.R. number">
                  <input
                    style={INPUT}
                    value={draft.drNumber}
                    maxLength={30}
                    onChange={(event) => update({ drNumber: event.target.value })}
                  />
                </Field>
              </div>
            </Panel>
          </div>

          {QUOTE_SECTIONS.map((section) => (
            <QuoteLines
              key={section.key}
              section={section.key}
              title={section.label}
              noun={section.noun}
              lines={draft.lines.filter((line) => line.section === section.key)}
              priceItems={priceItems}
              costSources={section.key === "parts" ? costSources : []}
              markupPercent={settings.markupPercent}
              onChange={(next) => {
                setDraft((current) => {
                  // Replace this section's rows in place, keeping the other's.
                  const others = current.lines.filter((line) => line.section !== section.key);
                  return { ...current, lines: [...others, ...next] };
                });
                setDirty(true);
              }}
            />
          ))}
        </div>

        <div className="flex min-w-0 flex-col gap-3.5">
          {photo && (
            <Panel title="From a photo" icon="image">
              <a href={`/api/quotations/photos/${encodeURIComponent(photo.ref)}`} target="_blank" rel="noreferrer">
                {/* Served by the app with the session; next/image would only re-encode it. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/quotations/photos/${encodeURIComponent(photo.ref)}`}
                  alt="The photo this draft was read from"
                  style={{
                    width: "100%",
                    maxHeight: 320,
                    objectFit: "contain",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid var(--border-default)",
                    background: "var(--surface-inset)",
                  }}
                />
              </a>
              <span style={{ fontSize: "11.5px", color: "var(--text-secondary)", textWrap: "pretty" }}>
                {photo.note} Check each line against the photo.
              </span>
            </Panel>
          )}
          <Panel title="Totals" icon="wallet">
            <TotalRow label="Parts" value={formatPeso(totals.partsCents)} />
            <TotalRow label="Labor" value={formatPeso(totals.laborCents)} />
            <div className="flex items-center justify-between gap-3">
              <span style={{ fontSize: "12.5px", color: "var(--text-secondary)" }}>Discount</span>
              <input
                aria-label="Discount"
                style={{ ...INPUT, width: 120, textAlign: "right", fontVariantNumeric: "tabular-nums" }}
                inputMode="decimal"
                placeholder="0.00"
                value={draft.discount}
                onChange={(event) => update({ discount: event.target.value })}
              />
            </div>
            {Boolean(discountCents) && (
              <input
                aria-label="Reason for the discount"
                style={INPUT}
                maxLength={200}
                value={draft.discountReason}
                placeholder="Reason for the discount (required)"
                onChange={(event) => update({ discountReason: event.target.value })}
              />
            )}
            <div
              className="flex items-baseline justify-between"
              style={{ paddingTop: 10, borderTop: "1px solid var(--border-subtle)" }}
            >
              <span style={{ fontSize: "13px", fontWeight: 700 }}>Customer total</span>
              <span
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: "20px",
                  fontWeight: 700,
                  letterSpacing: "-.02em",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {formatPeso(totals.totalCents)}
              </span>
            </div>
            {totals.unpricedCount > 0 && (
              <span style={{ fontSize: "11.5px", color: "var(--status-warning)" }}>
                {totals.unpricedCount} unpriced {totals.unpricedCount === 1 ? "line" : "lines"} not in the total
              </span>
            )}
            {dirty && draftPricingReason && (
              <span style={{ fontSize: "11.5px", color: "var(--status-warning)" }}>Needs admin approval before sending</span>
            )}

            {/* Internal figures: on screen only, never in the PDF or the email. */}
            <div
              className="flex flex-col gap-1.5"
              style={{ marginTop: 4, padding: "10px 12px", borderRadius: "var(--radius-md)", background: "var(--surface-inset)" }}
            >
              <span className="flex items-center gap-1.5" style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-muted)" }}>
                <Icon name="eye-off" size={12} />
                Internal · never printed
              </span>
              <TotalRow label="Cost" value={totals.costedLines ? formatPeso(totals.costCents) : "—"} />
              <TotalRow
                label="Gross profit"
                value={
                  totals.costedLines
                    ? `${formatPeso(totals.marginCents)}${totals.marginPercent === null ? "" : ` · ${totals.marginPercent.toFixed(1)}%`}`
                    : "—"
                }
                tone={totals.costedLines && totals.marginCents < 0 ? "negative" : undefined}
                strong
              />
              {totals.pricedLines > 0 && totals.costedLines < totals.pricedLines && (
                <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                  Costed on {totals.costedLines} of {totals.pricedLines} lines
                </span>
              )}
            </div>
          </Panel>

          <Panel title="Notes" icon="file-text">
            <textarea
              rows={3}
              maxLength={600}
              style={{ ...INPUT, resize: "vertical" }}
              value={draft.notes}
              placeholder="THIS QUOTATION IS ZERO RATED VAT"
              onChange={(event) => update({ notes: event.target.value })}
            />
          </Panel>
        </div>
      </fieldset>

      {quotation && <QuoteHistory quotation={quotation} revisions={revisions} events={events} />}
    </div>
  );
}

function TotalRow({
  label,
  value,
  strong,
  tone,
}: {
  label: string;
  value: string;
  strong?: boolean;
  tone?: "negative";
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span style={{ fontSize: "12.5px", color: strong ? "var(--text-primary)" : "var(--text-secondary)", fontWeight: strong ? 600 : 400 }}>
        {label}
      </span>
      <span
        style={{
          fontSize: "13px",
          fontWeight: strong ? 700 : 500,
          fontVariantNumeric: "tabular-nums",
          color: tone === "negative" ? "var(--status-negative)" : "var(--text-primary)",
        }}
      >
        {value}
      </span>
    </div>
  );
}
