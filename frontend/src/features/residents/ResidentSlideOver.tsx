import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { createActivity } from "@/lib/db";
import { useResidentDetail, useUpdateResident, useUsers } from "@/hooks/queries";
import { useRole } from "@/lib/auth";
import { useToast } from "@/components/ui/Toast";
import { SlideOver, Tabs } from "@/components/ui/overlays";
import { Avatar, Button, Field, Select, Textarea } from "@/components/ui/primitives";
import { InlineEdit } from "@/components/ui/InlineEdit";
import { Icon } from "@/components/ui/Icon";
import { EmptyState, SkeletonRows } from "@/components/ui/states";
import {
  ExperienceScore,
  FollowupBadge,
  PriorityBadge,
  StageBadge,
  StatusBadge,
} from "@/components/ui/badges";
import { ACTIVITY_META, RESIDENT_STATUSES, RESIDENT_STATUS_META } from "@/lib/constants";
import { formatDate, formatRelative } from "@/lib/format";
import { AddCaseModal } from "@/features/pipeline/AddCaseModal";
import type { Resident, ResidentDetail, ResidentStatus } from "@/types";

type Tab = "overview" | "cases" | "activity" | "notes";

export function ResidentSlideOver({
  residentId,
  open,
  onClose,
  onOpenCase,
}: {
  residentId: string | null;
  open: boolean;
  onClose: () => void;
  onOpenCase?: (id: string) => void;
}) {
  const [tab, setTab] = useState<Tab>("overview");
  const { data: r, isLoading } = useResidentDetail(open ? residentId : null);

  return (
    <SlideOver open={open} onClose={onClose} width="max-w-xl">
      {isLoading || !r ? (
        <div className="p-6">
          <SkeletonRows rows={7} />
        </div>
      ) : (
        <div className="flex h-full flex-col">
          <div className="flex items-start justify-between gap-3 border-b border-line p-5">
            <div className="flex items-center gap-3">
              <Avatar name={r.full_name} size={48} />
              <div>
                <h2 className="text-lg font-semibold text-ink">{r.full_name}</h2>
                <p className="text-sm text-muted">
                  {[r.properties?.name, r.unit_number && `Unit ${r.unit_number}`]
                    .filter(Boolean)
                    .join(" · ") || "No property"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge status={r.status} />
              <button
                onClick={onClose}
                className="rounded-control p-1 text-muted hover:bg-line/60 hover:text-ink"
                aria-label="Close"
              >
                <Icon name="close" size={18} />
              </button>
            </div>
          </div>

          <div className="px-5 pt-2">
            <Tabs
              active={tab}
              onChange={setTab}
              tabs={[
                { key: "overview", label: "Overview" },
                { key: "cases", label: "Cases", count: r.cases.length },
                { key: "activity", label: "Activity" },
                { key: "notes", label: "Notes" },
              ]}
            />
          </div>

          <div className="flex-1 overflow-y-auto p-5">
            {tab === "overview" && <OverviewTab r={r} />}
            {tab === "cases" && <CasesTab r={r} onOpenCase={onOpenCase} />}
            {tab === "activity" && <ActivityTab r={r} />}
            {tab === "notes" && <NotesTab r={r} />}
          </div>
        </div>
      )}
    </SlideOver>
  );
}

function OverviewTab({ r }: { r: ResidentDetail }) {
  const { canWrite } = useRole();
  const update = useUpdateResident();
  const { data: users } = useUsers();
  const toast = useToast();

  const save = (body: Partial<Resident>) =>
    update.mutate(
      { id: r.id, body },
      {
        onSuccess: () => toast.success("Member updated"),
        onError: (e) => toast.error(e instanceof Error ? e.message : "Update failed"),
      },
    );

  return (
    <div className="space-y-5">
      <div className="card-base p-4">
        <InlineEdit label="Full name" value={r.full_name} disabled={!canWrite} onSave={(v) => save({ full_name: v })} />
        <InlineEdit label="Email" type="email" value={r.email ?? ""} disabled={!canWrite} onSave={(v) => save({ email: v || null })} />
        <InlineEdit label="Phone" value={r.phone ?? ""} disabled={!canWrite} onSave={(v) => save({ phone: v || null })} />
        <InlineEdit label="Unit" value={r.unit_number ?? ""} disabled={!canWrite} onSave={(v) => save({ unit_number: v || null })} />
        <InlineEdit
          label="Experience score"
          type="number"
          value={r.experience_score != null ? String(r.experience_score) : ""}
          disabled={!canWrite}
          onSave={(v) => save({ experience_score: v ? Math.max(0, Math.min(100, Number(v))) : null })}
        />
        <div className="flex items-center justify-between gap-3 border-b border-line/70 py-2.5">
          <span className="text-xs font-semibold text-muted">Status</span>
          <Select
            value={r.status}
            disabled={!canWrite}
            onChange={(e) => save({ status: e.target.value as ResidentStatus })}
            className="h-8 w-44 text-sm"
          >
            {RESIDENT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {RESIDENT_STATUS_META[s].label}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex items-center justify-between gap-3 py-2.5">
          <span className="text-xs font-semibold text-muted">Case manager</span>
          <Select
            value={r.assigned_case_manager ?? ""}
            disabled={!canWrite}
            onChange={(e) => save({ assigned_case_manager: e.target.value || null })}
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

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 px-1 text-xs">
        <dt className="text-muted">Experience</dt>
        <dd>
          <ExperienceScore score={r.experience_score} />
        </dd>
        <dt className="text-muted">Move-in date</dt>
        <dd className="text-body">{formatDate(r.move_in_date)}</dd>
        <dt className="text-muted">Added</dt>
        <dd className="text-body">{formatDate(r.created_at)}</dd>
      </dl>
    </div>
  );
}

function CasesTab({ r, onOpenCase }: { r: ResidentDetail; onOpenCase?: (id: string) => void }) {
  const { canWrite } = useRole();
  const navigate = useNavigate();
  const [addOpen, setAddOpen] = useState(false);

  const openCase = (id: string) => {
    if (onOpenCase) onOpenCase(id);
    else navigate(`/cases?case=${id}`);
  };

  return (
    <div className="space-y-3">
      {canWrite && (
        <Button size="sm" variant="secondary" onClick={() => setAddOpen(true)}>
          <Icon name="plus" size={14} /> New case for {r.full_name.split(" ")[0]}
        </Button>
      )}
      {r.cases.length === 0 ? (
        <EmptyState icon={<Icon name="board" />} title="No cases" subtitle="This resident has no cases on file." />
      ) : (
        <div className="space-y-2">
          {r.cases.map((c) => (
            <button
              key={c.id}
              onClick={() => openCase(c.id)}
              className="card-base flex w-full items-center justify-between gap-3 p-3 text-left hover:border-primary/40"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-ink">{c.title}</p>
                <div className="mt-1 flex items-center gap-1.5">
                  <StageBadge stage={c.stage} />
                  <FollowupBadge at={c.next_follow_up_at} />
                </div>
              </div>
              <PriorityBadge priority={c.priority} />
            </button>
          ))}
        </div>
      )}
      <AddCaseModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        fixedResident={{ id: r.id, name: r.full_name, propertyId: r.property_id }}
      />
    </div>
  );
}

function ActivityTab({ r }: { r: ResidentDetail }) {
  if (r.activities.length === 0) {
    return (
      <EmptyState
        icon={<Icon name="activity" />}
        title="No activity yet"
        subtitle="Calls, visits, notes, and case changes will stream in here."
      />
    );
  }
  return (
    <div className="space-y-1">
      {r.activities.map((a) => {
        const meta = ACTIVITY_META[a.type];
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

function NotesTab({ r }: { r: ResidentDetail }) {
  const { canWrite } = useRole();
  const qc = useQueryClient();
  const toast = useToast();
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);

  const notes = r.activities.filter((a) => a.type === "note");

  const add = async () => {
    if (!text.trim()) return;
    setSaving(true);
    try {
      await createActivity({ resident_id: r.id, type: "note", description: text.trim() });
      setText("");
      qc.invalidateQueries({ queryKey: ["resident", r.id] });
      qc.invalidateQueries({ queryKey: ["activities"] });
      toast.success("Note added");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add note");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {canWrite && (
        <div className="space-y-2">
          <Field label="New note">
            <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Write a note about this resident…" />
          </Field>
          <div className="flex justify-end">
            <Button size="sm" onClick={add} loading={saving} disabled={!text.trim()}>
              Add note
            </Button>
          </div>
        </div>
      )}
      {notes.length === 0 ? (
        <EmptyState icon={<Icon name="note" />} title="No notes" subtitle="Add the first note above." />
      ) : (
        <div className="space-y-2">
          {notes.map((n) => (
            <div key={n.id} className="card-base p-3">
              <p className="text-sm text-body">{n.description}</p>
              <p className="mt-1.5 text-xs text-muted">
                {n.author?.full_name ?? "Someone"} · {formatRelative(n.created_at)}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
