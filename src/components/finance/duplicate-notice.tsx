"use client";

import Link from "next/link";
import { Notice } from "@/components/forms/form-kit";
import { Button } from "@/components/ui";
import type { DuplicateMatch } from "@/types";

/**
 * Shown when a new bill or invoice looks like one already on record. Nothing
 * was saved; the person checks the matches and either stops or saves past
 * them on purpose, which the new record's history then says.
 */
export function DuplicateNotice({
  matches,
  href,
  pending,
  onSaveAnyway,
}: {
  matches: DuplicateMatch[];
  /** Where a match opens: `/finance?tab=payables&bill=` plus the ref. */
  href: (ref: string) => string;
  pending: boolean;
  onSaveAnyway: () => void;
}) {
  return (
    <Notice tone="warning">
      <span className="flex flex-col gap-2">
        <strong>This may already be on record. Nothing was saved.</strong>
        <span className="flex flex-col gap-1">
          {matches.map((match) => (
            <span key={match.ref}>
              <Link href={href(match.ref)} target="_blank" style={{ color: "var(--text-accent)", fontWeight: 600 }}>
                {match.ref}
              </Link>{" "}
              {match.label}
              <span style={{ color: "var(--text-muted)" }}> · {match.reason}</span>
            </span>
          ))}
        </span>
        <span>If it is a different document, save it anyway; the warning is kept in its history.</span>
        <span>
          <Button size="sm" variant="secondary" onClick={onSaveAnyway} disabled={pending}>
            {pending ? "Saving…" : "It is different, save anyway"}
          </Button>
        </span>
      </span>
    </Notice>
  );
}
