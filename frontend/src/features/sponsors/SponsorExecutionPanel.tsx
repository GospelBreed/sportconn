import { useMemo, useState } from "react";
import { useLeads, usePendingApprovals, useSponsorScorecard } from "@/hooks/queries";
import { useRealtime } from "@/hooks/useRealtime";
import { useRole } from "@/lib/auth";
import { Badge, Input, Progress } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/Icon";
import { ErrorState, Skeleton } from "@/components/ui/states";
import { Tabs } from "@/components/ui/overlays";
import { cn } from "@/lib/cn";
import { daysInStage, followupBucket, formatDate } from "@/lib/format";
import { formatCompactMoney } from "@/lib/money";
import type { Lead, SponsorScorecard } from "@/types";
import { ApprovalRow } from "./SponsorDealTab";

type Panel = "scorecard" | "attention" | "approvals";

// SOP §11 bottleneck guide, keyed by the first funnel metric that is behind target.
const BOTTLENECK: Record<string, string> = {
  companies: "Not enough companies researched. Build the list before sending more messages.",
  contacts: "Not enough decision-makers identified. Find two relevant people per company.",
  first_contacts: "Outreach volume is behind. Send the personalised first messages to Priority A prospects.",
  meetings: "Replies aren't turning into meetings. Strengthen the call to action and relevance.",
  proposals: "Meetings aren't turning into proposals. Improve qualification and campaign fit.",
  paid: "Proposals aren't turning into payment. Check budget, value, timing, decision process and payment terms.",
};

export function SponsorExecutionPanel({ onOpenLead }: { onOpenLead: (id: string) => void }) {
  const [panel, setPanel] = useState<Panel>("scorecard");
  const { data: approvals } = usePendingApprovals();
  const { data: open } = useLeads({ pipeline: "sponsor", status: "open" });
  useRealtime("deal_approvals", [["approvals"], ["sponsor-scorecard"]]);
  const attention = useMemo(() => needsAttention(open ?? []), [open]);

  return (
    <div className="mt-5 card-base p-4 sm:p-5">
      <Tabs
        active={panel}
        onChange={setPanel}
        tabs={[
          { key: "scorecard", label: "30-day scorecard" },
          { key: "attention", label: "Needs attention", count: attention.length },
          { key: "approvals", label: "Approvals", count: approvals?.length ?? 0 },
        ]}
      />
      <div className="pt-4">
        {panel === "scorecard" && <Scorecard />}
        {panel === "attention" && <Attention items={attention} total={open?.length ?? 0} onOpenLead={onOpenLead} />}
        {panel === "approvals" && <PendingApprovals />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function Scorecard() {
  const [start, setStart] = useState("");
  const to = start ? addDays(start, 29) : undefined;
  const { data, isLoading, isError, refetch } = useSponsorScorecard(start || undefined, to);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <p className="text-xs text-muted">
          {data ? `${formatDate(data.from)} – ${formatDate(data.to)}` : "Loading period…"} · targets are initial operating targets, not a forecast.
        </p>
        <label className="flex items-center gap-2 text-xs text-muted">
          30-day sprint starting
          <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="h-8 w-40 text-xs" aria-label="Sprint start date" />
        </label>
      </div>
      {isLoading ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-card" />
          ))}
        </div>
      ) : isError || !data ? (
        <ErrorState message="Could not load the scorecard. Has migration 0004 been applied?" onRetry={() => refetch()} />
      ) : (
        <ScorecardBody data={data} />
      )}
    </div>
  );
}

