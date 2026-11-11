"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import type { CSSProperties } from "react";
import { removeQuoteSignerAction, saveQuoteSignerAction } from "@/app/actions/quotations";
import { Field, INPUT, Notice } from "@/components/forms/form-kit";
import { useToast } from "@/components/layout/toast-provider";
import { Button } from "@/components/ui";
import { signatureImage } from "@/lib/image-resize";
import { MAX_SIGNATURE_CHARS, MAX_SIGNERS } from "@/lib/quotations";
import type { QuoteSigner } from "@/types";

/**
 * The people whose signature prints on the PDF. Each is saved the moment it is
 * added, replaced or removed, apart from the rest of the settings, so an
 * image is never sent twice. A signature prints in a box whose name matches
 * exactly (case and spacing aside), so the name here must be written the way
 * the quotation writes it.
 */
export function SignaturesPanel({ signers }: { signers: QuoteSigner[] }) {
  const router = useRouter();
  const toast = useToast();
  const file = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  /** The signer whose image is being replaced, or "new" for one being added. */
  const [target, setTarget] = useState<string | "new" | null>(null);
  const [name, setName] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const startAdd = () => {
    setError(null);
    setTarget("new");
    setName("");
    setImage(null);
  };

  const startReplace = (signer: QuoteSigner) => {
    setError(null);
    setTarget(signer.id);
    setName(signer.name);
    setImage(signer.image);
  };

  const pick = async (picked: File | undefined) => {
    if (!picked) return;
    setError(null);
    try {
      const prepared = await signatureImage(picked);
      if (prepared.length > MAX_SIGNATURE_CHARS) {
        setError("That signature is still too large. Crop the photo closer to the signature.");
        return;
      }
      setImage(prepared);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That image could not be read.");
    } finally {
      if (file.current) file.current.value = "";
    }
  };

  const save = () => {
    if (!name.trim()) {
      setError("Type the name exactly as it prints on the quotation.");
      return;
    }
    if (!image) {
      setError("Upload a photo or scan of the signature.");
      return;
    }
    setError(null);
    const id = target === "new" ? null : target;
    startTransition(async () => {
      try {
        const result = await saveQuoteSignerAction({ id, name, image });
        if (!result.ok) {
          setError(result.error);
          toast({ tone: "error", title: "Signature not saved", description: result.error, key: "signer" });
          return;
        }
        setTarget(null);
        router.refresh();
        toast({ tone: "success", title: `Signature saved for ${name.trim()}`, description: "It prints beside that name on every PDF.", key: "signer" });
      } catch {
        toast({ tone: "error", title: "Signature not saved", description: "Please try again.", key: "signer" });
      }
    });
  };

  const remove = (signer: QuoteSigner) => {
    if (!window.confirm(`Remove ${signer.name}'s signature? PDFs made from now on leave their box for a hand signature.`)) return;
    startTransition(async () => {
      try {
        const result = await removeQuoteSignerAction(signer.id);
        if (!result.ok) {
          toast({ tone: "error", title: "Signature not removed", description: result.error, key: "signer" });
          return;
        }
        if (target === signer.id) setTarget(null);
        router.refresh();
        toast({ tone: "success", title: `${signer.name}'s signature removed`, key: "signer" });
      } catch {
        toast({ tone: "error", title: "Signature not removed", description: "Please try again.", key: "signer" });
      }
    });
  };

  return (
    <Field
      label="Signatures"
      hint="Printed beside the name in its signature box. The name must match how the quotation writes it. Saved as soon as you add or remove one."
    >
      <div className="flex flex-col gap-2">
        {signers.length === 0 && target === null && (
          <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>No signatures yet. Every box is signed by hand.</span>
        )}
        {signers.map((signer) =>
          target === signer.id ? null : (
            <div key={signer.id} style={ROW}>
              <span style={{ flex: 1, minWidth: 0, fontSize: "12.5px", fontWeight: 600, overflowWrap: "anywhere" }}>{signer.name}</span>
              <span style={PREVIEW}>
                {/* A data URL from this business's settings; next/image adds nothing. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={signer.image} alt={`${signer.name}'s signature`} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
              </span>
              <Button size="sm" variant="ghost" onClick={() => startReplace(signer)} disabled={pending || target !== null}>
                Replace
              </Button>
              <Button size="sm" variant="ghost" onClick={() => remove(signer)} disabled={pending || target !== null}>
                Remove
              </Button>
            </div>
          ),
        )}

        {target !== null && (
          <div style={FORM}>
            {error && <Notice tone="error">{error}</Notice>}
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex min-w-0 flex-1 flex-col gap-1.5" style={{ minWidth: 180 }}>
                <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-secondary)" }}>Name, as it prints</span>
                <input style={INPUT} value={name} maxLength={80} placeholder="Juan Dela Cruz" onChange={(event) => setName(event.target.value)} />
              </label>
              <span style={{ ...PREVIEW, width: 200, height: 56 }}>
                {image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={image} alt="Signature to save" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
                ) : (
                  <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>No signature yet</span>
                )}
              </span>
            </div>
            <input ref={file} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(event) => void pick(event.target.files?.[0])} />
            <span style={{ fontSize: "11px", color: "var(--text-muted)", textWrap: "pretty" }}>
              A photo of the signature in dark ink on plain white paper works best. The paper is removed and only the ink is kept.
            </span>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" icon="image" onClick={() => file.current?.click()} disabled={pending}>
                {image ? "Use another image" : "Upload signature"}
              </Button>
              <Button size="sm" icon="check" onClick={save} disabled={pending}>
                {pending ? "Saving…" : "Save signature"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setTarget(null)} disabled={pending}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {target === null && signers.length < MAX_SIGNERS && (
          <div>
            <Button size="sm" variant="secondary" icon="plus" onClick={startAdd} disabled={pending}>
              Add signature
            </Button>
          </div>
        )}
      </div>
    </Field>
  );
}

const ROW: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "10px",
  padding: "6px 8px 6px 11px",
  border: "1px solid var(--border-subtle)",
  borderRadius: "var(--radius-md)",
};

const PREVIEW: CSSProperties = {
  width: 140,
  height: 40,
  flex: "0 0 auto",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "#ffffff",
  border: "1px dashed var(--border-default)",
  borderRadius: "var(--radius-sm)",
  overflow: "hidden",
};

const FORM: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "10px",
  padding: "12px",
  border: "1px solid var(--blue-200)",
  borderRadius: "var(--radius-md)",
  background: "var(--gray-25)",
};
