import type {
  BookingRange,
  BookingStatus,
  BookingStatusStyle,
} from "@/types";

export const BOOKING_STATUSES: BookingStatus[] = [
  "Confirmed",
  "Pending",
  "In progress",
  "Completed",
  "Cancelled",
];

export const BOOKING_STATUS_STYLES: Record<BookingStatus, BookingStatusStyle> = {
  Confirmed: { tone: "positive", dot: "var(--status-positive)" },
  Pending: { tone: "warning", dot: "var(--status-warning)" },
  "In progress": { tone: "accent", dot: "var(--accent-primary)" },
  Completed: { tone: "neutral", dot: "var(--gray-400)" },
  Cancelled: { tone: "negative", dot: "var(--status-negative)" },
};

export const BOOKING_RANGES: BookingRange[] = [
  "This week",
  "Next 30 days",
  "Past 30 days",
  "All time",
];

export const DEFAULT_BOOKING_RANGE: BookingRange = "Next 30 days";

/** How a booking reached us. Offered in the New Booking form. */
export const BOOKING_CHANNELS = [
  "Website form",
  "Phone",
  "Email",
  "Referral",
  "Walk-in",
  "Internal",
];

/**
 * SEED FIXTURE ONLY — `scripts/seed.ts` turns these into real documents on a
 * fresh database, dated relative to the day it runs so the screen is never
 * stuck in a past week. No screen imports this.
 *
 * `dayOffset` is days from today; `hour`/`minute` are local wall-clock.
 */
export interface BookingSeed {
  customer: string;
  company: string;
  email: string;
  service: string;
  dayOffset: number;
  hour: number;
  minute: number;
  durationMinutes: number;
  staff: string;
  valueCents: number;
  status: BookingStatus;
  channel: string;
  notes: string;
}

