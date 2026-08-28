import type {
  ComposeDraftSuggestion,
  MailMessage,
  MailMonitorEntry,
  MailPriority,
  MailPriorityStyle,
} from "@/types";

/**
 * Per-priority styling: badge tone, rail dot, list-row accent and icon.
 * Colors come from the data-viz sequence so they never invent a new hue.
 */
export const PRIORITY_STYLES: Record<MailPriority, MailPriorityStyle> = {
  Urgent: {
    tone: "negative",
    dot: "#D92D20",
    accent: "#D92D20",
    icon: "circle-alert",
    color: "var(--viz-6)",
  },
  High: {
    tone: "warning",
    dot: "#C77A0E",
    accent: "#C77A0E",
    icon: "alert-triangle",
    color: "var(--viz-4)",
  },
  Normal: {
    tone: "accent",
    dot: "#2C6EF2",
    accent: "transparent",
    icon: "mail",
    color: "var(--viz-1)",
  },
  Low: {
    tone: "neutral",
    dot: "#A3ACBB",
    accent: "transparent",
    icon: "inbox",
    color: "var(--viz-2)",
  },
};

/** Sample inbox. Replace with the Gmail retrieval once the integration lands. */
export const MESSAGES: MailMessage[] = [
  {
    id: "m1",
    from: "Sofia Alvarez",
    email: "sofia@kestrelhaulage.com",
    label: "Suppliers",
    subject: "Contract renewal — Kestrel Haulage, response needed by Friday",
    time: "09:42",
    date: "May 31, 2026 · 09:42 AM",
    priority: "Urgent",
    unread: true,
    aiSummary:
      "Kestrel Haulage wants to renew the freight contract at a 6% rate increase effective July 1, with a signed decision needed by Friday. Sofia will hold the increase at 3% for a 24-month commitment.",
    actionItems: [
      "Decide by Fri May 5",
      "Compare 12 vs 24 month terms",
      "Loop in Finance",
    ],
    body: [
      "Hi Ahmed — following up on our call about the freight agreement expiring at the end of June.",
      "Our board approved a 6% rate adjustment for 12-month renewals. If AUTOBLITZ can commit to 24 months, I can hold the increase at 3% and keep the current fuel surcharge cap in place.",
      "I need a decision by Friday to get it through our contracts team before the quarter closes. Happy to jump on a call if that helps.",
    ],
    replies: [
      "Confirm the 24-month term at 3%",
      "Ask for a call Thursday morning",
      "Request the full rate card first",
    ],
  },
  {
    id: "m2",
    from: "PayStream Billing",
    email: "billing-noreply@paystream.io",
    label: "Finance",
    subject: "Invoice #INV-40219 is 8 days overdue ($12,480.00)",
    time: "08:15",
    date: "May 31, 2026 · 08:15 AM",
    priority: "Urgent",
    unread: true,
    aiSummary:
      "Invoice INV-40219 for $12,480.00 is 8 days past due and a 1.5% monthly late fee begins accruing on June 3. Reply with a remittance reference if it was already paid.",
    actionItems: ["Pay before Jun 3", "Verify PO match"],
    body: [
      "This is a reminder that invoice #INV-40219 issued May 15, 2026 remains unpaid.",
      "Amount due: $12,480.00. A 1.5% monthly late fee applies from June 3, 2026.",
      "If this invoice has already been paid, reply with the remittance reference and we will reconcile.",
    ],
    replies: [
      "Confirm payment scheduled for Jun 1",
      "Ask for a 7-day extension",
      "Dispute — PO mismatch",
    ],
  },
  {
    id: "m3",
    from: "Marcus Webb",
    email: "m.webb@caldersons.com",
    label: "Sales",
    subject: "Re: Fleet expansion quote — 14 units",
    time: "Yesterday",
    date: "May 30, 2026 · 04:20 PM",
    priority: "High",
    unread: true,
    aiSummary:
      "Marcus is approved for 14 units but needs delivery split 8 in Q3 and 6 in Q4, and asks whether the volume discount still holds on a staggered schedule.",
    actionItems: ["Confirm split delivery", "Re-quote discount"],
    body: [
      "Thanks for the revised quote. Leadership is on board with 14 units.",
      "One constraint: we can only take 8 units in Q3 and the remaining 6 in Q4. Does the volume discount still hold if delivery is staggered?",
      "If yes, send the updated paperwork and we will countersign this week.",
    ],
    replies: [
      "Yes — discount holds, paperwork attached",
      "Offer 10 in Q3 to keep the tier",
      "Ask for a PO before re-quoting",
    ],
  },
  {
    id: "m4",
    from: "Priya Raghavan",
    email: "priya@autoblitz.com",
    label: "Internal",
    subject: "Weekly ops report — week 22",
    time: "Yesterday",
    date: "May 30, 2026 · 11:05 AM",
    priority: "Normal",
    unread: false,
    aiSummary:
      "Ops throughput is up 4.2% week over week, two vehicles cleared unscheduled maintenance, and the storm backlog cleared with no missed SLAs. No action required.",
    actionItems: ["No action required"],
    body: [
      "Week 22 summary attached. Highlights below.",
      "Throughput +4.2% WoW. Two vehicles (FL-118, FL-204) went into unscheduled maintenance mid-week; both are back in service.",
      "Route backlog from Tuesday storms cleared by Thursday afternoon with no missed SLAs.",
    ],
    replies: [
      "Thanks — nothing needed",
      "Ask about FL-204 root cause",
      "Request SLA breakdown",
    ],
  },
  {
    id: "m5",
    from: "Ads Performance",
    email: "noreply@adsplatform.com",
    label: "Marketing",
    subject: "Spring Fleet Promo exceeded daily budget 3 days running",
    time: "Mon",
    date: "May 28, 2026 · 07:00 AM",
    priority: "High",
    unread: false,
    aiSummary:
      "Spring Fleet Promo overspent its daily cap by an average of 18% for three days while cost per lead fell 22% — likely worth raising the cap rather than pausing.",
    actionItems: ["Review daily cap", "Check CPL trend"],
    body: [
      'Campaign "Spring Fleet Promo" exceeded its daily budget on May 25, 26 and 27.',
      "Average overspend: 18%. Cost per lead over the same window fell from $41.20 to $32.05.",
      "Recommended action: increase the daily cap or narrow the audience to hold spend flat.",
    ],
    replies: [
      "Raise cap by 20%",
      "Hold spend, narrow audience",
      "Pause and review Monday",
    ],
  },
  {
    id: "m6",
    from: "Elena Fischer",
    email: "elena.fischer@vantageins.com",
    label: "Compliance",
    subject: "Fleet insurance certificate renewal documents",
    time: "Mon",
    date: "May 28, 2026 · 03:12 PM",
    priority: "Normal",
    unread: false,
    aiSummary:
      "Ardent Cover needs an updated driver roster and odometer readings for 11 vehicles before the July 15 renewal; returning them by June 20 holds the current premium band.",
    actionItems: ["Send roster by Jun 20", "Collect odometer readings"],
    body: [
      "Attached are the renewal forms for your fleet policy expiring July 15, 2026.",
      "We need an updated driver roster and current odometer readings for the 11 covered vehicles.",
      "Returning these by June 20 keeps your current premium band.",
    ],
    replies: [
      "Will send by Jun 20",
      "Ask which vehicles are missing data",
      "Request a call to review coverage",
    ],
  },
  {
    id: "m7",
    from: "Tomás Ruiz",
    email: "tomas@ruizfabrication.mx",
    label: "Suppliers",
    subject: "Lead time update: brackets delayed to 6 weeks",
    time: "Fri",
    date: "May 25, 2026 · 10:48 AM",
    priority: "High",
    unread: false,
    aiSummary:
      "Bracket lead time slipped from 4 to 6 weeks on a steel supply issue. Tomás can air-freight 40% of the order for about $1,850 to hold the original date.",
    actionItems: ["Decide on air freight", "Update install schedule"],
    body: [
      "Unfortunately our steel supplier pushed our intake by two weeks, so bracket lead time is now 6 weeks.",
      "I can air-freight 40% of the order to arrive on the original date, with an added cost of roughly $1,850.",
      "Let me know how you want to proceed and I will lock the production slot.",
    ],
    replies: [
      "Approve partial air freight",
      "Hold — sea freight is fine",
      "Ask for a revised full schedule",
    ],
  },
  {
    id: "m8",
    from: "Industry Weekly",
    email: "news@industryweekly.com",
    label: "Updates",
    subject: "Industry Weekly: fleet electrification incentives expand",
    time: "Fri",
    date: "May 25, 2026 · 06:00 AM",
    priority: "Low",
    unread: false,
    aiSummary:
      "Newsletter covering expanded regional incentives for commercial EV fleets. Informational only.",
    actionItems: ["No action required"],
    body: [
      "This week: three regions expanded purchase incentives for commercial EV fleets.",
      "Also inside: charging depot economics, and a short read on residual values.",
      "You are receiving this because you subscribed to Industry Weekly.",
    ],
    replies: ["Archive", "Forward to Finance", "Unsubscribe"],
  },
];

