"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { deleteQuotationAction, saveQuotationAction } from "@/app/actions/quotations";
import { useToast } from "@/components/layout/toast-provider";
import { Badge, Button, Icon } from "@/components/ui";
import { parseWholeNumber } from "@/lib/fleet";
import {
  QUOTE_SECTIONS,
  amountInput,
  defaultQuoteEmail,
  emptyLine,
  formatPeso,
  parseAmount,
  parseQty,
  quoteTotals,
} from "@/lib/quotations";
import { Field, INPUT, Notice, Panel, SELECT } from "@/components/forms/form-kit";
import { QuoteLines, type EditorLine } from "./quote-lines";
import { QuoteActions } from "./quote-actions";
import type {
  Customer,
  Quotation,
  QuotationInput,
  QuotationSettings,
  QuoteBillTo,
  QuoteLine,
  QuotePhotoView,
  QuotePriceItem,
  QuoteSection,
  VehicleOption,
} from "@/types";

export interface QuoteEditorProps {
  /** Null for a new quotation. */
  quotation: Quotation | null;
  /** The photo a draft was read from, shown beside it for checking. */
  photo: QuotePhotoView | null;
  /** Where a new quotation starts: today's date, the default notes. */
  defaults: { quoteDate: string; notes: string };
  settings: QuotationSettings;
  priceItems: QuotePriceItem[];
  /** Empty when CRM is off. */
  customers: Customer[];
  /** Empty when Fleet is off. */
  vehicles: VehicleOption[];
  crmEnabled: boolean;
  fleetEnabled: boolean;
  mailConnected: boolean;
  businessName: string;
}

