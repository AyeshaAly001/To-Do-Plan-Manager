# Plan: "Ash" — Team To-Do & Plan Manager

## Context

`/Users/mac/Documents/Ash` is an empty directory — this is a greenfield build with no existing code to reuse. The goal is a production-shaped web app for **collaborative task and project planning**: multi-tenant team workspaces where members create projects, break them into tasks and subtasks, plan them on boards/calendars/timelines, collaborate in comments, and read progress off a set of dashboards.

Confirmed decisions:

- **Scope:** team workspaces (multi-tenant). Solo use = a workspace of one.
- **Stack:** Next.js full-stack (App Router + TypeScript).
- **Delivery:** phased, full feature set — a runnable, demoable app at the end of every phase.
- **Data layer:** delegated to me → **Supabase** (rationale below).
- **Look & feel:** Playpen Sans (paired with a neutral for dense data), "Paper & Clay" minimal warm palette, with scoped glassmorphism, depth, and spring motion. Full spec in **Design System** below.

Intended outcome: by end of Phase 7, a deployed app that a small team can genuinely run their work on.

### Credential handling — do this first

The Supabase **personal access token** (`sbp_…`) supplied for this project is **account-level and unscoped**: it carries the same privileges as the whole Supabase account and can create or delete any project in any org that account belongs to. It is not a project-scoped key.

Rules for this build:

1. Write it to `.env.local` only, as `SUPABASE_ACCESS_TOKEN`. `.env.local` is in `.gitignore` before the first commit.
2. Use it solely for CLI/Management-API provisioning (create project, link, push migrations). It never reaches application runtime code, never ships to the client, never enters a committed file.
3. Runtime uses only the project-scoped keys the provisioning step returns: publishable key (client) and secret key + connection strings (server).
4. **Rotate it** at the account Access Tokens page once provisioning is done — it has passed through chat history.
5. Ignore any previously stored Supabase token in the environment; this project uses the supplied one exclusively.

### Why Supabase over Neon + Auth.js

Both have a real free tier, but this app needs four things — Postgres, auth, file storage (avatars/attachments), and realtime (live board updates). Supabase bundles all four; Neon supplies only the database, leaving Auth.js to wire up plus Cloudflare R2/S3 for files and a separate channel for realtime. That's three extra integrations for no gain here.

Free plan gives 500 MB database, 1 GB file storage, 50,000 monthly active users, 5 GB egress, 2 active projects — comfortably above what this app will use in development and early real use.

**The one real catch:** free projects **pause after 7 days of database inactivity** and must be manually restored. Mitigation is in Phase 0 — a daily Vercel Cron hitting a trivial query keeps the project warm. Worth knowing rather than discovering.

---

## Architecture

| Layer            | Choice                                       | Notes                                                                        |
| ---------------- | -------------------------------------------- | ---------------------------------------------------------------------------- |
| Framework        | **Next.js 16.3.x** (App Router, React 19)    | Current stable is 16.3.4. Note: v16 renamed `middleware.ts` → **`proxy.ts`** |
| Language         | TypeScript, `strict: true`                   |                                                                              |
| Styling          | **Tailwind CSS v4** + **shadcn/ui**          | shadcn CLI auto-detects v4 and emits OKLCH tokens                            |
| Database         | **Supabase Postgres**                        | Pooled conn (`:6543`) for runtime, direct (`:5432`) for migrations           |
| ORM / migrations | **Prisma**                                   | Owns the schema; all data access is server-side                              |
| Auth             | **Supabase Auth** via `@supabase/ssr`        | Email+password, magic link, Google/GitHub OAuth                              |
| Files            | **Supabase Storage**                         | Avatars, task attachments; signed URLs only                                  |
| Realtime         | **Supabase Realtime**                        | Postgres change streams → live board/comment sync                            |
| Server logic     | Server Actions + Route Handlers              | Every action wrapped (auth → RBAC → Zod → audit)                             |
| Client state     | **TanStack Query** + **nuqs**                | nuqs keeps filters/view in the URL so views are shareable                    |
| Validation       | **Zod**                                      | One schema per action, shared client/server                                  |
| Drag & drop      | **dnd-kit**                                  | Kanban, list reorder, timeline bars                                          |
| Tables           | **TanStack Table**                           | Table/spreadsheet view, virtualized                                          |
| Charts           | **Recharts**                                 | Dashboards, restyled to the warm palette                                     |
| Motion           | **`motion`** (ex-Framer Motion)              | Layout animations, spring drag-settle, count-ups                             |
| Fonts            | **Playpen Sans** + **Inter** via `next/font` | Self-hosted, no CLS                                                          |
| Rich text        | **Tiptap**                                   | Task descriptions, comments, `@`-mentions                                    |
| Email            | **Resend**                                   | Invites, mention alerts, daily digest                                        |
| Testing          | **Vitest** + **Playwright**                  | Unit/integration + E2E on critical flows                                     |
| Deploy           | **Vercel**                                   | Preview per branch                                                           |

