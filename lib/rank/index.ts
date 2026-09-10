import { generateKeyBetween, generateNKeysBetween } from "fractional-indexing";

/**
 * Fractional indexing for ordered lists.
 *
 * Tasks get reordered constantly — list, board, timeline. With an integer
 * `position` column, dropping a card at the top rewrites every sibling row;
 * with a fractional index, inserting between two neighbours is computed from
 * just those two, so a drag updates ONE row.
 *
 * Ranks are opaque, lexicographically-sortable strings. Never parse them,
 * never do arithmetic on them, and always sort with a plain string comparison
 * (Postgres `ORDER BY rank` and JS `localeCompare` disagree on some locales —
 * use `compareRanks` below, which is byte-order like Postgres).
 */

/** A rank at the very start of an empty list. */
export function firstRank(): string {
  return generateKeyBetween(null, null);
}

/**
 * A rank strictly between `before` and `after`.
 *
 * Pass `null` for an open end: `rankBetween(null, first)` prepends,
 * `rankBetween(last, null)` appends.
 */
export function rankBetween(before: string | null, after: string | null): string {
  return generateKeyBetween(before ?? null, after ?? null);
}

/** `count` evenly spaced ranks between two bounds — for bulk insert or reseeding. */
export function ranksBetween(
  before: string | null,
  after: string | null,
  count: number,
): string[] {
  if (count <= 0) return [];
  return generateNKeysBetween(before ?? null, after ?? null, count);
}

/** Appends after the current last rank. */
export function rankAfter(last: string | null): string {
  return generateKeyBetween(last ?? null, null);
}

/** Prepends before the current first rank. */
export function rankBefore(first: string | null): string {
  return generateKeyBetween(null, first ?? null);
}

/**
 * Byte-order comparison, matching how Postgres sorts these under the `C`
 * collation used by the index.
 *
 * `Array.prototype.sort()` with no comparator, and `localeCompare`, can both
 * disagree with the database for these strings — which produces a list that
 * looks subtly wrong only for some users. Always sort ranks with this.
 */
export function compareRanks(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * The rank an item should take when moved to `toIndex` in a list.
 *
 * `ranks` is the CURRENT order excluding the item being moved — the caller
 * removes it first, because "insert at index 3" is ambiguous while the item is
 * still occupying a slot.
 *
 * @example
 *   const others = ranks.filter((_, i) => i !== fromIndex);
 *   const rank = rankForIndex(others, toIndex);
 */
export function rankForIndex(ranks: string[], toIndex: number): string {
  const sorted = [...ranks].sort(compareRanks);
  const clamped = Math.max(0, Math.min(toIndex, sorted.length));

  const before = clamped === 0 ? null : (sorted[clamped - 1] ?? null);
  const after = clamped >= sorted.length ? null : (sorted[clamped] ?? null);

  return rankBetween(before, after);
}

/**
 * Whether a list of ranks has drifted long enough to want reseeding.
 *
 * Fractional keys grow by roughly one character per repeated insert at the
 * same spot. That is harmless for a long time, but a list someone has been
 * reordering for months can accumulate very long keys, so this gives the
 * background job something to detect. Reseeding is a maintenance concern, not
 * a correctness one.
 */
export const RANK_LENGTH_REBALANCE_THRESHOLD = 40;

export function needsRebalance(ranks: string[]): boolean {
  return ranks.some((r) => r.length > RANK_LENGTH_REBALANCE_THRESHOLD);
}
