"use client";

import Link from "next/link";
import { startTransition, useActionState, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { submitBookingRequestAction } from "@/app/book/actions";
import type { SubmitState } from "@/app/book/actions";
import { Badge, Button, Icon } from "@/components/ui";
import { HEARD_FROM, formatSlotTime, type OpenDay } from "@/lib/booking-slots";
import styles from "./book.module.css";

const INITIAL: SubmitState = { error: null };

export interface BookingFormProps {
  slug: string;
  openDays: OpenDay[];
  /** The first and last days a customer may pick, Manila calendar. */
  dateRange: { min: string; max: string };
}

/**
 * The public request form, laid out as the supplied design: your details,
 * vehicle, service and preferred time. Only times still free are offered; the
 * server checks again on submit, because someone else may have taken the slot
 * while this page was open.
 */
export function BookingForm({ slug, openDays: initialDays, dateRange }: BookingFormProps) {
  const [state, formAction, pending] = useActionState(
    submitBookingRequestAction.bind(null, slug),
    INITIAL,
  );
  const [date, setDate] = useState("");
  const [hour, setHour] = useState("");

  // After a slot is taken the server sends fresh availability; use it.
  const days = state.openDays ?? initialDays;
  const hoursByDate = useMemo(() => new Map(days.map((day) => [day.date, day.hours])), [days]);
  const hours = date ? (hoursByDate.get(date) ?? []) : [];
  const selectedHour = hours.includes(Number(hour)) ? hour : "";

  const dateNote = !date
    ? null
    : hours.length > 0
      ? null
      : new Date(`${date}T12:00:00+08:00`).getUTCDay() === 0
        ? "We're closed on Sundays. Please choose another day."
        : date < dateRange.min || date > dateRange.max
          ? "Please choose a day within the next 60 days."
          : "No times left on this day. Please choose another.";

  if (state.code) {
    return <Confirmation slug={slug} code={state.code} when={state.when ?? ""} />;
  }

  return (
    <form
      className={styles.card}
      // Submitted by hand rather than through `action`: React resets a form
      // after its action runs, which would wipe what the customer typed
      // whenever the server turns the request back.
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        startTransition(() => formAction(data));
      }}
    >
      {state.error && <ErrorNotice>{state.error}</ErrorNotice>}

      {/* Hidden from people; a bot that fills every field fills this one. */}
      <div className={styles.honeypot} aria-hidden>
        <label>
          Website
          <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <section className={styles.section}>
        <SectionHead
          icon="user"
          title="Your details"
          help="We only use these details to manage this appointment request."
        />
        <div className={styles.grid}>
          <Field label="Name" required>
            <input name="name" className={styles.input} autoComplete="name" placeholder="Juan Dela Cruz" maxLength={80} required />
          </Field>
          <Field label="Mobile number" required>
            <input
              name="mobile"
              type="tel"
              inputMode="tel"
              className={styles.input}
              autoComplete="tel"
              placeholder="0917 123 4567"
              maxLength={20}
              required
            />
          </Field>
          <Field label="How did you hear about us?" required>
            <select name="heardFrom" className={`${styles.input} ${styles.select}`} defaultValue="" required>
              <option value="" disabled>
                Select one
              </option>
              {HEARD_FROM.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
          </Field>
        </div>
      </section>

      <section className={styles.section}>
        <SectionHead icon="car" title="Vehicle" help="Tell us which vehicle you'd like us to service." />
        <div className={styles.grid}>
          <Field label="Make" required>
            <input name="make" className={styles.input} placeholder="Toyota" maxLength={40} required />
          </Field>
          <Field label="Model" required>
            <input name="model" className={styles.input} placeholder="Vios" maxLength={40} required />
          </Field>
          <Field label="Plate number">
            <input name="plate" className={`${styles.input} ${styles.mono}`} placeholder="ABC 1234" maxLength={12} />
          </Field>
          <Field label="Year">
            <input name="year" inputMode="numeric" className={styles.input} placeholder="2019" maxLength={4} />
          </Field>
        </div>
      </section>

      <section className={styles.section}>
        <SectionHead
          icon="calendar"
          title="Service and preferred time"
          help="Availability is checked again when you submit your request."
        />
        <div className={styles.grid}>
          <div className={styles.full}>
            <Field label="Service" required>
              <input
                name="service"
                className={styles.input}
                placeholder="e.g., PMS, checkup, brake inspection"
                maxLength={120}
                required
              />
            </Field>
          </div>
          <Field label="Preferred date" required>
            <input
              name="date"
              type="date"
              className={styles.input}
              min={dateRange.min}
              max={dateRange.max}
              value={date}
              onChange={(event) => {
                setDate(event.target.value);
                setHour("");
              }}
              required
            />
            {dateNote && (
              <span className={styles.hintWarn}>
                <Icon name="alert-triangle" size={12} style={{ marginTop: 1, flex: "0 0 auto" }} />
                {dateNote}
              </span>
            )}
          </Field>
          <Field label="Preferred time" required>
            <select
              name="hour"
              className={`${styles.input} ${styles.select}`}
              value={selectedHour}
              onChange={(event) => setHour(event.target.value)}
              disabled={hours.length === 0}
              required
            >
              <option value="" disabled>
                {date && hours.length === 0 ? "No times available" : "Select a time"}
              </option>
              {hours.map((slot) => (
                <option key={slot} value={slot}>
                  {formatSlotTime(slot)}
                </option>
              ))}
            </select>
            {!date && <span className={styles.hint}>Choose a date to see the times still open.</span>}
          </Field>
          <div className={styles.full}>
            <Field label="Notes for the service team">
              <textarea
                name="notes"
                className={`${styles.input} ${styles.textarea}`}
                placeholder="Describe any concerns or requests."
                maxLength={1000}
              />
            </Field>
          </div>
        </div>
      </section>

      <div className={styles.footer}>
        <p className={styles.footerNote}>
          After submission, you&apos;ll receive a unique booking code. Keep it with your mobile
          number to retrieve your appointment status.
        </p>
        <Button type="submit" icon={pending ? undefined : "send"} disabled={pending}>
          {pending ? "Sending…" : "Submit booking request"}
        </Button>
      </div>
    </form>
  );
}

