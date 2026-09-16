import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useQueryClient } from "@tanstack/react-query";
import {
  useCaptains,
  useFacilities,
  useLeads,
  usePipelineMetrics,
  usePipelineStages,
  usePipelines,
} from "@/hooks/queries";
import { updateCaptain, updateFacility, updateLeadStage } from "@/lib/db";
import { useRealtime } from "@/hooks/useRealtime";
import { useRole } from "@/lib/auth";
import { useToast } from "@/components/ui/Toast";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button, Select } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/Icon";
import { ErrorState, SkeletonRows } from "@/components/ui/states";
import { cn } from "@/lib/cn";
import { formatCompactMoney } from "@/lib/money";
import { LeadCard } from "@/features/leads/LeadCard";
import { AddLeadModal } from "@/features/leads/AddLeadModal";
import { LeadSlideOver } from "@/features/leads/LeadSlideOver";
import { FacilityCard } from "@/features/facilities/FacilityCard";
import { AddFacilityModal } from "@/features/facilities/AddFacilityModal";
import { CaptainCard } from "@/features/captains/CaptainCard";
import { AddCaptainModal } from "@/features/captains/AddCaptainModal";
import { CaptainSlideOver } from "@/features/captains/CaptainSlideOver";
import type { Captain, Facility, Lead, PipelineKey, PipelineStageDef } from "@/types";

export function PipelinePage() {
  const [params, setParams] = useSearchParams();
  const { canWrite } = useRole();
  const { data: pipelines } = usePipelines();
  const [pipeline, setPipeline] = useState<PipelineKey | "all">((params.get("pipeline") as PipelineKey) || "all");

  useEffect(() => {
    if (params.get("pipeline")) setPipeline(params.get("pipeline") as PipelineKey);
  }, [params]);

  return (
    <div className="flex h-full flex-col p-5 sm:p-6">
      <PageHeader
        eyebrow="Sportconn dealflow engine"
        title="Pipeline"
        subtitle="One CRM, multiple pipelines — track every opportunity from lead to won."
        actions={
          <Select
            value={pipeline}
            onChange={(e) => {
              setPipeline(e.target.value as PipelineKey | "all");
              params.set("pipeline", e.target.value);
              setParams(params, { replace: true });
            }}
            className="w-56"
          >
            <option value="all">All Pipelines</option>
            {pipelines?.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
              </option>
            ))}
          </Select>
        }
      />

      <div className="mt-5 flex-1 overflow-hidden">
        {pipeline === "all" ? (
          <AllPipelinesSummary onSelect={(p) => setPipeline(p)} />
        ) : (
          <SinglePipelineBoard pipeline={pipeline} canWrite={canWrite} />
        )}
      </div>
    </div>
  );
}

function AllPipelinesSummary({ onSelect }: { onSelect: (p: PipelineKey) => void }) {
  const { data: pipelines, isLoading } = usePipelines();
  if (isLoading) return <SkeletonRows rows={6} />;
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {pipelines?.map((p) => (
        <PipelineSummaryCard key={p.key} pipeline={p.key} label={p.label} onSelect={onSelect} />
      ))}
    </div>
  );
}

function PipelineSummaryCard({
  pipeline,
  label,
  onSelect,
}: {
  pipeline: PipelineKey;
  label: string;
  onSelect: (p: PipelineKey) => void;
}) {
  const { data: metrics } = usePipelineMetrics(pipeline);
  return (
    <button
      onClick={() => onSelect(pipeline)}
      className="card-base p-5 text-left transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-pop"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-ink">{label}</h3>
        <Icon name="arrow-right" size={16} className="text-muted" />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted">Active</p>
          <p className="text-lg font-bold text-ink">{metrics?.active_count ?? "—"}</p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted">Value</p>
          <p className="text-lg font-bold text-ink">{formatCompactMoney(metrics?.total_value ?? 0)}</p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted">Win rate</p>
          <p className="text-sm font-semibold text-body">{metrics?.win_rate ?? 0}%</p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted">Won / Lost</p>
          <p className="text-sm font-semibold text-body">
            {metrics?.won_count ?? 0} / {metrics?.lost_count ?? 0}
          </p>
        </div>
      </div>
    </button>
  );
}