function ScorecardBody({ data }: { data: SponsorScorecard }) {
  const actual = (metric: string) => Number((data as unknown as Record<string, number>)[metric] ?? 0);
  const behind = data.targets.find((t) => actual(t.metric) < t.target_min);
  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {data.targets.map((t) => {
          const n = actual(t.metric);
          const pct = t.target_min > 0 ? Math.round((n / t.target_min) * 100) : 100;
          const met = n >= t.target_min;
          return (
            <div key={t.metric} className="rounded-control border border-line p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{t.label}</p>
              <p className="mt-1 text-xl font-bold text-ink">
                {n}
                <span className="text-xs font-medium text-muted">
                  {" "}
                  / {t.target_min}
                  {t.target_max ? `–${t.target_max}` : ""}
                </span>
              </p>
              <Progress value={pct} className="mt-2" />
              <p className={cn("mt-1 text-[11px]", met ? "text-success" : "text-muted")}>{met ? "Target reached" : `${t.target_min - n} to go`}</p>
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted">
        <span>Replies: <b className="text-ink">{data.replies}</b></span>
        <span>Paid value: <b className="text-ink">{formatCompactMoney(data.paid_value)}</b></span>
        <span>Open pipeline: <b className="text-ink">{formatCompactMoney(data.pipeline_value)}</b></span>
        <span>Approvals waiting: <b className="text-ink">{data.pending_approvals}</b></span>
      </div>
      {behind ? (
        <p className="flex items-start gap-2 rounded-control bg-warning/12 px-3 py-2 text-xs text-warning">
          <Icon name="alert" size={13} className="mt-0.5 shrink-0" />
          <span>
            <b>Bottleneck: {behind.label.toLowerCase()}.</b> {BOTTLENECK[behind.metric] ?? ""}
          </span>
        </p>
      ) : (
        <p className="flex items-center gap-2 rounded-control bg-success/10 px-3 py-2 text-xs text-success">
          <Icon name="check" size={13} /> Every target for this period is met.
        </p>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------

interface AttentionItem {
  lead: Lead;
  issues: string[];
}

/** SOP §5 rule: every open prospect has an owner, a stage and a dated next action. */
function needsAttention(leads: Lead[]): AttentionItem[] {
  return leads
    .map((l) => {
      const issues: string[] = [];
      if (!l.assigned_to) issues.push("No owner");
      if (!l.next_action) issues.push("No next action");
      if (!l.next_follow_up_at) issues.push("No follow-up date");
      else if (followupBucket(l.next_follow_up_at) === "overdue") issues.push("Follow-up overdue");
      if (l.prospect_score == null) issues.push("Not scored");
      if (!l.company_name) issues.push("No company name");
      if (!l.email && !l.phone && !l.whatsapp && !l.linkedin_url) issues.push("No contact details");
      if (l.expected_value == null) issues.push("No value");
      if (daysInStage(l.stage_entered_at) >= 14) issues.push(`${daysInStage(l.stage_entered_at)} days in stage`);
      return { lead: l, issues };
    })
    .filter((i) => i.issues.length > 0)
    .sort((a, b) => b.issues.length - a.issues.length);
}

function Attention({ items, total, onOpenLead }: { items: AttentionItem[]; total: number; onOpenLead: (id: string) => void }) {
  const [showAll, setShowAll] = useState(false);
  if (items.length === 0) {
    return (
      <p className="flex items-center gap-2 py-4 text-sm text-success">
        <Icon name="check" size={15} /> Every open sponsor lead has an owner, a next action, a date and a score.
      </p>
    );
  }
  const shown = showAll ? items : items.slice(0, 8);
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted">
        {items.length} of {total} open sponsor leads are missing something. Fix the top ones first.
      </p>
      {shown.map(({ lead, issues }) => (
        <button
          key={lead.id}
          onClick={() => onOpenLead(lead.id)}
          className="flex w-full flex-col gap-1.5 rounded-control border border-line px-3 py-2 text-left transition hover:border-primary/40 sm:flex-row sm:items-center sm:justify-between"
        >
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium text-ink">{lead.company_name || lead.full_name}</span>
            <span className="block truncate text-xs text-muted">{lead.company_name ? lead.full_name : "Contact person not recorded"}</span>
          </span>
          <span className="flex flex-wrap gap-1">
            {issues.map((i) => (
              <Badge key={i} className="bg-warning/12 text-warning">
                {i}
              </Badge>
            ))}
          </span>
        </button>
      ))}
      {items.length > 8 && (
        <button onClick={() => setShowAll(!showAll)} className="text-xs font-medium text-primary hover:underline">
          {showAll ? "Show fewer" : `Show all ${items.length}`}
        </button>
      )}
    </div>
  );
}

function PendingApprovals() {
  const { canApprove } = useRole();
  const { data, isLoading, isError, refetch } = usePendingApprovals();
  if (isLoading) return <Skeleton className="h-16" />;
  if (isError) return <ErrorState message="Could not load approvals." onRetry={() => refetch()} />;
  if (!data || data.length === 0) {
    return <p className="py-4 text-sm text-muted">No approvals waiting for a decision.</p>;
  }
  return (
    <div className="space-y-2">
      {!canApprove && <p className="text-xs text-muted">Only management or admins can decide these.</p>}
      {data.map((a) => (
        <ApprovalRow key={a.id} approval={a} canDecide={canApprove} showLead />
      ))}
    </div>
  );
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(isoDate + "T00:00:00");
  d.setDate(d.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
