"use client";

import { useCallback, useSyncExternalStore } from "react";

/** Same-tab writes need an explicit nudge: `storage` only fires in OTHER tabs. */
const LOCAL_WRITE_EVENT = "ash:local-storage";

/**
 * A boolean persisted in localStorage, read hydration-safely.
 *
 * Written with `useSyncExternalStore` rather than `useState` + an effect,
 * because localStorage genuinely *is* an external store — and reading it in an
 * effect then calling setState forces a second render on every mount (which
 * React 19's `set-state-in-effect` rule flags).
 *
 * Subscribing to `storage` is a real bonus rather than incidental: collapse the
 * sidebar in one tab and every other tab follows.
 *
 * @param key          localStorage key
 * @param serverValue  what to assume during SSR, before the real value is readable
 */
export function usePersistedFlag(
  key: string,
  serverValue = false,
): readonly [boolean, (next: boolean) => void] {
  const subscribe = useCallback((onStoreChange: () => void) => {
    window.addEventListener("storage", onStoreChange);
    window.addEventListener(LOCAL_WRITE_EVENT, onStoreChange);
    return () => {
      window.removeEventListener("storage", onStoreChange);
      window.removeEventListener(LOCAL_WRITE_EVENT, onStoreChange);
    };
  }, []);

  const getSnapshot = useCallback(() => {
    try {
      return window.localStorage.getItem(key) === "1";
    } catch {
      // Safari in private mode throws on localStorage access.
      return serverValue;
    }
  }, [key, serverValue]);

  const getServerSnapshot = useCallback(() => serverValue, [serverValue]);

  const value = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setValue = useCallback(
    (next: boolean) => {
      try {
        window.localStorage.setItem(key, next ? "1" : "0");
      } catch {
        // Ignore: the UI still updates, it just won't persist.
      }
      window.dispatchEvent(new Event(LOCAL_WRITE_EVENT));
    },
    [key],
  );

  return [value, setValue] as const;
}