### Authorization model — read this before writing data code

Prisma connects with the service credential, which **bypasses Row Level Security**. So RLS is _not_ the authorization mechanism here. Instead:

1. **Every table gets RLS enabled with deny-all policies.** The public anon key can then read nothing directly — defense in depth if a key ever leaks.
2. **All authorization lives in the server layer**, enforced by one wrapper that no data path skips.
3. `supabase-js` is used _only_ for auth sessions, Storage uploads, and Realtime subscriptions — never for querying business tables.

The wrapper is the single most important file in the codebase:

```
lib/auth/action.ts        // authedAction(schema, {role}, handler)
                          //  → resolve session (getUser, never getSession)
                          //  → resolve workspace membership + role
                          //  → assert required role
                          //  → parse input with Zod
                          //  → run handler, write ActivityLog, revalidate
lib/auth/rbac.ts          // can(role, 'task.delete') capability matrix
```

Roles: `OWNER` > `ADMIN` > `MEMBER` > `GUEST` (guest = read + comment on assigned projects only).

### Repo structure

```
app/
  (auth)/login, /signup, /invite/[token]
  (app)/
    layout.tsx                         // shell: sidebar, topbar, command palette
    home/                              // personal dashboard
    inbox/
    my-tasks/
    projects/[projectId]/
      list/ board/ calendar/ timeline/ table/ dashboard/
    goals/
    reports/                           // workspace analytics
    team/                              // workload dashboard
    settings/{profile,workspace,members,labels,templates}
  api/
    cron/{keepalive,digest,recurrence}/route.ts
    webhooks/, export/
components/{ui,tasks,views,dashboard,layout}/
lib/{auth,db,rank,dates,realtime,validation,analytics}/
prisma/{schema.prisma,migrations,seed.ts}
utils/supabase/{client.ts,server.ts,proxy.ts}
proxy.ts                               // Next 16: session refresh at the edge
```

### Two utilities everything else leans on

**Fractional ranking** (`lib/rank/`) — tasks reorder constantly across list, board, and timeline. Storing an integer `position` forces rewriting every sibling row on each drag. Use the `fractional-indexing` package: each task holds a string `rank`, and inserting between two neighbours generates a key from just those two. One row updated per drag.

**Cursor pagination** (`lib/db/paginate.ts`) — projects will exceed a few thousand tasks. Keyset pagination on `(rank, id)` from the start; no `OFFSET`.

---

## Design System

The governing idea: **a well-made paper planner, with real depth.** Warm paper surfaces, handwritten headings, one clay accent — and glass/3D/motion applied only where they express something functional. The brief asked for minimal _and_ glassy/3D/animated; those only coexist if the effects are **scoped to specific surfaces** rather than sprayed across the UI. Restraint in placement is what keeps it from reading as templated.

Everything below lives in `app/globals.css` as CSS custom properties plus a Tailwind v4 `@theme` block, so no component hardcodes a color.

### Palette — "Paper & Clay"

| Token           | Light     | Dark      | Use                                |
| --------------- | --------- | --------- | ---------------------------------- |
| `--bg`          | `#FAF8F5` | `#1A1817` | Page ground (warm paper)           |
| `--surface`     | `#FFFFFF` | `#242120` | Cards, panels, rows                |
| `--surface-2`   | `#F5F2ED` | `#2E2A28` | Recessed wells, table headers      |
| `--ink`         | `#2A2724` | `#F2EFEA` | Primary text (warm near-black)     |
| `--muted`       | `#8A8177` | `#9E958A` | Secondary text, placeholders       |
| `--border`      | `#E8E3DC` | `#332F2C` | Hairlines, dividers                |
| `--accent`      | `#B5654A` | `#D08A6C` | Primary actions, active nav, focus |
| `--accent-soft` | `#F2E4DE` | `#3A2A24` | Accent tints, selected rows        |

