# Ash

Team to-do and plan manager. Multi-tenant workspaces, projects broken into
tasks and subtasks, planned across list / board / calendar / timeline views,
with a set of dashboards over the top.

**Status: Phase 4 complete — collaboration and realtime.** Phases 5–7 (planning
layer, dashboards, hardening) are still ahead; the full phase plan lives in
`docs/PLAN.md`.

---

## What works today

- **Accounts and workspaces** — email/password sign-in, magic link, OAuth hooks,
  password reset. Workspaces with `OWNER` / `ADMIN` / `MEMBER` / `GUEST` roles,
  tokened email invitations, member management, avatar upload.
- **Tasks** — projects with a key prefix, sections, subtasks, multi-assignee,
  priority, dates, estimates, labels and checklists. Drag reordering on a
  fractional rank, inline edit, multi-select bulk actions, saved filters in the
  URL, full-text search, and quick-add that parses `tomorrow 5pm !high @sam`.
- **Views** — list, board, calendar, table, My Tasks and a `⌘K` palette, all
  reading the same filtered dataset with the view and filters in the URL.
- **Collaboration** — threaded comments with `@`-mentions and reactions, file
  attachments through signed URLs, an activity feed written by the action
  wrapper, an in-app inbox with email preferences, and realtime updates plus
  presence avatars on an open task.

---

## Stack

| Layer     | Choice                                                    |
| --------- | --------------------------------------------------------- |
| Framework | Next.js 16 (App Router) + React 19, TypeScript strict     |
| Styling   | Tailwind CSS v4, tokens in `app/globals.css`              |
| Fonts     | Playpen Sans (display) + Inter (UI/data), via `next/font` |
| Database  | Supabase Postgres, Prisma for schema + queries            |
| Auth      | Supabase Auth via `@supabase/ssr`                         |
| Files     | Supabase Storage                                          |
| Realtime  | Supabase Realtime                                         |
| Motion    | `motion` (ex-Framer Motion)                               |
| Tests     | Vitest (unit) + Playwright (e2e)                          |

---

## Getting started

```bash
cp .env.example .env.local     # then fill in the values
npm install
npm run dev                    # http://localhost:3000 → /design
```

`npm run verify` runs everything CI runs: typecheck, lint, format check,
contrast audit, unit tests.

### Provisioning Supabase (once)

`SUPABASE_ACCESS_TOKEN` is an **account-level, unscoped** credential — it can
create or delete any project in any org on the account. It is used only by the
CLI for provisioning and migrations, is never imported by application code, and
never reaches the browser. Keep it in `.env.local` (gitignored) and **rotate it
once provisioning is done**: <https://supabase.com/dashboard/account/tokens>

```bash
npx supabase login --token "$SUPABASE_ACCESS_TOKEN"
npx supabase projects create ash --org-id <org> --region <region> --db-password <pw>
npx supabase link --project-ref <ref>
```

Then fill in `DATABASE_URL` (pooled, port **6543**), `DIRECT_URL` (direct, port
**5432**), and the project keys, and run `npx prisma migrate dev`.

> **Free-tier gotcha:** projects pause after 7 days without _database_
> activity — dashboard visits and cached responses don't count. The daily cron
> at `app/api/cron/keepalive` (scheduled in `vercel.json`) issues a real query
> to prevent it. It needs `CRON_SECRET` set both locally and in Vercel.

---

## Architecture notes worth reading before you write data code

**Prisma bypasses Row Level Security.** It connects with the service
credential, so RLS is _not_ the authorization mechanism. Every table has RLS
enabled with deny-all policies purely as insurance in case the publishable key
leaks. Real authorization lives in one wrapper (`lib/auth/action.ts`, Phase 1)
that resolves the session, resolves workspace membership and role, asserts the
required capability, validates input with Zod, and writes the audit log.
**Nothing may query the database around that wrapper.**

`supabase-js` is used only for auth sessions, Storage uploads, and Realtime
subscriptions — never to query business tables.

---

## Design system — Paper & Clay

Reference page: **`/design`**. It renders through the real layout and tokens, so
style new screens against it rather than inventing values.

The governing idea is _a well-made paper planner, with real depth_: warm paper
surfaces, handwritten headings, one clay accent. It is deliberately minimal
**and** glassy/3D/animated, which only works because the effects are **scoped to
specific surfaces** instead of sprayed everywhere.

