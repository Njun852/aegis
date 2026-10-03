"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { createQuotationFromPhotoAction } from "@/app/actions/quotations";
import { useToast } from "@/components/layout/toast-provider";
import { Button } from "@/components/ui";
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
 * Takes or picks a photo and turns it into a draft quotation. On a phone,
 * `capture` opens the camera; on a computer it is an ordinary file picker.
 */
export function PhotoButton({ aiConfigured }: { aiConfigured: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const read = async (file: File | undefined) => {
    if (input.current) input.current.value = "";
    if (!file) return;
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
      toast({ tone: "success", title: `${result.ref} drafted from the photo`, description: result.note, key: "quote-photo", durationMs: 9000 });
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
    <>
      <input
        ref={input}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(event) => void read(event.target.files?.[0])}
      />
      <Button
        variant="secondary"
        icon="image"
        disabled={busy || !aiConfigured}
        title={
          aiConfigured
            ? "Photograph a written estimate, a supplier receipt or the car, and get a draft to check"
            : "Reading photos needs AI, which is not switched on for this workspace."
        }
        onClick={() => input.current?.click()}
      >
        {busy ? "Reading photo…" : "From photo"}
      </Button>
    </>
  );
}