**Semantic (status) colors** — these carry meaning, so they stay distinguishable from the accent:

| Token       | Light     | Dark      | Meaning                  |
| ----------- | --------- | --------- | ------------------------ |
| `--success` | `#4C7A5B` | `#7FA98D` | Done, on-track           |
| `--warning` | `#B5773A` | `#D6A163` | Due soon, at-risk        |
| `--danger`  | `#A6402E` | `#D4705C` | Overdue, urgent, blocked |
| `--info`    | `#4F6B87` | `#8CA8C2` | Neutral notices          |

Priority scale reuses these (`NONE` = muted, `LOW` = info, `MEDIUM` = warning, `HIGH`/`URGENT` = danger at two intensities). Chart categoricals come from the `dataviz` skill palette **retuned to this warm base** — no default library colors.

**Explicitly banned** (this is the "AI-generated look" the brief rules out): indigo/violet primaries, multi-stop hero gradients, neon or glow shadows, `#0F172A`-style cold navy grounds, rainbow bento borders, purple-to-pink anything. All color is defined in **OKLCH** (Tailwind v4 default) so tints stay perceptually even.

### Typography — paired

- **Playpen Sans** (variable, 100–800) via `next/font/google`, CSS var `--font-display`. Used for: page and project titles, all headings, sidebar nav, buttons, tabs, KPI numbers, empty-state copy, toasts, section labels. This is the app's voice.
- **Inter** (variable, tabular numerals on) as `--font-ui`. Used for: table cells, chart axis/tick labels, timestamps, long task descriptions and comment bodies, form inputs, code/keys. This is where scanning matters.
- **Rationale:** Playpen Sans is a casual-handwriting design — TypeTogether's own guidance is that it suits headings and short copy rather than extended body text. Pairing keeps the character while letting dense views stay legible and numerals column-align.
- Scale (display): `36 / 28 / 22 / 18` semibold, tight leading. Body (Inter): `14` at `1.55`, small `12.5`. Playpen Sans runs slightly wide — set headings a touch tighter (`-0.01em`) and never below `13px`.
- Both self-hosted through `next/font` (no external font request, no layout shift, `display: swap`).

### Glassmorphism — floating surfaces only

Glass is used where a panel genuinely floats above content, so the blur communicates layering. Nowhere else.

```css
.glass {
  background: color-mix(in oklch, var(--surface) 72%, transparent);
  backdrop-filter: blur(20px) saturate(140%);
  border: 1px solid color-mix(in oklch, var(--border) 60%, transparent);
  box-shadow:
    0 1px 2px rgb(42 39 36 / 0.04),
    0 8px 24px -8px rgb(42 39 36 / 0.1);
}
```

Applied to: command palette (`⌘K`), task detail drawer, sticky topbar on scroll, modals/dialogs, dropdown and filter menus, toasts, the card actively being dragged. **Not** applied to: static cards, table rows, sidebar, dashboard tiles, chart containers — flat surfaces there keep the app calm and readable. Always over a real backdrop scrim (`rgb(42 39 36 / .28)`) so text contrast holds, and with an opaque `@supports not (backdrop-filter: blur(1px))` fallback.

### Depth & 3D — restrained, and tied to state

Depth signals interactivity and elevation rather than decorating:

- **Elevation ladder** — four steps only (`rest / hover / floating / dragging`), each a layered two-shadow recipe using warm-tinted shadow color (`rgb(42 39 36 / …)`), never pure black.
- **Card lift** — task/project cards translate `-2px` and step up one elevation on hover.
- **3D tilt on drag** — the grabbed kanban card gets `perspective(600px) rotate3d(1,1,0,1.5deg) scale(1.02)` plus the floating shadow, so it reads as physically picked up. This is the one place literal 3D transform appears.
- **KPI tiles** — a 1px top inner highlight and hairline border to suggest a pressed paper edge; no gradient fill.
- **Timeline/Gantt bars** — subtle inner shadow so bars sit _in_ the track.
- **Auth & empty states** — a single soft layered "paper stack" motif (2–3 offset sheets), the only decorative 3D in the app.

### Motion — spring physics, purposeful

