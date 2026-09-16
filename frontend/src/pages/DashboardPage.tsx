import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useActivityFeed, useDashboard, useFollowups, useLeads, useUpdateTask, useTasks } from "@/hooks/queries";
import { useRealtime } from "@/hooks/useRealtime";
import { useAuth, useRole } from "@/lib/auth";
import { useToast } from "@/components/ui/Toast";
import { Icon, type IconName } from "@/components/ui/Icon";
import { EmptyState, ErrorState, SkeletonRows } from "@/components/ui/states";
import { PriorityBadge } from "@/components/ui/badges";
import { ACTIVITY_META, PIPELINE_LABEL } from "@/lib/constants";
import { cn } from "@/lib/cn";
import { formatCompactMoney } from "@/lib/money";
import { followupBucket, formatDateTime, formatRelative } from "@/lib/format";
import type { Task } from "@/types";

export function DashboardPage() {
  const { user } = useAuth();
  const { canWrite } = useRole();
  const navigate = useNavigate();
  const { data: dash, isLoading, isError, refetch } = useDashboard();
  const { data: hotLeads } = useLeads({ temperature: "hot", status: "open" });
  const { data: openTasks } = useTasks(false);
  const { data: followups } = useFollowups();
  const { data: activity } = useActivityFeed(12);
  useRealtime("leads", [["dashboard-summary"], ["leads"]]);
  useRealtime("facilities", [["dashboard-summary"], ["facilities"]]);
  useRealtime("tasks", [["dashboard-summary"], ["tasks", false]]);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  const priority = useMemo(() => (hotLeads ?? []).slice(0, 3), [hotLeads]);

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

  const overdueFollowups = (followups ?? []).filter((f) => f.bucket === "overdue").length;
  const todayFollowups = (followups ?? []).filter((f) => f.bucket === "today").length;
  const upcomingFollowups = (followups ?? []).filter((f) => f.bucket === "upcoming").length;

  const usersProgress = dash && dash.users_target > 0 ? Math.round((dash.users_acquired / dash.users_target) * 100) : 0;

  if (isLoading) {
    return (
      <div className="space-y-5 p-5 sm:p-6">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          {Array.from({ length: 10 }).map((_, i) => (
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
          Growth &amp; partnership command centre
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink">
          {greeting}, {user?.full_name?.split(" ")[0] ?? "there"}
        </h1>
        <p className="mt-1 text-sm text-muted">
          What's happening across your Sportconn pipeline and growth work.
        </p>
      </div>

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
                <p className="truncate text-sm font-semibold">{l.company_name || l.full_name}</p>
                <p className="truncate text-xs text-white/80">
                  {PIPELINE_LABEL[l.pipeline]} · {[l.location_city, l.location_country].filter(Boolean).join(", ") || "—"}
                </p>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Kpi label="Total leads" value={String(dash.total_leads)} icon="person" />
        <Kpi label="Active opportunities" value={String(dash.active_opportunities)} icon="board" />
        <Kpi label="Total pipeline value" value={formatCompactMoney(dash.total_pipeline_value)} icon="analytics" accent />
        <Kpi label="Weighted pipeline" value={formatCompactMoney(dash.weighted_pipeline)} icon="dollar" />
        <Kpi label="Sponsors in pipeline" value={String(dash.sponsor_count)} icon="dollar" />
        <Kpi label="Investors in pipeline" value={String(dash.investor_count)} icon="building" />
        <Kpi label="Facilities in pipeline" value={String(dash.facility_count)} icon="properties" />
        <Kpi label="Users acquired" value={String(dash.users_acquired)} icon="sparkle" />
        <Kpi label="Overdue follow-ups" value={String(dash.overdue_followups)} icon="alert" tone={dash.overdue_followups ? "danger" : undefined} />
        <Kpi label="Overdue tasks" value={String(dash.tasks_overdue)} icon="clock" tone={dash.tasks_overdue ? "danger" : undefined} />
      </div>

      <div className="card-base p-5">
        <h3 className="text-sm font-semibold text-ink">Pipeline overview</h3>
        <p className="mb-4 text-xs text-muted">Active opportunities and value by pipeline.</p>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {dash.pipeline_breakdown.map((p) => (
            <button
              key={p.pipeline}
              onClick={() => navigate(`/pipeline?pipeline=${p.pipeline}`)}
              className="min-w-[140px] flex-1 rounded-control border border-line p-3 text-left transition hover:border-primary/40"
            >
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">{p.label}</p>
              <p className="mt-1 text-base font-bold text-ink">{formatCompactMoney(p.value)}</p>
              <p className="text-xs text-muted">{p.count} active</p>
              <div className="mt-2 h-1 rounded-full bg-primary" style={{ opacity: 0.25 + Math.min(0.75, p.count / 10) }} />
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className="card-base p-5">
          <h3 className="mb-3 text-sm font-semibold text-ink">Lead temperature</h3>
          <div className="mb-4 flex gap-4 text-xs">
            <Legend color="bg-danger" label={`Hot ${dash.temperature.hot}`} />
            <Legend color="bg-warning" label={`Warm ${dash.temperature.warm}`} />
            <Legend color="bg-info" label={`Cold ${dash.temperature.cold}`} />
            <Legend color="bg-muted" label={`At Risk ${dash.temperature.at_risk}`} />
          </div>
          <div className="flex h-2 overflow-hidden rounded-full bg-line">
            <Seg n={dash.temperature.hot} total={tempTotal(dash)} cls="bg-danger" />
            <Seg n={dash.temperature.warm} total={tempTotal(dash)} cls="bg-warning" />
            <Seg n={dash.temperature.cold} total={tempTotal(dash)} cls="bg-info" />
            <Seg n={dash.temperature.at_risk} total={tempTotal(dash)} cls="bg-muted" />
          </div>
        </div>

        <div className="card-base p-5">
          <h3 className="mb-1 text-sm font-semibold text-ink">User acquisition</h3>
          <p className="mb-3 text-xs text-muted">Target vs. actual users across all growth initiatives.</p>
          {dash.users_target === 0 ? (
            <EmptyState icon={<Icon name="sparkle" />} title="No targets set" subtitle="Add a User Acquisition lead to start tracking." />
          ) : (
            <>
              <div className="mb-1 flex justify-between text-xs">
                <span className="text-body">{dash.users_acquired} / {dash.users_target} users</span>
                <span className="font-semibold text-muted">{usersProgress}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-line">
                <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, usersProgress)}%` }} />
              </div>
              <p className="mt-2 text-xs text-muted">{Math.max(0, dash.users_target - dash.users_acquired)} remaining</p>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className="card-base p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-ink">Follow-up centre</h3>
            <button onClick={() => navigate("/tasks")} className="text-xs font-medium text-primary hover:underline">
              View all
            </button>
          </div>
          <div className="mb-3 grid grid-cols-3 gap-2 text-center">
            <MiniStat label="Overdue" value={overdueFollowups} tone="danger" />
            <MiniStat label="Due today" value={todayFollowups} tone="warning" />
            <MiniStat label="Upcoming" value={upcomingFollowups} />
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

        <div className="card-base p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-ink">Activity feed</h3>
            <button onClick={() => navigate("/activities")} className="text-xs font-medium text-primary hover:underline">
              View all
            </button>
          </div>
          {!activity || activity.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">No activity yet.</p>
          ) : (
            <div className="space-y-1">
              {activity.map((a) => {
                const meta = ACTIVITY_META[a.type] ?? ACTIVITY_META.system;
                return (
                  <div key={a.id} className="flex gap-3 py-2">
                    <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${meta.tone}`}>
                      <Icon name={meta.icon} size={13} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-body">{a.description}</p>
                      <p className="text-xs text-muted">
                        {a.author?.full_name ?? "System"} · {formatRelative(a.created_at)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function tempTotal(d: { temperature: { hot: number; warm: number; cold: number; at_risk: number } }) {
  return Math.max(1, d.temperature.hot + d.temperature.warm + d.temperature.cold + d.temperature.at_risk);
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

function MiniStat({ label, value, tone }: { label: string; value: number; tone?: "danger" | "warning" }) {
  return (
    <div className="rounded-control bg-surface-2 py-2">
      <p className={cn("text-lg font-bold", tone === "danger" ? "text-danger" : tone === "warning" ? "text-warning" : "text-ink")}>
        {value}
      </p>
      <p className="text-[10px] uppercase tracking-wide text-muted">{label}</p>
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
            { id: task.id, body: { status: "completed" } },
            { onSuccess: () => toast.success("Task completed") },
          )
        }
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded border border-line hover:border-success"
        aria-label="Complete task"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink">{task.title}</p>
        <p className="text-xs text-muted">
          {task.leads?.company_name ?? task.leads?.full_name ?? task.facilities?.name ?? task.captains?.full_name ?? "—"}
          {task.due_at ? ` · ${formatDateTime(task.due_at)}` : ""}
        </p>
      </div>
      <PriorityBadge priority={task.priority} />
    </div>
  );
}
