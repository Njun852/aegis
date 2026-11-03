"use client";

import { useState } from "react";
import { attachFileAction, scanDocumentAction } from "@/app/actions/finance";
import { Notice } from "@/components/forms/form-kit";
import { ScanPanel } from "@/components/forms/scan-panel";
import { useToast } from "@/components/layout/toast-provider";
import { INTAKE_DOC_TYPES, INTAKE_FIELD_LABELS } from "@/lib/finance-intake";
import { formatMoney } from "@/lib/format";
import { prepareUpload } from "./record-trail";
import type { IntakeExtraction, IntakeRatedField } from "@/types";

/** The file a form was filled from, kept to attach to the record it saves. */
export interface ScannedFile {
  name: string;
  dataUrl: string;
}

export interface Scan {
  read: IntakeExtraction;
  file: ScannedFile;
  cached: boolean;
}

/** An amount in centavos as the forms' amount field takes it. */
export function scanAmount(cents: number | null): string {
  return cents === null ? "" : (cents / 100).toFixed(2);
}

/**
 * The box at the top of a new bill, invoice or money entry: scan a photo or
 * PDF and AI fills in the fields. The person still checks every field and
 * saves; the scan is never saved on its own.
 */
export function ScanBox({
  scan,
  expect,
  onScan,
}: {
  scan: Scan | null;
  /** The direction the form records, to warn when the document looks like the other one. */
  expect: "in" | "out" | null;
  onScan: (scan: Scan) => void;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const read = async (file: File) => {
    setBusy(true);
    try {
      const dataUrl = await prepareUpload(file);
      const result = await scanDocumentAction(file.name, dataUrl);
      if (!result.ok) {
        toast({ tone: "error", title: "Scan not read", description: result.error, key: "finance-scan" });
        return;
      }
      onScan({ read: result.read, file: { name: file.name, dataUrl }, cached: result.cached });
      toast({
        tone: "success",
        title: "Filled in from the scan",
        description: `${result.read.party || "No name found"}, ${
          result.read.amountCents !== null ? formatMoney(result.read.amountCents) : "no amount found"
        }. Check each field before saving.${result.cached ? " Read before, so no AI charge." : ""}`,
        key: "finance-scan",
      });
    } catch (cause) {
      toast({
        tone: "error",
        title: "Scan not read",
        description: cause instanceof Error ? cause.message : "The file could not be read.",
        key: "finance-scan",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2.5">
      <ScanPanel
        title={scan ? `Filled from ${scan.file.name}` : "Fill in from a photo or PDF"}
        hint={scan ? "It will be attached to the record when you save." : "Take a photo of the invoice or receipt, or pick a PDF. AI fills in the fields for you to check."}
        busy={busy}
        buttonLabel={scan ? "Scan another" : "Scan document"}
        primary={!scan}
        accept="image/*,application/pdf"
        onFile={(file) => void read(file)}
      />
      {scan && <ScanNotice scan={scan} expect={expect} />}
    </div>
  );
}

/** What the scan could not read clearly, so the person knows which fields to check. */
function ScanNotice({ scan, expect }: { scan: Scan; expect: "in" | "out" | null }) {
  const { read } = scan;
  const unclear = (Object.keys(read.confidence) as IntakeRatedField[]).filter((field) => read.confidence[field] !== "high");
  const type = INTAKE_DOC_TYPES.find((entry) => entry.key === read.docType)?.label ?? "Document";
  const wrongWay = expect !== null && read.docType !== "other" && read.direction !== expect;
  const problems = [
    ...(read.docType === "other" ? ["This does not look like an invoice or receipt."] : []),
    ...(wrongWay
      ? [read.direction === "in" ? "It looks like money coming in (a sale), not a cost to pay." : "It looks like money going out (a cost), not a sale."]
      : []),
    ...unclear.map((field) => `${INTAKE_FIELD_LABELS[field]}: ${read.confidence[field]} confidence.`),
    ...read.warnings,
  ];
  return (
    <Notice tone={problems.length > 0 ? "warning" : "info"}>
      <strong>{type} read.</strong> {read.summary}
      {problems.length > 0 && (
        <>
          {" "}
          Check closely:
          <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
            {problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        </>
      )}
    </Notice>
  );
}

/**
 * Attaches the scanned file to the record a form just saved. Returns the
 * sentence the form's own success toast adds; a failure has its own toast.
 */
export function useAttachScan() {
  const toast = useToast();
  return async (recordRef: string, file: ScannedFile | undefined): Promise<string> => {
    if (!file) return "";
    const result = await attachFileAction(recordRef, file.name, file.dataUrl);
    if (!result.ok) {
      toast({ tone: "error", title: `Scan not attached to ${recordRef}`, description: `${result.error} Attach it from the record.`, key: "finance-scan" });
      return "";
    }
    return " The scan is attached.";
  };
}