Motion via **Motion** (the `motion` package, ex-Framer Motion) for orchestration; CSS transitions for simple hover/focus.

- Tokens: `--ease-out: cubic-bezier(.2,.8,.2,1)`, durations `120ms` (hover/press), `220ms` (panel/drawer), `320ms` (page/view transition). Spring `{stiffness: 400, damping: 32}` for drag-drop settle.
- Where motion earns its place: drawer slide-in, modal scale-fade `0.97→1`, **list reorder via `layout` animation** (rows slide to new positions instead of snapping), kanban card settle on drop, dashboard **number count-up** on mount, chart bar/line draw-in on first paint, checkbox check-draw, toast slide, sidebar collapse width tween, skeleton shimmer, view-to-view crossfade.
- Staggered entrance (`30ms` per item, capped at ~12 items) on list and board mount.
- **Hard rules:** no infinite decorative loops; nothing animates longer than `320ms` on a user-initiated action; drag-drop feedback is instant (never behind a transition); every animation wrapped so **`prefers-reduced-motion: reduce` collapses it to an opacity change or nothing** — including the count-ups and the 3D tilt.

### Component conventions

Radii `6 / 10 / 14px` (`sm`/`md`/`lg`) — soft to echo the font's roundness, not pill-shaped. Focus ring always `2px var(--accent)` at `2px` offset, never removed. Hairline borders `1px var(--border)` on all surfaces — the palette is low-contrast, so borders carry the structure. Density is comfortable by default with a compact toggle for table/list views. Every list has a designed empty state (paper motif + Playpen Sans line + one primary action), and skeletons — never spinners — for loading.

**Accessibility gate:** the warm low-contrast palette is the main risk here. Every text/background pair must clear **WCAG AA (4.5:1 body, 3:1 large)** in both themes, verified in Phase 0 and re-checked in Phase 7 — `--muted` on `--bg` and white-on-`--accent` are the pairs most likely to fail and must be adjusted rather than accepted.

---

## Data model

~24 tables. Grouped by concern:

**Identity & tenancy**

- `Profile` — mirrors `auth.users` (id, name, avatarUrl, timezone, weeklyCapacityHours, notification prefs)
- `Workspace` — name, slug, logo, settings
- `WorkspaceMember` — (workspaceId, profileId, role, joinedAt) · unique pair
- `Invitation` — email, role, token, expiresAt, acceptedAt

**Project structure**

- `Project` — workspaceId, name, key (e.g. `ASH`), description, color, icon, status (`PLANNING|ACTIVE|ON_HOLD|COMPLETED|ARCHIVED`), startDate, targetDate, ownerId, isPrivate
- `ProjectMember` — per-project access when `isPrivate`
- `Section` — ordered groups/board columns within a project (name, rank, wipLimit)
- `Milestone` — projectId, name, dueDate, completedAt

**The task core**

- `Task` — projectId, sectionId, parentTaskId (self-relation → subtasks), title, description (JSON from Tiptap), status (`TODO|IN_PROGRESS|IN_REVIEW|BLOCKED|DONE|CANCELLED`), priority (`NONE|LOW|MEDIUM|HIGH|URGENT`), startDate, dueDate, estimateHours, rank, completedAt, archivedAt, createdById, recurrenceId, milestoneId
- `TaskAssignee` — join table; multiple assignees per task
- `Label` / `TaskLabel` — workspace-scoped labels, many-to-many
- `ChecklistItem` — lightweight steps inside a task (title, isDone, rank)
- `TaskDependency` — (blockingTaskId, blockedTaskId, type) → feeds timeline + critical path
- `RecurrenceRule` — RRULE string, nextRunAt, endCondition
- `CustomField` / `CustomFieldValue` — workspace-defined fields (Phase 6)

**Collaboration**

- `Comment` — taskId, authorId, body (JSON), parentCommentId (threads), editedAt
- `Mention` — commentId, mentionedProfileId → drives notifications
- `Attachment` — taskId, storagePath, filename, mimeType, sizeBytes, uploadedById
- `ActivityLog` — workspaceId, actorId, entityType, entityId, action, diff (JSON) — written by the action wrapper, powers every activity feed
- `Notification` — recipientId, type, payload, readAt, emailedAt

**Planning & measurement**

