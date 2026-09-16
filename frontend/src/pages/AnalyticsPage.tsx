import {
  Bar,
  BarChart,
  Cell,
  Funnel,
  FunnelChart,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useAnalytics } from "@/hooks/queries";
import { useRealtime } from "@/hooks/useRealtime";
import { PageHeader } from "@/components/layout/PageHeader";
import { Icon, type IconName } from "@/components/ui/Icon";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { PRIORITY_META } from "@/lib/constants";
import { cn } from "@/lib/cn";
import type { AnalyticsSummary } from "@/types";

const CRIMSON = "#E11D48";
const FUNNEL_COLORS = ["#1D4ED8", "#E11D48", "#B45309", "#15803D"];
const PRIORITY_COLORS: Record<string, string> = {
  urgent: "#DC2626",
  high: "#B45309",
  medium: "#1D4ED8",
  low: "#9CA3AF",
};

export function AnalyticsPage() {
  const { data, isLoading, isError, refetch } = useAnalytics();
  useRealtime("cases", [["analytics-summary"]]);
  useRealtime("residents", [["analytics-summary"]]);

  return (
    <div className="p-5 sm:p-6">
      <PageHeader
        eyebrow="Operations intelligence"
        title="Analytics"
        subtitle="Live across the sports-operations pipeline."
      />

      {isLoading ? (
        <div className="mt-5 space-y-5">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="skeleton h-28 rounded-card" />
            ))}
          </div>
          <div className="skeleton h-72 rounded-card" />
        </div>
      ) : isError || !data ? (
        <div className="mt-5">
          <ErrorState message="Could not load analytics." onRetry={() => refetch()} />
        </div>
      ) : (
        <div className="mt-5 space-y-5">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Kpi
              label="Open cases"
              value={String(data.open_cases)}
              icon="board"
              accent
              foot={`${data.resolved_this_week} resolved this week`}
            />
            <Kpi
              label="Avg resolution time"
              value={`${data.avg_resolution_days}d`}
              icon="clock"
              foot="last 90 days"
            />
            <Kpi
              label="At-risk residents"
              value={String(data.at_risk_residents)}
              icon="alert"
              tone={data.at_risk_residents > 0 ? "danger" : undefined}
              foot={`of ${data.total_residents} residents`}
            />
            <Kpi
              label="Overdue follow-ups"
              value={String(data.overdue_followups)}
              icon="followups"
              tone={data.overdue_followups > 0 ? "danger" : undefined}
              foot={`${data.due_today_followups} due today`}
            />
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <div className="card-base p-5">
              <h3 className="text-sm font-semibold text-ink">Case resolution funnel</h3>
              <p className="mb-3 text-xs text-muted">Cases reaching each phase (approximate).</p>
              <FunnelView data={data} />
            </div>

            <div className="card-base p-5">
              <h3 className="text-sm font-semibold text-ink">Cases opened per week</h3>
              <p className="mb-3 text-xs text-muted">Last 8 weeks.</p>
              <WeeklyView data={data.cases_opened_per_week} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <div className="card-base p-5">
              <h3 className="mb-3 text-sm font-semibold text-ink">Open cases by priority</h3>
              <PriorityView data={data.priority_breakdown} />
            </div>

            <div className="card-base p-5">
              <h3 className="mb-3 text-sm font-semibold text-ink">Caseload by manager</h3>
              <CaseloadView data={data.caseload_by_manager} />
            </div>
          </div>

          <p className="text-center text-[11px] text-muted">
            Experience scores reflect resident self-assessments, not independent audits. Updates live
            via Supabase Realtime.
          </p>
        </div>
      )}
    </div>
  );
}

function Kpi({
  label,
  value,
  icon,
  accent,
  tone,
  foot,
}: {
  label: string;
  value: string;
  icon: IconName;
  accent?: boolean;
  tone?: "danger";
  foot?: string;
}) {
  return (
    <div className="card-base p-4">
      <span
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-control",
          tone === "danger"
            ? "bg-danger/10 text-danger"
            : accent
              ? "bg-primary/10 text-primary"
              : "bg-surface-2 text-muted",
        )}
      >
        <Icon name={icon} size={16} />
      </span>
      <p className={cn("mt-3 text-2xl font-bold", tone === "danger" ? "text-danger" : "text-ink")}>
        {value}
      </p>
      <p className="text-xs font-medium text-body">{label}</p>
      {foot && <p className="mt-0.5 text-[11px] text-muted">{foot}</p>}
    </div>
  );
}

