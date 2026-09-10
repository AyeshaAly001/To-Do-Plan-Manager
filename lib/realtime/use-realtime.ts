"use client";

import { useEffect, useRef, useState } from "react";

import { createClient } from "@/lib/supabase/client";

/**
 * Realtime change notifications.
 *
 * The important design decision: this subscribes to the FACT that something
 * changed, and never trusts the payload.
 *
 * Supabase Realtime applies RLS to the publishable key, and RLS here is
 * deny-all — so the browser receives change events with no row data. That is
 * deliberate: the alternative is writing RLS policies that duplicate the
 * tenancy rules already enforced in `lib/auth/action.ts`, and two copies of an
 * access rule is how they drift apart.
 *
 * So a change bumps a counter, and the component refetches through the
 * authorized server path. Slightly more work per event, one source of truth
 * for who may see what.
 */
export function useRealtimeChannel({
  channel,
  tables,
  enabled = true,
}: {
  /** Channel name. Use one per project so events are scoped. */
  channel: string;
  /** Tables to watch, e.g. ["tasks", "comments"]. */
  tables: string[];
  enabled?: boolean;
}): { version: number; connected: boolean } {
  const [version, setVersion] = useState(0);
  const [connected, setConnected] = useState(false);

  // Tables is usually an inline array; comparing by content stops the effect
  // from resubscribing on every render.
  const tablesKey = tables.join(",");
  const bumpRef = useRef(() => setVersion((v) => v + 1));

  useEffect(() => {
    if (!enabled) return;

    const supabase = createClient();
    const subscription = supabase.channel(channel);

    for (const table of tablesKey.split(",").filter(Boolean)) {
      subscription.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        // No payload inspection: see the note above.
        () => bumpRef.current(),
      );
    }

    subscription.subscribe((status) => {
      setConnected(status === "SUBSCRIBED");
    });

    return () => {
      // Explicit removal, not just unsubscribe: leaking channels across
      // navigations is what makes a realtime app slowly stop working.
      void supabase.removeChannel(subscription);
    };
  }, [channel, tablesKey, enabled]);

  return { version, connected };
}

/**
 * Presence: who else is looking at this.
 *
 * Uses Supabase presence rather than a table, because this state is genuinely
 * ephemeral — writing "viewing" rows to Postgres would mean cleaning up after
 * every dropped connection.
 */
export function usePresence({
  channel,
  self,
  enabled = true,
}: {
  channel: string;
  self: { id: string; name: string };
  enabled?: boolean;
}): { others: { id: string; name: string }[] } {
  const [others, setOthers] = useState<{ id: string; name: string }[]>([]);

  const selfId = self.id;
  const selfName = self.name;

  useEffect(() => {
    if (!enabled) return;

    const supabase = createClient();
    const room = supabase.channel(channel, {
      config: { presence: { key: selfId } },
    });

    room
      .on("presence", { event: "sync" }, () => {
        const state = room.presenceState<{ id: string; name: string }>();
        const people = Object.values(state)
          .flat()
          .filter((p) => p.id !== selfId)
          // The same person in two tabs is one person.
          .filter((p, i, all) => all.findIndex((q) => q.id === p.id) === i);
        setOthers(people.map((p) => ({ id: p.id, name: p.name })));
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          void room.track({ id: selfId, name: selfName });
        }
      });

    return () => {
      void supabase.removeChannel(room);
    };
  }, [channel, selfId, selfName, enabled]);

  return { others };
}
