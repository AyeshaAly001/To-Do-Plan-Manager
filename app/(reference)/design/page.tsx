"use client";

import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  StatTile,
} from "@/components/ui/card";
import { CountUp } from "@/components/ui/count-up";
import { EmptyState } from "@/components/ui/empty-state";
import { PageTitle } from "@/components/ui/page-title";
import { Skeleton, SkeletonText } from "@/components/ui/skeleton";
import { fade, NO_MOTION, scaleFade, staggerContainer, staggerItem } from "@/lib/motion/config";
import { usePrefersReducedMotion } from "@/lib/motion/use-prefers-reduced-motion";

/**
 * Living reference for the Paper & Clay design system.
 *
 * Kept in the app (not Storybook) on purpose: it renders through the real
 * layout, the real tokens and the real theme switch, so it catches drift that
 * an isolated harness would not. Every later phase should style against this
 * page rather than inventing new values.
 */

const SWATCHES = [
  { token: "bg", note: "page ground" },
  { token: "surface", note: "raised card" },
  { token: "surface-2", note: "recessed well" },
  { token: "ink", note: "primary text" },
  { token: "muted", note: "secondary text" },
  { token: "border", note: "hairline (decorative)" },
  { token: "border-strong", note: "control border, AA 3:1" },
  { token: "accent", note: "clay — actions, focus" },
  { token: "accent-soft", note: "tint, selected row" },
  { token: "success", note: "done, on-track" },
  { token: "warning", note: "due soon, at-risk" },
  { token: "danger", note: "overdue, blocked" },
  { token: "info", note: "neutral notice" },
] as const;

const ELEVATIONS = [
  { cls: "elev-rest", label: "rest", note: "cards, rows at idle" },
  { cls: "elev-hover", label: "hover", note: "pointer over an interactive card" },
  { cls: "elev-float", label: "floating", note: "drawer, modal, palette" },
  { cls: "elev-drag", label: "dragging", note: "card lifted off the board" },
] as const;

const TASKS = [
  { title: "Fix login redirect loop", who: "Sam", due: "Sep 12", est: 3.5 },
  { title: "Update onboarding copy", who: "Ali", due: "Sep 14", est: 1.25 },
  { title: "Audit colour contrast", who: "Sam", due: "Sep 19", est: 8 },
  { title: "Wire up Kanban drag", who: "Jo", due: "Sep 22", est: 12.75 },
] as const;

