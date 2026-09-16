import { cn } from "@/lib/cn";
import { useHealth } from "@/hooks/useHealth";

const META = {
  online: { label: "Connected", dot: "bg-success", text: "text-muted" },
  reconnecting: { label: "Reconnecting…", dot: "bg-warning animate-pulse", text: "text-warning" },
  offline: { label: "Offline", dot: "bg-danger", text: "text-danger" },
} as const;

export function HealthIndicator() {
  const { state, refetch, checking } = useHealth();
  const m = META[state];
  return (
    <button
      onClick={() => refetch()}
      disabled={checking}
      title="Connection to Supabase — click to re-check"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-control px-2 py-1 text-xs font-medium transition-colors hover:bg-line/60",
        m.text,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", m.dot)} />
      <span className="hidden sm:inline">{m.label}</span>
    </button>
  );
}

export function HealthBanner() {
  const { state, refetch, checking } = useHealth();
  if (state !== "offline") return null;
  return (
    <div className="flex items-center justify-center gap-3 border-b border-danger/30 bg-danger/10 px-4 py-2 text-sm text-danger">
      <span>Can't reach the Sportconn database.</span>
      <button
        onClick={() => refetch()}
        disabled={checking}
        className="rounded-control border border-danger/40 px-2 py-0.5 text-xs font-medium hover:bg-danger/10 disabled:opacity-50"
      >
        {checking ? "Checking…" : "Retry"}
      </button>
    </div>
  );
}
