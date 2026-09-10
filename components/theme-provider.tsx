"use client";

import { ThemeProvider as NextThemeProvider } from "next-themes";
import type { ComponentProps } from "react";

/**
 * Theme is a class on <html> ("dark"), which is what globals.css keys its
 * `@custom-variant dark` off. `defaultTheme: "system"` means a first-time
 * visitor gets whatever their OS prefers.
 */
export function ThemeProvider({
  children,
  ...props
}: ComponentProps<typeof NextThemeProvider>) {
  return (
    <NextThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      // Kill transitions during the swap, otherwise every tokenised color
      // animates at once and the change reads as a flash.
      disableTransitionOnChange
      {...props}
    >
      {children}
    </NextThemeProvider>
  );
}