- `TimeEntry` — taskId, profileId, startedAt, endedAt, durationMinutes, isBillable, note
- `Goal` — workspaceId, title, description, type (`OBJECTIVE`), period, ownerId, status
- `KeyResult` — goalId, title, metric type (`NUMBER|PERCENT|CURRENCY|BOOLEAN`), start/target/current value, linked projectIds
- `Template` — project or task template stored as JSON payload
- `SavedView` — per-user named filter+sort+group config, optionally shared

**Indexes that matter:** `Task(projectId, status)`, `Task(projectId, rank)`, `Task(dueDate)`, `TaskAssignee(profileId)`, `ActivityLog(workspaceId, createdAt DESC)`, `Notification(recipientId, readAt)`.

---

## Feature set by phase

Each phase ends with a working app, migrations applied, and tests green.

### Phase 0 — Foundation & design system

Scaffold Next.js 16 + TS + Tailwind v4; `shadcn init` and pull the base component set.

**Provisioning** — `.gitignore` first, then `SUPABASE_ACCESS_TOKEN` into `.env.local`; `supabase login --token` / `supabase projects create`, then `supabase link`. Pull the project keys and wire `DATABASE_URL` (pooled `:6543`) + `DIRECT_URL` (`:5432`), publishable key, secret key. `prisma init` and confirm a round-trip query.

**Design system materialization** — this is the phase that makes every later phase cheap:

- `next/font/google` loading Playpen Sans + Inter → `--font-display` / `--font-ui`.
- All Paper & Clay tokens as OKLCH custom properties in `globals.css`, exposed via Tailwind v4 `@theme`; light + dark sets.
- Override shadcn's generated token values with these — do this **before** pulling many components, so nothing inherits defaults.
- Primitives built once and reused everywhere: `.glass` utility, four-step elevation ladder, `<MotionProvider>` with the easing/duration/spring tokens and a `prefers-reduced-motion` guard, `<CountUp>`, `<Skeleton>`, `<EmptyState>` (paper-stack motif), `<PageTitle>`, focus-ring utility.
- Contrast audit of every token pair against WCAG AA; adjust tokens now, not later.

**Shell** — collapsible sidebar, sticky topbar (glass on scroll), workspace switcher, `next-themes` light/dark/system toggle, toast system, error/loading boundaries.

**Ops** — `app/api/cron/keepalive` + `vercel.json` daily schedule (the anti-pause fix). ESLint/Prettier, Vitest + Playwright config, GitHub Actions running typecheck/lint/test.

**Done when:** `npm run dev` serves the themed shell in both light and dark with correct fonts; a demo page proves glass, elevation, spring motion, and reduced-motion fallback all work; contrast audit passes; CI green; Supabase reachable through Prisma.

### Phase 1 — Auth & multi-tenancy

Signup/login/logout, magic link, Google + GitHub OAuth, password reset. `proxy.ts` refreshing tokens and guarding `(app)` routes. Profile auto-created on first sign-in via a Postgres trigger on `auth.users`. Workspace create/switch/settings. Member list, role changes, remove member. Email invitations with tokened accept flow. The `authedAction` wrapper + RBAC matrix + `ActivityLog` writes. RLS enabled deny-all on every table. Avatar upload to Storage.

**Done when:** two browser profiles can be separate users in one workspace; a `MEMBER` is provably blocked from admin actions; an anon-key query against any table returns zero rows.

### Phase 2 — Task engine + List view

Project CRUD (name, key, color, icon, dates, status, private/public + members). Sections with reorder. Task CRUD: title, rich description, status, priority, multi-assignee, start/due dates, estimate, labels, checklist, subtasks (nested, with parent roll-up progress). Fractional-rank drag reordering. Task detail — side drawer with deep-linkable URL (`?task=<id>`). List view: group by (status/assignee/priority/due/label/section), multi-sort, inline edit, multi-select + bulk actions (assign, label, move, complete, delete). Filter builder + saved views. Full-text search across tasks (Postgres `tsvector`). Quick-add with natural-language date parsing ("fix login tomorrow 5pm !high @sam"). Optimistic mutations everywhere via TanStack Query.

**Done when:** a project with a few hundred tasks stays responsive; every field edits inline; filters survive refresh and share via URL.

### Phase 3 — The other views

