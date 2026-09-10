"use client";

import { useSyncExternalStore } from "react";

/** Never changes, so React never re-subscribes. */
const subscribe = () => () => {};

/**
 * False during SSR and the first render, true once hydrated.
 *
 * The obvious version of this is `useState(false)` plus
 * `useEffect(() => setMounted(true))`, but that calls setState inside an effect
 * — which React 19's `react-hooks/set-state-in-effect` rule flags, because it
 * schedules a second render pass on every mount.
 *
 * `useSyncExternalStore` expresses the same thing declaratively: the server
 * snapshot is `false`, the client snapshot is `true`, and React reconciles it
 * during hydration with no extra render.
 *
 * Use it to gate anything that cannot be known on the server (resolved theme,
 * `window`, `localStorage`).
 */
export function useIsHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
