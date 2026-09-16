import { useLeads } from "@/hooks/queries";
import { LeadsPage } from "./LeadsPage";

export function UserAcquisitionPage() {
  const { data: leads } = useLeads({ pipeline: "user_acquisition" });
  const target = (leads ?? []).reduce((s, l) => s + (l.target_users ?? 0), 0);
  const acquired = (leads ?? []).reduce((s, l) => s + (l.actual_users ?? 0), 0);
  const remaining = Math.max(0, target - acquired);
  const progress = target > 0 ? Math.round((acquired / target) * 100) : 0;

  return (
    <div>
      <div className="px-5 pt-5 sm:px-6 sm:pt-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <SummaryCard label="Target Users" value={target.toLocaleString()} />
          <SummaryCard label="Users Acquired" value={acquired.toLocaleString()} accent="text-success" />
          <SummaryCard label="Remaining" value={remaining.toLocaleString()} />
          <SummaryCard label="Achievement" value={`${progress}%`} />
        </div>
        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-line">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.min(100, progress)}%` }} />
        </div>
      </div>
      <LeadsPage
        pipeline="user_acquisition"
        eyebrow="Growth"
        title="User Acquisition"
        subtitle="Community and user-growth initiatives — target vs. actual."
        emptyLabel="initiative"
      />
    </div>
  );
}

function SummaryCard({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="card-base p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className={`mt-1 text-xl font-bold ${accent ?? "text-ink"}`}>{value}</p>
    </div>
  );
}