**Board/Kanban** — dnd-kit columns from sections or any group-by, drag between columns and reorder within, collapsible swimlanes, WIP limit warnings, virtualized columns. **Calendar** — month/week/agenda, tasks placed on due date, drag to reschedule, multi-day spans from start→due. **Table** — TanStack Table, resizable/reorderable/hideable columns, inline edit, CSV export. **My Tasks** — cross-project, sectioned Overdue / Today / Next 7 days / Later / No date, with drag between sections rewriting due dates. **Inbox** — notification list, filter unread, mark all read. **Command palette** (`⌘K`) + keyboard shortcuts (`c` create, `/` search, `j/k` navigate, `x` select, `e` complete).

**Done when:** all five views render the same filtered dataset consistently, and view choice + filters live in the URL.

### Phase 4 — Collaboration & realtime

Threaded comments with Tiptap, `@`-mention autocomplete, edit/delete windows, emoji reactions. Attachments — drag-drop upload to Storage, image thumbnails, signed-URL downloads, per-workspace quota display. Activity feed per task, per project, per workspace, rendered from `ActivityLog` diffs. Notifications: in-app bell with unread count, per-type email preferences, digest batching. Realtime: subscribe per project channel so board moves, new comments, and status changes appear live for all viewers; presence avatars showing who's on a task; conflict resolution = last-write-wins with a "changed by X" toast.

**Done when:** two browsers side by side see each other's drags and comments within a second, and a mention delivers both bell and email.

### Phase 5 — Planning layer

Milestones with progress roll-up. Task dependencies (blocks / blocked-by) with cycle detection on write. **Timeline/Gantt** — horizontal bars from start→due, drag to move, edge-drag to resize, dependency arrows, critical-path highlight, day/week/month/quarter zoom, milestone diamonds. Recurring tasks — RRULE builder UI, nightly cron spawning next instances. Time tracking — start/stop timer, manual entry, per-task rollup, estimate-vs-actual. Goals/OKRs — objectives with key results, progress auto-derived from linked projects or manual check-ins, alignment tree. Project & task templates, plus "duplicate project". Workload capacity — per-member weekly hours vs assigned estimate.

**Done when:** a project can be laid out on the timeline with dependencies, a recurring task regenerates overnight, and a goal reflects linked project progress.

### Phase 6 — Dashboards & analytics

**Before writing any chart code, load the `dataviz` skill** — it defines the palette, mark specs, and dashboard layout rules so all eight dashboards read as one system.

Aggregation strategy: heavy metrics (velocity, cycle time, cumulative flow) come from SQL views; the expensive ones become **materialized views refreshed hourly by `pg_cron`**, not recomputed per request. Live counts stay as indexed queries.

| #   | Dashboard                 | Contents                                                                                                                                                                                             |
| --- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Home** (personal)       | Today's tasks, overdue, next 7 days, assigned-to-me, recent activity, completion streak, quick-add, at-a-glance KPI row                                                                              |
| 2   | **Project**               | Completion %, burndown vs ideal, burnup, status donut, priority mix, workload by assignee, overdue/blocked counts, milestone progress, at-risk badge, recent activity                                |
| 3   | **Portfolio** (workspace) | Every project as a health card (RAG status from overdue % + velocity trend), cross-project throughput, projects-at-risk table, capacity heatmap, upcoming milestones                                 |
| 4   | **Team & workload**       | Per-member capacity bar (assigned est. hours vs weekly capacity), over/under-allocation flags, unassigned queue, task distribution by member, completion rate per member                             |
| 5   | **Analytics / reports**   | Velocity (completed per week), cycle time & lead time distributions, cumulative flow diagram, created vs completed trend, aging WIP scatter, throughput by label, custom date range + project filter |
| 6   | **Time tracking**         | Hours by project / member / day, billable vs non-billable split, estimate-vs-actual variance table, timesheet grid, CSV export                                                                       |
| 7   | **Goals / OKR**           | Objective progress gauges, key-result trend lines, on-track/at-risk/off-track rollup, alignment tree                                                                                                 |
| 8   | **Admin**                 | Members & roles, pending invitations, storage & row usage vs free-tier caps, full audit log with filters, danger zone                                                                                |

Plus: date-range + project + assignee filter bar shared across dashboards (URL state via nuqs), CSV export on every table, PDF export of a project dashboard, and a scheduled weekly email digest.

**Done when:** each dashboard loads under ~1s on seeded data, every number is traceable to a query, and light/dark both read cleanly.

