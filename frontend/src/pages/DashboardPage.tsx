import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useDashboard, useLeads, useTasks, useUpdateTask } from "@/hooks/queries";
import { useRealtime } from "@/hooks/useRealtime";
import { useAuth, useRole } from "@/lib/auth";
import { useToast } from "@/components/ui/Toast";
import { Icon, type IconName } from "@/components/ui/Icon";
import { EmptyState, ErrorState, SkeletonRows } from "@/components/ui/states";
import { Button } from "@/components/ui/primitives";
import {
  ExperienceScore,
  FollowupBadge,
  LeadStageBadge,
  PriorityBadge,
  TemperatureBadge,
} from "@/components/ui/badges";
import { cn } from "@/lib/cn";
import { formatCompactUsd } from "@/lib/money";
import { followupBucket, formatDateTime } from "@/lib/format";
import type { Task } from "@/types";

export function DashboardPage() {
  const { user } = useAuth();
  const { canWrite } = useRole();
  const navigate = useNavigate();
  const { data: dash, isLoading, isError, refetch } = useDashboard();
  const { data: recentLeads } = useLeads({});
  const { data: openTasks } = useTasks(false);
  useRealtime("leads", [["dashboard-summary"], ["leads"]]);
  useRealtime("tasks", [["dashboard-summary"], ["tasks", false]]);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  const priority = useMemo(
    () =>
      (recentLeads ?? [])
        .filter((l) => l.temperature === "hot" && l.stage !== "closed_won" && l.stage !== "closed_lost")
        .slice(0, 3),
    [recentLeads],
  );

  const todaysTasks = useMemo(
    () =>
      (openTasks ?? [])
        .filter((t) => {
          const b = followupBucket(t.due_at);
          return b === "overdue" || b === "today";
        })
        .slice(0, 5),
    [openTasks],
  );

  if (isLoading) {
    return (
      <div className="space-y-5 p-5 sm:p-6">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="skeleton h-24 rounded-card" />
          ))}
        </div>
        <div className="skeleton h-64 rounded-card" />
      </div>
    );
  }
  if (isError || !dash) {
    return (
      <div className="p-5 sm:p-6">
        <ErrorState message="Could not load the dashboard." onRetry={() => refetch()} />
      </div>
    );
  }

  return (
    <div className="space-y-5 p-5 sm:p-6">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">
          Operations intelligence · portfolio feed
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink">
          {greeting}, {user?.full_name?.split(" ")[0] ?? "there"}
        </h1>
        <p className="mt-1 text-sm text-muted">
          What's happening across your Sportconn pipeline and member-experience work.
        </p>
      </div>

      {/* Priority attention */}
      {priority.length > 0 && (
        <div className="rounded-card bg-primary p-5 text-white">
          <div className="flex items-center gap-2">
            <Icon name="alert" size={16} />
            <span className="text-[11px] font-semibold uppercase tracking-wide">Priority attention</span>
          </div>
          <p className="mt-1 text-lg font-semibold">
            {priority.length} hot {priority.length === 1 ? "opportunity needs" : "opportunities need"} attention today
          </p>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
            {priority.map((l) => (
              <button
                key={l.id}
                onClick={() => navigate(`/leads?focus=${l.id}`)}
                className="rounded-control bg-white/12 p-3 text-left transition hover:bg-white/20"
              >
                <p className="truncate text-sm font-semibold">{l.property_name ?? l.full_name}</p>
                <p className="truncate text-xs text-white/80">
                  {[l.location_city, l.location_state].filter(Boolean).join(", ")} ·{" "}
                  {l.experience_score != null ? `Score ${l.experience_score}` : l.company_name}
                </p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
        <Kpi label="Open leads" value={String(dash.total_leads)} icon="residents" />
        <Kpi label="Newly qualified" value={String(dash.new_qualified)} icon="check" />
        <Kpi label="Hot leads" value={String(dash.hot_leads)} icon="alert" tone={dash.hot_leads ? "danger" : undefined} />
        <Kpi label="Assessments" value={String(dash.assessments_done)} icon="sparkle" />
        <Kpi label="Consultations" value={String(dash.consultations)} icon="calendar" />
        <Kpi label="Pipeline ARR" value={formatCompactUsd(dash.pipeline_arr)} icon="analytics" accent />
      </div>

      {/* Pipeline flow */}
      <div className="card-base p-5">
        <h3 className="text-sm font-semibold text-ink">Leasing &amp; resident-onboarding pipeline flow</h3>
        <p className="mb-4 text-xs text-muted">Lead progression and ARR by stage.</p>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {dash.lead_flow.map((s) => (
            <div key={s.stage} className="min-w-[130px] flex-1 rounded-control border border-line p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">{s.label}</p>
              <p className="mt-1 text-base font-bold text-ink">{formatCompactUsd(s.arr)}</p>
              <p className="text-xs text-muted">{s.count} {s.count === 1 ? "lead" : "leads"}</p>
              <div className="mt-2 h-1 rounded-full bg-primary" style={{ opacity: 0.25 + Math.min(0.75, s.count / 10) }} />
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Temperature + experience ranges */}
        <div className="card-base p-5">
          <h3 className="mb-3 text-sm font-semibold text-ink">Lead temperature &amp; experience distribution</h3>
          <div className="mb-4 flex gap-4 text-xs">
            <Legend color="bg-danger" label={`Hot ${dash.temperature.hot}`} />
            <Legend color="bg-warning" label={`Warm ${dash.temperature.warm}`} />
            <Legend color="bg-info" label={`Cold ${dash.temperature.cold}`} />
          </div>
          <div className="mb-4 flex h-2 overflow-hidden rounded-full bg-line">
            <Seg n={dash.temperature.hot} total={tempTotal(dash)} cls="bg-danger" />
            <Seg n={dash.temperature.warm} total={tempTotal(dash)} cls="bg-warning" />
            <Seg n={dash.temperature.cold} total={tempTotal(dash)} cls="bg-info" />
          </div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
            Resident experience score ranges · median {dash.median_experience}
          </p>
          <div className="space-y-2">
            {dash.experience_ranges.map((r) => (
              <div key={r.label} className="flex items-center justify-between text-xs">
                <span className="text-body">{r.label}</span>
                <span className="font-semibold text-muted">{r.count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Demand heatmap */}
        <div className="card-base p-5">
          <h3 className="mb-1 text-sm font-semibold text-ink">Where Sportconn can help most</h3>
          <p className="mb-3 text-xs text-muted">Largest experience gaps across assessed communities.</p>
          {dash.demand_heatmap.every((d) => d.gap === 0) ? (
            <EmptyState icon={<Icon name="sparkle" />} title="No assessments yet" subtitle="Gaps appear once diagnostics are in." />
          ) : (
            <div className="space-y-3">
              {dash.demand_heatmap.map((d) => (
                <div key={d.pillar}>
                  <div className="mb-1 flex justify-between text-xs">
                    <span className="text-body">{d.pillar}</span>
                    <span className="font-semibold text-muted">{d.gap}% gap</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-line">
                    <div
                      className={"h-full rounded-full " + (d.gap >= 40 ? "bg-danger" : d.gap >= 25 ? "bg-warning" : "bg-primary")}
                      style={{ width: `${Math.min(100, d.gap)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Today's priorities */}
        <div className="card-base p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-ink">Today's priorities &amp; follow-ups</h3>
            <button onClick={() => navigate("/tasks")} className="text-xs font-medium text-primary hover:underline">
              View all
            </button>
          </div>
          {todaysTasks.length === 0 ? (
            <EmptyState icon={<Icon name="check" />} title="Nothing due" subtitle="You're clear for today." />
          ) : (
            <div className="space-y-2">
              {todaysTasks.map((t) => (
                <TaskRow key={t.id} task={t} canWrite={canWrite} />
              ))}
            </div>
          )}
        </div>

        {/* Recent leads */}
        <div className="card-base p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-ink">Recent leads &amp; opportunities</h3>
            <button onClick={() => navigate("/pipeline")} className="text-xs font-medium text-primary hover:underline">
              View pipeline
            </button>
          </div>
          {!recentLeads || recentLeads.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">No leads yet.</p>
          ) : (
            <div className="space-y-2">
              {recentLeads.slice(0, 6).map((l) => (
                <button
                  key={l.id}
                  onClick={() => navigate(`/leads?focus=${l.id}`)}
                  className="flex w-full items-center justify-between gap-3 rounded-control border border-line px-3 py-2 text-left hover:border-primary/40"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink">{l.property_name ?? l.full_name}</p>
                    <p className="truncate text-xs text-muted">
                      {[l.location_city, l.location_state].filter(Boolean).join(", ") || l.company_name}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <ExperienceScore score={l.experience_score} />
                    <LeadStageBadge stage={l.stage} />
                    <TemperatureBadge temperature={l.temperature} />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function tempTotal(d: { temperature: { hot: number; warm: number; cold: number } }) {
  return Math.max(1, d.temperature.hot + d.temperature.warm + d.temperature.cold);
}

function Kpi({
  label,
  value,
  icon,
  accent,
  tone,
}: {
  label: string;
  value: string;
  icon: IconName;
  accent?: boolean;
  tone?: "danger";
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
      <p className={cn("mt-2.5 text-xl font-bold", tone === "danger" ? "text-danger" : "text-ink")}>{value}</p>
      <p className="text-xs text-muted">{label}</p>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-muted">
      <span className={cn("h-2 w-2 rounded-full", color)} />
      {label}
    </span>
  );
}

function Seg({ n, total, cls }: { n: number; total: number; cls: string }) {
  if (n <= 0) return null;
  return <span className={cls} style={{ width: `${(n / total) * 100}%` }} />;
}

function TaskRow({ task, canWrite }: { task: Task; canWrite: boolean }) {
  const update = useUpdateTask();
  const toast = useToast();
  return (
    <div className="flex items-center gap-3 rounded-control border border-line px-3 py-2">
      <button
        disabled={!canWrite}
        onClick={() =>
          update.mutate(
            { id: task.id, body: { status: "done" } },
            { onSuccess: () => toast.success("Task completed") },
          )
        }
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded border border-line hover:border-success"
        aria-label="Complete task"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink">{task.title}</p>
        <p className="text-xs text-muted">
          {task.leads?.company_name ?? task.leads?.full_name ?? task.cases?.title ?? "—"}
          {task.due_at ? ` · ${formatDateTime(task.due_at)}` : ""}
        </p>
      </div>
      <PriorityBadge priority={task.priority} />
      <FollowupBadge at={task.due_at} />
    </div>
  );
}
