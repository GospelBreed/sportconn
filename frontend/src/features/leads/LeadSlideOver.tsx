import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { createOutreach, createTask, updateTask } from "@/lib/db";
import { useLeadDetail, usePipelineStages, useUpdateLead, useUsers } from "@/hooks/queries";
import { useRole } from "@/lib/auth";
import { useToast } from "@/components/ui/Toast";
import { ConfirmDialog, SlideOver, Tabs } from "@/components/ui/overlays";
import { Badge, Button, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/Icon";
import { EmptyState, SkeletonRows } from "@/components/ui/states";
import { FollowupBadge, TemperatureBadge } from "@/components/ui/badges";
import {
  ACTIVITY_META,
  CHANNEL_META,
  FOLLOWUP_TYPE_LABEL,
  FOLLOWUP_TYPES,
  LEAD_SOURCE_LABEL,
  LEAD_TYPE_LABEL,
  LOST_REASON_LABEL,
  LOST_REASONS,
  OUTCOME_META,
  PRIORITY_META,
  TEMPERATURE_META,
  TEMPERATURES,
} from "@/lib/constants";
import { formatDateTime, formatRelative, toDateTimeLocal } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import type {
  Lead,
  LeadDetail,
  LostReason,
  OutreachChannel,
  OutreachOutcome,
  PipelineKey,
  Temperature,
} from "@/types";

type Tab = "overview" | "timeline" | "outreach" | "tasks";

export function LeadSlideOver({
  leadId,
  open,
  onClose,
}: {
  leadId: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>("overview");
  const { data: lead, isLoading } = useLeadDetail(open ? leadId : null);

  useEffect(() => {
    if (open) setTab("overview");
  }, [open, leadId]);

  return (
    <SlideOver open={open} onClose={onClose} width="max-w-2xl">
      {isLoading || !lead ? (
        <div className="p-6">
          <SkeletonRows rows={8} />
        </div>
      ) : (
        <div className="flex h-full flex-col">
          <Header lead={lead} onClose={onClose} />
          <div className="px-5 pt-2">
            <Tabs
              active={tab}
              onChange={setTab}
              tabs={[
                { key: "overview", label: "Overview" },
                { key: "timeline", label: "Timeline" },
                { key: "outreach", label: "Activities", count: lead.outreach.length },
                { key: "tasks", label: "Tasks", count: lead.tasks.filter((t) => t.status !== "completed" && t.status !== "cancelled").length },
              ]}
            />
          </div>
          <div className="flex-1 overflow-y-auto p-5">
            {tab === "overview" && <Overview lead={lead} />}
            {tab === "timeline" && <Timeline lead={lead} />}
            {tab === "outreach" && <OutreachTab lead={lead} />}
            {tab === "tasks" && <TasksTab lead={lead} />}
          </div>
        </div>
      )}
    </SlideOver>
  );
}

function Header({ lead, onClose }: { lead: LeadDetail; onClose: () => void }) {
  const { canWrite } = useRole();
  const update = useUpdateLead();
  const toast = useToast();
  const { data: stages } = usePipelineStages(lead.pipeline as PipelineKey);
  const [lostOpen, setLostOpen] = useState(false);
  const [lostReason, setLostReason] = useState<LostReason>("other");

  const save = (body: Partial<Lead>) =>
    update.mutate(
      { id: lead.id, body },
      { onError: (e) => toast.error(e instanceof Error ? e.message : "Update failed") },
    );

  const wonStage = stages?.find((s) => s.is_won)?.key;
  const lostStage = stages?.find((s) => s.is_lost)?.key;

  const markWon = () => {
    if (!wonStage) return;
    save({ stage: wonStage });
    toast.success("Marked Won");
  };

  const confirmLost = () => {
    if (!lostStage) return;
    save({ stage: lostStage, lost_reason: lostReason });
    setLostOpen(false);
    toast.success("Marked Lost");
  };

  return (
    <div className="border-b border-line p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-lg font-semibold text-ink">{lead.full_name}</h2>
            <Badge className="bg-line text-muted">{LEAD_TYPE_LABEL[lead.lead_type]}</Badge>
          </div>
          <p className="truncate text-sm text-muted">
            {lead.title ?? "—"} · {lead.company_name ?? "—"} · {lead.location_city ?? "—"}
          </p>
        </div>
        <button onClick={onClose} className="rounded-control p-1 text-muted hover:bg-line/60 hover:text-ink" aria-label="Close">
          <Icon name="close" size={18} />
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {lead.phone && (
          <a href={`tel:${lead.phone}`} className="btn-secondary-sm inline-flex items-center gap-1.5 rounded-control border border-line px-2.5 py-1.5 text-xs font-medium text-body hover:bg-line/40">
            <Icon name="phone" size={13} /> Call
          </a>
        )}
        {lead.email && (
          <a href={`mailto:${lead.email}`} className="inline-flex items-center gap-1.5 rounded-control border border-line px-2.5 py-1.5 text-xs font-medium text-body hover:bg-line/40">
            <Icon name="mail" size={13} /> Email
          </a>
        )}
        {(lead.whatsapp || lead.phone) && (
          <a
            href={`https://wa.me/${(lead.whatsapp || lead.phone || "").replace(/[^0-9]/g, "")}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-control border border-line px-2.5 py-1.5 text-xs font-medium text-body hover:bg-line/40"
          >
            <Icon name="mail" size={13} /> WhatsApp
          </a>
        )}
        {canWrite && lead.status === "open" && wonStage && (
          <button onClick={markWon} className="inline-flex items-center gap-1.5 rounded-control bg-success/10 px-2.5 py-1.5 text-xs font-medium text-success hover:bg-success/15">
            <Icon name="check" size={13} /> Mark Won
          </button>
        )}
        {canWrite && lead.status === "open" && lostStage && (
          <button onClick={() => setLostOpen(true)} className="inline-flex items-center gap-1.5 rounded-control bg-danger/10 px-2.5 py-1.5 text-xs font-medium text-danger hover:bg-danger/15">
            <Icon name="flag" size={13} /> Mark Lost
          </button>
        )}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Select
          value={lead.stage}
          disabled={!canWrite}
          onChange={(e) => save({ stage: e.target.value })}
          className="h-9 text-xs"
        >
          {(stages ?? []).map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </Select>
        <Select
          value={lead.temperature}
          disabled={!canWrite}
          onChange={(e) => save({ temperature: e.target.value as Temperature })}
          className="h-9 text-xs"
        >
          {TEMPERATURES.map((t) => (
            <option key={t} value={t}>
              {TEMPERATURE_META[t].label}
            </option>
          ))}
        </Select>
        <div className="col-span-2 flex items-center justify-end gap-2">
          <span className="text-xs text-muted">Value</span>
          <span className="text-sm font-bold text-ink">{formatMoney(lead.expected_value, lead.currency)}</span>
        </div>
      </div>

      <ConfirmDialog
        open={lostOpen}
        onClose={() => setLostOpen(false)}
        title="Mark as Lost"
        message={
          <div className="space-y-2 pt-1">
            <p className="text-sm text-muted">A reason is required so Reports can track why deals are lost.</p>
            <Select value={lostReason} onChange={(e) => setLostReason(e.target.value as LostReason)}>
              {LOST_REASONS.map((r) => (
                <option key={r} value={r}>
                  {LOST_REASON_LABEL[r]}
                </option>
              ))}
            </Select>
          </div>
        }
        confirmLabel="Mark Lost"
        tone="danger"
        onConfirm={confirmLost}
      />
    </div>
  );
}

function Overview({ lead }: { lead: LeadDetail }) {
  const { canWrite } = useRole();
  const update = useUpdateLead();
  const { data: users } = useUsers();
  const toast = useToast();
  const [followUp, setFollowUp] = useState(toDateTimeLocal(lead.next_follow_up_at));
  useEffect(() => setFollowUp(toDateTimeLocal(lead.next_follow_up_at)), [lead.next_follow_up_at]);

  const save = (body: Partial<Lead>) =>
    update.mutate(
      { id: lead.id, body },
      {
        onSuccess: () => toast.success("Lead updated"),
        onError: (e) => toast.error(e instanceof Error ? e.message : "Update failed"),
      },
    );

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="card-base p-4">
          <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-ink">
            <Icon name="user" size={14} /> Contact
          </h3>
          <dl className="space-y-1.5 text-xs">
            <Row label="Email" value={lead.email} />
            <Row label="Phone" value={lead.phone} />
            <Row label="WhatsApp" value={lead.whatsapp} />
            <Row label="LinkedIn" value={lead.linkedin_url} />
            <Row label="Source" value={LEAD_SOURCE_LABEL[lead.source]} />
          </dl>
        </div>
        <div className="card-base p-4">
          <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-ink">
            <Icon name="building" size={14} /> Organization
          </h3>
          <dl className="space-y-1.5 text-xs">
            <Row label="Company" value={lead.company_name} />
            <Row label="Location" value={[lead.location_city, lead.location_country].filter(Boolean).join(", ")} />
            <Row label="Priority" value={PRIORITY_META[lead.priority].label} />
            {lead.pipeline === "sponsor" && <Row label="Sponsorship category" value={lead.sponsorship_category} />}
            {lead.pipeline === "investor" && <Row label="Investor type" value={lead.investor_type} />}
            {lead.pipeline === "investor" && <Row label="Ticket size" value={lead.ticket_size ? formatMoney(lead.ticket_size, lead.currency) : null} />}
            {lead.pipeline === "user_acquisition" && (
              <Row label="Users" value={`${lead.actual_users ?? 0} / ${lead.target_users ?? "—"}`} />
            )}
          </dl>
        </div>
      </div>

      <div className="card-base space-y-3 p-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Assigned to">
            <Select
              value={lead.assigned_to ?? ""}
              disabled={!canWrite}
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
          <Field label="Expected value">
            <Input
              type="number"
              min={0}
              defaultValue={lead.expected_value ?? ""}
              disabled={!canWrite}
              onBlur={(e) => {
                const n = e.target.value ? Number(e.target.value) : null;
                if (n !== lead.expected_value) save({ expected_value: n });
              }}
            />
          </Field>
        </div>
        <Field label="Next follow-up">
          <div className="flex gap-2">
            <Input
              type="datetime-local"
              value={followUp}
              disabled={!canWrite}
              onChange={(e) => setFollowUp(e.target.value)}
            />
            <Select
              value={lead.next_follow_up_type ?? ""}
              disabled={!canWrite}
              onChange={(e) => save({ next_follow_up_type: (e.target.value || null) as Lead["next_follow_up_type"] })}
              className="w-40"
            >
              <option value="">Type…</option>
              {FOLLOWUP_TYPES.map((t) => (
                <option key={t} value={t}>
                  {FOLLOWUP_TYPE_LABEL[t]}
                </option>
              ))}
            </Select>
            <Button
              size="sm"
              variant="secondary"
              disabled={!canWrite}
              onClick={() =>
                save({ next_follow_up_at: followUp ? new Date(followUp).toISOString() : null })
              }
            >
              Set
            </Button>
          </div>
        </Field>
        <Field label="Notes">
          <Textarea
            defaultValue={lead.notes ?? ""}
            disabled={!canWrite}
            onBlur={(e) => {
              if (e.target.value !== (lead.notes ?? "")) save({ notes: e.target.value });
            }}
          />
        </Field>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className="truncate text-right text-body">{value || "—"}</dd>
    </div>
  );
}

function Timeline({ lead }: { lead: LeadDetail }) {
  if (lead.activities.length === 0) {
    return <EmptyState icon={<Icon name="activity" />} title="No activity yet" subtitle="Stage changes and outreach log here." />;
  }
  return (
    <div className="space-y-1">
      {lead.activities.map((a) => {
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

const CHANNELS: OutreachChannel[] = ["call", "whatsapp", "email", "meeting", "linkedin", "proposal", "demo", "other"];

function OutreachTab({ lead }: { lead: LeadDetail }) {
  const { canWrite } = useRole();
  const qc = useQueryClient();
  const toast = useToast();
  const [channel, setChannel] = useState<OutreachChannel>("call");
  const [subject, setSubject] = useState("");
  const [outcome, setOutcome] = useState("completed");
  const [saving, setSaving] = useState(false);

  const log = async () => {
    setSaving(true);
    try {
      await createOutreach({
        lead_id: lead.id,
        channel,
        outcome: outcome as OutreachOutcome,
        subject: subject.trim() || null,
      });
      setSubject("");
      qc.invalidateQueries({ queryKey: ["lead", lead.id] });
      qc.invalidateQueries({ queryKey: ["outreach"] });
      toast.success("Activity logged");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not log");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {canWrite && (
        <div className="card-base space-y-2 p-3">
          <div className="grid grid-cols-2 gap-2">
            <Select value={channel} onChange={(e) => setChannel(e.target.value as OutreachChannel)} className="h-8 text-xs">
              {CHANNELS.map((c) => (
                <option key={c} value={c}>
                  {CHANNEL_META[c].label}
                </option>
              ))}
            </Select>
            <Select value={outcome} onChange={(e) => setOutcome(e.target.value)} className="h-8 text-xs">
              {Object.entries(OUTCOME_META).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </Select>
          </div>
          <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Note / summary" />
          <div className="flex justify-end">
            <Button size="sm" onClick={log} loading={saving}>
              Log activity
            </Button>
          </div>
        </div>
      )}
      {lead.outreach.length === 0 ? (
        <EmptyState icon={<Icon name="mail" />} title="No activity logged yet" subtitle="Log the first call, email, or WhatsApp touch above." />
      ) : (
        <div className="space-y-2">
          {lead.outreach.map((o) => {
            const cm = CHANNEL_META[o.channel];
            const om = OUTCOME_META[o.outcome];
            return (
              <div key={o.id} className="card-base flex items-start gap-3 p-3">
                <div className="mt-0.5 text-muted">
                  <Icon name={cm.icon} size={15} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-body">{o.subject || cm.label}</p>
                  <p className="text-xs text-muted">
                    {o.campaigns?.name ? `${o.campaigns.name} · ` : ""}
                    {formatRelative(o.occurred_at)}
                  </p>
                </div>
                <Badge className={om.cls}>{om.label}</Badge>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TasksTab({ lead }: { lead: LeadDetail }) {
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
      await createTask({
        title: title.trim(),
        lead_id: lead.id,
        due_at: due ? new Date(due).toISOString() : null,
      });
      setTitle("");
      setDue("");
      qc.invalidateQueries({ queryKey: ["lead", lead.id] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
      toast.success("Task added");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add task");
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (id: string, done: boolean) => {
    try {
      await updateTask(id, { status: done ? "to_do" : "completed" });
      qc.invalidateQueries({ queryKey: ["lead", lead.id] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
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
      {lead.tasks.length === 0 ? (
        <EmptyState icon={<Icon name="check" />} title="No tasks" subtitle="Add a follow-up task above." />
      ) : (
        <div className="space-y-2">
          {lead.tasks.map((t) => {
            const done = t.status === "completed";
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
                  <p className={"text-sm " + (done ? "text-muted line-through" : "text-body")}>
                    {t.title}
                  </p>
                  {t.due_at && <p className="text-xs text-muted">Due {formatDateTime(t.due_at)}</p>}
                </div>
                <FollowupBadge at={!done ? t.due_at : null} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