### Phase 7 — Hardening & launch

Accessibility pass: keyboard reachability on all views, focus traps in drawers/modals, ARIA on drag-drop with keyboard alternatives, contrast audit. Performance: route-level code splitting, virtualization on long lists, `next/image` on avatars, N+1 hunt with Prisma logging, bundle analysis. Security: rate limiting on auth + write actions, file type/size validation, signed-URL expiry, dependency audit, then run the **`security-review`** skill. Reliability: error boundaries, Sentry, structured logging. Testing: Vitest on RBAC/rank/recurrence/analytics SQL; Playwright on signup→workspace→project→task→board-drag→comment→dashboard. Seed script generating a realistic demo workspace. Deploy to Vercel with production Supabase, custom domain, backup guidance.

**Done when:** E2E suite green in CI, Lighthouse ≥90 across the board, deployed and usable.

---

## Verification

**Per phase**

```bash
npm run typecheck && npm run lint && npm run test    # must be clean
npx prisma migrate dev                                # schema in sync
npm run dev                                           # manual walkthrough
```

**Multi-tenancy isolation** (the highest-risk area — verify every phase after 1):

1. Seed two workspaces with different members.
2. As a member of A, request a task ID belonging to B by URL → expect 404, not a leak.
3. As `GUEST`, attempt delete-project → expect denied.
4. Query each table with the anon key → expect 0 rows (RLS deny-all holding).

**Realtime** — two browser profiles, same project board, drag in one, confirm the other updates without refresh.

**Dashboard correctness** — seed known data (e.g. exactly 40 tasks, 12 done, 3 overdue) and assert each dashboard number matches. Analytics bugs hide well; pin them with fixtures.

**E2E** — `npx playwright test`, covering signup → create workspace → invite → create project → create tasks → drag on board → comment with mention → read project dashboard.

**Load sanity** — seed 10k tasks in one project; List, Board, and Timeline must stay interactive.

**Design system** (each phase, on every new screen):

1. Toggle light → dark → system; no unstyled flash, no hardcoded color leaking through.
2. Grep for raw hex/`rgb(` in `components/` — should return nothing outside `globals.css`.
3. Enable **Reduce Motion** in macOS System Settings → Accessibility → Display; confirm count-ups, tilt, stagger, and layout animations all degrade gracefully and nothing is left mid-transition.
4. Confirm glass appears only on the approved floating surfaces, and that text over it still clears AA against the scrim.
5. Zoom to 200% and narrow to 375px — no horizontal page scroll; wide tables/timeline scroll inside their own container.
6. Keyboard-only pass: tab through, focus ring visible on every interactive element.

---

## Notes & risks

- **Free-tier pause** is the main operational gotcha. The keepalive cron handles it; if this ever carries real team data, the $25 Pro plan removes the risk (plus backups).
- **Timezones** — store all timestamps UTC, render in the user's `Profile.timezone`. Getting this wrong makes "Today" and every due-date dashboard subtly wrong. Fix it in Phase 2, not later.
- **Gantt/timeline (Phase 5) is the single largest UI item** — plan roughly a phase's worth of effort for it alone. If schedule pressure appears, ship it read-only first (no drag-resize).
- **Prisma bypasses RLS** — worth restating, because it's the mistake that would matter most. Authorization correctness rests entirely on `authedAction`; nothing may query the DB around it.
- **The token needs rotating** after Phase 0 provisioning — see _Credential handling_. This is the one action item that falls to you rather than the build.
- **Low-contrast warm palettes fail accessibility quietly.** `--muted` on `--bg` and white-on-`--accent` are the two pairs most likely to miss AA. They get audited in Phase 0 and tokens adjusted — resist "it looks fine" here.
- **`backdrop-filter` is a real GPU cost.** Glass on a long scrolling list would drop frames, which is precisely why it's scoped to floating surfaces only. If a glass surface ever lands on something that scrolls or repaints often, drop it to opaque rather than optimizing.
- **Playpen Sans has no true monospace/tabular numerals**, which is the concrete reason KPI numbers use it but table and chart numerals use Inter. Mixing them inside one column would look like a bug — keep the boundary at the component level.
- **Scope realism:** this is a substantial build — Phases 0–2 give a genuinely usable task manager, and 3–7 are what make it a _plan manager_. If you want value sooner, the natural early stopping point is end of Phase 4.
