"use client";

import Link from "next/link";
import { startTransition, useActionState } from "react";
import { retrieveBookingAction } from "@/app/book/actions";
import type { RetrieveState } from "@/app/book/actions";
import { Badge, Button } from "@/components/ui";
import type { BadgeTone } from "@/components/ui";
import { CUSTOMER_STATUS } from "@/lib/booking-slots";
import type { BookingStatus } from "@/types";
import { ErrorNotice, SectionHead } from "./booking-form";
import styles from "./book.module.css";

const INITIAL: RetrieveState = { error: null };

/** The app's own status tones, with an icon so the state never rests on colour alone. */
const STATUS_BADGE: Record<BookingStatus, { tone: BadgeTone; icon: string }> = {
  Pending: { tone: "warning", icon: "clock" },
  Confirmed: { tone: "accent", icon: "check" },
  "In progress": { tone: "accent", icon: "wrench" },
  Completed: { tone: "positive", icon: "check-circle-2" },
  Cancelled: { tone: "negative", icon: "x" },
};

/**
 * Looks a request up by its code and the mobile it was made with. The result
 * shows only what the customer needs about their own appointment.
 */
export function RetrieveForm({ slug }: { slug: string }) {
  const [state, formAction, pending] = useActionState(retrieveBookingAction.bind(null, slug), INITIAL);
  const booking = state.booking;
  const status = booking ? CUSTOMER_STATUS[booking.status] : null;
  const badge = booking ? STATUS_BADGE[booking.status] : null;

  return (
    <>
      <form
        className={styles.card}
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          startTransition(() => formAction(data));
        }}
      >
        {state.error && <ErrorNotice>{state.error}</ErrorNotice>}
        <section className={styles.section}>
          <SectionHead
            icon="search"
            title="Find your booking"
            help="Enter the code you received and the mobile number you booked with."
          />
          <div className={styles.grid}>
            <label className={styles.field}>
              <span className={styles.label}>
                Booking code<span className={styles.required}> *</span>
              </span>
              <input
                name="code"
                className={`${styles.input} ${styles.mono}`}
                placeholder="AB7K-3Q9P"
                autoComplete="off"
                maxLength={12}
                required
              />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>
                Mobile number<span className={styles.required}> *</span>
              </span>
              <input
                name="mobile"
                type="tel"
                inputMode="tel"
                className={styles.input}
                placeholder="0917 123 4567"
                autoComplete="tel"
                maxLength={20}
                required
              />
            </label>
          </div>
        </section>
        <div className={styles.footer}>
          <p className={styles.footerNote}>Lost your code? Call the shop and we&apos;ll look it up for you.</p>
          <Button type="submit" icon={pending ? undefined : "search"} disabled={pending}>
            {pending ? "Looking…" : "Retrieve booking"}
          </Button>
        </div>
      </form>

      {booking && status && badge && (
        <div className={styles.card} role="status">
          <div className={styles.resultHead}>
            <span>
              <span className={styles.codeLabel}>Booking</span>
              <span className={styles.code} style={{ fontSize: 20, lineHeight: "26px" }}>
                {booking.displayCode}
              </span>
            </span>
            <Badge tone={badge.tone} icon={badge.icon}>
              {status.title}
            </Badge>
          </div>
          <p className={styles.lead} style={{ margin: "0 0 16px" }}>
            {status.detail}
          </p>
          <dl className={styles.summary}>
            <dt>Service</dt>
            <dd>{booking.service}</dd>
            <dt>Time</dt>
            <dd>{booking.when} (Asia/Manila)</dd>
            <dt>Vehicle</dt>
            <dd>
              {booking.vehicle}
              {booking.plate ? ` · ${booking.plate}` : ""}
            </dd>
          </dl>
        </div>
      )}

      <p className={styles.after}>
        Need a new appointment?{" "}
        <Link href={`/book/${slug}`} className={styles.link}>
          Book a service
        </Link>
        .
      </p>
    </>
  );
}
