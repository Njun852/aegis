"use client";

import { useState } from "react";
import { Select } from "@/components/ui";
import { DATE_RANGES } from "@/lib/data/dashboard";
import { CURRENT_USER } from "@/lib/data/workspace";

export function DashboardHeader() {
  const [range, setRange] = useState(DATE_RANGES[0]);

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
        onChange={setRange}
      />
    </div>
  );
}