const METRIC_LABELS: Record<PipelineKey, { total: string; active: string; avg: string; win: string }> = {
  sponsor: { total: "Total Sponsorship Pipeline", active: "Active Sponsor Prospects", avg: "Average Sponsorship Value", win: "Sponsor Conversion Rate" },
  investor: { total: "Total Investment Pipeline", active: "Active Investors", avg: "Average Ticket Size", win: "Investors Converted" },
  strategic_partnership: { total: "Total Partnership Pipeline", active: "Active Partnerships", avg: "Average Opportunity Value", win: "Conversion Rate" },
  user_acquisition: { total: "Total Target Users", active: "Active Initiatives", avg: "Avg Target per Initiative", win: "Completion Rate" },
  facility: { total: "Potential Facility Value", active: "Active Opportunities", avg: "Average Opportunity Value", win: "Conversion Rate" },
  captain: { total: "Active Captains", active: "In Onboarding", avg: "Avg Players / Captain", win: "Activation Rate" },
};

function SinglePipelineBoard({ pipeline, canWrite }: { pipeline: PipelineKey; canWrite: boolean }) {
  if (pipeline === "facility") return <FacilityBoard canWrite={canWrite} />;
  if (pipeline === "captain") return <CaptainBoard canWrite={canWrite} />;
  return <LeadBoard pipeline={pipeline} canWrite={canWrite} />;
}

