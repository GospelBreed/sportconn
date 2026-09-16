import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { createTask, updateTask } from "@/lib/db";
import { useCaptainDetail, usePipelineStages, useUpdateCaptain, useUsers } from "@/hooks/queries";
import { useRole } from "@/lib/auth";
import { useToast } from "@/components/ui/Toast";
import { SlideOver, Tabs } from "@/components/ui/overlays";
import { Avatar, Button, Field, Input, Select } from "@/components/ui/primitives";
import { InlineEdit } from "@/components/ui/InlineEdit";
import { Icon } from "@/components/ui/Icon";
import { EmptyState, SkeletonRows } from "@/components/ui/states";
import { ACTIVITY_META, FOLLOWUP_BUCKET_META } from "@/lib/constants";
import { followupBucket, formatDate, formatDateTime, formatRelative } from "@/lib/format";
import type { Captain, CaptainDetail } from "@/types";

type Tab = "overview" | "activity" | "tasks";

export function CaptainSlideOver({
  captainId,
  open,
  onClose,
}: {
  captainId: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>("overview");
  const { data: c, isLoading } = useCaptainDetail(open ? captainId : null);

  useEffect(() => {
    if (open) setTab("overview");
  }, [open, captainId]);

  return (
    <SlideOver open={open} onClose={onClose} width="max-w-xl">
      {isLoading || !c ? (
        <div className="p-6">
          <SkeletonRows rows={7} />
        </div>
      ) : (
        <div className="flex h-full flex-col">
          <div className="flex items-start justify-between gap-3 border-b border-line p-5">
            <div className="flex items-center gap-3">
              <Avatar name={c.full_name} size={48} />
              <div>
                <h2 className="text-lg font-semibold text-ink">{c.full_name}</h2>
                <p className="text-sm text-muted">{c.community || c.area || "No community set"}</p>
              </div>
            </div>
            <button onClick={onClose} className="rounded-control p-1 text-muted hover:bg-line/60 hover:text-ink" aria-label="Close">
              <Icon name="close" size={18} />
            </button>
          </div>

          <div className="px-5 pt-2">
            <Tabs
              active={tab}
              onChange={setTab}
              tabs={[
                { key: "overview", label: "Overview" },
                { key: "activity", label: "Activity" },
                { key: "tasks", label: "Tasks", count: c.tasks.filter((t) => t.status !== "completed" && t.status !== "cancelled").length },
              ]}
            />
          </div>

          <div className="flex-1 overflow-y-auto p-5">
            {tab === "overview" && <OverviewTab c={c} />}
            {tab === "activity" && <ActivityTab c={c} />}
            {tab === "tasks" && <TasksTab c={c} />}
          </div>
        </div>
      )}
    </SlideOver>
  );
}

function OverviewTab({ c }: { c: CaptainDetail }) {
  const { canWrite } = useRole();
  const update = useUpdateCaptain();
  const { data: users } = useUsers();
  const { data: stages } = usePipelineStages("captain");
  const toast = useToast();

  const save = (body: Partial<Captain>) =>
    update.mutate(
      { id: c.id, body },
      {
        onSuccess: () => toast.success("Captain updated"),
        onError: (e) => toast.error(e instanceof Error ? e.message : "Update failed"),
      },
    );

  return (
    <div className="space-y-5">
      <div className="card-base p-4">
        <InlineEdit label="Full name" value={c.full_name} disabled={!canWrite} onSave={(v) => save({ full_name: v })} />
        <InlineEdit label="Email" type="email" value={c.email ?? ""} disabled={!canWrite} onSave={(v) => save({ email: v || null })} />
        <InlineEdit label="Phone" value={c.phone ?? ""} disabled={!canWrite} onSave={(v) => save({ phone: v || null })} />
        <InlineEdit label="WhatsApp" value={c.whatsapp ?? ""} disabled={!canWrite} onSave={(v) => save({ whatsapp: v || null })} />
        <InlineEdit label="Community" value={c.community ?? ""} disabled={!canWrite} onSave={(v) => save({ community: v || null })} />
        <InlineEdit label="Area" value={c.area ?? ""} disabled={!canWrite} onSave={(v) => save({ area: v || null })} />
        <InlineEdit
          label="Players"
          type="number"
          value={c.player_count != null ? String(c.player_count) : ""}
          disabled={!canWrite}
          onSave={(v) => save({ player_count: v ? Math.max(0, Number(v)) : null })}
        />
        <div className="flex items-center justify-between gap-3 border-b border-line/70 py-2.5">
          <span className="text-xs font-semibold text-muted">Stage</span>
          <Select
            value={c.stage}
            disabled={!canWrite}
            onChange={(e) => save({ stage: e.target.value })}
            className="h-8 w-44 text-sm"
          >
            {(stages ?? []).map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex items-center justify-between gap-3 py-2.5">
          <span className="text-xs font-semibold text-muted">Owner</span>
          <Select
            value={c.assigned_to ?? ""}
            disabled={!canWrite}
            onChange={(e) => save({ assigned_to: e.target.value || null })}
            className="h-8 w-44 text-sm"
          >
            <option value="">Unassigned</option>
            {users?.map((u) => (
              <option key={u.id} value={u.id}>
                {u.full_name}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="card-base p-4">
        <Field label="Next game">
          <Input
            type="date"
            defaultValue={c.next_game_at ?? ""}
            disabled={!canWrite}
            onBlur={(e) => {
              if (e.target.value !== (c.next_game_at ?? "")) save({ next_game_at: e.target.value || null });
            }}
          />
        </Field>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 px-1 text-xs">
        <dt className="text-muted">Games coordinated</dt>
        <dd className="text-body">{c.games_coordinated}</dd>
        <dt className="text-muted">Date joined</dt>
        <dd className="text-body">{formatDate(c.date_joined)}</dd>
        <dt className="text-muted">Last activity</dt>
        <dd className="text-body">{formatRelative(c.last_activity_at)}</dd>
      </dl>
    </div>
  );
}

function ActivityTab({ c }: { c: CaptainDetail }) {
  if (c.activities.length === 0) {
    return <EmptyState icon={<Icon name="activity" />} title="No activity yet" subtitle="Calls, games, and stage changes will stream in here." />;
  }
  return (
    <div className="space-y-1">
      {c.activities.map((a) => {
        const meta = ACTIVITY_META[a.type] ?? ACTIVITY_META.system;
        return (
          <div key={a.id} className="flex gap-3 py-2.5">
            <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${meta.tone}`}>
              <Icon name={meta.icon} size={14} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-body">{a.description}</p>
              <p className="text-xs text-muted">
                {a.author?.full_name ?? "System"} · {formatRelative(a.created_at)}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TasksTab({ c }: { c: CaptainDetail }) {
  const { canWrite } = useRole();
  const qc = useQueryClient();
  const toast = useToast();
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [saving, setSaving] = useState(false);

  const add = async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      await createTask({ title: title.trim(), captain_id: c.id, due_at: due ? new Date(due).toISOString() : null });
      setTitle("");
      setDue("");
      qc.invalidateQueries({ queryKey: ["captain", c.id] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
      toast.success("Task added");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add task");
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (id: string, done: boolean) => {
    await updateTask(id, { status: done ? "to_do" : "completed" });
    qc.invalidateQueries({ queryKey: ["captain", c.id] });
    qc.invalidateQueries({ queryKey: ["tasks"] });
  };

  return (
    <div className="space-y-4">
      {canWrite && (
        <div className="card-base space-y-2 p-3">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Task title" />
          <div className="flex gap-2">
            <Input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} />
            <Button size="sm" onClick={add} loading={saving} disabled={!title.trim()}>
              Add
            </Button>
          </div>
        </div>
      )}
      {c.tasks.length === 0 ? (
        <EmptyState icon={<Icon name="check" />} title="No tasks" subtitle="Add a follow-up task above." />
      ) : (
        <div className="space-y-2">
          {c.tasks.map((t) => {
            const done = t.status === "completed";
            const bucket = !done ? followupBucket(t.due_at) : "none";
            return (
              <div key={t.id} className="card-base flex items-center gap-3 p-3">
                <button
                  onClick={() => toggle(t.id, done)}
                  disabled={!canWrite}
                  className={
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded border " +
                    (done ? "border-success bg-success text-white" : "border-line")
                  }
                  aria-label="Toggle done"
                >
                  {done && <Icon name="check" size={12} />}
                </button>
                <div className="min-w-0 flex-1">
                  <p className={"text-sm " + (done ? "text-muted line-through" : "text-body")}>{t.title}</p>
                  {t.due_at && <p className="text-xs text-muted">Due {formatDateTime(t.due_at)}</p>}
                </div>
                {bucket !== "none" && (
                  <span className="rounded-control px-1.5 py-0.5 text-[10px] font-semibold text-muted">
                    {FOLLOWUP_BUCKET_META[bucket].label}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
