import { describe, expect, it } from "vitest";

import {
  auditPalette,
  contrast,
  hueGap,
  MIN_ACCENT_HUE_GAP,
  PALETTE,
  SURFACES,
  TEXT_TOKENS,
} from "@/lib/design/palette";

describe("contrast()", () => {
  it("returns 21:1 for black on white", () => {
    expect(contrast("#000000", "#FFFFFF")).toBeCloseTo(21, 1);
  });

  it("returns 1:1 for a color against itself", () => {
    expect(contrast("#A6583E", "#A6583E")).toBeCloseTo(1, 5);
  });

  it("is order-independent", () => {
    expect(contrast("#2A2724", "#FAF8F5")).toBeCloseTo(contrast("#FAF8F5", "#2A2724"), 10);
  });
});

describe("Paper & Clay palette", () => {
  // The whole point of this gate: a warm, low-contrast palette fails
  // accessibility quietly, and "it looks fine" is not a measurement.
  it("clears WCAG AA on every foreground/surface pair in both themes", () => {
    const failures = auditPalette()
      .filter((c) => !c.pass)
      .map((c) => `${c.theme}: ${c.label} — ${c.ratio.toFixed(2)}:1 (needs ${c.required})`);

    expect(failures).toEqual([]);
  });

  it("checks every text token against every plain surface", () => {
    // Guards the audit itself: if someone adds a token but forgets to include
    // it, this catches the shrinking coverage rather than a silent pass.
    // Chip-tint checks share the " text on " wording, so exclude them here —
    // they have their own count assertion below.
    const perTheme = TEXT_TOKENS.length * SURFACES.length;
    const plainChecks = auditPalette().filter(
      (c) => c.label.includes(" text on ") && !c.label.includes("chip tint"),
    );
    expect(plainChecks).toHaveLength(perTheme * 2);
  });

  it("checks every status token against every chip tint", () => {
    // 4 status tokens x 3 surfaces x 2 themes. The accent is excluded by
    // design: it uses --accent-soft, not a self-tint.
    const chipChecks = auditPalette().filter((c) => c.label.includes("chip tint"));
    expect(chipChecks).toHaveLength(4 * SURFACES.length * 2);
  });

  it("defines the same token set in both themes", () => {
    expect(Object.keys(PALETTE.dark).sort()).toEqual(Object.keys(PALETTE.light).sort());
  });

  it("uses a distinct accent-ink per theme, since the accent flips fill role", () => {
    // On light the accent is a dark fill (white label); on dark it is a light
    // fill (dark label). Sharing one label color would fail one of the two.
    expect(PALETTE.light["accent-ink"]).not.toBe(PALETTE.dark["accent-ink"]);
  });

  it("keeps semantic colors distinguishable from the accent by hue", () => {
    // Status must not read as "just the brand color" — an overdue badge that
    // looks clay-coloured signals nothing.
    //
    // Measured as HUE separation, not contrast ratio. Every text token is
    // solved to ~the same ratio against the background, which forces them to
    // near-identical lightness; luminance contrast between two of them is
    // therefore ~1:1 by construction and says nothing about whether a human
    // can tell them apart. Hue is what carries the distinction.
    const tooClose: string[] = [];

    for (const theme of ["light", "dark"] as const) {
      const t = PALETTE[theme];
      for (const token of ["success", "warning", "danger", "info"] as const) {
        const gap = hueGap(t.accent, t[token]);
        if (gap < MIN_ACCENT_HUE_GAP) {
          tooClose.push(`${theme}: ${token} is ${gap.toFixed(1)}° from accent`);
        }
      }
    }

    expect(tooClose).toEqual([]);
  });

  it("keeps the semantic colors distinguishable from each other by hue", () => {
    const collisions: string[] = [];
    const tokens = ["success", "warning", "danger", "info"] as const;

    for (const theme of ["light", "dark"] as const) {
      const t = PALETTE[theme];
      for (let i = 0; i < tokens.length; i++) {
        for (let j = i + 1; j < tokens.length; j++) {
          const gap = hueGap(t[tokens[i]!], t[tokens[j]!]);
          if (gap < MIN_ACCENT_HUE_GAP) {
            collisions.push(
              `${theme}: ${tokens[i]}/${tokens[j]} only ${gap.toFixed(1)}° apart`,
            );
          }
        }
      }
    }

    expect(collisions).toEqual([]);
  });

  it("keeps text legible on tinted status chips", () => {
    // `bg-danger/15 text-danger` paints the token flattened over the surface,
    // which lowers the ratio versus the bare surface. Covered by auditPalette,
    // asserted separately here so a regression names the chip explicitly.
    const failures = auditPalette()
      .filter((c) => c.label.includes("chip tint") && !c.pass)
      .map((c) => `${c.theme}: ${c.label} — ${c.ratio.toFixed(2)}:1`);

    expect(failures).toEqual([]);
  });
});