interface Draft {
  quoteDate: string;
  drNumber: string;
  billTo: QuoteBillTo;
  vehicleRef: string | null;
  plate: string;
  makeModel: string;
  odometer: string;
  serviceAdvisor: string;
  technician: string;
  lines: EditorLine[];
  discount: string;
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
    return {
      quoteDate: defaults.quoteDate,
      drNumber: "",
      billTo: { customerRef: null, name: "", company: "", address: "", phone: "", email: "" },
      vehicleRef: null,
      plate: "",
      makeModel: "",
      odometer: "",
      serviceAdvisor: "",
      technician: "",
      lines: [blankEditorLine("parts"), blankEditorLine("labor")],
      discount: "",
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
    drNumber: quotation.drNumber,
    billTo: quotation.billTo,
    vehicleRef: quotation.vehicle.vehicleRef,
    plate: quotation.vehicle.plate,
    makeModel: quotation.vehicle.makeModel,
    odometer: quotation.vehicle.odometerKm === null ? "" : String(quotation.vehicle.odometerKm),
    serviceAdvisor: quotation.serviceAdvisor,
    technician: quotation.technician,
    lines,
    discount: quotation.discountCents ? amountInput(quotation.discountCents) : "",
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
  customers,
  vehicles,
  crmEnabled,
  fleetEnabled,
  mailConnected,
  businessName,
}: QuoteEditorProps) {
  const router = useRouter();
  const toast = useToast();
  const [draft, setDraft] = useState<Draft>(() => initialDraft(quotation, defaults));
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  const [deleting, startDeleting] = useTransition();
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

  const buildInput = (): QuotationInput | string => {
    if (parsed.error) return parsed.error;
    if (discountCents === undefined) return "The discount is not an amount.";
    const odometer = parseWholeNumber(draft.odometer);
    if (odometer === undefined) return "The odometer reading must be a whole number of km.";
    return {
      quoteDate: draft.quoteDate,
      drNumber: draft.drNumber,
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
          title: quotation ? `${result.ref} saved` : `${result.ref} created`,
          description: totals.unpricedCount
            ? `${totals.unpricedCount} ${totals.unpricedCount === 1 ? "line still needs" : "lines still need"} a price.`
            : `Total ${formatPeso(totals.totalCents)}.`,
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
          <Badge tone={quotation.status === "Sent" ? "positive" : "neutral"}>{quotation.status}</Badge>
        )}
        {quotation?.source === "photo" && <Badge tone="accent" icon="image">From photo</Badge>}
        {dirty && <span style={{ fontSize: "12px", color: "var(--status-warning)" }}>Unsaved changes</span>}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {quotation && (
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
              email={defaultQuoteEmail(quotation, businessName, settings.contact)}
              save={save}
            />
          )}
          {/* Once the stored copy matches the screen there is nothing to save,
              and the button says so instead of inviting a click. */}
          {quotation && !dirty && !saving ? (
            <Button variant="secondary" icon="check" disabled>
              Saved
            </Button>
          ) : (
            <Button icon="check" onClick={() => void save()} disabled={saving || deleting}>
              {saving ? "Saving…" : "Save"}
            </Button>
          )}
        </div>
      </div>

      {quotation?.status === "Sent" && dirty && (
        <Notice tone="warning">
          This quotation was emailed to {quotation.sentTo} on {quotation.sent}. They keep that version
          until you send it again.
        </Notice>
      )}
      {error && <Notice tone="error">{error}</Notice>}

      <div className="grid gap-3.5 min-[1440px]:grid-cols-[minmax(0,1fr)_300px]">
        <div className="flex min-w-0 flex-col gap-3.5">
          <div className="grid gap-3.5 wide:grid-cols-2">
            <Panel title="Bill to" icon="user">
              {crmEnabled && (
                <Field
                  label="Customer record"
                  hint={
                    customerOnFile
                      ? `Filled from ${customerOnFile.ref}. Edits here stay on this quotation.`
                      : "Pick a CRM customer to fill this in, or type the details."
                  }
                >
                  <select
                    style={SELECT}
                    value={draft.billTo.customerRef ?? ""}
                    onChange={(event) => pickCustomer(event.target.value)}
                  >
                    <option value="">Not linked</option>
                    {customers.map((customer) => (
                      <option key={customer.ref} value={customer.ref}>
                        {customer.name}
                        {customer.company ? ` · ${customer.company}` : ""}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              <div className="grid grid-cols-2 gap-3">
                <Field label="Customer name">
                  <input
                    style={INPUT}
                    value={draft.billTo.name}
                    maxLength={120}
                    onChange={(event) => updateBillTo({ name: event.target.value })}
                  />
                </Field>
                <Field label="Company name">
                  <input
                    style={INPUT}
                    value={draft.billTo.company}
                    maxLength={120}
                    onChange={(event) => updateBillTo({ company: event.target.value })}
                  />
                </Field>
              </div>
              <Field label="Street address">
                <input
                  style={INPUT}
                  value={draft.billTo.address}
                  maxLength={200}
                  onChange={(event) => updateBillTo({ address: event.target.value })}
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Contact number">
                  <input
                    style={INPUT}
                    type="tel"
                    value={draft.billTo.phone}
                    maxLength={40}
                    onChange={(event) => updateBillTo({ phone: event.target.value })}
                  />
                </Field>
                <Field label="Email address" hint="The quotation is emailed here.">
                  <input
                    style={INPUT}
                    type="email"
                    value={draft.billTo.email}
                    maxLength={120}
                    onChange={(event) => updateBillTo({ email: event.target.value })}
                  />
                </Field>
              </div>
            </Panel>

            <Panel title="Vehicle and job" icon="car">
              {fleetEnabled && (
                <Field label="Car on file">
                  <select
                    style={SELECT}
                    value={draft.vehicleRef ?? ""}
                    onChange={(event) => pickVehicle(event.target.value)}
                  >
                    <option value="">Not linked</option>
                    {vehicles.map((vehicle) => (
                      <option key={vehicle.ref} value={vehicle.ref}>
                        {vehicle.plate} · {vehicle.label}
                        {vehicle.ownerName ? ` · ${vehicle.ownerName}` : ""}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              <div className="grid grid-cols-2 gap-3">
                <Field label="Plate number">
                  <input
                    style={{ ...INPUT, fontFamily: "var(--font-mono)" }}
                    value={draft.plate}
                    maxLength={12}
                    onChange={(event) => update({ plate: event.target.value.toUpperCase() })}
                  />
                </Field>
                <Field label="Model / make">
                  <input
                    style={INPUT}
                    value={draft.makeModel}
                    maxLength={80}
                    placeholder="Fortuner 2015"
                    onChange={(event) => update({ makeModel: event.target.value })}
                  />
                </Field>
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
                    onChange={(event) => update({ quoteDate: event.target.value })}
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
              <span style={{ fontSize: "11.5px", color: "var(--text-secondary)", textWrap: "pretty" }}>{photo.note}</span>
              <span style={{ fontSize: "11px", color: "var(--text-muted)", textWrap: "pretty" }}>
                Check every line against the photo. Prices read from it, or from the price list, are a starting
                point; the customer sees only what you save.
              </span>
            </Panel>
          )}
          <Panel title="Totals" icon="wallet">
            <TotalRow label="Total parts" value={formatPeso(totals.partsCents)} />
            <TotalRow label="Total labor" value={formatPeso(totals.laborCents)} />
            <TotalRow label="Subtotal" value={formatPeso(totals.subtotalCents)} strong />
            <Field label="Discount">
              <input
                style={{ ...INPUT, textAlign: "right", fontVariantNumeric: "tabular-nums" }}
                inputMode="decimal"
                placeholder="0.00"
                value={draft.discount}
                onChange={(event) => update({ discount: event.target.value })}
              />
            </Field>
            <div
              className="flex items-baseline justify-between"
              style={{ paddingTop: 10, borderTop: "1px solid var(--border-subtle)" }}
            >
              <span style={{ fontSize: "13px", fontWeight: 700 }}>Total</span>
              <span
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: "20px",
                  fontWeight: 700,
                  letterSpacing: "-.02em",
                  fontVariantNumeric: "tabular-nums",
                  color: "var(--status-negative)",
                }}
              >
                {formatPeso(totals.totalCents)}
              </span>
            </div>
            {totals.unpricedCount > 0 && (
              <Notice tone="warning">
                {totals.unpricedCount} {totals.unpricedCount === 1 ? "line has" : "lines have"} no price yet
                and {totals.unpricedCount === 1 ? "is" : "are"} left out of the total. Price{" "}
                {totals.unpricedCount === 1 ? "it" : "them"} before sending.
              </Notice>
            )}
          </Panel>

          <Panel
            title="Internal"
            icon="eye-off"
            action={<span style={{ fontSize: "11px", color: "var(--text-muted)" }}>Never printed</span>}
          >
            <TotalRow label="Cost" value={totals.costedLines ? formatPeso(totals.costCents) : "—"} />
            <TotalRow
              label="Margin"
              value={totals.costedLines ? formatPeso(totals.marginCents) : "—"}
              tone={totals.costedLines && totals.marginCents < 0 ? "negative" : undefined}
              strong
            />
            <span style={{ fontSize: "11px", color: "var(--text-muted)", textWrap: "pretty" }}>
              {totals.pricedLines === 0
                ? "Type a cost on a line to see the margin."
                : `From the cost on ${totals.costedLines} of ${totals.pricedLines} priced ${
                    totals.pricedLines === 1 ? "line" : "lines"
                  }${totals.discountCents ? ", after the discount" : ""}. A cost with no price is offered at ${
                    settings.markupPercent
                  }% markup.`}
            </span>
          </Panel>

          <Panel title="Notes" icon="file-text">
            <textarea
              rows={4}
              maxLength={600}
              style={{ ...INPUT, resize: "vertical" }}
              value={draft.notes}
              placeholder="THIS QUOTATION IS ZERO RATED VAT"
              onChange={(event) => update({ notes: event.target.value })}
            />
            <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
              Printed in the notes box. New quotations start with the notes in Settings.
            </span>
          </Panel>
        </div>
      </div>
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
