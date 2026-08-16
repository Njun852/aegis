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

Open [http://localhost:3000](http://localhost:3000) to view the app.

## Folder structure

```
src/
  app/            App Router routes
  components/     Shared/reusable UI components
  components/ui/  Base design-system components (buttons, cards, inputs, etc.)
  lib/            Utilities, API clients, helper functions
  lib/db/         MongoDB client singleton (native driver + Mongoose connection helper)
  types/          Shared TypeScript types/interfaces
  hooks/          Custom React hooks
  styles/         Global styles, Tailwind config extensions
```

This is currently infrastructure-only scaffolding — no pages, components, or database models have been built yet.
