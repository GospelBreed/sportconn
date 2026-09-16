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
import { useCases, useDeleteCase } from "@/hooks/queries";
import { updateCaseStage } from "@/lib/db";
import { useRole } from "@/lib/auth";
import { useToast } from "@/components/ui/Toast";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/Icon";
import { ConfirmDialog } from "@/components/ui/overlays";
import { ErrorState, SkeletonRows } from "@/components/ui/states";
import { cn } from "@/lib/cn";
import { ACTIVE_STAGES, STAGES, STAGE_ACCENT } from "@/lib/constants";
import { CaseCard } from "@/features/pipeline/CaseCard";
import { AddCaseModal } from "@/features/pipeline/AddCaseModal";
import { CaseSlideOver } from "@/features/pipeline/CaseSlideOver";
import type { Case, CaseStage } from "@/types";

export function PipelinePage() {
  const { data: cases, isLoading, isError, refetch } = useCases();
  const qc = useQueryClient();
  const toast = useToast();
  const del = useDeleteCase();
  const { canWrite } = useRole();
  const [params, setParams] = useSearchParams();

  const [activeCase, setActiveCase] = useState<Case | null>(null);
  const [addStage, setAddStage] = useState<CaseStage | null>(null);
  const [openCase, setOpenCase] = useState<string | null>(params.get("case"));
  const [toDelete, setToDelete] = useState<Case | null>(null);
  const [showArchive, setShowArchive] = useState(false);

  useEffect(() => {
    if (params.get("new") === "1" && canWrite) {
      setAddStage("intake");
      params.delete("new");
      setParams(params, { replace: true });
    }
    const c = params.get("case");
    if (c) setOpenCase(c);
  }, [params, canWrite, setParams]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const byStage = useMemo(() => {
    const map: Record<CaseStage, Case[]> = {
      intake: [],
      in_progress: [],
      awaiting_resident: [],
      resolved: [],
      closed: [],
    };
    (cases ?? []).forEach((c) => map[c.stage]?.push(c));
    return map;
  }, [cases]);

  const openCount = ACTIVE_STAGES.reduce((n, s) => n + byStage[s].length, 0);

  const stageOf = (id: string): CaseStage | null => {
    if (STAGES.some((s) => s.key === id)) return id as CaseStage;
    return (cases ?? []).find((c) => c.id === id)?.stage ?? null;
  };

  const onDragStart = (e: DragStartEvent) =>
    setActiveCase((cases ?? []).find((c) => c.id === e.active.id) ?? null);

  const onDragEnd = async (e: DragEndEvent) => {
    setActiveCase(null);
    const { active, over } = e;
    if (!over) return;
    const id = String(active.id);
    const target = stageOf(String(over.id));
    const current = (cases ?? []).find((c) => c.id === id);
    if (!current || !target || current.stage === target) return;

    const prev = cases ?? [];
    qc.setQueryData<Case[]>(["cases"], (old) =>
      (old ?? []).map((c) =>
        c.id === id ? { ...c, stage: target, stage_entered_at: new Date().toISOString() } : c,
      ),
    );
    try {
      await updateCaseStage(id, target);
      qc.invalidateQueries({ queryKey: ["cases"] });
      qc.invalidateQueries({ queryKey: ["analytics-summary"] });
    } catch (err) {
      qc.setQueryData(["cases"], prev);
      toast.error(err instanceof Error ? err.message : "Could not move case");
    }
  };

  const columns = showArchive ? STAGES : STAGES.filter((s) => ACTIVE_STAGES.includes(s.key));

  return (
    <div className="flex h-full flex-col p-5 sm:p-6">
      <PageHeader
        eyebrow="Sports operations · pipeline"
        title="Case Pipeline"
        subtitle={`${openCount} open ${openCount === 1 ? "case" : "cases"} across ${ACTIVE_STAGES.length} active stages`}
        actions={
          <>
            <Button variant="secondary" onClick={() => setShowArchive((s) => !s)}>
              <Icon name={showArchive ? "close" : "folder"} size={15} />
              {showArchive ? "Hide archive" : "Show resolved / closed"}
            </Button>
            {canWrite && (
              <Button onClick={() => setAddStage("intake")}>
                <Icon name="plus" size={16} /> New case
              </Button>
            )}
          </>
        }
      />

      <div className="mt-5 flex-1 overflow-hidden">
        {isLoading ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {STAGES.slice(0, 3).map((s) => (
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
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
          >
            <div className="flex h-full gap-4 overflow-x-auto pb-2">
              {columns.map((stage) => (
                <Column
                  key={stage.key}
                  stage={stage.key}
                  label={stage.label}
                  cases={byStage[stage.key]}
                  canWrite={canWrite}
                  onAdd={() => setAddStage(stage.key)}
                  onOpen={setOpenCase}
                  onDelete={setToDelete}
                />
              ))}
            </div>
            <DragOverlay>
              {activeCase && (
                <div className="w-72 rotate-1">
                  <CaseCard c={activeCase} onOpen={() => {}} onDelete={() => {}} dragDisabled />
                </div>
              )}
            </DragOverlay>
          </DndContext>
        )}
      </div>

      <AddCaseModal
        open={addStage !== null}
        defaultStage={addStage ?? "intake"}
        onClose={() => setAddStage(null)}
      />
      <CaseSlideOver
        caseId={openCase}
        open={openCase !== null}
        onClose={() => {
          setOpenCase(null);
          if (params.get("case")) {
            params.delete("case");
            setParams(params, { replace: true });
          }
        }}
      />
      <ConfirmDialog
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        title="Delete case"
        message={`Permanently delete "${toDelete?.title}"? This can't be undone.`}
        loading={del.isPending}
        onConfirm={() =>
          toDelete &&
          del.mutate(toDelete.id, {
            onSuccess: () => {
              toast.success("Case deleted");
              setToDelete(null);
            },
            onError: (e) => toast.error(e instanceof Error ? e.message : "Delete failed"),
          })
        }
      />
    </div>
  );
}

function Column({
  stage,
  label,
  cases,
  canWrite,
  onAdd,
  onOpen,
  onDelete,
}: {
  stage: CaseStage;
  label: string;
  cases: Case[];
  canWrite: boolean;
  onAdd: () => void;
  onOpen: (id: string) => void;
  onDelete: (c: Case) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  return (
    <div className="flex w-[300px] shrink-0 flex-col">
      <div className="mb-2 flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <span className={cn("h-2 w-2 rounded-full", STAGE_ACCENT[stage])} />
          <h3 className="text-sm font-semibold text-ink">{label}</h3>
          <span className="rounded-control bg-line px-1.5 py-0.5 text-[10px] font-semibold text-muted">
            {cases.length}
          </span>
        </div>
        {canWrite && (
          <button
            onClick={onAdd}
            className="rounded p-1 text-muted hover:bg-line/60 hover:text-primary"
            aria-label={`Add case to ${label}`}
          >
            <Icon name="plus" size={15} />
          </button>
        )}
      </div>

      <div
        ref={setNodeRef}
        className={cn(
          "flex-1 space-y-2 overflow-y-auto rounded-card border border-dashed p-2 transition-colors",
          isOver ? "border-primary/50 bg-primary/[0.04]" : "border-line bg-surface-2/60",
        )}
      >
        <SortableContext items={cases.map((c) => c.id)} strategy={verticalListSortingStrategy}>
          {cases.map((c) => (
            <CaseCard key={c.id} c={c} onOpen={onOpen} onDelete={onDelete} dragDisabled={!canWrite} />
          ))}
        </SortableContext>
        {cases.length === 0 && (
          <p className="px-2 py-8 text-center text-xs text-muted">No cases</p>
        )}
      </div>
    </div>
  );
}
