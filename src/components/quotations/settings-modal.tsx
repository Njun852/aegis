"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { saveQuotationSettingsAction } from "@/app/actions/quotations";
import { useToast } from "@/components/layout/toast-provider";
import { Button } from "@/components/ui";
import { shrinkImage } from "@/lib/image-resize";
import { PDF_COLOR_FIELDS, PDF_COLOR_PRESETS, priceFromCost, formatAmount, signerFor } from "@/lib/quotations";
import { Field, INPUT, Modal, Notice } from "@/components/forms/form-kit";
import type { QuotationSettings, QuotePdfColors } from "@/types";
import { SignaturesPanel } from "./signatures-panel";

/** Roughly 300 KB once encoded, the most the server accepts. */
const MAX_LOGO_CHARS = 400_000;

export function QuoteSettingsModal({
  settings,
  businessName,
  onClose,
}: {
  settings: QuotationSettings;
  businessName: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const file = useRef<HTMLInputElement>(null);
  const [address, setAddress] = useState(settings.address);
  const [contact, setContact] = useState(settings.contact);
  const [notes, setNotes] = useState(settings.notes);
  const [footer, setFooter] = useState(settings.footer);
  const [markup, setMarkup] = useState(String(settings.markupPercent));
  const [validDays, setValidDays] = useState(String(settings.validDays));
  const [signOff, setSignOff] = useState(settings.signOff);
  const [pdfColors, setPdfColors] = useState<QuotePdfColors>(settings.pdfColors);
  // undefined: unchanged; null: removed; string: a new image.
  const [logo, setLogo] = useState<string | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const shownLogo = logo === undefined ? settings.logo : logo;
  const markupValue = Number(markup);

  const pickLogo = async (picked: File | undefined) => {
    if (!picked) return;
    setError(null);
    try {
      // PNG keeps a transparent background; a logo too heavy as PNG goes JPEG.
      let shrunk = await shrinkImage(picked, { maxEdge: 900, type: "image/png" });
      if (shrunk.dataUrl.length > MAX_LOGO_CHARS) {
        shrunk = await shrinkImage(picked, { maxEdge: 900, type: "image/jpeg", quality: 0.9 });
      }
      if (shrunk.dataUrl.length > MAX_LOGO_CHARS) {
        setError("That logo is still too large after shrinking. Try a simpler image.");
        return;
      }
      setLogo(shrunk.dataUrl);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That image could not be read.");
    } finally {
      if (file.current) file.current.value = "";
    }
  };

  const save = () => {
    if (!Number.isFinite(markupValue) || markup.trim() === "") {
      setError("The markup must be a number, such as 50.");
      return;
    }
    const days = Number(validDays);
    if (!Number.isInteger(days) || days < 1) {
      setError("Validity must be a whole number of days, such as 30.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await saveQuotationSettingsAction(
        { address, contact, notes, footer, markupPercent: markupValue, validDays: days, signOff, pdfColors },
        logo,
      );
      if (!result.ok) {
        setError(result.error);
        toast({ tone: "error", title: "Settings not saved", description: result.error });
        return;
      }
      toast({ tone: "success", title: "Quotation settings saved", description: "New PDFs use them from now on." });
      router.refresh();
      onClose();
    });
  };

  return (
    <Modal
      title="Quotation settings"
      icon="settings"
      onClose={onClose}
      width={600}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button icon="check" onClick={save} disabled={pending}>
            {pending ? "Saving…" : "Save settings"}
          </Button>
        </>
      }
    >
      {error && <Notice tone="error">{error}</Notice>}

      <Field label="Logo" hint={`Printed at the top right. Without one, the PDF prints ${businessName} in a dark box.`}>
        <div className="flex flex-wrap items-center gap-3">
          <div
            style={{
              width: 220,
              height: 64,
              border: "1px dashed var(--border-strong)",
              borderRadius: "var(--radius-md)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "var(--gray-25)",
              overflow: "hidden",
            }}
          >
            {shownLogo ? (
              // A data URL from this form; next/image adds nothing here.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={shownLogo} alt="Quotation logo" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
            ) : (
              <span style={{ fontSize: "11.5px", color: "var(--text-muted)" }}>No logo</span>
            )}
          </div>
          <input
            ref={file}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            hidden
            onChange={(event) => void pickLogo(event.target.files?.[0])}
          />
          <Button variant="secondary" size="sm" icon="image" onClick={() => file.current?.click()}>
            {shownLogo ? "Replace" : "Upload"}
          </Button>
          {shownLogo && (
            <Button variant="ghost" size="sm" onClick={() => setLogo(null)}>
              Remove
            </Button>
          )}
        </div>
      </Field>

      <PdfColorsField colors={pdfColors} businessName={businessName} onChange={setPdfColors} />

      <Field label="Address" hint="Printed in bold beside the quote number.">
        <input
          style={INPUT}
          value={address}
          maxLength={200}
          placeholder="Iñigo Street B.O. Obrero, Davao City 8000"
          onChange={(event) => setAddress(event.target.value)}
        />
      </Field>
      <Field label="Contact numbers">
        <input
          style={INPUT}
          value={contact}
          maxLength={160}
          placeholder="0915-5146520 / 0932-453792 / 285-2545"
          onChange={(event) => setContact(event.target.value)}
        />
      </Field>
      <Field label="Default notes" hint="Each line prints in red in the notes box. New quotations start with these; each can be changed.">
        <textarea
          rows={3}
          maxLength={600}
          style={{ ...INPUT, resize: "vertical" }}
          value={notes}
          placeholder={"THIS QUOTATION IS ZERO RATED VAT\n5-6 DAYS WORK LEAD TIME"}
          onChange={(event) => setNotes(event.target.value)}
        />
      </Field>
      <Field label="Footer">
        <input style={INPUT} value={footer} maxLength={120} onChange={(event) => setFooter(event.target.value)} />
      </Field>
      <Field
        label="Markup (%)"
        hint={
          Number.isFinite(markupValue) && markup.trim() !== ""
            ? `When a line has a cost and no price, the price offered is cost plus this. A cost of 1,000.00 is offered at ${formatAmount(
                priceFromCost(100_000, markupValue),
              )}. Never printed.`
            : "Cost plus this percentage is offered as the price."
        }
      >
        <input
          style={{ ...INPUT, maxWidth: 140 }}
          inputMode="decimal"
          value={markup}
          onChange={(event) => setMarkup(event.target.value)}
        />
      </Field>
      <Field
        label="Valid for (days)"
        hint="New quotations are valid this long from their date, and each can be changed. A sent quotation with no answer by then reads as Expired."
      >
        <input
          style={{ ...INPUT, maxWidth: 140 }}
          inputMode="numeric"
          value={validDays}
          onChange={(event) => setValidDays(event.target.value)}
        />
      </Field>

      <SignaturesPanel signers={settings.signers} />

      <Field
        label="Signed by"
        hint="The names printed in these boxes on every quotation, with their signature when one is saved above. Service Advisor and Assigned Technician come from each quotation; the customer signs by hand."
      >
        <datalist id="quote-signer-names">
          {settings.signers.map((signer) => (
            <option key={signer.id} value={signer.name} />
          ))}
        </datalist>
        <div className="grid gap-2.5 wide:grid-cols-3">
          {(
            [
              ["accounting", "Accounting"],
              ["headTechnician", "Head Technician"],
              ["manager", "Manager"],
            ] as const
          ).map(([key, label]) => {
            const signed = signerFor(signOff[key], settings.signers) !== null;
            return (
              <label key={key} className="flex min-w-0 flex-col gap-1.5">
                <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-secondary)" }}>{label}</span>
                <input
                  style={INPUT}
                  list="quote-signer-names"
                  value={signOff[key]}
                  maxLength={80}
                  placeholder="Leave blank to sign by hand"
                  onChange={(event) => setSignOff((current) => ({ ...current, [key]: event.target.value }))}
                />
                {signOff[key].trim() && (
                  <span style={{ fontSize: "10.5px", color: signed ? "var(--status-positive)" : "var(--text-muted)" }}>
                    {signed ? "Signature on file" : "No signature for this name: name only"}
                  </span>
                )}
              </label>
            );
          })}
        </div>
      </Field>
    </Modal>
  );
}

