"use client";

import { Search } from "lucide-react";
import { useEffect, useState } from "react";

import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Sticky top bar.
 *
 * This is one of the approved glass surfaces — but only once the page has
 * scrolled, because that is the moment content actually passes beneath it and
 * the blur starts meaning something. At scroll-top it stays flat, which also
 * avoids paying for backdrop-filter on a page nobody has scrolled.
 *
 * The listener is passive and only flips a boolean, so it does no layout work
 * per scroll event.
 */
export function Topbar() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 z-30 flex h-14 items-center gap-3 px-4",
        "transition-[background-color,box-shadow,border-color] duration-[--dur-mid] ease-[--ease-out]",
        scrolled ? "glass border-x-0 border-t-0" : "bg-bg border-b border-transparent",
      )}
    >
      {/* Command palette entry point — wired up in Phase 3. */}
      <Button
        variant="secondary"
        size="sm"
        className="text-muted font-ui w-full max-w-xs justify-start gap-2 font-normal"
      >
        <Search />
        <span className="flex-1 text-left">Search…</span>
        <kbd className="border-border bg-surface-2 text-muted rounded border px-1.5 py-0.5 text-[0.6875rem]">
          ⌘K
        </kbd>
      </Button>

      <div className="ml-auto flex items-center gap-1">
        <ThemeToggle />
      </div>
    </header>
  );
}
