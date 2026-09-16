import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useFacilityDetail, useDeleteFacility, usePipelineStages, useUpdateFacility } from "@/hooks/queries";
import { useRole } from "@/lib/auth";
import { useToast } from "@/components/ui/Toast";
import { Button, Select } from "@/components/ui/primitives";
import { InlineEdit } from "@/components/ui/InlineEdit";
import { Icon } from "@/components/ui/Icon";
import { ErrorState, SkeletonRows, EmptyState } from "@/components/ui/states";
import { ConfirmDialog } from "@/components/ui/overlays";
import { FollowupBadge, StatusBadge } from "@/components/ui/badges";
import { ACTIVITY_META, FACILITY_TYPES, FACILITY_TYPE_LABEL, LOST_REASON_LABEL, LOST_REASONS } from "@/lib/constants";
import { formatDate, formatRelative } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import type { Facility, FacilityType, LostReason } from "@/types";

export function FacilityDetailPage() {
  const { id = "" } = useParams();
  const { data: f, isLoading, isError, refetch } = useFacilityDetail(id);
  const { canWrite, isAdmin } = useRole();
  const { data: stages } = usePipelineStages("facility");
  const update = useUpdateFacility();
  const del = useDeleteFacility();
  const toast = useToast();
  const navigate = useNavigate();
  const [confirmDel, setConfirmDel] = useState(false);
  const [lostOpen, setLostOpen] = useState(false);
  const [lostReason, setLostReason] = useState<LostReason>("other");

  const save = (body: Partial<Facility>) =>
    update.mutate(
      { id, body },
      {
        onSuccess: () => toast.success("Facility updated"),
        onError: (e) => toast.error(e instanceof Error ? e.message : "Update failed"),
      },
    );

  if (isLoading) {
    return (
      <div className="p-5 sm:p-6">
        <SkeletonRows rows={8} />
      </div>
    );
  }
  if (isError || !f) {
    return (
      <div className="p-5 sm:p-6">
        <ErrorState message="Could not load this facility." onRetry={() => refetch()} />
      </div>
    );
  }

  const wonStage = stages?.find((s) => s.is_won)?.key;
  const lostStage = stages?.find((s) => s.is_lost)?.key;

  return (
    <div className="p-5 sm:p-6">
      <Link to="/facilities" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <Icon name="chevron-left" size={16} /> Facilities
      </Link>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-card bg-primary/10 text-primary">
            <Icon name="properties" size={24} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-ink">{f.name}</h1>
              <StatusBadge status={f.status} />
            </div>
            <p className="text-sm text-muted">
              {[f.address_line1, f.city, f.area].filter(Boolean).join(", ") || "No address"} ·{" "}
              {FACILITY_TYPE_LABEL[f.facility_type]}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {canWrite && f.status === "open" && wonStage && (
            <Button
              variant="secondary"
              onClick={() => {
                save({ stage: wonStage });
              }}
            >
              <Icon name="check" size={15} /> Mark Won
            </Button>
          )}
          {canWrite && f.status === "open" && lostStage && (
            <Button variant="secondary" onClick={() => setLostOpen(true)}>
              <Icon name="flag" size={15} /> Mark Lost
            </Button>
          )}
          {isAdmin && (
            <Button variant="secondary" onClick={() => setConfirmDel(true)}>
              <Icon name="trash" size={15} /> Delete
            </Button>
          )}
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-1">
          <div className="card-base p-5">
            <h3 className="mb-2 text-sm font-semibold text-ink">Facility info</h3>
            <InlineEdit label="Name" value={f.name} disabled={!canWrite} onSave={(v) => save({ name: v })} />
            <InlineEdit label="Address" value={f.address_line1 ?? ""} disabled={!canWrite} onSave={(v) => save({ address_line1: v || null })} />
            <InlineEdit label="City" value={f.city ?? ""} disabled={!canWrite} onSave={(v) => save({ city: v || null })} />
            <InlineEdit label="Area" value={f.area ?? ""} disabled={!canWrite} onSave={(v) => save({ area: v || null })} />
            <InlineEdit
              label="Pitches / courts"
              type="number"
              value={String(f.pitch_count ?? 0)}
              disabled={!canWrite}
              onSave={(v) => save({ pitch_count: Math.max(0, Number(v || 0)) })}
            />
            <InlineEdit label="Operating hours" value={f.operating_hours ?? ""} disabled={!canWrite} onSave={(v) => save({ operating_hours: v || null })} />
            <InlineEdit label="Booking model" value={f.booking_model ?? ""} disabled={!canWrite} onSave={(v) => save({ booking_model: v || null })} />
            <InlineEdit label="Current software" value={f.current_software ?? ""} disabled={!canWrite} onSave={(v) => save({ current_software: v || null })} />
            <div className="flex items-center justify-between gap-3 py-2.5">
              <span className="text-xs font-semibold text-muted">Type</span>
              <Select
                value={f.facility_type}
                disabled={!canWrite}
                onChange={(e) => save({ facility_type: e.target.value as FacilityType })}
                className="h-8 w-40 text-sm"
              >
                {FACILITY_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {FACILITY_TYPE_LABEL[t]}
                  </option>
                ))}
              </Select>
            </div>
            <p className="pt-3 text-xs text-muted">Added {formatDate(f.created_at)}</p>
          </div>

          <div className="card-base p-5">
            <h3 className="mb-2 text-sm font-semibold text-ink">Contact</h3>
            <InlineEdit label="Name" value={f.contact_name ?? ""} disabled={!canWrite} onSave={(v) => save({ contact_name: v || null })} />
            <InlineEdit label="Email" type="email" value={f.contact_email ?? ""} disabled={!canWrite} onSave={(v) => save({ contact_email: v || null })} />
            <InlineEdit label="Phone" value={f.contact_phone ?? ""} disabled={!canWrite} onSave={(v) => save({ contact_phone: v || null })} />
          </div>

          <div className="card-base p-5">
            <h3 className="mb-2 text-sm font-semibold text-ink">Opportunity</h3>
            <InlineEdit
              label="Expected value"
              type="number"
              value={String(f.expected_value ?? "")}
              disabled={!canWrite}
              onSave={(v) => save({ expected_value: v ? Number(v) : null })}
            />
            <div className="flex items-center justify-between gap-3 py-2.5">
              <span className="text-xs font-semibold text-muted">Stage</span>
              <Select value={f.stage} disabled={!canWrite} onChange={(e) => save({ stage: e.target.value })} className="h-8 w-40 text-sm">
                {stages?.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </div>
            <InlineEdit
              label="Next follow-up"
              type="date"
              value={f.next_follow_up_at?.slice(0, 10) ?? ""}
              disabled={!canWrite}
              onSave={(v) => save({ next_follow_up_at: v ? new Date(v).toISOString() : null })}
            />
            {f.status === "lost" && f.lost_reason && (
              <p className="mt-2 text-xs text-danger">Lost reason: {LOST_REASON_LABEL[f.lost_reason]}</p>
            )}
          </div>
        </div>

        <div className="space-y-5 lg:col-span-2">
          <div className="card-base p-5">
            <h3 className="mb-3 text-sm font-semibold text-ink">Activity ({f.activities.length})</h3>
            {f.activities.length === 0 ? (
              <EmptyState icon={<Icon name="activity" />} title="No activity yet" subtitle="Calls, visits, and stage changes will stream in here." />
            ) : (
              <div className="space-y-2">
                {f.activities.slice(0, 20).map((a) => (
                  <div key={a.id} className="flex items-start gap-3 rounded-control border border-line px-3 py-2">
                    <Icon name={(ACTIVITY_META[a.type] ?? ACTIVITY_META.system).icon} size={14} className="mt-0.5 text-muted" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-body">{a.description}</p>
                      <p className="text-xs text-muted">{formatRelative(a.created_at)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card-base p-5">
            <h3 className="mb-3 text-sm font-semibold text-ink">Open tasks ({f.tasks.filter((t) => t.status !== "completed" && t.status !== "cancelled").length})</h3>
            {f.tasks.length === 0 ? (
              <EmptyState icon={<Icon name="check" />} title="No tasks" subtitle="No tasks tied to this facility." />
            ) : (
              <div className="space-y-2">
                {f.tasks.map((t) => (
                  <div key={t.id} className="flex items-center justify-between gap-3 rounded-control border border-line px-3 py-2">
                    <p className="truncate text-sm text-body">{t.title}</p>
                    <FollowupBadge at={t.due_at} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDel}
        onClose={() => setConfirmDel(false)}
        title="Delete facility"
        message={`Delete "${f.name}"? This cannot be undone.`}
        loading={del.isPending}
        onConfirm={() =>
          del.mutate(id, {
            onSuccess: () => {
              toast.success("Facility deleted");
              navigate("/facilities");
            },
            onError: (e) => toast.error(e instanceof Error ? e.message : "Delete failed"),
          })
        }
      />

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
        onConfirm={() => {
          if (lostStage) save({ stage: lostStage, lost_reason: lostReason });
          setLostOpen(false);
        }}
      />
    </div>
  );
}