function Confirmation({ slug, code, when }: { slug: string; code: string; when: string }) {
  const [copied, setCopied] = useState<"yes" | "no" | null>(null);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied("yes");
    } catch {
      setCopied("no");
    }
  };

  return (
    <div className={styles.card} role="status">
      <div className={styles.sectionHead} style={{ marginBottom: 0 }}>
        <span className={`${styles.sectionIcon} ${styles.successIcon}`}>
          <Icon name="check-circle-2" size={16} />
        </span>
        <span>
          <h2 className={styles.sectionTitle}>Request sent</h2>
          <p className={styles.sectionHelp}>
            Your booking is pending until our team confirms it. Keep this code with your mobile
            number to check on it.
          </p>
        </span>
      </div>

      <div className={styles.codeBox}>
        <span>
          <span className={styles.codeLabel}>Your booking code</span>
          <span className={styles.code}>{code}</span>
        </span>
        <Button variant="secondary" size="sm" icon={copied === "yes" ? "check" : "copy"} onClick={copy}>
          {copied === "yes" ? "Copied" : "Copy code"}
        </Button>
      </div>
      {copied === "no" && (
        <p className={styles.hint} style={{ margin: "-8px 0 16px" }}>
          Copying isn&apos;t available here. Please write the code down.
        </p>
      )}

      <dl className={styles.summary}>
        <dt>Requested time</dt>
        <dd>{when} (Asia/Manila)</dd>
        <dt>Status</dt>
        <dd>
          <Badge tone="warning" icon="clock">
            Waiting for confirmation
          </Badge>
        </dd>
      </dl>

      <div className={styles.footer}>
        <p className={styles.footerNote}>You can check the status any time with your code and mobile number.</p>
        <Link href={`/book/${slug}/status`} className={`${styles.linkButton} ${styles.linkButtonLarge}`}>
          Retrieve your booking
        </Link>
      </div>
    </div>
  );
}

export function ErrorNotice({ children }: { children: ReactNode }) {
  return (
    <div role="alert" className={styles.error}>
      <span className={styles.errorIcon}>
        <Icon name="circle-alert" size={15} />
      </span>
      <span>{children}</span>
    </div>
  );
}

export function SectionHead({ icon, title, help }: { icon: string; title: string; help: string }) {
  return (
    <div className={styles.sectionHead}>
      <span className={styles.sectionIcon}>
        <Icon name={icon} size={15} />
      </span>
      <span>
        <h2 className={styles.sectionTitle}>{title}</h2>
        <p className={styles.sectionHelp}>{help}</p>
      </span>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: ReactNode }) {
  return (
    <label className={styles.field}>
      <span className={styles.label}>
        {label}
        {required && <span className={styles.required}> *</span>}
      </span>
      {children}
    </label>
  );
}
