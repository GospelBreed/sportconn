import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { pingDb } from "@/lib/db";
import { supabase } from "@/lib/supabase";

export type HealthState = "online" | "reconnecting" | "offline";

export function useHealth(): { state: HealthState; refetch: () => void; checking: boolean } {
  const q = useQuery({
    queryKey: ["health"],
    queryFn: pingDb,
    retry: false,
    refetchInterval: 30_000,
    staleTime: 10_000,
  });

  const [rtConnected, setRtConnected] = useState(true);
  useEffect(() => {
    const channel = supabase.channel("rt-health").subscribe((status) => {
      setRtConnected(String(status) === "SUBSCRIBED");
    });
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  let state: HealthState = "online";
  if (q.isError) state = "offline";
  else if (q.isLoading || !rtConnected) state = "reconnecting";

  return { state, refetch: () => q.refetch(), checking: q.isFetching };
}
