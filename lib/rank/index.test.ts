import { describe, expect, it } from "vitest";

import {
  compareRanks,
  firstRank,
  needsRebalance,
  rankAfter,
  rankBefore,
  rankBetween,
  rankForIndex,
  ranksBetween,
} from "@/lib/rank";

/** Sorts the way Postgres does, which is what the index guarantees. */
const sorted = (ranks: string[]) => [...ranks].sort(compareRanks);

describe("rank generation", () => {
  it("produces a rank for an empty list", () => {
    expect(firstRank()).toBeTruthy();
  });

  it("places a new rank strictly between two others", () => {
    const a = firstRank();
    const c = rankAfter(a);
    const b = rankBetween(a, c);

    expect(compareRanks(a, b)).toBeLessThan(0);
    expect(compareRanks(b, c)).toBeLessThan(0);
  });

  it("appends after the last rank", () => {
    const a = firstRank();
    const b = rankAfter(a);
    expect(compareRanks(a, b)).toBeLessThan(0);
  });

  it("prepends before the first rank", () => {
    const a = firstRank();
    const z = rankBefore(a);
    expect(compareRanks(z, a)).toBeLessThan(0);
  });

  it("generates n ordered ranks between bounds", () => {
    const ranks = ranksBetween(null, null, 5);
    expect(ranks).toHaveLength(5);
    expect(sorted(ranks)).toEqual(ranks);
  });

  it("returns nothing for a non-positive count", () => {
    expect(ranksBetween(null, null, 0)).toEqual([]);
    expect(ranksBetween(null, null, -3)).toEqual([]);
  });
});

describe("repeated insertion at the same point", () => {
  it("never produces a duplicate or out-of-order rank", () => {
    // The pathological case for fractional indexing: dragging into the same
    // gap over and over. Keys get longer, but order must hold exactly.
    let low = firstRank();
    const high = rankAfter(low);
    const generated: string[] = [];

    for (let i = 0; i < 200; i++) {
      const next = rankBetween(low, high);
      generated.push(next);
      expect(compareRanks(low, next)).toBeLessThan(0);
      expect(compareRanks(next, high)).toBeLessThan(0);
      low = next;
    }

    expect(new Set(generated).size).toBe(generated.length);
    expect(sorted(generated)).toEqual(generated);
  });
});

describe("compareRanks", () => {
  it("orders bytewise, not by locale", () => {
    // The reason this helper exists: a locale-aware comparison can disagree
    // with Postgres, which sorts these bytewise — producing a list that looks
    // wrong only for some users.
    expect(compareRanks("a0", "a1")).toBeLessThan(0);
    expect(compareRanks("a1", "a0")).toBeGreaterThan(0);
    expect(compareRanks("a0", "a0")).toBe(0);
    expect(compareRanks("Z", "a")).toBeLessThan(0); // uppercase sorts first
  });

  it("is a valid comparator: sorting is stable and total", () => {
    const ranks = ranksBetween(null, null, 20);
    const shuffled = [...ranks].reverse();
    expect(sorted(shuffled)).toEqual(ranks);
  });
});

describe("rankForIndex", () => {
  // Simulates the real drag: remove the moved item, then ask where it lands.
  const setup = (n: number) => ranksBetween(null, null, n);

  it("moves an item to the front", () => {
    const ranks = setup(4);
    const others = ranks.filter((_, i) => i !== 2);
    const moved = rankForIndex(others, 0);

    expect(compareRanks(moved, others[0]!)).toBeLessThan(0);
  });

  it("moves an item to the end", () => {
    const ranks = setup(4);
    const others = ranks.filter((_, i) => i !== 1);
    const moved = rankForIndex(others, others.length);

    expect(compareRanks(moved, others[others.length - 1]!)).toBeGreaterThan(0);
  });

  it("moves an item into the middle", () => {
    const ranks = setup(5);
    const others = ranks.filter((_, i) => i !== 0);
    const moved = rankForIndex(others, 2);

    expect(compareRanks(others[1]!, moved)).toBeLessThan(0);
    expect(compareRanks(moved, others[2]!)).toBeLessThan(0);
  });

  it("clamps an out-of-range index instead of throwing", () => {
    // Defensive: a drag library reporting a stale index should not 500.
    const others = setup(3);
    expect(() => rankForIndex(others, 99)).not.toThrow();
    expect(() => rankForIndex(others, -5)).not.toThrow();

    expect(compareRanks(rankForIndex(others, 99), others[2]!)).toBeGreaterThan(0);
    expect(compareRanks(rankForIndex(others, -5), others[0]!)).toBeLessThan(0);
  });

  it("handles an empty list", () => {
    expect(rankForIndex([], 0)).toBeTruthy();
  });

  it("does not care what order the input array is in", () => {
    // Callers pass whatever order the UI had; the function sorts internally.
    const ranks = setup(4);
    const forward = rankForIndex(ranks, 2);
    const backward = rankForIndex([...ranks].reverse(), 2);
    expect(forward).toBe(backward);
  });
});

describe("needsRebalance", () => {
  it("is false for freshly generated ranks", () => {
    expect(needsRebalance(ranksBetween(null, null, 50))).toBe(false);
  });

  it("is true once a key grows pathologically long", () => {
    expect(needsRebalance(["a0", "a".repeat(60)])).toBe(true);
  });
});