export const MAIL_MONITORING: MailMonitorEntry[] = [
  {
    label: "Gmail API — authorized",
    meta: "scope: gmail.readonly, gmail.send",
    dot: "#16A34A",
  },
  {
    label: "Last full retrieval",
    meta: "09:42 · 128 threads · 1.4s",
    dot: "#16A34A",
  },
  {
    label: "AI summarization queue",
    meta: "0 pending · avg 620ms",
    dot: "#16A34A",
  },
  {
    label: "Retrieval errors (24h)",
    meta: "2 · 429 rateLimitExceeded",
    dot: "#D92D20",
  },
];

/** Order the folder rail lists labels in. "Inbox" always comes first. */
export const MAIL_FOLDERS: { label: string; icon: string }[] = [
  { label: "Inbox", icon: "inbox" },
  { label: "Suppliers", icon: "truck" },
  { label: "Finance", icon: "credit-card" },
  { label: "Sales", icon: "users" },
  { label: "Marketing", icon: "megaphone" },
  { label: "Compliance", icon: "file-text" },
];

/** "AI Assist" suggestions in the compose modal — replies tied to existing threads. */
export const COMPOSE_DRAFT_SUGGESTIONS: ComposeDraftSuggestion[] = [
  {
    label: "Reply to Harbor renewal",
    to: "sofia@kestrelhaulage.com",
    subject: "Re: Contract renewal — Kestrel Haulage",
    body: "Hi Sofia,\n\nWe are prepared to commit to the 24-month term at the 3% adjustment, provided the fuel surcharge cap carries over unchanged.\n\nSend the paperwork and we will countersign before Friday.\n\nBest,\nAhmed",
  },
  {
    label: "Chase overdue invoice",
    to: "billing-noreply@paystream.io",
    subject: "INV-40219 — payment scheduled",
    body: "Hello,\n\nInvoice INV-40219 is scheduled for payment on June 1, ahead of the June 3 late-fee date. Remittance reference to follow once settled.\n\nRegards,\nAhmed Ben",
  },
  {
    label: "Confirm split delivery",
    to: "m.webb@caldersons.com",
    subject: "Re: Fleet expansion quote — 14 units",
    body: "Hi Marcus,\n\nThe volume discount holds on the staggered schedule: 8 units in Q3 and 6 in Q4. Updated paperwork is attached for countersignature.\n\nThanks,\nAhmed",
  },
];
