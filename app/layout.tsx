import type { Metadata, Viewport } from "next";
import { Inter, Playpen_Sans } from "next/font/google";

import { ThemeProvider } from "@/components/theme-provider";
import { PALETTE } from "@/lib/design/palette";

import "./globals.css";

/**
 * Two families, on purpose.
 *
 * Playpen Sans is a casual-handwriting design — it gives the app its voice in
 * headings and short copy, but it has no tabular numerals and reads poorly in
 * long or dense text. Inter carries the data: table cells, chart labels,
 * timestamps, descriptions. The boundary is enforced at the component level;
 * see the `font-display` / `font-ui` utilities.
 *
 * Both are self-hosted by next/font (no request to Google at runtime, no CLS).
 * Variable fonts, so no `weight` array is needed.
 */
const playpen = Playpen_Sans({
  variable: "--font-playpen",
  subsets: ["latin"],
  display: "swap",
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Ash",
    template: "%s · Ash",
  },
  description: "Plan the work, then do it. Team task and project planning.",
  applicationName: "Ash",
};

/**
 * Browser chrome color. The meta tag can't read a CSS custom property, so the
 * value comes from the TS palette rather than being written out by hand — this
 * is the one place the token has to cross into JS.
 */
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: PALETTE.light.bg },
    { media: "(prefers-color-scheme: dark)", color: PALETTE.dark.bg },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // suppressHydrationWarning: next-themes sets class="dark" before paint, so
    // the server and client markup differ on <html> by design.
    <html
      lang="en"
      suppressHydrationWarning
      className={`${playpen.variable} ${inter.variable} h-full`}
    >
      <body className="bg-bg text-ink flex min-h-full flex-col">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
