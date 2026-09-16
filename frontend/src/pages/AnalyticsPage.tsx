import { useMemo, useState } from "react";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useFacilities, useLeads, usePipelineStages, useUsers } from "@/hooks/queries";
import { useRealtime } from "@/hooks/useRealtime";
import { PageHeader } from "@/components/layout/PageHeader";
import { Icon, type IconName } from "@/components/ui/Icon";
import { EmptyState } from "@/components/ui/states";
import { Select } from "@/components/ui/primitives";
import { LEAD_SOURCE_LABEL, LEAD_TYPE_LABEL, LOST_REASON_LABEL, PIPELINE_LABEL } from "@/lib/constants";
import { formatCompactMoney } from "@/lib/money";
import { cn } from "@/lib/cn";
import type { Lead, PipelineKey } from "@/types";

const CRIMSON = "#2563EB";

const REPORT_PIPELINES: PipelineKey[] = ["sponsor", "investor", "strategic_partnership", "facility"];

export function AnalyticsPage() {
  const { data: leads, isLoading: leadsLoading } = useLeads({});
  const { data: facilities } = useFacilities();
  const { data: users } = useUsers();
  useRealtime("leads", [["leads"]]);
  useRealtime("facilities", [["facilities"]]);

  const [pipeline, setPipeline] = useState<PipelineKey>("sponsor");
  const { data: stages } = usePipelineStages(pipeline);

  const isLoading = leadsLoading;

  const allLeads = leads ?? [];
  const openLeads = allLeads.filter((l) => l.status === "open");
  const wonLeads = allLeads.filter((l) => l.status === "won");
  const lostLeads = allLeads.filter((l) => l.status === "lost");
  const totalValue = openLeads.reduce((s, l) => s + (l.expected_value ?? 0), 0);
  const weightedValue = openLeads.reduce((s, l) => s + (l.weighted_value ?? 0), 0);
  const winRate = wonLeads.length + lostLeads.length ? Math.round((wonLeads.length / (wonLeads.length + lostLeads.length)) * 100) : 0;
  const avgDeal = openLeads.length ? totalValue / openLeads.length : 0;

  const usersTarget = allLeads.filter((l) => l.pipeline === "user_acquisition").reduce((s, l) => s + (l.target_users ?? 0), 0);
  const usersAcquired = allLeads.filter((l) => l.pipeline === "user_acquisition").reduce((s, l) => s + (l.actual_users ?? 0), 0);

  return (
    <div className="p-5 sm:p-6">
      <PageHeader
        eyebrow="Insights"
        title="Reports & Analytics"
        subtitle="Management-level reporting across every pipeline. Live from stored records."
      />

      {isLoading ? (
        <div className="mt-5 space-y-5">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="skeleton h-28 rounded-card" />
            ))}
          </div>
          <div className="skeleton h-72 rounded-card" />
        </div>
      ) : (
        <div className="mt-5 space-y-5">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
            <Kpi label="Total pipeline value" value={formatCompactMoney(totalValue)} icon="analytics" accent />
            <Kpi label="Weighted pipeline" value={formatCompactMoney(weightedValue)} icon="dollar" />
            <Kpi label="Win rate" value={`${winRate}%`} icon="check" foot={`${wonLeads.length} won · ${lostLeads.length} lost`} />
            <Kpi label="Avg deal size" value={formatCompactMoney(avgDeal)} icon="board" />
            <Kpi label="Users acquired" value={`${usersAcquired}/${usersTarget || "—"}`} icon="sparkle" />
          </div>

          <div className="card-base p-5">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-ink">Pipeline report — opportunities by stage</h3>
                <p className="text-xs text-muted">Active opportunities in each stage of the selected pipeline.</p>
              </div>
              <Select value={pipeline} onChange={(e) => setPipeline(e.target.value as PipelineKey)} className="w-52">
                {REPORT_PIPELINES.map((p) => (
                  <option key={p} value={p}>
                    {PIPELINE_LABEL[p]}
                  </option>
                ))}
              </Select>
            </div>
            <StageFunnel pipeline={pipeline} stages={stages ?? []} leads={allLeads} facilities={facilities ?? []} />
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <div className="card-base p-5">
              <h3 className="mb-3 text-sm font-semibold text-ink">Lead report — by source</h3>
              <BarList
                data={Object.entries(LEAD_SOURCE_LABEL)
                  .map(([k, label]) => ({ label, value: allLeads.filter((l) => l.source === k).length }))
                  .filter((d) => d.value > 0)
                  .sort((a, b) => b.value - a.value)}
                emptyLabel="No leads yet."
              />
            </div>
            <div className="card-base p-5">
              <h3 className="mb-3 text-sm font-semibold text-ink">Lead report — by type</h3>
              <BarList
                data={Object.entries(LEAD_TYPE_LABEL)
                  .map(([k, label]) => ({ label, value: allLeads.filter((l) => l.lead_type === k).length }))
                  .filter((d) => d.value > 0)
                  .sort((a, b) => b.value - a.value)}
                emptyLabel="No leads yet."
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <div className="card-base p-5">
              <h3 className="mb-3 text-sm font-semibold text-ink">Team performance — active opportunities owned</h3>
              <TeamPerformance leads={allLeads} users={users ?? []} />
            </div>
            <div className="card-base p-5">
              <h3 className="mb-3 text-sm font-semibold text-ink">Why we lose — lost reasons</h3>
              {lostLeads.length === 0 ? (
                <EmptyState icon={<Icon name="flag" />} title="Nothing lost yet" subtitle="Lost reasons will be tracked here." />
              ) : (
                <BarList
                  data={Object.entries(LOST_REASON_LABEL)
                    .map(([k, label]) => ({ label, value: lostLeads.filter((l) => l.lost_reason === k).length }))
                    .filter((d) => d.value > 0)
                    .sort((a, b) => b.value - a.value)}
                  emptyLabel="Nothing lost yet."
                  tone="danger"
                />
              )}
            </div>
          </div>

          <p className="text-center text-[11px] text-muted">
            All figures are calculated live from stored records — no fabricated metrics. Updates live via Supabase Realtime.
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
          tone === "danger" ? "bg-danger/10 text-danger" : accent ? "bg-primary/10 text-primary" : "bg-surface-2 text-muted",
        )}
      >
        <Icon name={icon} size={16} />
      </span>
      <p className={cn("mt-3 text-2xl font-bold", tone === "danger" ? "text-danger" : "text-ink")}>{value}</p>
      <p className="text-xs font-medium text-body">{label}</p>
      {foot && <p className="mt-0.5 text-[11px] text-muted">{foot}</p>}
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TooltipBox = ({ active, payload, label }: any) =>
  active && payload?.length ? (
    <div className="rounded-control border border-line bg-surface px-3 py-2 text-xs shadow-pop">
      <p className="font-medium text-ink">{label ?? payload[0].name}</p>
      <p className="text-muted">{payload[0].payload.display ?? payload[0].value}</p>
    </div>
  ) : null;

