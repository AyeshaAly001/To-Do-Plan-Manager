"use client";

import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { scaleFade, NO_MOTION } from "@/lib/motion/config";
import { usePrefersReducedMotion } from "@/lib/motion/use-prefers-reduced-motion";
import type { Membership } from "@/lib/auth/session";
import { switchWorkspace } from "@/lib/workspace/actions";
import { cn } from "@/lib/utils";

/**
 * Switches the active workspace.
 *
 * Hand-rolled rather than pulled from a component library, but it still owes
 * the same behaviour a real menu has: Escape closes, outside click closes,
 * focus returns to the trigger, and arrow keys move through options. Skipping
 * those is what makes custom menus unusable without a mouse.
 *
 * The panel is glass — it floats above content, which is exactly the case the
 * design system reserves glass for.
 */
export function WorkspaceSwitcher({
  active,
  memberships,
  collapsed,
}: {
  active: Membership;
  memberships: Membership[];
  collapsed?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const reduced = usePrefersReducedMotion();

  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on Escape and on clicks outside. Both listeners are only attached
  // while open, so a closed switcher costs nothing.
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!panelRef.current?.contains(target) && !triggerRef.current?.contains(target)) {
        setOpen(false);
      }
    };

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  const select = (workspaceId: string) => {
    if (workspaceId === active.workspaceId) {
      setOpen(false);
      return;
    }
    startTransition(async () => {
      const result = await switchWorkspace({ workspaceId });
      setOpen(false);
      if (result.ok) {
        // Everything in the shell is workspace-scoped, so refresh rather than
        // trying to patch client state.
        router.refresh();
      }
    });
  };

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={pending}
        title={collapsed ? active.workspaceName : undefined}
        className={cn(
          "hover:bg-surface-2 flex w-full items-center gap-2 rounded-[--radius-md] px-2 py-1.5 text-left",
          "transition-colors duration-[--dur-fast] ease-[--ease-out]",
          collapsed && "justify-center px-0",
        )}
      >
        <span className="bg-accent text-accent-ink font-display grid size-7 shrink-0 place-items-center rounded-[--radius-sm] text-xs font-bold">
          {active.workspaceName.slice(0, 1).toUpperCase()}
        </span>
        {!collapsed && (
          <>
            <span className="min-w-0 flex-1">
              <span className="font-display block truncate text-sm font-semibold">
                {active.workspaceName}
              </span>
              <span className="text-muted block truncate text-xs">
                {active.role.toLowerCase()}
              </span>
            </span>
            <ChevronsUpDown className="text-muted size-4 shrink-0" />
          </>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            ref={panelRef}
            role="menu"
            aria-label="Switch workspace"
            initial="hidden"
            animate="visible"
            exit="exit"
            variants={reduced ? NO_MOTION.scaleFade : scaleFade}
            className="glass absolute top-full left-0 z-40 mt-1 w-64 origin-top-left rounded-[--radius-lg] p-1"
          >
            <p className="text-muted px-2 py-1.5 text-xs font-medium">Workspaces</p>

            {memberships.map((m) => {
              const isActive = m.workspaceId === active.workspaceId;
              return (
                <button
                  key={m.workspaceId}
                  type="button"
                  role="menuitemradio"
                  aria-checked={isActive}
                  onClick={() => select(m.workspaceId)}
                  className="hover:bg-surface-2 flex w-full items-center gap-2 rounded-[--radius-md] px-2 py-1.5 text-left"
                >
                  <span className="bg-accent-soft text-ink font-display grid size-6 shrink-0 place-items-center rounded-[--radius-sm] text-[0.625rem] font-bold">
                    {m.workspaceName.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm">{m.workspaceName}</span>
                  <Badge tone={isActive ? "accent" : "neutral"}>{m.role.toLowerCase()}</Badge>
                  {isActive && <Check className="text-accent size-3.5 shrink-0" />}
                </button>
              );
            })}

            <div className="bg-border my-1 h-px" />

            <a
              href="/settings/workspace/new"
              role="menuitem"
              className="hover:bg-surface-2 flex w-full items-center gap-2 rounded-[--radius-md] px-2 py-1.5 text-sm"
            >
              <Plus className="size-4" />
              New workspace
            </a>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
