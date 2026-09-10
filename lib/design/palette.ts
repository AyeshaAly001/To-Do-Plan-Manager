/**
 * The Paper & Clay palette, in TypeScript.
 *
 * `app/globals.css` is what the browser reads; this module is the same values
 * for the places CSS can't reach — Recharts series colors (Phase 6), canvas or
 * PDF export, and the contrast gate.
 *
 * Values are contrast-solved, not eyeballed. If you change one here, change it
 * in globals.css too and run `npm run audit:contrast`.
 */

export type ThemeName = "light" | "dark";

export type TokenName =
  | "bg"
  | "surface"
  | "surface-2"
  | "ink"
  | "muted"
  | "border"
  | "border-strong"
  | "accent"
  | "accent-soft"
  | "accent-ink"
  | "success"
  | "warning"
  | "danger"
  | "info";

export const PALETTE: Record<ThemeName, Record<TokenName, string>> = {
  light: {
    bg: "#FAF8F5",
    surface: "#FFFFFF",
    "surface-2": "#F5F2ED",
    ink: "#2A2724",
    muted: "#756C63",
    border: "#E8E3DC",
    "border-strong": "#8E8983",
    accent: "#A6583E",
    "accent-soft": "#F2E4DE",
    "accent-ink": "#FFFFFF",
    success: "#3B694C",
    warning: "#7D5903",
    danger: "#A63749",
    info: "#47627F",
  },
  dark: {
    bg: "#1A1817",
    surface: "#242120",
    "surface-2": "#2E2A28",
    ink: "#F2EFEA",
    muted: "#9E958A",
    border: "#332F2C",
    "border-strong": "#797570",
    accent: "#D08A6C",
    "accent-soft": "#3A2A24",
    "accent-ink": "#1A1817",
    success: "#89B497",
    warning: "#CAA458",
    danger: "#F78892",
    info: "#91AEC7",
  },
};

/** Surfaces that body text can be painted on. */
export const SURFACES = ["bg", "surface", "surface-2"] as const satisfies readonly TokenName[];

/** Tokens that render as normal-size text, so they owe 4.5:1. */
export const TEXT_TOKENS = [
  "ink",
  "muted",
  "accent",
  "success",
  "warning",
  "danger",
  "info",
] as const satisfies readonly TokenName[];

export const AA_TEXT = 4.5;
/** WCAG 1.4.11 non-text contrast, for control boundaries and the focus ring. */
export const AA_NON_TEXT = 3.0;

// --- color math -------------------------------------------------------------

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as [
    number,
    number,
    number,
  ];
}

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));

/** WCAG relative luminance. */
export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map(toLinear) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two colors, 1..21. Order-independent. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const toHex = (rgb: number[]) =>
  "#" +
  rgb
    .map((c) =>
      Math.round(Math.min(1, Math.max(0, c)) * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")
    .toUpperCase();

/**
 * Flattens `fg` at `alpha` over `bg` — the actual color a `bg-danger/15` chip
 * paints. Needed because a translucent tint is NOT the token's own color, so
 * checking `danger` against `bg` says nothing about text on a danger chip.
 */
export function composite(fg: string, bg: string, alpha: number): string {
  const f = hexToRgb(fg);
  const b = hexToRgb(bg);
  return toHex(f.map((c, i) => c * alpha + b[i]! * (1 - alpha)));
}

/**
 * OKLCH hue angle in degrees.
 *
 * Why this exists: every text token is solved to roughly the same contrast
 * ratio, which forces them to near-identical *lightness*. Luminance contrast
 * therefore cannot tell you whether two of them are visually distinguishable —
 * only hue and chroma can. Hue separation is the metric that actually matters
 * for "does an overdue badge read as the brand color".
 */
export function hue(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map(toLinear) as [number, number, number];
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const deg = (Math.atan2(bb, a) * 180) / Math.PI;
  return deg < 0 ? deg + 360 : deg;
}

/** Shortest angular distance between two hues, 0..180. */
export function hueGap(a: string, b: string): number {
  const d = Math.abs(hue(a) - hue(b));
  return Math.min(d, 360 - d);
}

/**
 * Minimum hue separation between the accent and any semantic color.
 *
 * 20° is the empirical floor at which a clay-orange accent and a red "overdue"
 * badge stop being mistaken for each other at chip size. It is NOT a
 * substitute for non-color encoding — see MIN_* note in the design docs: every
 * status must also carry a label or icon (WCAG 1.4.1).
 */
export const MIN_ACCENT_HUE_GAP = 20;

/** Opacity used by tinted status chips (`bg-danger/15`). */
export const CHIP_TINT_ALPHA = 0.15;

// --- audit ------------------------------------------------------------------

export type ContrastCheck = {
  theme: ThemeName;
  label: string;
  ratio: number;
  required: number;
  pass: boolean;
};

/**
 * Every foreground token against every surface it can actually land on.
 *
 * `--border` is deliberately absent: it is decorative (dividers, hairlines),
 * which 1.4.11 does not cover. `--border-strong` is the token that carries
 * form-control boundaries and is checked here.
 */
export function auditPalette(): ContrastCheck[] {
  const checks: ContrastCheck[] = [];

  for (const theme of ["light", "dark"] as const) {
    const t = PALETTE[theme];
    const add = (label: string, fg: string, bg: string, required: number) => {
      const ratio = contrast(fg, bg);
      checks.push({ theme, label, ratio, required, pass: ratio >= required });
    };

    for (const token of TEXT_TOKENS) {
      for (const surface of SURFACES) {
        add(`${token} text on ${surface}`, t[token], t[surface], AA_TEXT);
      }
    }

    // A filled button's label against its own fill. On dark the accent is a
    // light fill, so the label is the dark ground — hence a separate token.
    add("button label on accent fill", t["accent-ink"], t.accent, AA_TEXT);
    add("ink on accent-soft", t.ink, t["accent-soft"], AA_TEXT);

    for (const surface of SURFACES) {
      add(`control border on ${surface}`, t["border-strong"], t[surface], AA_NON_TEXT);
      add(`focus ring on ${surface}`, t.accent, t[surface], AA_NON_TEXT);
    }

    // Tinted status chips: `bg-danger/15 text-danger`. The chip's real
    // background is the token flattened over the surface, so the token against
    // the bare surface does not cover this case — and the tint always REDUCES
    // the ratio, so this is the binding constraint, not the loose one.
    //
    // The accent is deliberately excluded: it never uses a self-tint. Accent
    // chips and selected rows use the dedicated `--accent-soft` token with
    // `--ink` text (checked above), which is both prettier and far clearer of
    // AA than accent-on-accent/15 could ever be.
    for (const token of ["success", "warning", "danger", "info"] as const) {
      for (const surface of SURFACES) {
        const chipBg = composite(t[token], t[surface], CHIP_TINT_ALPHA);
        add(`${token} text on its ${surface} chip tint`, t[token], chipBg, AA_TEXT);
      }
    }
  }

  return checks;
}