function StageFunnel({
  pipeline,
  stages,
  leads,
  facilities,
}: {
  pipeline: PipelineKey;
  stages: { key: string; label: string }[];
  leads: Lead[];
  facilities: ReturnType<typeof useFacilities>["data"];
}) {
  const rows = useMemo(() => {
    if (pipeline === "facility") {
      return stages.map((s) => ({
        name: s.label,
        value: (facilities ?? []).filter((f) => f.stage === s.key).length,
        display: `${(facilities ?? []).filter((f) => f.stage === s.key).length} facilities`,
      }));
    }
    return stages.map((s) => ({
      name: s.label,
      value: leads.filter((l) => l.pipeline === pipeline && l.stage === s.key).length,
      display: `${leads.filter((l) => l.pipeline === pipeline && l.stage === s.key).length} opportunities`,
    }));
  }, [pipeline, stages, leads, facilities]);

  if (!rows.some((r) => r.value > 0)) {
    return <EmptyState icon={<Icon name="analytics" />} title="No opportunities yet" subtitle="Add opportunities to see the funnel." />;
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={rows} margin={{ left: -18 }}>
        <XAxis dataKey="name" tick={{ fill: "#6B7280", fontSize: 10 }} axisLine={{ stroke: "#E9E9EF" }} tickLine={false} interval={0} angle={-20} textAnchor="end" height={60} />
        <YAxis allowDecimals={false} tick={{ fill: "#6B7280", fontSize: 11 }} axisLine={false} tickLine={false} />
        <Tooltip content={<TooltipBox />} cursor={{ fill: "rgba(37,99,235,0.06)" }} />
        <Bar dataKey="value" radius={[6, 6, 0, 0]} fill={CRIMSON} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function BarList({ data, emptyLabel, tone }: { data: { label: string; value: number }[]; emptyLabel: string; tone?: "danger" }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) {
    return <EmptyState icon={<Icon name="flag" />} title="Nothing yet" subtitle={emptyLabel} />;
  }
  return (
    <div className="space-y-3">
      {data.slice(0, 8).map((d) => (
        <div key={d.label}>
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="font-medium text-body">{d.label}</span>
            <span className="text-muted">
              {d.value} · {Math.round((d.value / total) * 100)}%
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-line">
            <div
              className={cn("h-full rounded-full", tone === "danger" ? "bg-danger" : "bg-primary")}
              style={{ width: `${(d.value / total) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function TeamPerformance({ leads, users }: { leads: Lead[]; users: { id: string; full_name: string }[] }) {
  const rows = users
    .map((u) => ({
      name: u.full_name.length > 16 ? u.full_name.slice(0, 16) + "…" : u.full_name,
      value: leads.filter((l) => l.assigned_to === u.id && l.status === "open").length,
      display: `${leads.filter((l) => l.assigned_to === u.id && l.status === "open").length} active`,
    }))
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value);

  if (!rows.length) {
    return <EmptyState icon={<Icon name="users" />} title="Nothing assigned" subtitle="Assign leads to see load per team member." />;
  }
  return (
    <ResponsiveContainer width="100%" height={Math.max(180, rows.length * 42)}>
      <BarChart data={rows} layout="vertical" margin={{ left: 16 }}>
        <XAxis type="number" hide allowDecimals={false} />
        <YAxis type="category" dataKey="name" width={120} tick={{ fill: "#3F3F49", fontSize: 11 }} axisLine={false} tickLine={false} />
        <Tooltip content={<TooltipBox />} cursor={{ fill: "rgba(37,99,235,0.06)" }} />
        <Bar dataKey="value" radius={[0, 6, 6, 0]}>
          {rows.map((_, i) => (
            <Cell key={i} fill={i === 0 ? CRIMSON : "#93C5FD"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
