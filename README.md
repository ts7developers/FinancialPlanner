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
4. In **Authentication → Email Templates → Magic Link**, change the confirmation URL to:

   ```
   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/overview
   ```

   This is required — the app's `/auth/confirm` route expects `token_hash`/`type` params, not
   Supabase's default confirmation link format.
5. In **Authentication → URL Configuration**, add your local dev URL (`http://localhost:3000`) and your
   eventual production URL to the allowed redirect URLs.

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

Open [http://localhost:3000](http://localhost:3000). Sign in with a magic link (no password).

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
- `app/(auth)/` — magic-link sign-in.
- `app/(app)/` — the five tabs (Overview, Expenses, Reconcile, Accounts, Plan) behind auth.
- `app/manifest.ts`, `app/icon.tsx`, `app/apple-icon.tsx`, `app/icons/` — PWA manifest and generated
  icons (via `next/og`'s `ImageResponse` — no image assets to maintain). `public/sw.js` is the service
  worker, registered from the root layout.
- `supabase/migrations/` — SQL migrations, run manually in the Supabase SQL editor (or via the Supabase
  CLI once linked to the project).

## Deploying

Verify locally against a real Supabase project first (magic-link sign-in round trip, data persists
across a refresh) before deploying.

1. Push this repo to GitHub (or another Vercel-supported git provider).
2. In Vercel, **Add New → Project** and import the repo. Framework preset auto-detects Next.js — no
   build command changes needed.
3. Add the environment variables from `.env.local` to the Vercel project (**Settings → Environment
   Variables**), with one change: set `NEXT_PUBLIC_SITE_URL` to the production URL Vercel assigns (or
   your custom domain).
4. In Supabase **Authentication → URL Configuration**, add the production URL to the allowed redirect
   URLs (alongside `http://localhost:3000` for local dev).
5. Deploy. Test the magic-link flow against the production URL — the email link must round-trip through
   `/auth/confirm` on the *deployed* domain, so this only fully works once `NEXT_PUBLIC_SITE_URL` and the
   Supabase redirect allowlist both point at it.
6. Test "Add to Home Screen" on a phone against the deployed HTTPS URL — PWA install prompts generally
   require a real HTTPS origin, not `localhost`.

The `ANTHROPIC_API_KEY` env var only needs to exist on Vercel (server-side) — it's read inside the
payslip-parsing Route Handler and never sent to the client.

General information to help track finances — not financial, tax, or credit advice.
