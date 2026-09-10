"use client";

import {
  BarChart3,
  CalendarCheck,
  ChevronsLeft,
  FolderKanban,
  Inbox,
  LayoutDashboard,
  Settings,
  Target,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { Button } from "@/components/ui/button";
import { usePersistedFlag } from "@/lib/hooks/use-persisted-flag";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/home", label: "Home", icon: LayoutDashboard },
  { href: "/inbox", label: "Inbox", icon: Inbox },
  { href: "/my-tasks", label: "My tasks", icon: CalendarCheck },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/goals", label: "Goals", icon: Target },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/team", label: "Team", icon: Users },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

const STORAGE_KEY = "ash:sidebar-collapsed";

/**
 * Primary navigation.
 *
 * Flat surface, no glass: the sidebar is always present, and backdrop-filter on
 * a permanent full-height element is wasted GPU work every frame.
 *
 * Collapse state is persisted in localStorage and read through
 * `useSyncExternalStore`, which keeps it hydration-safe without a second
 * render — and makes the state follow across browser tabs.
 */
export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = usePersistedFlag(STORAGE_KEY, false);

  const toggle = () => setCollapsed(!collapsed);

  return (
    <aside
      data-collapsed={collapsed}
      className={cn(
        "bg-surface border-border sticky top-0 hidden h-dvh shrink-0 flex-col border-r md:flex",
        "transition-[width] duration-[--dur-mid] ease-[--ease-out]",
        collapsed ? "w-16" : "w-60",
      )}
    >
      {/* Brand */}
      <div className="flex h-14 items-center gap-2 px-3">
        <div className="bg-accent text-accent-ink font-display grid size-8 shrink-0 place-items-center rounded-[--radius-md] text-sm font-bold">
          A
        </div>
        {!collapsed && <span className="font-display truncate text-lg font-semibold">Ash</span>}
      </div>

      <nav className="flex-1 space-y-0.5 px-2 py-2">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              title={collapsed ? label : undefined}
              className={cn(
                "font-display flex items-center gap-2.5 rounded-[--radius-md] px-2.5 py-2 text-sm font-medium",
                "transition-colors duration-[--dur-fast] ease-[--ease-out]",
                active
                  ? "bg-accent-soft text-ink"
                  : "text-muted hover:bg-surface-2 hover:text-ink",
                collapsed && "justify-center px-0",
              )}
            >
              <Icon className="size-4 shrink-0" />
              {!collapsed && <span className="truncate">{label}</span>}
            </Link>
          );
        })}
      </nav>

      <div className="border-border border-t p-2">
        <Button
          variant="ghost"
          size={collapsed ? "icon" : "sm"}
          onClick={toggle}
          className={cn("w-full", collapsed && "w-9")}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <ChevronsLeft
            className={cn(
              "transition-transform duration-[--dur-mid] ease-[--ease-out]",
              collapsed && "rotate-180",
            )}
          />
          {!collapsed && <span>Collapse</span>}
        </Button>
      </div>
    </aside>
  );
}
