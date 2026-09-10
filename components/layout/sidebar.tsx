"use client";

import {
  BarChart3,
  CalendarCheck,
  ChevronsLeft,
  FolderKanban,
  Inbox,
  LayoutDashboard,
  LogOut,
  Settings,
  Target,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTransition } from "react";

import { WorkspaceSwitcher } from "@/components/layout/workspace-switcher";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/auth/auth-actions";
import { can, type Capability } from "@/lib/auth/rbac";
import type { Membership, SessionUser } from "@/lib/auth/session";
import { usePersistedFlag } from "@/lib/hooks/use-persisted-flag";
import { cn } from "@/lib/utils";

/**
 * Nav items, some gated by capability.
 *
 * Hiding what someone cannot use keeps the sidebar honest — a GUEST seeing a
 * "Team" link that 403s is a worse experience than not seeing it. This is
 * presentation only: the actual enforcement is in `authedAction`, and hiding a
 * link is never a substitute for that.
 */
const NAV: { href: string; label: string; icon: typeof Inbox; capability?: Capability }[] = [
  { href: "/home", label: "Home", icon: LayoutDashboard },
  { href: "/inbox", label: "Inbox", icon: Inbox },
  { href: "/my-tasks", label: "My tasks", icon: CalendarCheck },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/goals", label: "Goals", icon: Target },
  { href: "/reports", label: "Reports", icon: BarChart3, capability: "report.view" },
  { href: "/team", label: "Team", icon: Users, capability: "member.view" },
  { href: "/settings/profile", label: "Settings", icon: Settings },
];

const STORAGE_KEY = "ash:sidebar-collapsed";

/**
 * Primary navigation.
 *
 * Flat surface, no glass: the sidebar is always on screen, and
 * backdrop-filter on a permanent full-height element is wasted GPU work on
 * every frame.
 *
 * Collapse state is persisted through `useSyncExternalStore`, which keeps it
 * hydration-safe without a second render and makes it follow across tabs.
 */
export function Sidebar({
  user,
  workspace,
  memberships,
}: {
  user: SessionUser;
  workspace: Membership;
  memberships: Membership[];
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = usePersistedFlag(STORAGE_KEY, false);
  const [signingOut, startSignOut] = useTransition();

  const visible = NAV.filter(
    (item) => !item.capability || can(workspace.role, item.capability),
  );

  return (
    <aside
      data-collapsed={collapsed}
      className={cn(
        "bg-surface border-border sticky top-0 hidden h-dvh shrink-0 flex-col border-r md:flex",
        "transition-[width] duration-[--dur-mid] ease-[--ease-out]",
        collapsed ? "w-16" : "w-60",
      )}
    >
      <div className="border-border border-b p-2">
        <WorkspaceSwitcher active={workspace} memberships={memberships} collapsed={collapsed} />
      </div>

      <nav aria-label="Main" className="flex-1 space-y-0.5 overflow-y-auto px-2 py-2">
        {visible.map(({ href, label, icon: Icon }) => {
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

      <div className="border-border space-y-1 border-t p-2">
        <div
          className={cn(
            "flex items-center gap-2 px-1 py-1",
            collapsed && "justify-center px-0",
          )}
        >
          <Avatar email={user.email} size="sm" />
          {!collapsed && (
            <span className="text-muted min-w-0 flex-1 truncate text-xs">{user.email}</span>
          )}
        </div>

        <form action={() => startSignOut(() => signOut())}>
          <Button
            type="submit"
            variant="ghost"
            size={collapsed ? "icon" : "sm"}
            disabled={signingOut}
            className={cn("w-full justify-start", collapsed && "w-9 justify-center")}
            aria-label="Sign out"
          >
            <LogOut />
            {!collapsed && <span>{signingOut ? "Signing out…" : "Sign out"}</span>}
          </Button>
        </form>

        <Button
          variant="ghost"
          size={collapsed ? "icon" : "sm"}
          onClick={() => setCollapsed(!collapsed)}
          className={cn("w-full justify-start", collapsed && "w-9 justify-center")}
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
