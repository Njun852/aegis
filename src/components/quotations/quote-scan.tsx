"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createQuotationFromPhotoAction } from "@/app/actions/quotations";
import { ScanPanel } from "@/components/forms/scan-panel";
import { useToast } from "@/components/layout/toast-provider";
import { shrinkImage } from "@/lib/image-resize";

/** Under the server's 1 MB limit for one action, with room for the request around it. */
const MAX_CHARS = 950_000;

/**
 * Progressively smaller copies until one fits. Around 1400px keeps
 * handwriting legible, and the pixel count is what the AI call costs.
 */
const ATTEMPTS = [
  { maxEdge: 1400, quality: 0.82 },
  { maxEdge: 1400, quality: 0.68 },
  { maxEdge: 1200, quality: 0.65 },
  { maxEdge: 1000, quality: 0.6 },
];

async function prepare(file: File): Promise<string> {
  for (const attempt of ATTEMPTS) {
    const { dataUrl } = await shrinkImage(file, { ...attempt, type: "image/jpeg" });
    if (dataUrl.length <= MAX_CHARS) return dataUrl;
  }
  throw new Error("That photo is too detailed to upload. Try a closer, plainer shot.");
}

/**
 * The box at the top of a new quotation: scan a written estimate, a supplier
 * receipt or the car, and AI drafts the quotation, with its lines priced from
 * the price list, and opens it beside the photo for checking.
 */
export function QuoteScanBox({ aiConfigured, dirty }: { aiConfigured: boolean; dirty: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const read = async (file: File) => {
    setBusy(true);
    toast({
      tone: "info",
      title: "Reading the photo…",
      description: "This can take up to half a minute.",
      key: "quote-photo",
      durationMs: 45_000,
    });
    try {
      const dataUrl = await prepare(file);
      const result = await createQuotationFromPhotoAction(dataUrl);
      if (!result.ok) {
        toast({ tone: "error", title: "No draft made", description: result.error, key: "quote-photo" });
        return;
      }
      toast({ tone: "success", title: `${result.ref} filled in from the scan`, description: result.note, key: "quote-photo", durationMs: 9000 });
      router.push(`/quotations/${encodeURIComponent(result.ref)}`);
    } catch (cause) {
      toast({
        tone: "error",
        title: "No draft made",
        description: cause instanceof Error ? cause.message : "The photo could not be read.",
        key: "quote-photo",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScanPanel
      title="Fill in from a photo"
      hint={
        aiConfigured
          ? `Photograph a written estimate, a supplier receipt or the car. AI fills in the quotation for you to check.${
              dirty ? " It starts a fresh draft, so what is typed here is not kept." : ""
            }`
          : "Reading photos needs AI, which is not switched on for this workspace."
      }
      busy={busy}
      buttonLabel="Scan document"
      primary
      accept="image/*"
      disabled={!aiConfigured}
      disabledReason="Reading photos needs AI, which is not switched on for this workspace."
      onFile={(file) => void read(file)}
    />
  );
}
