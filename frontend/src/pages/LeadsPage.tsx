import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useDeleteLead, useLeads, useUsers } from "@/hooks/queries";
import { useDebounced } from "@/hooks/useDebounced";
import { useRealtime } from "@/hooks/useRealtime";
import { useRole } from "@/lib/auth";
import { useToast } from "@/components/ui/Toast";
import { PageHeader } from "@/components/layout/PageHeader";
import { Avatar, Button, Input, Select } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/Icon";
import { EmptyState, ErrorState, SkeletonRows } from "@/components/ui/states";
import { ConfirmDialog } from "@/components/ui/overlays";
import {
  ExperienceScore,
  FollowupBadge,
  LeadStageBadge,
  TemperatureBadge,
} from "@/components/ui/badges";
import {
  LEAD_SOURCE_LABEL,
  LEAD_STAGES,
  PROPERTY_TYPE_LABEL,
} from "@/lib/constants";
import { formatCompactUsd } from "@/lib/money";
import { AddLeadModal } from "@/features/leads/AddLeadModal";
import { LeadSlideOver } from "@/features/leads/LeadSlideOver";
import { LeadCsvModal } from "@/features/leads/LeadCsvModal";
import { leadsToCsvRows } from "@/features/leads/leadCsv";
import { downloadFile, toCsv } from "@/lib/csv";
import type { Lead } from "@/types";

