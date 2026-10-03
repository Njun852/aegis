"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { saveQuotationSettingsAction } from "@/app/actions/quotations";
import { useToast } from "@/components/layout/toast-provider";
import { Button } from "@/components/ui";
import { shrinkImage } from "@/lib/image-resize";
import { priceFromCost, formatAmount } from "@/lib/quotations";
import { Field, INPUT, Modal, Notice } from "@/components/forms/form-kit";
import type { QuotationSettings } from "@/types";

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
    setError(null);
    startTransition(async () => {
      const result = await saveQuotationSettingsAction(
        { address, contact, notes, footer, markupPercent: markupValue },
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
    </Modal>
  );
}
