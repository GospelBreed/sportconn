import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useCases, useProperties, useResidents } from "@/hooks/queries";
import { useDebounced } from "@/hooks/useDebounced";
import { useRole } from "@/lib/auth";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge, Button, Input } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/Icon";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { ACTIVE_STAGES, PROPERTY_TYPE_LABEL } from "@/lib/constants";
import { AddPropertyModal } from "@/features/properties/AddPropertyModal";

export function PropertiesPage() {
  const { canWrite } = useRole();
  const [search, setSearch] = useState("");
  const q = useDebounced(search, 300);
  const { data, isLoading, isError, refetch } = useProperties(q);
  const { data: residents } = useResidents({});
  const { data: cases } = useCases();
  const [addOpen, setAddOpen] = useState(false);

  const residentCounts = useMemo(() => {
    const m = new Map<string, number>();
    (residents ?? []).forEach((r) => {
      if (r.property_id && r.status !== "former")
        m.set(r.property_id, (m.get(r.property_id) ?? 0) + 1);
    });
    return m;
  }, [residents]);

  const caseCounts = useMemo(() => {
    const m = new Map<string, number>();
    (cases ?? []).forEach((c) => {
      if (c.property_id && ACTIVE_STAGES.includes(c.stage))
        m.set(c.property_id, (m.get(c.property_id) ?? 0) + 1);
    });
    return m;
  }, [cases]);

  return (
    <div className="p-5 sm:p-6">
      <PageHeader
        eyebrow="Portfolio"
        title="Facilities"
        subtitle="Facilities Sportconn supports, and their open caseload."
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
              <div key={i} className="skeleton h-44 rounded-card" />
            ))}
          </div>
        ) : isError ? (
          <ErrorState message="Could not load facilities." onRetry={() => refetch()} />
        ) : !data || data.length === 0 ? (
          <EmptyState
            icon={<Icon name="properties" />}
            title="No facilities yet"
            subtitle="Add the first facility to start tracking cases."
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
            {data.map((p) => {
              const openCases = caseCounts.get(p.id) ?? 0;
              return (
                <Link
                  key={p.id}
                  to={`/properties/${p.id}`}
                  className="card-base group p-5 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-pop"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex h-11 w-11 items-center justify-center rounded-card bg-primary/10 text-primary">
                      <Icon name="properties" size={20} />
                    </div>
                    <Badge className="bg-line text-muted">{PROPERTY_TYPE_LABEL[p.property_type]}</Badge>
                  </div>
                  <h3 className="mt-3 text-base font-semibold text-ink group-hover:text-primary">
                    {p.name}
                  </h3>
                  <p className="text-xs text-muted">
                    {[p.city, p.state].filter(Boolean).join(", ") || p.address_line1 || "—"}
                  </p>
                  <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                    <Stat label="Units" value={String(p.unit_count || "—")} />
                    <Stat label="Members" value={String(residentCounts.get(p.id) ?? 0)} />
                    <Stat
                      label="Open cases"
                      value={String(openCases)}
                      accent={openCases > 0}
                    />
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      <AddPropertyModal open={addOpen} onClose={() => setAddOpen(false)} />
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-control bg-surface-2 py-2">
      <p className={"text-sm font-semibold " + (accent ? "text-primary" : "text-ink")}>{value}</p>
      <p className="text-[10px] uppercase tracking-wide text-muted">{label}</p>
    </div>
  );
}
