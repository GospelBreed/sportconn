import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { createOutreach, createTask, updateTask } from "@/lib/db";
import { useLeadDetail, useUpdateLead, useUsers } from "@/hooks/queries";
import { useRole } from "@/lib/auth";
import { useToast } from "@/components/ui/Toast";
import { SlideOver, Tabs } from "@/components/ui/overlays";
import { Avatar, Badge, Button, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/Icon";
import { EmptyState, SkeletonRows } from "@/components/ui/states";
import { FollowupBadge, TemperatureBadge } from "@/components/ui/badges";
import { ScoreRing } from "@/components/ui/ScoreRing";
import {
  ACTIVITY_META,
  CHANNEL_META,
  LEAD_SOURCE_LABEL,
  LEAD_STAGES,
  OUTCOME_META,
  PILLARS,
  PROPERTY_TYPE_LABEL,
  TEMPERATURE_META,
} from "@/lib/constants";
import { formatDateTime, formatRelative, toDateTimeLocal } from "@/lib/format";
import { formatUsd } from "@/lib/money";
import type {
  ExperienceAssessment,
  Lead,
  LeadDetail,
  LeadStage,
  LeadTemperature,
  OutreachChannel,
  OutreachOutcome,
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
                { key: "outreach", label: "Outreach", count: lead.outreach.length },
                { key: "tasks", label: "Tasks", count: lead.tasks.filter((t) => t.status === "open").length },
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
  const save = (body: Partial<Lead>) =>
    update.mutate(
      { id: lead.id, body },
      { onError: (e) => toast.error(e instanceof Error ? e.message : "Update failed") },
    );

  return (
    <div className="border-b border-line p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar name={lead.full_name} size={46} />
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold text-ink">{lead.full_name}</h2>
            <p className="truncate text-sm text-muted">
              {lead.title ?? "—"} · {lead.company_name ?? "—"}
            </p>
          </div>
        </div>
        <button onClick={onClose} className="rounded-control p-1 text-muted hover:bg-line/60 hover:text-ink" aria-label="Close">
          <Icon name="close" size={18} />
        </button>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Select
          value={lead.stage}
          disabled={!canWrite}
          onChange={(e) => save({ stage: e.target.value as LeadStage })}
          className="h-9 text-xs"
        >
          {LEAD_STAGES.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </Select>
        <Select
          value={lead.temperature}
          disabled={!canWrite}
          onChange={(e) => save({ temperature: e.target.value as LeadTemperature })}
          className="h-9 text-xs"
        >
          {(["hot", "warm", "cold"] as LeadTemperature[]).map((t) => (
            <option key={t} value={t}>
              {TEMPERATURE_META[t].label}
            </option>
          ))}
        </Select>
        <div className="col-span-2 flex items-center justify-end gap-2">
          <span className="text-xs text-muted">ARR</span>
          <span className="text-sm font-bold text-ink">{formatUsd(lead.estimated_arr)}/yr</span>
        </div>
      </div>
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
            <Row label="LinkedIn" value={lead.linkedin_url} />
            <Row label="Source" value={LEAD_SOURCE_LABEL[lead.source]} />
          </dl>
        </div>
        <div className="card-base p-4">
          <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-ink">
            <Icon name="properties" size={14} /> Property asset
          </h3>
          <dl className="space-y-1.5 text-xs">
            <Row label="Facility" value={lead.property_name} />
            <Row
              label="Location"
              value={[lead.location_city, lead.location_state].filter(Boolean).join(", ")}
            />
            <Row label="Units" value={lead.unit_count ? String(lead.unit_count) : null} />
            <Row label="Asset type" value={PROPERTY_TYPE_LABEL[lead.asset_type]} />
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
          <Field label="Estimated ARR (USD/yr)">
            <Input
              type="number"
              min={0}
              defaultValue={lead.estimated_arr}
              disabled={!canWrite}
              onBlur={(e) => {
                const n = Number(e.target.value || 0);
                if (n !== lead.estimated_arr) save({ estimated_arr: n });
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

      <Diagnostic assessment={lead.assessment} />
    </div>
  );
}

function Diagnostic({ assessment }: { assessment: ExperienceAssessment | null }) {
  if (!assessment) {
    return (
      <div className="card-base p-4">
        <EmptyState
          icon={<Icon name="sparkle" />}
          title="No experience diagnostic"
          subtitle="Once this facility completes the Member Experience checklist, the score and pillar breakdown appear here."
        />
      </div>
    );
  }
  const pillars = PILLARS.map((p) => ({
    label: p.label,
    value: (assessment[p.key as keyof ExperienceAssessment] as number | null) ?? null,
  }));
  return (
    <div className="card-base space-y-4 p-4">
      <div className="flex items-center gap-4">
        <ScoreRing score={assessment.overall_score} size={72} />
        <div>
          <h3 className="text-sm font-semibold text-ink">Member Experience Diagnostic</h3>
          <p className="text-xs text-muted">Submitted {formatDateTime(assessment.submitted_at)}</p>
        </div>
      </div>
      {assessment.synthesis && (
        <p className="rounded-control bg-surface-2 p-3 text-xs leading-relaxed text-body">
          {assessment.synthesis}
        </p>
      )}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {pillars.map((p) => (
          <div key={p.label}>
            <div className="mb-1 flex justify-between text-[11px]">
              <span className="text-body">{p.label}</span>
              <span className="font-semibold text-muted">{p.value ?? "—"}%</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-line">
              <div
                className={
                  "h-full rounded-full " +
                  ((p.value ?? 0) >= 70 ? "bg-success" : (p.value ?? 0) >= 50 ? "bg-warning" : "bg-danger")
                }
                style={{ width: `${p.value ?? 0}%` }}
              />
            </div>
          </div>
        ))}
      </div>
      {assessment.recommended_scope.length > 0 && (
        <div>
          <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-primary">
            <Icon name="sparkle" size={13} /> Recommended scope
          </p>
          <div className="flex flex-wrap gap-1.5">
            {assessment.recommended_scope.map((s) => (
              <Badge key={s} className="bg-primary/10 text-primary">
                {s}
              </Badge>
            ))}
          </div>
        </div>
      )}
      {assessment.responses.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer font-semibold text-muted">
            Diagnostic intake responses ({assessment.responses.length})
          </summary>
          <div className="mt-2 space-y-2">
            {assessment.responses.map((r, i) => (
              <div key={i} className="rounded-control border border-line p-2">
                <p className="font-medium text-body">{r.q}</p>
                <p className="mt-0.5 text-muted">"{r.a}"</p>
              </div>
            ))}
          </div>
        </details>
      )}
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

const CHANNELS: OutreachChannel[] = ["email", "call", "linkedin", "meeting", "sms", "other"];

function OutreachTab({ lead }: { lead: LeadDetail }) {
  const { canWrite } = useRole();
  const qc = useQueryClient();
  const toast = useToast();
  const [channel, setChannel] = useState<OutreachChannel>("email");
  const [subject, setSubject] = useState("");
  const [outcome, setOutcome] = useState("sent");
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
      toast.success("Outreach logged");
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
          <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject / summary" />
          <div className="flex justify-end">
            <Button size="sm" onClick={log} loading={saving}>
              Log outreach
            </Button>
          </div>
        </div>
      )}
      {lead.outreach.length === 0 ? (
        <EmptyState icon={<Icon name="mail" />} title="No outreach yet" subtitle="Log the first touch above." />
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

  const toggle = async (id: string, status: "open" | "done") => {
    try {
      await updateTask(id, { status: status === "open" ? "done" : "open" });
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
          {lead.tasks.map((t) => (
            <div key={t.id} className="card-base flex items-center gap-3 p-3">
              <button
                onClick={() => toggle(t.id, t.status)}
                disabled={!canWrite}
                className={
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded border " +
                  (t.status === "done" ? "border-success bg-success text-white" : "border-line")
                }
                aria-label="Toggle done"
              >
                {t.status === "done" && <Icon name="check" size={12} />}
              </button>
              <div className="min-w-0 flex-1">
                <p className={"text-sm " + (t.status === "done" ? "text-muted line-through" : "text-body")}>
                  {t.title}
                </p>
                {t.due_at && <p className="text-xs text-muted">Due {formatDateTime(t.due_at)}</p>}
              </div>
              <FollowupBadge at={t.status === "open" ? t.due_at : null} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