**Rules**

- **No hardcoded colors.** Everything goes through a token. `npm run
lint:colors` fails the build on a raw hex or `rgb()` in `components/`.
- **Two fonts, one boundary.** Playpen Sans for headings, nav, buttons, KPI
  figures, empty states. Inter for table cells, chart labels, timestamps, long
  copy. Playpen Sans has no tabular numerals, which is why data uses Inter —
  mixing them inside one column looks like a bug.
- **Glass only on floating surfaces**: command palette, task drawer, sticky
  topbar once scrolled, modals, dropdowns, toasts, the dragged card. Never on
  static cards, table rows, the sidebar, dashboard tiles, or chart containers —
  `backdrop-filter` on anything that scrolls or repaints often drops frames.
- **Four elevation steps only**: rest → hover → floating → dragging. Needing a
  fifth means the hierarchy is wrong.
- **One literal 3D transform**: `.tilt-drag`, the card lifted off the board.
- **Motion is purposeful.** No infinite decorative loops; nothing over 320ms on
  a user-initiated action; drag feedback is never behind a transition;
  everything collapses under `prefers-reduced-motion` (guarded three ways — a
  CSS blanket rule, `MotionConfig reducedMotion="user"`, and the
  `usePrefersReducedMotion` hook).
- **Contrast is a gate, not an opinion.** The palette is warm and
  low-contrast — the kind that fails accessibility quietly. `npm run
audit:contrast` checks all **82** pairs against WCAG AA in both themes and
  blocks CI. If a token fails, change the token; don't lower the bar.
- **Status chips use the token as both tint and text**: `bg-danger/15
text-danger`. The status colors are solved so this composite still clears AA —
  a 15% tint over the surface lowers the ratio, so it is the binding
  constraint. The **accent never self-tints**: accent chips and selected rows
  use `bg-accent-soft` with `text-ink`.
- **Status is never encoded by colour alone.** Every status carries a label or
  an icon (WCAG 1.4.1). This matters more than the palette maths: the accent is
  clay-orange and `danger` is red, and while they are held ≥20° apart in hue
  (enforced by test), red/orange is exactly the pair that red-green colour
  blindness collapses. The text is what makes it unambiguous.
- **Luminance contrast cannot tell you if two tokens look different.** Every
  text token is solved to ~the same ratio against the background, so they all
  land at near-identical lightness — the contrast between any two of them is
  ~1:1 by construction. Use `hueGap()` for "are these distinguishable", and
  `contrast()` only for "is this legible".

---

## Scripts

| Script                      | What it does                               |
| --------------------------- | ------------------------------------------ |
| `npm run dev`               | Dev server                                 |
| `npm run build`             | Production build                           |
| `npm run verify`            | Everything CI runs                         |
| `npm run typecheck`         | `tsc --noEmit`                             |
| `npm run lint`              | ESLint                                     |
| `npm run lint:colors`       | Fails on hardcoded colors in `components/` |
| `npm run format`            | Prettier write                             |
| `npm run audit:contrast`    | Full WCAG table for both themes            |
| `npm run test`              | Vitest                                     |
| `npm run test:e2e`          | Playwright                                 |
| `npm run db:migrate`        | `prisma migrate dev`                       |
| `npm run db:studio`         | Prisma Studio                              |
| `npm run db:healthcheck`    | Round-trips a query through Prisma         |
| `npm run verify:security`   | Asserts RLS, grants, triggers, key posture |
| `npm run dev:user`          | Creates a confirmed user for e2e runs      |
| `npm run dev:clean`         | Deletes test projects the e2e suite leaves |
| `npm run provision:env`     | Writes `.env.local` from the Supabase API  |
| `npm run provision:storage` | Creates the private attachments bucket     |

---

## Verifying the design system by hand

1. Open `/design` and toggle light → dark → system. No unstyled flash, no color
   leaking through.
2. Scroll — the topbar should turn to glass only after content passes under it.
3. Turn on **System Settings → Accessibility → Display → Reduce Motion**. The
   badge at the top of `/design` should read `Reduced motion: ON`, the count-ups
   should show final values immediately, and the stagger and 3D tilt should be
   gone.
4. Zoom to 200% and narrow to 375px — no horizontal page scroll.
5. Tab through: a visible focus ring on every interactive element.
