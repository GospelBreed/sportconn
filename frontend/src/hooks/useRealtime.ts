import { useEffect, useRef } from "react";
import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

type Table =
  | "leads"
  | "facilities"
  | "captains"
  | "activities"
  | "notifications"
  | "tasks"
  | "outreach"
  | "campaigns";

/**
 * Subscribe to Postgres changes on a `sportconn` table and invalidate the
 * given query keys (debounced). Cleans up the channel on unmount.
 */
export function useRealtime(table: Table, keys: QueryKey[], enabled = true) {
  const qc = useQueryClient();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const channel = supabase
      .channel(`rt-${table}-${Math.random().toString(36).slice(2, 8)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "sportconn", table },
        () => {
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => {
            keys.forEach((key) => qc.invalidateQueries({ queryKey: key }));
          }, 250);
        },
      )
      .subscribe();

    return () => {
      if (timer.current) clearTimeout(timer.current);
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, enabled, JSON.stringify(keys)]);
}
