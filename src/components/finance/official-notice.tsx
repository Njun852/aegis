"use client";

import Link from "next/link";
import { Notice } from "@/components/forms/form-kit";
import type { OfficialReport } from "@/types";

/**
 * Shown on a live report for a closed month: which frozen revision is the
 * official one, and whether today's records still agree with it.
 */
export function OfficialNotice({ official }: { official: OfficialReport }) {
  const link = `/finance?tab=reports&report=${official.kind}:${official.period}:${official.revision}`;
  const made = new Date(official.generatedAt).toLocaleDateString("en-US", { timeZone: "Asia/Manila", month: "short", day: "2-digit", year: "numeric" });
  return official.changed ? (
    <Notice tone="warning">
      <strong>This month is closed, and these live figures no longer match its report.</strong> Records dated in it changed after{" "}
      <Link href={link} style={{ color: "inherit", textDecoration: "underline" }}>
        {official.title}
      </Link>{" "}
      was made on {made}. An administrator can review the changes on the{" "}
      <Link href="/finance?tab=reports" style={{ color: "inherit", textDecoration: "underline" }}>
        Reports
      </Link>{" "}
      tab and issue a revision.
    </Notice>
  ) : (
    <Notice tone="info">
      This month is closed. The official report is{" "}
      <Link href={link} style={{ color: "inherit", textDecoration: "underline" }}>
        {official.title}
      </Link>
      , made on {made}; these live figures match it.
    </Notice>
  );
}
