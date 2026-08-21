# AEGIS

A multi-module operations app (Dashboard, Mail, Ads, CRM, Inventory, Fleet) built on Next.js.

## Setup

```bash
git clone <repo-url>
cd aegis
npm install
cp .env.local.example .env.local
```

Fill in the values in `.env.local` (MongoDB connection, OAuth credentials, etc.), then start the dev server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the app. `/` redirects to `/dashboard`.

## Routes

| Route        | What it is                                                                    |
| ------------ | ----------------------------------------------------------------------------- |
| `/dashboard` | KPI row, revenue chart, bookings split, email/alerts/ads summaries, AI insight |
| `/mail`      | Three-pane Gmail-style workspace: folder rail, thread list, thread detail      |

Both live under the `(app)` route group, which supplies the persistent shell
(collapsible sidebar + top bar) via `src/app/(app)/layout.tsx`, gated behind a
sign-in screen (`src/components/auth`). Signing out from the sidebar user menu
returns to the gate; there is no real session yet — see **Auth** below.

Mail also has a Compose modal (`src/components/mail/compose-modal.tsx`), opened
from the "Compose" button in the folder rail, with three canned "AI Assist"
draft suggestions tied to existing threads.

## Auth

`src/components/auth/auth-provider.tsx` is a client-side stand-in for real
session state — `isAuthed` starts `false`, and `signIn()`/`signOut()` just flip
it. `LoginScreen` owns the form (email/password, validation, the simulated
700ms sign-in delay); `AuthGate` renders it instead of the app shell while
signed out.

This deliberately diverges from the source design, which mounts the app shell
and layers the login screen on top (`z-index: 90`) so both exist in the DOM at
once — fine for a design canvas, wrong for a real app that shouldn't render
protected content while signed out. Here `AuthGate` renders one or the other,
never both.

**Not built yet**, both marked `AUTH INTEGRATION POINT` in the code: real
credential checking, session persistence (cookie/JWT), and route protection
via middleware (right now an unauthenticated user hitting `/dashboard`
directly still gets the gate, but only because the client-side check runs
before anything renders — a `middleware.ts` redirect would be the real fix).

## Design system

The UI comes from the **AEGIS AI Design System** published at claude.ai/design and
imported into this repo. Two things carry it:

- `src/styles/tokens/*.css` — colors, typography, spacing, elevation and motion as
  CSS custom properties. These are the source of truth; restyle here, not in components.
- `src/components/ui/*` — the design system primitives (Button, Card, StatCard,
  BarChart, ListRow, InsightPanel, …), ported to typed React components that read
  those tokens.

Deliberate changes made during the port:

- **Fonts** are self-hosted with `next/font/google` (Plus Jakarta Sans, Inter,
  JetBrains Mono) instead of a Google Fonts `@import`. `tokens/typography.css`
  points `--font-display` / `--font-body` / `--font-mono` at the generated variables.
- **Icons** come from the `lucide-react` package instead of CSS-masking SVGs off a
  CDN. Same Lucide drawings, but self-hosted — the CDN mask approach is blocked by
  CORS in the browser. `Icon` still takes the design system's kebab-case names.
- **Layout** uses normal page scrolling and CSS breakpoints rather than the
  zoom-to-fit script the design canvas used to squeeze the dashboard into a fixed
  viewport. The `wide` Tailwind breakpoint (1240px) is where the dashboard bands and
  the mail three-pane switch on, matching the design's own threshold.

## Folder structure

```
src/
  app/                  App Router routes
    (app)/              Signed-in shell (sidebar + top bar) wrapping dashboard and mail
  components/ui/        Design system primitives, token-driven
  components/auth/      Sign-in gate: provider, login screen, gate component
  components/layout/    App shell: sidebar, top bar, shared sync state
  components/dashboard/ Dashboard cards
  components/mail/      Mail rail, thread list, thread detail, compose modal
  lib/                  Utilities and domain helpers (lib/mail.ts)
  lib/data/             Sample data standing in for the real backend
  lib/db/               MongoDB client singleton (native driver + Mongoose helper)
  types/                Shared TypeScript types/interfaces
  hooks/                Custom React hooks
  styles/               globals.css plus the design system tokens
```

Data is currently static sample content in `src/lib/data`. The Gmail integration,
persistence and auth are not built yet.
