"use client";

import { Select } from "@/components/ui";
import { DATE_RANGES } from "@/lib/data/dashboard";
import { CURRENT_USER } from "@/lib/data/workspace";
import { useDashboardRange } from "./dashboard-range-provider";
import type { DateRange } from "@/types";

export function DashboardHeader() {
  const { range, setRange } = useDashboardRange();

  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div>
        <h2
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "22px",
            lineHeight: "28px",
            fontWeight: 700,
            letterSpacing: "-.02em",
          }}
        >
          Welcome back, {CURRENT_USER.firstName} 👋
        </h2>
        <p
          style={{
            margin: "3px 0 0",
            fontSize: "12.5px",
            color: "var(--text-secondary)",
            textWrap: "pretty",
          }}
        >
          Here&apos;s what&apos;s happening with your finances today.
        </p>
      </div>
      <Select
        size="md"
        leadingIcon="calendar"
        options={DATE_RANGES}
        value={range}
        onChange={(value) => setRange(value as DateRange)}
      />
    </div>
  );
}
