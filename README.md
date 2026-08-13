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
- `lib/supabase/` — browser client, server client, and the session-refresh helper used by `proxy.ts`
  (Next.js 16 renamed Middleware to Proxy — same mechanism, new filename).
- `app/(auth)/` — magic-link sign-in.
- `app/(app)/` — the five tabs (Overview, Expenses, Reconcile, Accounts, Plan) behind auth.
- `supabase/migrations/` — SQL migrations, run manually in the Supabase SQL editor (or via the Supabase
  CLI once linked to the project).

## Deploying

Not yet wired up — see the build spec §9 step 7/8. Once the app is verified working locally against a
real Supabase project, deploy to Vercel and set the same environment variables there (with
`NEXT_PUBLIC_SITE_URL` set to the production URL, and the magic-link redirect URLs updated in Supabase).

General information to help track finances — not financial, tax, or credit advice.
