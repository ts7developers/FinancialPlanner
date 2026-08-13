# The Reconciliation

Personal finance reconciliation app for a graduate accountant on a fortnightly pay cycle — a ledger:
log expenses as a subledger, close each fortnight, reconcile actual vs plan. Next.js 16 + TypeScript +
Supabase (Postgres, Auth, Storage) + Recharts, deployed to Vercel as an installable PWA.

Ported from the `_prototype/FinancialPlanTracker.jsx` single-file prototype — see the build spec for
the full design (period model, AU tax engine, category defaults, data model).

## Setup

### 1. Create a Supabase project

1. Sign up / log in at [supabase.com](https://supabase.com) and create a new project.
2. In **Project Settings → API**, copy the **Project URL** and the **anon public** key.
3. In the SQL Editor, run the migration at [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql).
   This creates all tables, RLS policies, the new-user bootstrap trigger (seeds default plan settings
   and budget categories on signup), and a private `payslips` storage bucket.
4. In **Authentication → URL Configuration**, add `http://localhost:3000/auth/callback` (and later your
   production `.../auth/callback` URL) to the allowed redirect URLs. The default Magic Link email
   template works as-is — no template edit needed.

### 2. Environment variables

Copy `.env.local.example` to `.env.local` and fill in:

```
NEXT_PUBLIC_SUPABASE_URL=       # from step 1.2
NEXT_PUBLIC_SUPABASE_ANON_KEY=  # from step 1.2
NEXT_PUBLIC_SITE_URL=http://localhost:3000
ANTHROPIC_API_KEY=              # for payslip parsing — server-side only, never sent to the client
```

### 3. Run

```bash
npm install
npm test    # Vitest — period/tax engine baseline figures
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). First sign-in: enter your email, click the link that
arrives, then set a 6-digit PIN. That PIN is remembered on this device (via localStorage) — returning
visits skip straight to a PIN prompt, no email round trip. "Not you? Use email instead" on the PIN screen
resets to the email flow (e.g. on a new device, or if you forget the PIN — verifying by email again lets
you set a new one).

## Project structure

- `lib/period.ts`, `lib/tax.ts`, `lib/categories.ts` — the fortnightly period engine, AU tax engine, and
  default expense categories. Pure functions, unit-tested against the build spec's baseline figures.
- `lib/derive.ts` — cross-tab derived data (plan-vs-actual variances, deposit trajectory, logged-by-category
  rollups), also pure functions ported from the prototype's memoized calculations.
- `lib/supabase/` — browser client, server client, and the session-refresh helper used by `proxy.ts`
  (Next.js 16 renamed Middleware to Proxy — same mechanism, new filename).
- `lib/data/fetchAppData.ts` — the one server-side fetch that loads everything a signed-in user needs;
  `components/AppDataProvider.tsx` holds it in a client context so all tabs share the same state and
  derived math, matching the prototype's single-component architecture.
- `app/(auth)/` — magic-link + PIN sign-in (`lib/pinAuth.ts` remembers the email on-device);
  `app/auth/callback/` exchanges the link's code for a session (PKCE flow).
- `app/(app)/` — the five tabs (Overview, Expenses, Reconcile, Accounts, Plan) behind auth.
- `app/manifest.ts`, `app/icon.tsx`, `app/apple-icon.tsx`, `app/icons/` — PWA manifest and generated
  icons (via `next/og`'s `ImageResponse` — no image assets to maintain). `public/sw.js` is the service
  worker, registered from the root layout.
- `supabase/migrations/` — SQL migrations, run manually in the Supabase SQL editor (or via the Supabase
  CLI once linked to the project).

## Deploying

Verify locally against a real Supabase project first (magic-link + PIN sign-in, data persists across a
refresh) before deploying.

1. Push this repo to GitHub (or another Vercel-supported git provider).
2. In Vercel, **Add New → Project** and import the repo. Framework preset auto-detects Next.js — no
   build command changes needed.
3. Add the environment variables from `.env.local` to the Vercel project (**Settings → Environment
   Variables**), with one change: set `NEXT_PUBLIC_SITE_URL` to the production URL Vercel assigns (or
   your custom domain).
4. In Supabase **Authentication → URL Configuration**, add `<production-url>/auth/callback` to the
   allowed redirect URLs (alongside the localhost one from setup step 1.4).
5. Deploy. Sign in on the production URL the same way as locally (email link once, then a PIN) —
   localStorage is per-origin, so the PIN is set again the first time on a new domain/device.
6. Test "Add to Home Screen" on a phone against the deployed HTTPS URL — PWA install prompts generally
   require a real HTTPS origin, not `localhost`.

The `ANTHROPIC_API_KEY` env var only needs to exist on Vercel (server-side) — it's read inside the
payslip-parsing Route Handler and never sent to the client.

General information to help track finances — not financial, tax, or credit advice.
