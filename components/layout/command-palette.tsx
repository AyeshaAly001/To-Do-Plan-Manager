"use client";

import { AnimatePresence, motion } from "motion/react";
import {
  BarChart3,
  CalendarCheck,
  FolderKanban,
  Inbox,
  LayoutDashboard,
  Search,
  Settings,
  Target,
  Users,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { NO_MOTION, fade, scaleFade } from "@/lib/motion/config";
import { usePrefersReducedMotion } from "@/lib/motion/use-prefers-reduced-motion";
import { searchWorkspaceTasks } from "@/lib/tasks/read-actions";
import { TASK_STATUS_META } from "@/lib/tasks/display";
import type { TaskStatus } from "@/lib/generated/prisma/enums";
import { cn } from "@/lib/utils";

type SearchHit = {
  id: string;
  number: number;
  title: string;
  status: TaskStatus;
  project_id: string;
  project_key: string;
  project_name: string;
};

const NAV_COMMANDS = [
  { label: "Home", href: "/home", icon: LayoutDashboard },
  { label: "Inbox", href: "/inbox", icon: Inbox },
  { label: "My tasks", href: "/my-tasks", icon: CalendarCheck },
  { label: "Projects", href: "/projects", icon: FolderKanban },
  { label: "Goals", href: "/goals", icon: Target },
  { label: "Reports", href: "/reports", icon: BarChart3 },
  { label: "Team", href: "/team", icon: Users },
  { label: "Settings", href: "/settings/profile", icon: Settings },
] as const;

/** Lets anything on the page open the palette without lifting its state. */
export const OPEN_PALETTE_EVENT = "ash:open-palette";

export function openCommandPalette() {
  document.dispatchEvent(new Event(OPEN_PALETTE_EVENT));
}

/**
 * Command palette (⌘K / Ctrl+K).
 *
 * Searching tasks is the main use, and it goes through the server's ranked
 * query — full-text on title and body plus a trigram fallback, so "logi"
 * finds "login" where full-text alone would not.
 *
 * Debounced at 200ms. Every keystroke firing a cross-region query would be
 * both slow and wasteful; 200ms is short enough to feel immediate while
 * collapsing a typed word into one request.
 *
 * Keyboard-first by definition: arrows move, Enter opens, Escape closes, and
 * focus returns to whatever was focused before it opened.
 */
export function CommandPalette() {
  const router = useRouter();
  const reduced = usePrefersReducedMotion();
  const inputRef = useRef<HTMLInputElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const filteredNav = query
    ? NAV_COMMANDS.filter((c) => c.label.toLowerCase().includes(query.toLowerCase()))
    : NAV_COMMANDS;

  // Nav first when there is no query; task results lead once you type, since
  // that is what you were looking for.
  const items: (
    | { kind: "nav"; label: string; href: string; icon: typeof Inbox }
    | { kind: "task"; hit: SearchHit }
  )[] = query
    ? [
        ...hits.map((hit) => ({ kind: "task" as const, hit })),
        ...filteredNav.map((c) => ({ kind: "nav" as const, ...c })),
      ]
    : filteredNav.map((c) => ({ kind: "nav" as const, ...c }));

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setHits([]);
    setActiveIndex(0);
    // Put focus back where it was, or the user is dumped at the top of the
    // document after closing.
    restoreFocusRef.current?.focus();
  }, []);

  // Global shortcut.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        restoreFocusRef.current = document.activeElement as HTMLElement;
        setOpen((v) => !v);
        return;
      }

      // "/" as a shortcut, but never while the user is typing in a field —
      // otherwise it steals the character.
      if (event.key === "/" && !open) {
        const target = event.target as HTMLElement | null;
        const typing =
          target &&
          (target.tagName === "INPUT" ||
            target.tagName === "TEXTAREA" ||
            target.isContentEditable);
        if (!typing) {
          event.preventDefault();
          restoreFocusRef.current = document.activeElement as HTMLElement;
          setOpen(true);
        }
      }
    };

    // The topbar's search button opens it through this event rather than by
    // lifting state into a provider — the palette owns its own visibility.
    const onOpenRequest = () => {
      restoreFocusRef.current = document.activeElement as HTMLElement;
      setOpen(true);
    };

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener(OPEN_PALETTE_EVENT, onOpenRequest);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener(OPEN_PALETTE_EVENT, onOpenRequest);
    };
  }, [open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Debounced search. All state changes happen inside async callbacks or
  // timers, never synchronously in the effect body.
  useEffect(() => {
    if (!query.trim()) {
      return;
    }

    let cancelled = false;
    const timer = setTimeout(() => {
      setSearching(true);
      void searchWorkspaceTasks({ query: query.trim(), limit: 12 }).then((result) => {
        if (cancelled) return;
        setSearching(false);
        setHits(result.ok ? (result.data as SearchHit[]) : []);
        setActiveIndex(0);
      });
    }, 200);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  /**
   * A hit opens its task's drawer inside the project it belongs to — which
   * needs the PROJECT id, not the task id. The search query returns both for
   * exactly this reason.
   */
  const hrefFor = (item: (typeof items)[number]) =>
    item.kind === "nav" ? item.href : `/projects/${item.hit.project_id}?task=${item.hit.id}`;

  const activate = (index: number) => {
    const item = items[index];
    if (!item) return;
    close();
    router.push(hrefFor(item) as never);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((i) => (i + 1) % Math.max(1, items.length));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((i) => (i - 1 + items.length) % Math.max(1, items.length));
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      activate(activeIndex);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[12vh]"
          initial="hidden"
          animate="visible"
          exit="exit"
          variants={fade}
        >
          <motion.button
            type="button"
            aria-label="Close command palette"
            onClick={close}
            className="scrim absolute inset-0 cursor-default"
            variants={fade}
          />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Command palette"
            variants={reduced ? NO_MOTION.scaleFade : scaleFade}
            className="glass relative w-full max-w-xl overflow-hidden rounded-[--radius-lg]"
          >
            <div className="border-border flex items-center gap-2 border-b px-3 py-2">
              <Search className="text-muted size-4 shrink-0" aria-hidden />
              <Input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Search tasks, or jump to a page…"
                aria-label="Search"
                // Combobox semantics so a screen reader announces the results
                // list and the active option.
                role="combobox"
                aria-expanded
                aria-controls="command-results"
                aria-activedescendant={
                  items[activeIndex] ? `command-item-${activeIndex}` : undefined
                }
                autoComplete="off"
                className="border-transparent bg-transparent hover:border-transparent focus-visible:border-transparent"
              />
              <kbd className="border-border bg-surface-2 text-muted hidden shrink-0 rounded border px-1.5 py-0.5 text-[0.6875rem] sm:block">
                esc
              </kbd>
            </div>

            <ul
              id="command-results"
              role="listbox"
              aria-label="Results"
              className="max-h-80 overflow-y-auto p-1"
            >
              {searching && (
                <li className="text-muted px-3 py-2 text-xs" role="status">
                  Searching…
                </li>
              )}

              {!searching && items.length === 0 && (
                <li className="text-muted px-3 py-6 text-center text-sm">
                  Nothing matches “{query}”.
                </li>
              )}

              {items.map((item, index) => {
                const selected = index === activeIndex;
                return (
                  <li key={item.kind === "nav" ? item.href : item.hit.id}>
                    <button
                      id={`command-item-${index}`}
                      role="option"
                      aria-selected={selected}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => activate(index)}
                      className={cn(
                        "flex w-full items-center gap-2.5 rounded-[--radius-md] px-2.5 py-2 text-left text-sm",
                        selected ? "bg-accent-soft text-ink" : "hover:bg-surface-2",
                      )}
                    >
                      {item.kind === "nav" ? (
                        <>
                          <item.icon className="text-muted size-4 shrink-0" />
                          <span className="flex-1">{item.label}</span>
                          <span className="text-muted text-xs">Page</span>
                        </>
                      ) : (
                        <>
                          <span className="text-muted shrink-0 text-xs" data-numeric>
                            {item.hit.project_key}-{item.hit.number}
                          </span>
                          <span className="min-w-0 flex-1 truncate">{item.hit.title}</span>
                          <Badge tone={TASK_STATUS_META[item.hit.status].tone}>
                            {TASK_STATUS_META[item.hit.status].label}
                          </Badge>
                        </>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