function sameColors(a: QuotePdfColors, b: QuotePdfColors): boolean {
  return (Object.keys(a) as (keyof QuotePdfColors)[]).every((key) => a[key].toLowerCase() === b[key].toLowerCase());
}

/**
 * The PDF's colour scheme: a ready-made one in a click, or each colour picked
 * by hand, with a small drawing of the form that follows the choice.
 */
function PdfColorsField({
  colors,
  businessName,
  onChange,
}: {
  colors: QuotePdfColors;
  businessName: string;
  onChange: (next: QuotePdfColors) => void;
}) {
  const preset = PDF_COLOR_PRESETS.find((entry) => sameColors(entry.colors, colors));
  return (
    <Field label="PDF colours" hint={`${preset ? preset.name : "Custom"}. Used on every quotation PDF, printed or emailed.`}>
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          {PDF_COLOR_PRESETS.map((entry) => {
            const active = preset?.name === entry.name;
            return (
              <button
                key={entry.name}
                type="button"
                title={entry.name}
                aria-pressed={active}
                onClick={() => onChange(entry.colors)}
                className="flex items-center gap-1.5"
                style={{
                  height: 30,
                  padding: "0 10px 0 6px",
                  borderRadius: "var(--radius-pill)",
                  border: `1px solid ${active ? "var(--accent-primary)" : "var(--border-default)"}`,
                  background: active ? "var(--accent-soft)" : "var(--surface-card)",
                  cursor: "pointer",
                  font: "inherit",
                  fontSize: "11.5px",
                  fontWeight: active ? 700 : 500,
                  color: "var(--text-primary)",
                }}
              >
                <span style={{ display: "inline-flex", borderRadius: 999, overflow: "hidden", border: "1px solid rgba(0,0,0,.1)" }}>
                  {[entry.colors.frame, entry.colors.heading, entry.colors.shade, entry.colors.highlight].map((color, index) => (
                    <span key={index} style={{ width: 8, height: 16, background: color }} />
                  ))}
                </span>
                {entry.name}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-start gap-4">
          <div className="grid grid-cols-2 gap-x-4 gap-y-2" style={{ flex: "1 1 260px" }}>
            {PDF_COLOR_FIELDS.map((field) => (
              <label key={field.key} className="flex min-w-0 items-center gap-2" title={field.hint}>
                <input
                  type="color"
                  aria-label={`${field.label} colour`}
                  value={colors[field.key]}
                  onChange={(event) => onChange({ ...colors, [field.key]: event.target.value.toUpperCase() })}
                  style={{
                    width: 34,
                    height: 28,
                    padding: 0,
                    border: "1px solid var(--border-default)",
                    borderRadius: 6,
                    background: "none",
                    cursor: "pointer",
                  }}
                />
                <span className="flex min-w-0 flex-col leading-tight">
                  <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-primary)" }}>{field.label}</span>
                  <span style={{ fontSize: "10.5px", color: "var(--text-muted)" }}>{field.hint}</span>
                </span>
              </label>
            ))}
          </div>

          {/* A thumbnail of the form in these colours. */}
          <div
            aria-hidden
            style={{
              width: 150,
              flex: "0 0 auto",
              border: `2px solid ${colors.frame}`,
              background: "#fff",
              fontFamily: "Helvetica, Arial, sans-serif",
              color: "#111",
              fontSize: 6,
            }}
          >
            <div className="flex" style={{ borderBottom: "1px solid #ccc" }}>
              <span style={{ flex: 1, padding: "5px 4px", fontWeight: 700, fontSize: 10, color: colors.heading }}>QUOTATION</span>
              <span
                style={{
                  flex: 1,
                  background: colors.frame,
                  color: "#fff",
                  fontWeight: 700,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  overflow: "hidden",
                  whiteSpace: "nowrap",
                }}
              >
                {businessName.toUpperCase().slice(0, 12)}
              </span>
            </div>
            <div style={{ background: colors.shade, textAlign: "center", padding: 2 }}>Bill To</div>
            <div style={{ height: 22, borderBottom: "1px solid #ddd" }} />
            <div style={{ background: colors.shade, padding: 2 }}>DESCRIPTION · QTY · AMOUNT</div>
            <div style={{ height: 18, borderBottom: "1px solid #ddd" }} />
            <div className="flex" style={{ padding: 3 }}>
              <span style={{ flex: 1, color: colors.highlight, fontWeight: 700 }}>NOTE</span>
              <span style={{ color: colors.heading, fontWeight: 700, marginRight: 4 }}>TOTAL</span>
              <span style={{ color: colors.highlight, fontWeight: 700 }}>12,500.00</span>
            </div>
            <div style={{ background: colors.shade, textAlign: "center", padding: 2, color: colors.heading, fontWeight: 700 }}>
              Thank you!
            </div>
          </div>
        </div>
      </div>
    </Field>
  );
}