// ============================= LEAD-BASED BOARD =============================
function LeadBoard({ pipeline, canWrite }: { pipeline: PipelineKey; canWrite: boolean }) {
  const [params, setParams] = useSearchParams();
  const { data: leads, isLoading, isError, refetch } = useLeads({ pipeline });
  const { data: stages } = usePipelineStages(pipeline);
  const { data: metrics } = usePipelineMetrics(pipeline);
  const qc = useQueryClient();
  const toast = useToast();
  useRealtime("leads", [["leads", { pipeline }]]);

  const [active, setActive] = useState<Lead | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [openLead, setOpenLead] = useState<string | null>(params.get("lead"));
  const [showArchive, setShowArchive] = useState(false);

  useEffect(() => {
    const l = params.get("lead");
    if (l) setOpenLead(l);
  }, [params]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const byStage = useMemo(() => {
    const map = new Map<string, Lead[]>();
    (stages ?? []).forEach((s) => map.set(s.key, []));
    (leads ?? []).forEach((l) => map.get(l.stage)?.push(l));
    return map;
  }, [leads, stages]);

  const onDragEnd = async (e: DragEndEvent) => {
    setActive(null);
    const { active: a, over } = e;
    if (!over) return;
    const id = String(a.id);
    const target = String(over.id);
    if (!(stages ?? []).some((s) => s.key === target)) return;
    const current = (leads ?? []).find((l) => l.id === id);
    if (!current || current.stage === target) return;
    const prev = leads ?? [];
    qc.setQueryData<Lead[]>(["leads", { pipeline }], (old) =>
      (old ?? []).map((l) => (l.id === id ? { ...l, stage: target } : l)),
    );
    try {
      await updateLeadStage(id, target);
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["pipeline-metrics"] });
      qc.invalidateQueries({ queryKey: ["dashboard-summary"] });
    } catch (err) {
      qc.setQueryData(["leads", { pipeline }], prev);
      toast.error(err instanceof Error ? err.message : "Could not move lead");
    }
  };

  const labels = METRIC_LABELS[pipeline];
  const columns = (stages ?? []).filter((s) => showArchive || !s.is_won && !s.is_lost);

  return (
    <div className="flex h-full flex-col">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="grid flex-1 grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi label={labels.total} value={pipeline === "user_acquisition" ? String(metrics?.total_value ?? 0) : formatCompactMoney(metrics?.total_value)} />
          <Kpi label={labels.active} value={String(metrics?.active_count ?? 0)} />
          <Kpi label={labels.avg} value={pipeline === "user_acquisition" ? String(Math.round(metrics?.avg_value ?? 0)) : formatCompactMoney(metrics?.avg_value)} />
          <Kpi label={labels.win} value={`${metrics?.win_rate ?? 0}%`} />
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="secondary" onClick={() => setShowArchive((s) => !s)}>
            <Icon name={showArchive ? "close" : "folder"} size={15} />
            {showArchive ? "Hide closed" : "Show closed"}
          </Button>
          {canWrite && (
            <Button onClick={() => setAddOpen(true)}>
              <Icon name="plus" size={16} /> Add lead
            </Button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        {isLoading ? (
          <SkeletonRows rows={4} />
        ) : isError ? (
          <ErrorState message="Could not load the pipeline." onRetry={() => refetch()} />
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={(e: DragStartEvent) => setActive((leads ?? []).find((l) => l.id === e.active.id) ?? null)}
            onDragEnd={onDragEnd}
          >
            <div className="flex h-full gap-4 overflow-x-auto pb-2">
              {columns.map((s) => (
                <LeadColumn
                  key={s.key}
                  stage={s}
                  leads={byStage.get(s.key) ?? []}
                  canWrite={canWrite}
                  onAdd={() => setAddOpen(true)}
                  onOpen={setOpenLead}
                />
              ))}
            </div>
            <DragOverlay>
              {active && (
                <div className="w-[300px] rotate-1">
                  <LeadCard lead={active} onOpen={() => {}} dragDisabled />
                </div>
              )}
            </DragOverlay>
          </DndContext>
        )}
      </div>

      <AddLeadModal open={addOpen} onClose={() => setAddOpen(false)} defaultPipeline={pipeline} />
      <LeadSlideOver
        leadId={openLead}
        open={openLead !== null}
        onClose={() => {
          setOpenLead(null);
          if (params.get("lead")) {
            params.delete("lead");
            setParams(params, { replace: true });
          }
        }}
      />
    </div>
  );
}

function LeadColumn({
  stage,
  leads,
  canWrite,
  onAdd,
  onOpen,
}: {
  stage: PipelineStageDef;
  leads: Lead[];
  canWrite: boolean;
  onAdd: () => void;
  onOpen: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.key });
  const total = leads.reduce((s, l) => s + Number(l.expected_value || 0), 0);
  return (
    <div className="flex w-[300px] shrink-0 flex-col">
      <div className="mb-1 flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <span className={cn("h-2 w-2 rounded-full", stage.is_won ? "bg-success" : stage.is_lost ? "bg-muted" : "bg-primary")} />
          <h3 className="text-sm font-semibold text-ink">{stage.label}</h3>
          <span className="rounded-control bg-line px-1.5 py-0.5 text-[10px] font-semibold text-muted">{leads.length}</span>
        </div>
        {canWrite && (
          <button onClick={onAdd} className="rounded p-1 text-muted hover:bg-line/60 hover:text-primary" aria-label="Add lead">
            <Icon name="plus" size={15} />
          </button>
        )}
      </div>
      <p className="mb-2 px-1 text-xs text-muted">{formatCompactMoney(total)}</p>
      <div
        ref={setNodeRef}
        className={cn(
          "flex-1 space-y-2 overflow-y-auto rounded-card border border-dashed p-2 transition-colors",
          isOver ? "border-primary/50 bg-primary/[0.04]" : "border-line bg-surface-2/60",
        )}
      >
        <SortableContext items={leads.map((l) => l.id)} strategy={verticalListSortingStrategy}>
          {leads.map((l) => (
            <LeadCard key={l.id} lead={l} onOpen={onOpen} dragDisabled={!canWrite} />
          ))}
        </SortableContext>
        {leads.length === 0 && <p className="px-2 py-8 text-center text-xs text-muted">No leads</p>}
      </div>
    </div>
  );
}