export function LeadsPage() {
  const [params, setParams] = useSearchParams();
  const { canWrite, canDelete, canImport, canExport } = useRole();
  const toast = useToast();
  useRealtime("leads", [["leads"]]);

  const [search, setSearch] = useState("");
  const [stage, setStage] = useState("");
  const [temperature, setTemperature] = useState("");
  const [source, setSource] = useState("");
  const q = useDebounced(search, 300);

  const { data: users } = useUsers();
  const { data: leads, isLoading, isError, refetch } = useLeads({
    q: q || undefined,
    stage: stage || undefined,
    temperature: temperature || undefined,
    source: source || undefined,
  });
  const del = useDeleteLead();

  const [selected, setSelected] = useState<string | null>(params.get("focus"));
  const [addOpen, setAddOpen] = useState(false);
  const [csvOpen, setCsvOpen] = useState(false);
  const [toDelete, setToDelete] = useState<Lead | null>(null);

  const exportCsv = () => {
    const list = leads ?? [];
    if (list.length === 0) {
      toast.error("Nothing to export with the current filters");
      return;
    }
    const { headers, rows } = leadsToCsvRows(list);
    const stamp = new Date().toISOString().slice(0, 10);
    downloadFile(`roseway-leads-${stamp}.csv`, toCsv(headers, rows));
    toast.success(`Exported ${list.length} lead${list.length === 1 ? "" : "s"}`);
  };

  useEffect(() => {
    if (params.get("new") === "1" && canWrite) {
      setAddOpen(true);
      params.delete("new");
      setParams(params, { replace: true });
    }
    const focus = params.get("focus");
    if (focus) setSelected(focus);
  }, [params, canWrite, setParams]);

  const close = () => {
    setSelected(null);
    if (params.get("focus")) {
      params.delete("focus");
      setParams(params, { replace: true });
    }
  };

  return (
    <div className="p-5 sm:p-6">
      <PageHeader
        eyebrow="Sportconn dealflow"
        title="Leads"
        subtitle="Prospective facility partners and their conversion pipeline."
        actions={
          <>
            {canImport && (
              <Button variant="secondary" onClick={() => setCsvOpen(true)}>
                <Icon name="upload" size={15} /> Import CSV
              </Button>
            )}
            {canExport && (
              <Button variant="secondary" onClick={exportCsv}>
                <Icon name="external" size={15} /> Export CSV
              </Button>
            )}
            {canWrite && (
              <Button onClick={() => setAddOpen(true)}>
                <Icon name="plus" size={16} /> Add lead
              </Button>
            )}
          </>
        }
      />

      <div className="mt-5 flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Icon name="search" size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search lead, company, facility…" className="pl-9" />
        </div>
        <Select value={stage} onChange={(e) => setStage(e.target.value)} className="lg:w-40">
          <option value="">All stages</option>
          {LEAD_STAGES.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </Select>
        <Select value={temperature} onChange={(e) => setTemperature(e.target.value)} className="lg:w-36">
          <option value="">All temps</option>
          <option value="hot">Hot</option>
          <option value="warm">Warm</option>
          <option value="cold">Cold</option>
        </Select>
        <Select value={source} onChange={(e) => setSource(e.target.value)} className="lg:w-44">
          <option value="">All sources</option>
          {Object.entries(LEAD_SOURCE_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
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
          <ErrorState message="Could not load leads." onRetry={() => refetch()} />
        ) : !leads || leads.length === 0 ? (
          <EmptyState
            icon={<Icon name="residents" />}
            title="No leads found"
            subtitle="Adjust filters or add the first lead."
            action={canWrite && <Button onClick={() => setAddOpen(true)}><Icon name="plus" size={16} /> Add lead</Button>}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line bg-surface-2 text-left text-[11px] uppercase tracking-wide text-muted">
                  <th className="px-4 py-3 font-semibold">Lead contact</th>
                  <th className="hidden px-4 py-3 font-semibold md:table-cell">Facility &amp; management</th>
                  <th className="hidden px-4 py-3 font-semibold lg:table-cell">Location &amp; scale</th>
                  <th className="hidden px-4 py-3 font-semibold xl:table-cell">Asset</th>
                  <th className="px-4 py-3 font-semibold">Exp. score</th>
                  <th className="px-4 py-3 font-semibold">Temp</th>
                  <th className="px-4 py-3 font-semibold">Stage</th>
                  <th className="hidden px-4 py-3 font-semibold lg:table-cell">Follow-up</th>
                  <th className="px-4 py-3 text-right font-semibold">·</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((l) => (
                  <tr
                    key={l.id}
                    onClick={() => setSelected(l.id)}
                    className="cursor-pointer border-b border-line/70 transition-colors last:border-0 hover:bg-surface-2"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar name={l.full_name} size={32} />
                        <div className="min-w-0">
                          <p className="font-medium text-ink">{l.full_name}</p>
                          <p className="truncate text-xs text-muted">{l.title ?? "—"}</p>
                        </div>
                      </div>
                    </td>
                    <td className="hidden px-4 py-3 md:table-cell">
                      <p className="text-body">{l.property_name ?? "—"}</p>
                      <p className="text-xs text-muted">{l.company_name ?? "—"}</p>
                    </td>
                    <td className="hidden px-4 py-3 text-muted lg:table-cell">
                      {[l.location_city, l.location_state].filter(Boolean).join(", ") || "—"}
                      <span className="block text-xs">{l.unit_count ? `${l.unit_count} units` : ""}</span>
                    </td>
                    <td className="hidden px-4 py-3 text-muted xl:table-cell">
                      {PROPERTY_TYPE_LABEL[l.asset_type]}
                      <span className="block text-xs">{formatCompactUsd(l.estimated_arr)}/yr</span>
                    </td>
                    <td className="px-4 py-3">
                      <ExperienceScore score={l.experience_score} />
                    </td>
                    <td className="px-4 py-3">
                      <TemperatureBadge temperature={l.temperature} />
                    </td>
                    <td className="px-4 py-3">
                      <LeadStageBadge stage={l.stage} />
                    </td>
                    <td className="hidden px-4 py-3 lg:table-cell">
                      <FollowupBadge at={l.next_follow_up_at} />
                    </td>
                    <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                      {canDelete && (
                        <button
                          onClick={() => setToDelete(l)}
                          className="rounded p-1 text-muted hover:bg-line/60 hover:text-danger"
                          aria-label="Delete lead"
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

      <LeadSlideOver leadId={selected} open={selected !== null} onClose={close} />
      <AddLeadModal open={addOpen} onClose={() => setAddOpen(false)} />
      <LeadCsvModal open={csvOpen} onClose={() => setCsvOpen(false)} />
      <ConfirmDialog
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        title="Delete lead"
        message={`Permanently delete "${toDelete?.full_name}"? Outreach and tasks on this lead are removed too.`}
        loading={del.isPending}
        onConfirm={() =>
          toDelete &&
          del.mutate(toDelete.id, {
            onSuccess: () => {
              toast.success("Lead deleted");
              setToDelete(null);
            },
            onError: (e) => toast.error(e instanceof Error ? e.message : "Delete failed"),
          })
        }
      />
    </div>
  );
}