export default function DesignSystemPage() {
  const reduced = usePrefersReducedMotion();
  const [modalOpen, setModalOpen] = useState(false);
  const [listKey, setListKey] = useState(0);

  return (
    <div className="space-y-10 pb-24">
      <PageTitle
        title="Design system"
        subtitle="Paper & Clay — tokens, depth, and motion. The reference every other screen matches."
        actions={
          <span
            className={
              reduced
                ? "bg-warning/15 text-warning rounded-[--radius-sm] px-2.5 py-1 text-xs font-medium"
                : "bg-success/15 text-success rounded-[--radius-sm] px-2.5 py-1 text-xs font-medium"
            }
          >
            {reduced ? "Reduced motion: ON" : "Reduced motion: off"}
          </span>
        }
      />

      {/* ---------------------------------------------------------------- */}
      <section className="space-y-3">
        <h2 className="text-xl">Typography — paired on purpose</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Playpen Sans — the voice</CardTitle>
              <CardDescription>
                Headings, nav, buttons, KPI figures, empty states. Short copy only.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="font-display text-4xl font-semibold">Q3 Website Redesign</p>
              <p className="font-display text-lg">Overdue · 3 tasks</p>
              <p className="font-display text-muted text-sm">
                Nothing here yet — add your first task.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Inter — the data</CardTitle>
              <CardDescription>
                Table cells, chart labels, timestamps, long descriptions. Tabular numerals so
                columns line up.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-muted border-border border-b text-left">
                    <th className="pb-2 font-medium">Task</th>
                    <th className="pb-2 font-medium">Who</th>
                    <th className="pb-2 text-right font-medium">Est.</th>
                  </tr>
                </thead>
                <tbody>
                  {TASKS.map((t) => (
                    <tr key={t.title} className="border-border/60 border-b last:border-0">
                      <td className="py-1.5">{t.title}</td>
                      <td className="text-muted py-1.5">{t.who}</td>
                      <td className="py-1.5 text-right">{t.est.toFixed(2)}h</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      <section className="space-y-3">
        <h2 className="text-xl">Palette</h2>
        <p className="text-muted text-sm">
          Every pair is contrast-solved, not eyeballed — <code>npm run audit:contrast</code> is
          the gate. No indigo, no gradients, no glow.
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {SWATCHES.map(({ token, note }) => (
            <div
              key={token}
              className="border-border overflow-hidden rounded-[--radius-md] border"
            >
              <div className="h-14" style={{ background: `var(--${token})` }} />
              <div className="bg-surface px-3 py-2">
                <p className="font-display text-sm font-semibold">--{token}</p>
                <p className="text-muted text-xs">{note}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      <section className="space-y-3">
        <h2 className="text-xl">Depth — four steps, no more</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {ELEVATIONS.map(({ cls, label, note }) => (
            <div
              key={cls}
              className={`bg-surface border-border rounded-[--radius-lg] border p-4 ${cls}`}
            >
              <p className="font-display font-semibold">{label}</p>
              <p className="text-muted text-xs">{note}</p>
            </div>
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Card interactive className="p-4">
            <p className="font-display font-semibold">Hover me</p>
            <p className="text-muted text-sm">
              <code>.lift</code> — translates 2px and steps up one elevation.
            </p>
          </Card>
          <div className="bg-surface border-border tilt-drag rounded-[--radius-lg] border p-4">
            <p className="font-display font-semibold">Dragging state</p>
            <p className="text-muted text-sm">
              <code>.tilt-drag</code> — the one literal 3D transform in the app.
            </p>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      <section className="space-y-3">
        <h2 className="text-xl">Glass — floating surfaces only</h2>
        <p className="text-muted text-sm">
          Scroll the page: the top bar turns to glass once content passes under it. Below, a
          floating panel over text. Static cards, rows, the sidebar and chart containers stay
          flat.
        </p>
        <div className="relative overflow-hidden rounded-[--radius-lg]">
          {/* Content for the glass to actually sit over. */}
          <div className="bg-surface-2 space-y-2 p-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <p key={i} className="text-muted text-sm">
                Backdrop content — the blur has to have something to blur, otherwise glass is
                just a translucent panel that costs GPU time for nothing.
              </p>
            ))}
          </div>
          <div className="absolute inset-x-6 top-6 bottom-6 grid place-items-center">
            <div className="glass rounded-[--radius-lg] px-6 py-5 text-center">
              <p className="font-display text-lg font-semibold">Command palette</p>
              <p className="text-muted text-sm">⌘K · drawer · modal · dropdown · toast</p>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      <section className="space-y-3">
        <h2 className="text-xl">Motion</h2>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" onClick={() => setModalOpen(true)}>
            Open modal (scale-fade)
          </Button>
          <Button variant="secondary" onClick={() => setListKey((k) => k + 1)}>
            Replay stagger
          </Button>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <StatTile>
            <span className="text-muted text-xs font-medium">Completion</span>
            <CountUp value={68} format={(v) => `${Math.round(v)}%`} />
          </StatTile>
          <StatTile>
            <span className="text-muted text-xs font-medium">Open tasks</span>
            <CountUp value={124} />
          </StatTile>
          <StatTile>
            <span className="text-muted text-xs font-medium">Overdue</span>
            <CountUp value={3} className="text-danger" />
          </StatTile>
        </div>

        <motion.ul
          key={listKey}
          initial="hidden"
          animate="visible"
          variants={reduced ? NO_MOTION.container : staggerContainer(TASKS.length)}
          className="space-y-2"
        >
          {TASKS.map((t) => (
            <motion.li
              key={t.title}
              variants={reduced ? NO_MOTION.item : staggerItem}
              className="bg-surface border-border elev-rest flex items-center justify-between rounded-[--radius-md] border px-4 py-2.5"
            >
              <span className="text-sm">{t.title}</span>
              <span className="text-muted text-xs" data-numeric>
                {t.due}
              </span>
            </motion.li>
          ))}
        </motion.ul>
      </section>

      {/* ---------------------------------------------------------------- */}
      <section className="space-y-3">
        <h2 className="text-xl">Loading & empty</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Skeletons, never spinners</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-3">
                <Skeleton className="size-9 rounded-full" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-1/3" />
                  <Skeleton className="h-3 w-1/4" />
                </div>
              </div>
              <SkeletonText lines={3} />
            </CardContent>
          </Card>
          <Card>
            <EmptyState
              title="No tasks yet"
              description="Everything starts as a line on a page. Add the first one."
              action={<Button variant="primary">Add task</Button>}
            />
          </Card>
        </div>
      </section>

      {/* Modal — glass, scrim, scale-fade, focus-visible ring on the button. */}
      <AnimatePresence>
        {modalOpen && (
          <motion.div
            className="fixed inset-0 z-50 grid place-items-center p-4"
            initial="hidden"
            animate="visible"
            exit="exit"
            variants={fade}
          >
            <motion.button
              type="button"
              aria-label="Close modal"
              className="scrim absolute inset-0 cursor-default"
              onClick={() => setModalOpen(false)}
              variants={fade}
            />
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="demo-modal-title"
              className="glass relative w-full max-w-sm rounded-[--radius-lg] p-6"
              variants={reduced ? NO_MOTION.scaleFade : scaleFade}
            >
              <h3 id="demo-modal-title" className="text-lg">
                Floating surface
              </h3>
              <p className="text-muted mt-1 text-sm">
                Glass, over a scrim so text keeps its contrast. Scale-fades in at 220ms, out at
                120ms.
              </p>
              <div className="mt-4 flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setModalOpen(false)}>
                  Cancel
                </Button>
                <Button variant="primary" onClick={() => setModalOpen(false)}>
                  Got it
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