// ============================= FACILITY BOARD =============================
function FacilityBoard({ canWrite }: { canWrite: boolean }) {
  const navigate = useNavigate();
  const { data: facilities, isLoading, isError, refetch } = useFacilities();
  const { data: stages } = usePipelineStages("facility");
  const { data: metrics } = usePipelineMetrics("facility");
  const qc = useQueryClient();
  const toast = useToast();
  const [active, setActive] = useState<Facility | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [showArchive, setShowArchive] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const byStage = useMemo(() => {
    const map = new Map<string, Facility[]>();
    (stages ?? []).forEach((s) => map.set(s.key, []));
    (facilities ?? []).forEach((f) => map.get(f.stage)?.push(f));
    return map;
  }, [facilities, stages]);

  const onDragEnd = async (e: DragEndEvent) => {
    setActive(null);
    const { active: a, over } = e;
    if (!over) return;
    const id = String(a.id);
    const target = String(over.id);
    if (!(stages ?? []).some((s) => s.key === target)) return;
    const current = (facilities ?? []).find((f) => f.id === id);
    if (!current || current.stage === target) return;
    try {
      await updateFacility(id, { stage: target });
      qc.invalidateQueries({ queryKey: ["facilities"] });
      qc.invalidateQueries({ queryKey: ["pipeline-metrics"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not move facility");
    }
  };

  const labels = METRIC_LABELS.facility;
  const columns = (stages ?? []).filter((s) => showArchive || (!s.is_won && !s.is_lost));

  return (
    <div className="flex h-full flex-col">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="grid flex-1 grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi label={labels.total} value={formatCompactMoney(metrics?.total_value)} />
          <Kpi label={labels.active} value={String(metrics?.active_count ?? 0)} />
          <Kpi label={labels.avg} value={formatCompactMoney(metrics?.avg_value)} />
          <Kpi label={labels.win} value={`${metrics?.win_rate ?? 0}%`} />
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="secondary" onClick={() => setShowArchive((s) => !s)}>
            <Icon name={showArchive ? "close" : "folder"} size={15} />
            {showArchive ? "Hide closed" : "Show closed"}
          </Button>
          {canWrite && (
            <Button onClick={() => setAddOpen(true)}>
              <Icon name="plus" size={16} /> Add facility
            </Button>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-hidden">
        {isLoading ? (
          <SkeletonRows rows={4} />
        ) : isError ? (
          <ErrorState message="Could not load facilities." onRetry={() => refetch()} />
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={(e) => setActive((facilities ?? []).find((f) => f.id === e.active.id) ?? null)}
            onDragEnd={onDragEnd}
          >
            <div className="flex h-full gap-4 overflow-x-auto pb-2">
              {columns.map((s) => {
                const items = byStage.get(s.key) ?? [];
                return (
                  <GenericColumn key={s.key} stage={s} count={items.length}>
                    <SortableContext items={items.map((f) => f.id)} strategy={verticalListSortingStrategy}>
                      {items.map((f) => (
                        <FacilityCard key={f.id} facility={f} onOpen={(id) => navigate(`/facilities/${id}`)} dragDisabled={!canWrite} />
                      ))}
                    </SortableContext>
                    {items.length === 0 && <p className="px-2 py-8 text-center text-xs text-muted">No facilities</p>}
                  </GenericColumn>
                );
              })}
            </div>
            <DragOverlay>
              {active && (
                <div className="w-[300px] rotate-1">
                  <FacilityCard facility={active} onOpen={() => {}} dragDisabled />
                </div>
              )}
            </DragOverlay>
          </DndContext>
        )}
      </div>
      <AddFacilityModal open={addOpen} onClose={() => setAddOpen(false)} />
    </div>
  );
}

// ============================= CAPTAIN BOARD =============================
function CaptainBoard({ canWrite }: { canWrite: boolean }) {
  const [params, setParams] = useSearchParams();
  const { data: captains, isLoading, isError, refetch } = useCaptains();
  const { data: stages } = usePipelineStages("captain");
  const { data: metrics } = usePipelineMetrics("captain");
  const qc = useQueryClient();
  const toast = useToast();
  const [active, setActive] = useState<Captain | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [openCaptain, setOpenCaptain] = useState<string | null>(params.get("focus"));
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const byStage = useMemo(() => {
    const map = new Map<string, Captain[]>();
    (stages ?? []).forEach((s) => map.set(s.key, []));
    (captains ?? []).forEach((c) => map.get(c.stage)?.push(c));
    return map;
  }, [captains, stages]);

  const onDragEnd = async (e: DragEndEvent) => {
    setActive(null);
    const { active: a, over } = e;
    if (!over) return;
    const id = String(a.id);
    const target = String(over.id);
    if (!(stages ?? []).some((s) => s.key === target)) return;
    const current = (captains ?? []).find((c) => c.id === id);
    if (!current || current.stage === target) return;
    try {
      await updateCaptain(id, { stage: target, active: target === "active" });
      qc.invalidateQueries({ queryKey: ["captains"] });
      qc.invalidateQueries({ queryKey: ["pipeline-metrics"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not move captain");
    }
  };

  const labels = METRIC_LABELS.captain;

  return (
    <div className="flex h-full flex-col">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="grid flex-1 grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi label={labels.total} value={String(metrics?.won_count ?? 0)} />
          <Kpi label={labels.active} value={String(metrics?.active_count ?? 0)} />
          <Kpi label={labels.avg} value={String(Math.round(metrics?.avg_value ?? 0))} />
          <Kpi label={labels.win} value={`${metrics?.win_rate ?? 0}%`} />
        </div>
        {canWrite && (
          <Button onClick={() => setAddOpen(true)}>
            <Icon name="plus" size={16} /> Add captain
          </Button>
        )}
      </div>
      <div className="flex-1 overflow-hidden">
        {isLoading ? (
          <SkeletonRows rows={4} />
        ) : isError ? (
          <ErrorState message="Could not load captains." onRetry={() => refetch()} />
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={(e) => setActive((captains ?? []).find((c) => c.id === e.active.id) ?? null)}
            onDragEnd={onDragEnd}
          >
            <div className="flex h-full gap-4 overflow-x-auto pb-2">
              {(stages ?? []).map((s) => {
                const items = byStage.get(s.key) ?? [];
                return (
                  <GenericColumn key={s.key} stage={s} count={items.length}>
                    <SortableContext items={items.map((c) => c.id)} strategy={verticalListSortingStrategy}>
                      {items.map((c) => (
                        <CaptainCard key={c.id} captain={c} onOpen={setOpenCaptain} dragDisabled={!canWrite} />
                      ))}
                    </SortableContext>
                    {items.length === 0 && <p className="px-2 py-8 text-center text-xs text-muted">No captains</p>}
                  </GenericColumn>
                );
              })}
            </div>
            <DragOverlay>
              {active && (
                <div className="w-[300px] rotate-1">
                  <CaptainCard captain={active} onOpen={() => {}} dragDisabled />
                </div>
              )}
            </DragOverlay>
          </DndContext>
        )}
      </div>
      <AddCaptainModal open={addOpen} onClose={() => setAddOpen(false)} />
      <CaptainSlideOver
        captainId={openCaptain}
        open={openCaptain !== null}
        onClose={() => {
          setOpenCaptain(null);
          if (params.get("focus")) {
            params.delete("focus");
            setParams(params, { replace: true });
          }
        }}
      />
    </div>
  );
}

function GenericColumn({ stage, count, children }: { stage: PipelineStageDef; count: number; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.key });
  return (
    <div className="flex w-[300px] shrink-0 flex-col">
      <div className="mb-2 flex items-center gap-2 px-1">
        <span className={cn("h-2 w-2 rounded-full", stage.is_won ? "bg-success" : stage.is_lost ? "bg-muted" : "bg-primary")} />
        <h3 className="text-sm font-semibold text-ink">{stage.label}</h3>
        <span className="rounded-control bg-line px-1.5 py-0.5 text-[10px] font-semibold text-muted">{count}</span>
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          "flex-1 space-y-2 overflow-y-auto rounded-card border border-dashed p-2 transition-colors",
          isOver ? "border-primary/50 bg-primary/[0.04]" : "border-line bg-surface-2/60",
        )}
      >
        {children}
      </div>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="card-base p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 text-xl font-bold text-ink">{value}</p>
    </div>
  );
}
