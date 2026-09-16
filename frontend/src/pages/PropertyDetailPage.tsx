import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { usePropertyDetail, useDeleteProperty, useUpdateProperty } from "@/hooks/queries";
import { useRole } from "@/lib/auth";
import { useToast } from "@/components/ui/Toast";
import { Avatar, Badge, Button, Select } from "@/components/ui/primitives";
import { InlineEdit } from "@/components/ui/InlineEdit";
import { Icon } from "@/components/ui/Icon";
import { ErrorState, SkeletonRows, EmptyState } from "@/components/ui/states";
import { ConfirmDialog } from "@/components/ui/overlays";
import { PriorityBadge, StageBadge, StatusBadge } from "@/components/ui/badges";
import { ACTIVE_STAGES, PROPERTY_TYPES, PROPERTY_TYPE_LABEL } from "@/lib/constants";
import { formatDate } from "@/lib/format";
import type { Property, PropertyType } from "@/types";

export function PropertyDetailPage() {
  const { id = "" } = useParams();
  const { data: p, isLoading, isError, refetch } = usePropertyDetail(id);
  const { canWrite, isAdmin } = useRole();
  const update = useUpdateProperty();
  const del = useDeleteProperty();
  const toast = useToast();
  const navigate = useNavigate();
  const [confirmDel, setConfirmDel] = useState(false);

  const save = (body: Partial<Property>) =>
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
  if (isError || !p) {
    return (
      <div className="p-5 sm:p-6">
        <ErrorState message="Could not load this facility." onRetry={() => refetch()} />
      </div>
    );
  }

  const openCases = p.cases.filter((c) => ACTIVE_STAGES.includes(c.stage));

  return (
    <div className="p-5 sm:p-6">
      <Link to="/properties" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <Icon name="chevron-left" size={16} /> Facilities
      </Link>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-card bg-primary/10 text-primary">
            <Icon name="properties" size={24} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-ink">{p.name}</h1>
            <p className="text-sm text-muted">
              {[p.address_line1, p.city, p.state].filter(Boolean).join(", ") || "No address"} ·{" "}
              {PROPERTY_TYPE_LABEL[p.property_type]}
            </p>
          </div>
        </div>
        {isAdmin && (
          <Button variant="secondary" onClick={() => setConfirmDel(true)}>
            <Icon name="trash" size={15} /> Delete
          </Button>
        )}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-1">
          <div className="card-base p-5">
            <h3 className="mb-2 text-sm font-semibold text-ink">Facility info</h3>
            <InlineEdit label="Name" value={p.name} disabled={!canWrite} onSave={(v) => save({ name: v })} />
            <InlineEdit label="Address" value={p.address_line1 ?? ""} disabled={!canWrite} onSave={(v) => save({ address_line1: v || null })} />
            <InlineEdit label="City" value={p.city ?? ""} disabled={!canWrite} onSave={(v) => save({ city: v || null })} />
            <InlineEdit label="State" value={p.state ?? ""} disabled={!canWrite} onSave={(v) => save({ state: v || null })} />
            <InlineEdit
              label="Unit count"
              type="number"
              value={String(p.unit_count ?? 0)}
              disabled={!canWrite}
              onSave={(v) => save({ unit_count: Math.max(0, Number(v || 0)) })}
            />
            <div className="flex items-center justify-between gap-3 py-2.5">
              <span className="text-xs font-semibold text-muted">Type</span>
              <Select
                value={p.property_type}
                disabled={!canWrite}
                onChange={(e) => save({ property_type: e.target.value as PropertyType })}
                className="h-8 w-40 text-sm"
              >
                {PROPERTY_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {PROPERTY_TYPE_LABEL[t]}
                  </option>
                ))}
              </Select>
            </div>
            <p className="pt-3 text-xs text-muted">Added {formatDate(p.created_at)}</p>
          </div>

          <div className="card-base p-5">
            <h3 className="mb-2 text-sm font-semibold text-ink">On-site manager</h3>
            <InlineEdit label="Name" value={p.manager_name ?? ""} disabled={!canWrite} onSave={(v) => save({ manager_name: v || null })} />
            <InlineEdit label="Email" type="email" value={p.manager_email ?? ""} disabled={!canWrite} onSave={(v) => save({ manager_email: v || null })} />
            <InlineEdit label="Phone" value={p.manager_phone ?? ""} disabled={!canWrite} onSave={(v) => save({ manager_phone: v || null })} />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <MiniStat label="Units" value={p.unit_count || "—"} />
            <MiniStat label="Members" value={p.residents.filter((r) => r.status !== "former").length} />
            <MiniStat label="Open cases" value={openCases.length} accent={openCases.length > 0} />
          </div>
        </div>

        <div className="space-y-5 lg:col-span-2">
          <div className="card-base p-5">
            <h3 className="mb-3 text-sm font-semibold text-ink">
              Members ({p.residents.length})
            </h3>
            {p.residents.length === 0 ? (
              <EmptyState icon={<Icon name="residents" />} title="No members" subtitle="No members linked to this facility yet." />
            ) : (
              <div className="space-y-2">
                {p.residents.map((r) => (
                  <Link
                    key={r.id}
                    to={`/residents?focus=${r.id}`}
                    className="flex items-center justify-between rounded-control border border-line px-3 py-2 hover:border-primary/40"
                  >
                    <div className="flex items-center gap-3">
                      <Avatar name={r.full_name} size={30} />
                      <div>
                        <p className="text-sm font-medium text-ink">{r.full_name}</p>
                        <p className="text-xs text-muted">
                          {r.unit_number ? `Unit ${r.unit_number}` : "—"}
                        </p>
                      </div>
                    </div>
                    <StatusBadge status={r.status} />
                  </Link>
                ))}
              </div>
            )}
          </div>

          <div className="card-base p-5">
            <h3 className="mb-3 text-sm font-semibold text-ink">Cases ({p.cases.length})</h3>
            {p.cases.length === 0 ? (
              <EmptyState icon={<Icon name="board" />} title="No cases" subtitle="No cases tied to this facility." />
            ) : (
              <div className="space-y-2">
                {p.cases.map((c) => (
                  <Link
                    key={c.id}
                    to={`/cases?case=${c.id}`}
                    className="flex items-center justify-between gap-3 rounded-control border border-line px-3 py-2 hover:border-primary/40"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink">{c.title}</p>
                      <p className="text-xs text-muted">{c.residents?.full_name ?? "Facility-level"}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <StageBadge stage={c.stage} />
                      <PriorityBadge priority={c.priority} />
                    </div>
                  </Link>
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
        message={`Delete "${p.name}"? Members and cases will be unlinked, not deleted.`}
        loading={del.isPending}
        onConfirm={() =>
          del.mutate(id, {
            onSuccess: () => {
              toast.success("Facility deleted");
              navigate("/properties");
            },
            onError: (e) => toast.error(e instanceof Error ? e.message : "Delete failed"),
          })
        }
      />
    </div>
  );
}

function MiniStat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  accent?: boolean;
}) {
  return (
    <div className="card-base p-3 text-center">
      <p className={"text-lg font-bold " + (accent ? "text-primary" : "text-ink")}>{value}</p>
      <p className="text-[10px] uppercase tracking-wide text-muted">{label}</p>
    </div>
  );
}
