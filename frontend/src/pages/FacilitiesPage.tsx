import { useState } from "react";
import { Link } from "react-router-dom";
import { useFacilities, usePipelineStages } from "@/hooks/queries";
import { useDebounced } from "@/hooks/useDebounced";
import { useRole } from "@/lib/auth";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge, Button, Input } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/Icon";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { FACILITY_TYPE_LABEL } from "@/lib/constants";
import { formatCompactMoney } from "@/lib/money";
import { AddFacilityModal } from "@/features/facilities/AddFacilityModal";

export function FacilitiesPage() {
  const { canWrite } = useRole();
  const [search, setSearch] = useState("");
  const q = useDebounced(search, 300);
  const { data, isLoading, isError, refetch } = useFacilities({ q: q || undefined });
  const { data: stages } = usePipelineStages("facility");
  const [addOpen, setAddOpen] = useState(false);

  const stageLabel = (key: string) => stages?.find((s) => s.key === key)?.label ?? key;

  return (
    <div className="p-5 sm:p-6">
      <PageHeader
        eyebrow="Business Development"
        title="Facilities"
        subtitle="Sports venues SportConn is pursuing as partnership opportunities."
        actions={
          canWrite && (
            <Button onClick={() => setAddOpen(true)}>
              <Icon name="plus" size={16} /> Add facility
            </Button>
          )
        }
      />

      <div className="relative mt-5 max-w-md">
        <Icon name="search" size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or city…"
          className="pl-9"
        />
      </div>

      <div className="mt-5">
        {isLoading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="skeleton h-40 rounded-card" />
            ))}
          </div>
        ) : isError ? (
          <ErrorState message="Could not load facilities." onRetry={() => refetch()} />
        ) : !data || data.length === 0 ? (
          <EmptyState
            icon={<Icon name="properties" />}
            title="No facilities yet"
            subtitle="Add your first sports facility to start tracking cases."
            action={
              canWrite && (
                <Button onClick={() => setAddOpen(true)}>
                  <Icon name="plus" size={16} /> Add facility
                </Button>
              )
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {data.map((f) => (
              <Link
                key={f.id}
                to={`/facilities/${f.id}`}
                className="card-base group p-5 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-pop"
              >
                <div className="flex items-start justify-between">
                  <div className="flex h-11 w-11 items-center justify-center rounded-card bg-primary/10 text-primary">
                    <Icon name="properties" size={20} />
                  </div>
                  <Badge className="bg-line text-muted">{FACILITY_TYPE_LABEL[f.facility_type]}</Badge>
                </div>
                <h3 className="mt-3 text-base font-semibold text-ink group-hover:text-primary">{f.name}</h3>
                <p className="text-xs text-muted">
                  {[f.city, f.area].filter(Boolean).join(", ") || f.address_line1 || "—"}
                </p>
                <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                  <Stat label="Pitches" value={String(f.pitch_count ?? "—")} />
                  <Stat label="Value" value={formatCompactMoney(f.expected_value, f.currency)} />
                  <Stat label="Stage" value={stageLabel(f.stage)} small />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      <AddFacilityModal open={addOpen} onClose={() => setAddOpen(false)} />
    </div>
  );
}

function Stat({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return (
    <div className="rounded-control bg-surface-2 py-2">
      <p className={"font-semibold text-ink " + (small ? "text-[11px] truncate px-1" : "text-sm")}>{value}</p>
      <p className="text-[10px] uppercase tracking-wide text-muted">{label}</p>
    </div>
  );
}
