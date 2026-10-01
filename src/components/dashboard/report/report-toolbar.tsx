"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { DATE_RANGES } from "@/lib/data/dashboard";
import { REPORT_RANGE_SLUGS } from "@/lib/report";
import type { DateRange } from "@/types";

/**
 * The report's controls: which period, print, and the way back. Hidden when
 * printing, so the page that comes out is the report alone.
 */
export function ReportToolbar({ range }: { range: DateRange }) {
  const router = useRouter();

  return (
    <div className="aegis-no-print flex flex-wrap items-center gap-2.5">
      <div
        role="group"
        aria-label="Report period"
        style={{
          display: "inline-flex",
          padding: 3,
          gap: 2,
          border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-md)",
          background: "var(--surface-card)",
        }}
      >
        {DATE_RANGES.map((option) => {
          const active = option === range;
          return (
            <Link
              key={option}
              href={`/dashboard/report?range=${REPORT_RANGE_SLUGS[option]}`}
              aria-current={active ? "page" : undefined}
              style={{
                padding: "6px 11px",
                borderRadius: "var(--radius-sm)",
                fontSize: "12px",
                fontWeight: active ? 700 : 500,
                color: active ? "var(--blue-600)" : "var(--text-secondary)",
                background: active ? "var(--accent-soft)" : "transparent",
                whiteSpace: "nowrap",
              }}
            >
              {option}
            </Link>
          );
        })}
      </div>
      <Button variant="secondary" icon="file-text" onClick={() => window.print()}>
        Print or save PDF
      </Button>
      <Button variant="ghost" icon="arrow-left" onClick={() => router.push("/dashboard")}>
        Dashboard
      </Button>
    </div>
  );
}
