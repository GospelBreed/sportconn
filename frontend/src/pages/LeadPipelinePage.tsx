import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
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
import { useLeadPipeline } from "@/hooks/queries";
import { updateLeadStage } from "@/lib/db";
import { useRealtime } from "@/hooks/useRealtime";
import { useRole } from "@/lib/auth";
import { useToast } from "@/components/ui/Toast";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/Icon";
import { ErrorState, SkeletonRows } from "@/components/ui/states";
import { cn } from "@/lib/cn";
import { LEAD_ACTIVE_STAGES, LEAD_STAGES, LEAD_STAGE_ACCENT } from "@/lib/constants";
import { formatCompactUsd } from "@/lib/money";
import { LeadCard } from "@/features/leads/LeadCard";
import { AddLeadModal } from "@/features/leads/AddLeadModal";
import { LeadSlideOver } from "@/features/leads/LeadSlideOver";
import type { Lead, LeadStage } from "@/types";

export function LeadPipelinePage() {
  const { data: leads, isLoading, isError, refetch } = useLeadPipeline();
  const qc = useQueryClient();
  const toast = useToast();
  const { canWrite } = useRole();
  const [params, setParams] = useSearchParams();
  useRealtime("leads", [["leads"]]);

  const [active, setActive] = useState<Lead | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [openLead, setOpenLead] = useState<string | null>(params.get("lead"));
  const [showArchive, setShowArchive] = useState(false);

  useEffect(() => {
    if (params.get("new") === "1" && canWrite) {
      setAddOpen(true);
      params.delete("new");
      setParams(params, { replace: true });
    }
    const l = params.get("lead");
    if (l) setOpenLead(l);
  }, [params, canWrite, setParams]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const byStage = useMemo(() => {
    const map = Object.fromEntries(LEAD_STAGES.map((s) => [s.key, [] as Lead[]])) as Record<
      LeadStage,
      Lead[]
    >;
    (leads ?? []).forEach((l) => map[l.stage]?.push(l));
    return map;
  }, [leads]);

  const activeLeads = (leads ?? []).filter((l) => LEAD_ACTIVE_STAGES.includes(l.stage));
  const pipelineArr = activeLeads.reduce((s, l) => s + Number(l.estimated_arr || 0), 0);
  const won = (leads ?? []).filter((l) => l.stage === "closed_won").length;
  const lost = (leads ?? []).filter((l) => l.stage === "closed_lost").length;
  const winRate = won + lost ? Math.round((won / (won + lost)) * 100) : 0;
  const avgDeal = activeLeads.length ? pipelineArr / activeLeads.length : 0;

  const stageOf = (id: string): LeadStage | null => {
    if (LEAD_STAGES.some((s) => s.key === id)) return id as LeadStage;
    return (leads ?? []).find((l) => l.id === id)?.stage ?? null;
  };

  const onDragEnd = async (e: DragEndEvent) => {
    setActive(null);
    const { active: a, over } = e;
    if (!over) return;
    const id = String(a.id);
    const target = stageOf(String(over.id));
    const current = (leads ?? []).find((l) => l.id === id);
    if (!current || !target || current.stage === target) return;
    const prev = leads ?? [];
    qc.setQueryData<Lead[]>(["leads"], (old) =>
      (old ?? []).map((l) =>
        l.id === id ? { ...l, stage: target, stage_entered_at: new Date().toISOString() } : l,
      ),
    );
    try {
      await updateLeadStage(id, target);
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["dashboard-summary"] });
    } catch (err) {
      qc.setQueryData(["leads"], prev);
      toast.error(err instanceof Error ? err.message : "Could not move lead");
    }
  };

  const columns = showArchive ? LEAD_STAGES : LEAD_STAGES.filter((s) => LEAD_ACTIVE_STAGES.includes(s.key));

  return (
    <div className="flex h-full flex-col p-5 sm:p-6">
      <PageHeader
        eyebrow="Sportconn dealflow engine"
        title="Pipeline"
        subtitle="Track deal stages and prospective facility partnerships from lead to won."
        actions={
          <>
            <Button variant="secondary" onClick={() => setShowArchive((s) => !s)}>
              <Icon name={showArchive ? "close" : "folder"} size={15} />
              {showArchive ? "Hide closed" : "Show closed"}
            </Button>
            {canWrite && (
              <Button onClick={() => setAddOpen(true)}>
                <Icon name="plus" size={16} /> Add lead
              </Button>
            )}
          </>
        }
      />

      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Total pipeline" value={`${formatCompactUsd(pipelineArr)}/yr`} />
        <Kpi label="Active leads" value={String(activeLeads.length)} />
        <Kpi label="Avg deal size" value={`${formatCompactUsd(avgDeal)}/yr`} />
        <Kpi label="Win rate" value={`${winRate}%`} />
      </div>

      <div className="mt-5 flex-1 overflow-hidden">
        {isLoading ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {LEAD_STAGES.slice(0, 3).map((s) => (
              <div key={s.key} className="card-base p-3">
                <SkeletonRows rows={3} />
              </div>
            ))}
          </div>
        ) : isError ? (
          <ErrorState message="Could not load the pipeline." onRetry={() => refetch()} />
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={(e: DragStartEvent) =>
              setActive((leads ?? []).find((l) => l.id === e.active.id) ?? null)
            }
            onDragEnd={onDragEnd}
          >
            <div className="flex h-full gap-4 overflow-x-auto pb-2">
              {columns.map((s) => (
                <Column
                  key={s.key}
                  stage={s.key}
                  label={s.label}
                  leads={byStage[s.key]}
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

      <AddLeadModal open={addOpen} onClose={() => setAddOpen(false)} />
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

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="card-base p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 text-xl font-bold text-ink">{value}</p>
    </div>
  );
}

function Column({
  stage,
  label,
  leads,
  canWrite,
  onAdd,
  onOpen,
}: {
  stage: LeadStage;
  label: string;
  leads: Lead[];
  canWrite: boolean;
  onAdd: () => void;
  onOpen: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  const total = leads.reduce((s, l) => s + Number(l.estimated_arr || 0), 0);
  return (
    <div className="flex w-[300px] shrink-0 flex-col">
      <div className="mb-1 flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <span className={cn("h-2 w-2 rounded-full", LEAD_STAGE_ACCENT[stage])} />
          <h3 className="text-sm font-semibold text-ink">{label}</h3>
          <span className="rounded-control bg-line px-1.5 py-0.5 text-[10px] font-semibold text-muted">
            {leads.length}
          </span>
        </div>
        {canWrite && (
          <button onClick={onAdd} className="rounded p-1 text-muted hover:bg-line/60 hover:text-primary" aria-label={`Add lead`}>
            <Icon name="plus" size={15} />
          </button>
        )}
      </div>
      <p className="mb-2 px-1 text-xs text-muted">{formatCompactUsd(total)}/yr</p>
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
