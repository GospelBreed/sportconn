import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createActivity, listActivities } from "@/lib/db";
import { useCase, useUpdateCase, useUsers } from "@/hooks/queries";
import { useRole } from "@/lib/auth";
import { useToast } from "@/components/ui/Toast";
import { SlideOver, Tabs } from "@/components/ui/overlays";
import { Button, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/Icon";
import { EmptyState, SkeletonRows } from "@/components/ui/states";
import { AgingBadge, FollowupBadge, PriorityBadge, StageBadge } from "@/components/ui/badges";
import {
  ACTIVITY_META,
  CASE_CATEGORIES,
  CATEGORY_META,
  PRIORITIES,
  PRIORITY_META,
  STAGES,
} from "@/lib/constants";
import { formatDateTime, formatRelative, toDateTimeLocal } from "@/lib/format";
import type { Activity, Case, CaseCategory, CasePriority, CaseStage } from "@/types";

type Tab = "overview" | "timeline";

export function CaseSlideOver({
  caseId,
  open,
  onClose,
}: {
  caseId: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>("overview");
  const { data: c, isLoading } = useCase(open ? caseId : null);

  useEffect(() => {
    if (open) setTab("overview");
  }, [open, caseId]);

  return (
    <SlideOver open={open} onClose={onClose} width="max-w-xl">
      {isLoading || !c ? (
        <div className="p-6">
          <SkeletonRows rows={7} />
        </div>
      ) : (
        <div className="flex h-full flex-col">
          <div className="border-b border-line p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">
                  {CATEGORY_META[c.category].label} case
                </p>
                <h2 className="mt-0.5 text-lg font-semibold text-ink">{c.title}</h2>
                <p className="mt-1 text-sm text-muted">
                  {c.residents?.full_name ?? c.properties?.name ?? "—"}
                  {c.residents?.unit_number ? ` · Unit ${c.residents.unit_number}` : ""}
                </p>
              </div>
              <button
                onClick={onClose}
                className="rounded-control p-1 text-muted hover:bg-line/60 hover:text-ink"
                aria-label="Close"
              >
                <Icon name="close" size={18} />
              </button>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <StageBadge stage={c.stage} />
              <PriorityBadge priority={c.priority} />
              <AgingBadge stageEnteredAt={c.stage_entered_at} />
              <FollowupBadge at={c.next_follow_up_at} />
            </div>
          </div>

          <div className="px-5 pt-2">
            <Tabs
              active={tab}
              onChange={setTab}
              tabs={[
                { key: "overview", label: "Overview" },
                { key: "timeline", label: "Timeline" },
              ]}
            />
          </div>

          <div className="flex-1 overflow-y-auto p-5">
            {tab === "overview" ? <OverviewTab c={c} /> : <TimelineTab c={c} />}
          </div>
        </div>
      )}
    </SlideOver>
  );
}

function OverviewTab({ c }: { c: Case }) {
  const { canWrite } = useRole();
  const update = useUpdateCase();
  const { data: users } = useUsers();
  const toast = useToast();
  const [followUp, setFollowUp] = useState(toDateTimeLocal(c.next_follow_up_at));

  useEffect(() => setFollowUp(toDateTimeLocal(c.next_follow_up_at)), [c.next_follow_up_at]);

  const save = (body: Partial<Case>) =>
    update.mutate(
      { id: c.id, body },
      {
        onSuccess: () => toast.success("Case updated"),
        onError: (e) => toast.error(e instanceof Error ? e.message : "Update failed"),
      },
    );

  const disabled = !canWrite;

  return (
    <div className="space-y-5">
      <div className="card-base space-y-3 p-4">
        <Field label="Stage">
          <Select
            value={c.stage}
            disabled={disabled}
            onChange={(e) => save({ stage: e.target.value as CaseStage })}
          >
            {STAGES.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Priority">
            <Select
              value={c.priority}
              disabled={disabled}
              onChange={(e) => save({ priority: e.target.value as CasePriority })}
            >
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_META[p].label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Category">
            <Select
              value={c.category}
              disabled={disabled}
              onChange={(e) => save({ category: e.target.value as CaseCategory })}
            >
              {CASE_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {CATEGORY_META[cat].label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Assigned to">
          <Select
            value={c.assigned_to ?? ""}
            disabled={disabled}
            onChange={(e) => save({ assigned_to: e.target.value || null })}
          >
            <option value="">Unassigned</option>
            {users?.map((u) => (
              <option key={u.id} value={u.id}>
                {u.full_name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="card-base space-y-3 p-4">
        <Field label="Next follow-up" hint="Overdue and due-today follow-ups drive reminders">
          <div className="flex gap-2">
            <Input
              type="datetime-local"
              value={followUp}
              disabled={disabled}
              onChange={(e) => setFollowUp(e.target.value)}
            />
            <Button
              size="sm"
              variant="secondary"
              disabled={disabled}
              onClick={() =>
                save({ next_follow_up_at: followUp ? new Date(followUp).toISOString() : null })
              }
            >
              Set
            </Button>
          </div>
        </Field>
        <button
          type="button"
          disabled
          title="Calendar integration is planned — hook: cases.calendar_event_id"
          className="inline-flex items-center gap-1.5 rounded-control border border-dashed border-line px-2.5 py-1.5 text-xs text-muted"
        >
          <Icon name="calendar" size={13} /> Sync to calendar (coming soon)
        </button>
      </div>

      <div className="card-base p-4">
        <Field label="Description">
          <Textarea
            defaultValue={c.description ?? ""}
            disabled={disabled}
            onBlur={(e) => {
              if (e.target.value !== (c.description ?? "")) save({ description: e.target.value });
            }}
            placeholder="Add context for the team…"
          />
        </Field>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 px-1 text-xs">
        <dt className="text-muted">Opened</dt>
        <dd className="text-body">{formatDateTime(c.opened_at)}</dd>
        <dt className="text-muted">In current stage since</dt>
        <dd className="text-body">{formatDateTime(c.stage_entered_at)}</dd>
        {c.resolved_at && (
          <>
            <dt className="text-muted">Resolved</dt>
            <dd className="text-body">{formatDateTime(c.resolved_at)}</dd>
          </>
        )}
      </dl>
    </div>
  );
}

function TimelineTab({ c }: { c: Case }) {
  const { canWrite } = useRole();
  const qc = useQueryClient();
  const toast = useToast();
  const [type, setType] = useState<"note" | "call" | "visit">("note");
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["case-activities", c.id],
    queryFn: () => listActivities(200),
    select: (rows: Activity[]) => rows.filter((a) => a.case_id === c.id),
  });

  const add = async () => {
    if (!text.trim()) return;
    setSaving(true);
    try {
      await createActivity({
        case_id: c.id,
        resident_id: c.resident_id ?? null,
        property_id: c.property_id ?? null,
        type,
        description: text.trim(),
      });
      setText("");
      qc.invalidateQueries({ queryKey: ["case-activities", c.id] });
      qc.invalidateQueries({ queryKey: ["activities"] });
      toast.success("Logged");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not log");
    } finally {
      setSaving(false);
    }
  };

  const rows = useMemo(() => data ?? [], [data]);

  return (
    <div className="space-y-4">
      {canWrite && (
        <div className="card-base space-y-2 p-3">
          <div className="flex gap-1.5">
            {(["note", "call", "visit"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setType(t)}
                className={
                  "rounded-control px-2.5 py-1 text-xs font-medium capitalize " +
                  (type === t ? "bg-primary/10 text-primary" : "text-muted hover:bg-line/60")
                }
              >
                {t}
              </button>
            ))}
          </div>
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={`Log a ${type}…`}
            className="min-h-[64px]"
          />
          <div className="flex justify-end">
            <Button size="sm" onClick={add} loading={saving} disabled={!text.trim()}>
              Add to timeline
            </Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <SkeletonRows rows={5} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Icon name="activity" />}
          title="No activity yet"
          subtitle="Stage changes and logged calls, visits, and notes appear here."
        />
      ) : (
        <div className="space-y-1">
          {rows.map((a) => {
            const meta = ACTIVITY_META[a.type];
            return (
              <div key={a.id} className="flex gap-3 py-2.5">
                <div
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${meta.tone}`}
                >
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
      )}
    </div>
  );
}
