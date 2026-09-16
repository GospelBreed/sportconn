import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  useCases,
  useDeleteResident,
  useProperties,
  useResidents,
  useUpdateResident,
  useUsers,
} from "@/hooks/queries";
import { useDebounced } from "@/hooks/useDebounced";
import { useRole } from "@/lib/auth";
import { useToast } from "@/components/ui/Toast";
import { PageHeader } from "@/components/layout/PageHeader";
import { Avatar, Button, Input, Select } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/Icon";
import { EmptyState, ErrorState, SkeletonRows } from "@/components/ui/states";
import { ConfirmDialog } from "@/components/ui/overlays";
import { ExperienceScore, StatusBadge } from "@/components/ui/badges";
import { ACTIVE_STAGES, RESIDENT_STATUSES, RESIDENT_STATUS_META } from "@/lib/constants";
import { formatRelative } from "@/lib/format";
import { ResidentSlideOver } from "@/features/residents/ResidentSlideOver";
import { AddResidentModal } from "@/features/residents/AddResidentModal";
import type { Resident } from "@/types";

export function ResidentsPage() {
  const [params, setParams] = useSearchParams();
  const { canWrite, isAdmin } = useRole();
  const toast = useToast();

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [propertyId, setPropertyId] = useState("");
  const [manager, setManager] = useState("");
  const q = useDebounced(search, 300);

  const { data: properties } = useProperties();
  const { data: users } = useUsers();
  const { data: cases } = useCases();
  const { data: residents, isLoading, isError, refetch } = useResidents({
    q: q || undefined,
    status: status || undefined,
    property_id: propertyId || undefined,
    case_manager: manager || undefined,
  });

  const del = useDeleteResident();
  const update = useUpdateResident();

  const [selected, setSelected] = useState<string | null>(params.get("focus"));
  const [addOpen, setAddOpen] = useState(false);
  const [toArchive, setToArchive] = useState<Resident | null>(null);

  useEffect(() => {
    if (params.get("new") === "1" && canWrite) {
      setAddOpen(true);
      params.delete("new");
      setParams(params, { replace: true });
    }
    const focus = params.get("focus");
    if (focus) setSelected(focus);
  }, [params, canWrite, setParams]);

  const openCaseCounts = useMemo(() => {
    const m = new Map<string, number>();
    (cases ?? []).forEach((c) => {
      if (c.resident_id && ACTIVE_STAGES.includes(c.stage))
        m.set(c.resident_id, (m.get(c.resident_id) ?? 0) + 1);
    });
    return m;
  }, [cases]);

  const closeSlideOver = () => {
    setSelected(null);
    if (params.get("focus")) {
      params.delete("focus");
      setParams(params, { replace: true });
    }
  };

  const archiveResident = (r: Resident) => {
    if (isAdmin) {
      del.mutate(r.id, {
        onSuccess: () => {
          toast.success("Member deleted");
          setToArchive(null);
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : "Delete failed"),
      });
    } else {
      update.mutate(
        { id: r.id, body: { status: "former" } },
        {
          onSuccess: () => {
            toast.success("Member marked former");
            setToArchive(null);
          },
          onError: (e) => toast.error(e instanceof Error ? e.message : "Update failed"),
        },
      );
    }
  };

  return (
    <div className="p-5 sm:p-6">
      <PageHeader
        eyebrow="Directory"
        title="Members"
        subtitle="Every member across Sportconn's partner facilities."
        actions={
          canWrite && (
            <Button onClick={() => setAddOpen(true)}>
              <Icon name="plus" size={16} /> Add member
            </Button>
          )
        }
      />

      <div className="mt-5 flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Icon name="search" size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email, or unit…"
            className="pl-9"
          />
        </div>
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="lg:w-40">
          <option value="">All statuses</option>
          {RESIDENT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {RESIDENT_STATUS_META[s].label}
            </option>
          ))}
        </Select>
        <Select value={propertyId} onChange={(e) => setPropertyId(e.target.value)} className="lg:w-48">
          <option value="">All facilities</option>
          {properties?.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
        <Select value={manager} onChange={(e) => setManager(e.target.value)} className="lg:w-44">
          <option value="">All case managers</option>
          {users?.map((u) => (
            <option key={u.id} value={u.id}>
              {u.full_name}
            </option>
          ))}
        </Select>
      </div>

      <div className="mt-4 card-base overflow-hidden">
        {isLoading ? (
          <div className="p-4">
            <SkeletonRows rows={8} />
          </div>
        ) : isError ? (
          <ErrorState message="Could not load members." onRetry={() => refetch()} />
        ) : !residents || residents.length === 0 ? (
          <EmptyState
            icon={<Icon name="residents" />}
            title="No members found"
            subtitle="Adjust your filters, or add the first member."
            action={
              canWrite && (
                <Button onClick={() => setAddOpen(true)}>
                  <Icon name="plus" size={16} /> Add member
                </Button>
              )
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line bg-surface-2 text-left text-[11px] uppercase tracking-wide text-muted">
                  <th className="px-4 py-3 font-semibold">Member</th>
                  <th className="hidden px-4 py-3 font-semibold md:table-cell">Facility / Unit</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="hidden px-4 py-3 font-semibold lg:table-cell">Experience</th>
                  <th className="px-4 py-3 font-semibold">Open cases</th>
                  <th className="hidden px-4 py-3 font-semibold lg:table-cell">Last activity</th>
                  <th className="px-4 py-3 text-right font-semibold">·</th>
                </tr>
              </thead>
              <tbody>
                {residents.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => setSelected(r.id)}
                    className="cursor-pointer border-b border-line/70 transition-colors last:border-0 hover:bg-surface-2"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar name={r.full_name} size={32} />
                        <div className="min-w-0">
                          <p className="font-medium text-ink">{r.full_name}</p>
                          <p className="truncate text-xs text-muted">{r.email ?? "—"}</p>
                        </div>
                      </div>
                    </td>
                    <td className="hidden px-4 py-3 text-muted md:table-cell">
                      {r.properties?.name ?? "—"}
                      {r.unit_number ? ` · #${r.unit_number}` : ""}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="hidden px-4 py-3 lg:table-cell">
                      <ExperienceScore score={r.experience_score} />
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={
                          "inline-flex min-w-6 justify-center rounded-control px-1.5 py-0.5 text-xs font-semibold " +
                          ((openCaseCount(openCaseCounts, r.id)) > 0
                            ? "bg-primary/10 text-primary"
                            : "bg-line text-muted")
                        }
                      >
                        {openCaseCount(openCaseCounts, r.id)}
                      </span>
                    </td>
                    <td className="hidden px-4 py-3 text-muted lg:table-cell">
                      {formatRelative(r.updated_at)}
                    </td>
                    <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                      {canWrite && r.status !== "former" && (
                        <button
                          onClick={() => setToArchive(r)}
                          className="rounded p-1 text-muted hover:bg-line/60 hover:text-danger"
                          aria-label="Archive resident"
                        >
                          <Icon name="trash" size={15} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ResidentSlideOver residentId={selected} open={selected !== null} onClose={closeSlideOver} />
      <AddResidentModal open={addOpen} onClose={() => setAddOpen(false)} />
      <ConfirmDialog
        open={!!toArchive}
        onClose={() => setToArchive(null)}
        title={isAdmin ? "Delete member" : "Mark member as former"}
        message={
          isAdmin
            ? `Permanently delete "${toArchive?.full_name}"? Their cases will be removed too.`
            : `Move "${toArchive?.full_name}" to Former status? Their history is kept.`
        }
        confirmLabel={isAdmin ? "Delete" : "Mark former"}
        tone={isAdmin ? "danger" : "primary"}
        loading={del.isPending || update.isPending}
        onConfirm={() => toArchive && archiveResident(toArchive)}
      />
    </div>
  );
}

function openCaseCount(map: Map<string, number>, id: string): number {
  return map.get(id) ?? 0;
}