const TooltipBox = ({ active, payload, label }: any) =>
  active && payload?.length ? (
    <div className="rounded-control border border-line bg-surface px-3 py-2 text-xs shadow-pop">
      <p className="font-medium text-ink">{label ?? payload[0].name}</p>
      <p className="text-muted">{payload[0].payload.display ?? payload[0].value}</p>
    </div>
  ) : null;

function FunnelView({ data }: { data: AnalyticsSummary }) {
  const rows = data.resolution_funnel.map((s, i) => ({
    name: s.label,
    value: Math.max(s.count, 0),
    fill: FUNNEL_COLORS[i % FUNNEL_COLORS.length],
    display: `${s.count} cases`,
  }));
  if (!rows.some((r) => r.value > 0)) {
    return <EmptyState icon={<Icon name="analytics" />} title="No cases yet" subtitle="Add cases to see the funnel." />;
  }
  return (
    <ResponsiveContainer width="100%" height={280}>
      <FunnelChart>
        <Tooltip content={<TooltipBox />} />
        <Funnel dataKey="value" data={rows} isAnimationActive>
          <LabelList position="right" fill="#3F3F49" stroke="none" dataKey="name" className="text-xs" />
        </Funnel>
      </FunnelChart>
    </ResponsiveContainer>
  );
}

function WeeklyView({ data }: { data: AnalyticsSummary["cases_opened_per_week"] }) {
  if (!data.some((d) => d.count > 0)) {
    return <EmptyState icon={<Icon name="board" />} title="No cases yet" subtitle="Opened cases chart here weekly." />;
  }
  const rows = data.map((d) => ({
    week: new Date(d.week_start).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    count: d.count,
    display: `${d.count} opened`,
  }));
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={rows} margin={{ left: -18 }}>
        <XAxis dataKey="week" tick={{ fill: "#6B7280", fontSize: 11 }} axisLine={{ stroke: "#E9E9EF" }} tickLine={false} />
        <YAxis allowDecimals={false} tick={{ fill: "#6B7280", fontSize: 11 }} axisLine={false} tickLine={false} />
        <Tooltip content={<TooltipBox />} cursor={{ fill: "rgba(225,29,72,0.06)" }} />
        <Bar dataKey="count" radius={[6, 6, 0, 0]} fill={CRIMSON} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function PriorityView({ data }: { data: AnalyticsSummary["priority_breakdown"] }) {
  const total = data.reduce((s, d) => s + d.count, 0);
  if (total === 0) {
    return <EmptyState icon={<Icon name="flag" />} title="No open cases" subtitle="Priority mix appears here." />;
  }
  return (
    <div className="space-y-3">
      {data.map((d) => (
        <div key={d.priority}>
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="font-medium text-body">{PRIORITY_META[d.priority].label}</span>
            <span className="text-muted">
              {d.count} · {Math.round((d.count / total) * 100)}%
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-line">
            <div
              className="h-full rounded-full"
              style={{
                width: `${(d.count / total) * 100}%`,
                background: PRIORITY_COLORS[d.priority],
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function CaseloadView({ data }: { data: AnalyticsSummary["caseload_by_manager"] }) {
  if (!data.length) {
    return <EmptyState icon={<Icon name="users" />} title="Nothing assigned" subtitle="Assign cases to see load per manager." />;
  }
  const rows = data.map((d) => ({
    name: d.full_name.length > 16 ? d.full_name.slice(0, 16) + "…" : d.full_name,
    value: d.open_cases,
    display: `${d.open_cases} open`,
  }));
  return (
    <ResponsiveContainer width="100%" height={Math.max(180, rows.length * 42)}>
      <BarChart data={rows} layout="vertical" margin={{ left: 16 }}>
        <XAxis type="number" hide allowDecimals={false} />
        <YAxis
          type="category"
          dataKey="name"
          width={120}
          tick={{ fill: "#3F3F49", fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip content={<TooltipBox />} cursor={{ fill: "rgba(225,29,72,0.06)" }} />
        <Bar dataKey="value" radius={[0, 6, 6, 0]}>
          {rows.map((_, i) => (
            <Cell key={i} fill={i === 0 ? CRIMSON : "#F0A8B8"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
