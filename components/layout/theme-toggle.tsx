"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import { Button } from "@/components/ui/button";
import { useIsHydrated } from "@/lib/hooks/use-is-hydrated";

const ORDER = ["light", "dark", "system"] as const;
type Theme = (typeof ORDER)[number];

const META: Record<Theme, { icon: typeof Sun; label: string }> = {
  light: { icon: Sun, label: "Light" },
  dark: { icon: Moon, label: "Dark" },
  system: { icon: Monitor, label: "System" },
};

/**
 * Cycles light -> dark -> system.
 *
 * The hydration guard is not optional: on the server we cannot know the
 * resolved theme, so rendering the icon before hydration would either mismatch
 * or flash the wrong one. Until then we render a same-size placeholder so the
 * topbar doesn't reflow.
 */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const hydrated = useIsHydrated();

  if (!hydrated) {
    return <div className="size-9" aria-hidden />;
  }

  const current = (ORDER.includes(theme as Theme) ? theme : "system") as Theme;
  const next = ORDER[(ORDER.indexOf(current) + 1) % ORDER.length];
  const Icon = META[current].icon;

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(next)}
      title={`Theme: ${META[current].label} — switch to ${META[next].label}`}
      aria-label={`Theme: ${META[current].label}. Switch to ${META[next].label}.`}
    >
      <Icon />
    </Button>
  );
}
