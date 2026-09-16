import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  useCases,
  useDeleteTask,
  useLeadPipeline,
  useTasks,
  useUpdateTask,
} from "@/hooks/queries";
import { useRealtime } from "@/hooks/useRealtime";
import { useRole } from "@/lib/auth";
import { useToast } from "@/components/ui/Toast";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/Icon";
import { EmptyState, ErrorState, SkeletonRows } from "@/components/ui/states";
import { ConfirmDialog } from "@/components/ui/overlays";
import { PriorityBadge } from "@/components/ui/badges";
import { cn } from "@/lib/cn";
import { followupBucket, formatDateTime } from "@/lib/format";
import { ACTIVE_STAGES, FOLLOWUP_META, LEAD_ACTIVE_STAGES } from "@/lib/constants";
import { AddTaskModal } from "@/features/tasks/AddTaskModal";
import type { Task } from "@/types";

const BUCKETS = [
  { key: "overdue", title: "Overdue" },
  { key: "today", title: "Due today" },
  { key: "upcoming", title: "Upcoming" },
  { key: "later", title: "Later / no date" },
] as const;

export function TasksPage() {
  const { canWrite } = useRole();
  const navigate = useNavigate();
  const { data: tasks, isLoading, isError, refetch } = useTasks(true);
  const { data: leads } = useLeadPipeline();
  const { data: cases } = useCases();
  const update = useUpdateTask();
  const del = useDeleteTask();
  const toast = useToast();

  useRealtime("tasks", [["tasks", true]]);
  const [params, setParams] = useSearchParams();
  const [addOpen, setAddOpen] = useState(false);
  const [toDelete, setToDelete] = useState<Task | null>(null);
  const [showDone, setShowDone] = useState(false);

  useEffect(() => {
    if (params.get("new") === "1" && canWrite) {
      setAddOpen(true);
      params.delete("new");
      setParams(params, { replace: true });
    }
  }, [params, canWrite, setParams]);

  const open = useMemo(() => (tasks ?? []).filter((t) => t.status === "open"), [tasks]);
  const done = useMemo(() => (tasks ?? []).filter((t) => t.status === "done"), [tasks]);

  const grouped = useMemo(() => {
    const g: Record<string, Task[]> = { overdue: [], today: [], upcoming: [], later: [] };
    for (const t of open) {
      const b = followupBucket(t.due_at);
      if (b === "overdue") g.overdue.push(t);
      else if (b === "today") g.today.push(t);
      else if (b === "upcoming") g.upcoming.push(t);
      else g.later.push(t);
    }
    return g;
  }, [open]);

  const pipelineFollowups = useMemo(() => {
    const rows: { id: string; label: string; sub: string; at: string; to: string }[] = [];
    (leads ?? [])
      .filter((l) => LEAD_ACTIVE_STAGES.includes(l.stage) && l.next_follow_up_at)
      .forEach((l) =>
        rows.push({
          id: `lead-${l.id}`,
          label: l.property_name ?? l.full_name,
          sub: `Lead · ${l.company_name ?? "—"}`,
          at: l.next_follow_up_at as string,
          to: `/leads?focus=${l.id}`,
        }),
      );
    (cases ?? [])
      .filter((c) => ACTIVE_STAGES.includes(c.stage) && c.next_follow_up_at)
      .forEach((c) =>
        rows.push({
          id: `case-${c.id}`,
          label: c.title,
          sub: `Case · ${c.residents?.full_name ?? c.properties?.name ?? "—"}`,
          at: c.next_follow_up_at as string,
          to: `/cases?case=${c.id}`,
        }),
      );
    return rows
      .filter((r) => ["overdue", "today", "upcoming"].includes(followupBucket(r.at)))
      .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  }, [leads, cases]);

  const complete = (t: Task) =>
    update.mutate(
      { id: t.id, body: { status: t.status === "done" ? "open" : "done" } },
      { onError: (e) => toast.error(e instanceof Error ? e.message : "Failed") },
    );

  const snooze = (t: Task, days: number) => {
    const base = t.due_at ? new Date(t.due_at) : new Date();
    const next = new Date(Math.max(Date.now(), base.getTime()) + days * 86_400_000);
    update.mutate(
      { id: t.id, body: { due_at: next.toISOString() } },
      {
        onSuccess: () => toast.success(`Snoozed ${days}d`),
        onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
      },
    );
  };

  return (
    <div className="p-5 sm:p-6">
      <PageHeader
        eyebrow="Operations"
        title="Tasks"
        subtitle={`${grouped.overdue.length} overdue · ${grouped.today.length} due today · ${open.length} open`}
        actions={
          canWrite && (
            <Button onClick={() => setAddOpen(true)}>
              <Icon name="plus" size={16} /> New task
            </Button>
          )
        }
      />

      <div className="mt-5 space-y-6">
        {isLoading ? (
          <div className="card-base p-5">
            <SkeletonRows rows={6} />
          </div>
        ) : isError ? (
          <ErrorState message="Could not load tasks." onRetry={() => refetch()} />
        ) : (
          <>
            {open.length === 0 && (
              <div className="card-base">
                <EmptyState
                  icon={<Icon name="check" />}
                  title="No open tasks"
                  subtitle="Create a task or set a follow-up on a lead or case."
                />
              </div>
            )}

            {BUCKETS.map((b) => {
              const rows = grouped[b.key];
              if (rows.length === 0) return null;
              return (
                <section key={b.key}>
                  <div className="mb-2 flex items-center gap-2">
                    {b.key !== "later" && (
                      <span className={cn("h-2 w-2 rounded-full", FOLLOWUP_META[b.key].dot)} />
                    )}
                    <h2 className="text-sm font-semibold text-ink">{b.title}</h2>
                    <span className="rounded-control bg-line px-1.5 py-0.5 text-[10px] font-semibold text-muted">
                      {rows.length}
                    </span>
                  </div>
                  <div className="card-base divide-y divide-line overflow-hidden">
                    {rows.map((t) => (
                      <div key={t.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex min-w-0 items-start gap-3">
                          <button
                            disabled={!canWrite}
                            onClick={() => complete(t)}
                            className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border border-line hover:border-success"
                            aria-label="Complete"
                          />
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-ink">{t.title}</p>
                            <p className="text-xs text-muted">
                              {t.leads?.company_name ?? t.leads?.full_name ?? t.residents?.full_name ?? t.cases?.title ?? "General"}
                              {t.due_at ? ` · ${formatDateTime(t.due_at)}` : ""}
                              {t.assignee ? ` · ${t.assignee.full_name}` : ""}
                            </p>
                          </div>
                        </div>
                        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                          <PriorityBadge priority={t.priority} />
                          {canWrite && (
                            <>
                              <Button size="sm" variant="secondary" onClick={() => snooze(t, 1)}>
                                +1d
                              </Button>
                              {t.lead_id && (
                                <Button size="sm" variant="ghost" onClick={() => navigate(`/leads?focus=${t.lead_id}`)}>
                                  Open
                                </Button>
                              )}
                              <button
                                onClick={() => setToDelete(t)}
                                className="rounded p-1 text-muted hover:bg-line/60 hover:text-danger"
                                aria-label="Delete task"
                              >
                                <Icon name="trash" size={14} />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              );
            })}

            {pipelineFollowups.length > 0 && (
              <section>
                <div className="mb-2 flex items-center gap-2">
                  <Icon name="clock" size={14} className="text-muted" />
                  <h2 className="text-sm font-semibold text-ink">Pipeline follow-ups</h2>
                  <span className="rounded-control bg-line px-1.5 py-0.5 text-[10px] font-semibold text-muted">
                    {pipelineFollowups.length}
                  </span>
                </div>
                <div className="card-base divide-y divide-line overflow-hidden">
                  {pipelineFollowups.map((r) => (
                    <button
                      key={r.id}
                      onClick={() => navigate(r.to)}
                      className="flex w-full items-center justify-between gap-3 p-4 text-left hover:bg-surface-2"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-ink">{r.label}</p>
                        <p className="text-xs text-muted">{r.sub}</p>
                      </div>
                      <span
                        className={cn(
                          "shrink-0 rounded-control px-1.5 py-0.5 text-[10px] font-semibold",
                          FOLLOWUP_META[followupBucket(r.at) as "overdue" | "today" | "upcoming"].badge,
                        )}
                      >
                        {formatDateTime(r.at)}
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {done.length > 0 && (
              <section>
                <button
                  onClick={() => setShowDone((s) => !s)}
                  className="mb-2 flex items-center gap-2 text-sm font-semibold text-muted hover:text-ink"
                >
                  <Icon name={showDone ? "chevron-down" : "chevron-right"} size={14} />
                  Completed ({done.length})
                </button>
                {showDone && (
                  <div className="card-base divide-y divide-line overflow-hidden">
                    {done.map((t) => (
                      <div key={t.id} className="flex items-center gap-3 p-3">
                        <span className="flex h-5 w-5 items-center justify-center rounded border border-success bg-success text-white">
                          <Icon name="check" size={12} />
                        </span>
                        <p className="flex-1 text-sm text-muted line-through">{t.title}</p>
                        {canWrite && (
                          <button onClick={() => complete(t)} className="text-xs text-muted hover:text-ink">
                            Reopen
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}
          </>
        )}
      </div>

      <AddTaskModal open={addOpen} onClose={() => setAddOpen(false)} />
      <ConfirmDialog
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        title="Delete task"
        message={`Delete "${toDelete?.title}"?`}
        loading={del.isPending}
        onConfirm={() =>
          toDelete &&
          del.mutate(toDelete.id, {
            onSuccess: () => {
              toast.success("Task deleted");
              setToDelete(null);
            },
            onError: (e) => toast.error(e instanceof Error ? e.message : "Delete failed"),
          })
        }
      />
    </div>
  );
}