export const BOOKING_SEEDS: BookingSeed[] = [
  {
    customer: "Sofia Alvarez",
    company: "Kestrel Haulage",
    email: "sofia@kestrelhaulage.com",
    service: "Full service & MOT",
    dayOffset: 0,
    hour: 9,
    minute: 0,
    durationMinutes: 45,
    staff: "Ahmed Ben",
    valueCents: 24000,
    status: "Confirmed",
    channel: "Website form",
    notes:
      "Fleet car due its annual MOT. Customer asked for a quote on rear discs at the same time.",
  },
  {
    customer: "Marcus Reed",
    company: "Calder & Sons",
    email: "m.reed@caldersons.com",
    service: "Fleet inspection",
    dayOffset: 0,
    hour: 11,
    minute: 0,
    durationMinutes: 120,
    staff: "Dana Whitfield",
    valueCents: 78000,
    status: "In progress",
    channel: "Phone",
    notes:
      "Annual inspection for six vehicles. Two units flagged for brake wear at the last service.",
  },
  {
    customer: "Priya Nair",
    company: "Ardent Cover",
    email: "p.nair@ardentcover.com",
    service: "Warranty assessment",
    dayOffset: 0,
    hour: 15,
    minute: 30,
    durationMinutes: 30,
    staff: "Ahmed Ben",
    valueCents: 0,
    status: "Pending",
    channel: "Email",
    notes:
      "Assessing a gearbox claim under warranty. No charge — goodwill inspection.",
  },
  {
    customer: "Tomás Ruiz",
    company: "Salvo Industries",
    email: "tomas@salvoindustries.com",
    service: "Diagnostics",
    dayOffset: 1,
    hour: 10,
    minute: 0,
    durationMinutes: 60,
    staff: "Léa Fontaine",
    valueCents: 15000,
    status: "Confirmed",
    channel: "Website form",
    notes:
      "Intermittent warning light on the dash. Bring the reader for the newer ECU.",
  },
  {
    customer: "Hannah Kim",
    company: "AUTOBLITZ",
    email: "h.kim@autoblitz.com",
    service: "Courtesy vehicle handover",
    dayOffset: 1,
    hour: 13,
    minute: 0,
    durationMinutes: 90,
    staff: "Dana Whitfield",
    valueCents: 42000,
    status: "Confirmed",
    channel: "Internal",
    notes: "Handover and walkaround for the replacement courtesy car.",
  },
  {
    customer: "Daniel Osei",
    company: "Coastline Foods",
    email: "d.osei@coastlinefoods.com",
    service: "Refrigeration unit service",
    dayOffset: 2,
    hour: 8,
    minute: 0,
    durationMinutes: 180,
    staff: "Léa Fontaine",
    valueCents: 115000,
    status: "Pending",
    channel: "Referral",
    notes:
      "Needs the compliance certificate reissued before their retail contract signs.",
  },
  {
    customer: "Elena Petrova",
    company: "Meridian Retail",
    email: "elena@meridianretail.com",
    service: "Full service & MOT",
    dayOffset: 2,
    hour: 14,
    minute: 0,
    durationMinutes: 45,
    staff: "Ahmed Ben",
    valueCents: 24000,
    status: "Cancelled",
    channel: "Website form",
    notes:
      "Cancelled by the customer — rebooking next month after their peak season.",
  },
  {
    customer: "Jonas Weber",
    company: "Alpine Parts",
    email: "j.weber@alpineparts.eu",
    service: "Fleet inspection",
    dayOffset: 3,
    hour: 9,
    minute: 30,
    durationMinutes: 120,
    staff: "Dana Whitfield",
    valueCents: 78000,
    status: "Confirmed",
    channel: "Phone",
    notes:
      "Two vans in for a pre-delivery check ahead of the September contract start.",
  },
  {
    customer: "Nina Okafor",
    company: "Delta Freight",
    email: "n.okafor@deltafreight.com",
    service: "Tyres & alignment",
    dayOffset: 5,
    hour: 10,
    minute: 30,
    durationMinutes: 60,
    staff: "Marco Silva",
    valueCents: 32000,
    status: "Confirmed",
    channel: "Website form",
    notes: "Four-wheel alignment plus two replacement tyres on the front axle.",
  },
  {
    customer: "Peter Lindqvist",
    company: "Nordic Timber",
    email: "p.lindqvist@nordictimber.se",
    service: "Bodywork estimate",
    dayOffset: 9,
    hour: 9,
    minute: 0,
    durationMinutes: 30,
    staff: "Ivy Chen",
    valueCents: 18000,
    status: "Pending",
    channel: "Email",
    notes: "Panel damage to the nearside door. Estimate for an insurance claim.",
  },
  {
    customer: "Amara Diallo",
    company: "Lumen Health",
    email: "a.diallo@lumenhealth.io",
    service: "Diagnostics",
    dayOffset: -3,
    hour: 11,
    minute: 0,
    durationMinutes: 60,
    staff: "Léa Fontaine",
    valueCents: 15000,
    status: "Completed",
    channel: "Referral",
    notes: "Traced the fault to a failing sensor. Quote sent the same afternoon.",
  },
  {
    customer: "Victor Salas",
    company: "Salas Produce",
    email: "victor@salasproduce.mx",
    service: "Refrigeration unit service",
    dayOffset: -4,
    hour: 8,
    minute: 0,
    durationMinutes: 180,
    staff: "Léa Fontaine",
    valueCents: 115000,
    status: "Completed",
    channel: "Email",
    notes: "Passed with two minor findings — logged for the next visit.",
  },
  {
    customer: "Rosa Marín",
    company: "Puerto Verde",
    email: "rosa@puertoverde.es",
    service: "Full service & MOT",
    dayOffset: -8,
    hour: 16,
    minute: 0,
    durationMinutes: 45,
    staff: "Marco Silva",
    valueCents: 26000,
    status: "Completed",
    channel: "Referral",
    notes: "Routine service. Advisory on front pads at the next interval.",
  },
];
