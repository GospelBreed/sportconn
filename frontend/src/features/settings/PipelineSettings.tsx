import { useState } from "react";
import {
  useCreatePipelineStage,
  useDeletePipelineStage,
  usePipelines,
  usePipelineStages,
  useUpdatePipelineStage,
} from "@/hooks/queries";
import { useRole } from "@/lib/auth";
import { useToast } from "@/components/ui/Toast";
import { Badge, Button, Input } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/Icon";
import { SkeletonRows } from "@/components/ui/states";
import type { PipelineKey } from "@/types";

export function PipelineSettings() {
  const { isAdmin } = useRole();
  const { data: pipelines, isLoading } = usePipelines();
  const [active, setActive] = useState<PipelineKey | null>(null);

  if (!isAdmin) return null;

  return (
    <div className="card-base p-5">
      <h4 className="mb-1 text-sm font-semibold text-ink">Pipelines &amp; stages</h4>
      <p className="mb-4 text-xs text-muted">
        Add, rename, reorder, or remove stages for each pipeline — the Pipeline board and Leads
        filters pick up changes immediately. New pipeline types can be added the same way, without
        code changes.
      </p>
      {isLoading ? (
        <SkeletonRows rows={3} />
      ) : (
        <div className="space-y-2">
          {pipelines?.map((p) => (
            <div key={p.key} className="rounded-card border border-line">
              <button
                onClick={() => setActive((a) => (a === p.key ? null : p.key))}
                className="flex w-full items-center justify-between px-4 py-3 text-left"
              >
                <div>
                  <p className="text-sm font-medium text-ink">{p.label}</p>
                  {p.description && <p className="text-xs text-muted">{p.description}</p>}
                </div>
                <Icon name={active === p.key ? "chevron-down" : "chevron-right"} size={15} className="text-muted" />
              </button>
              {active === p.key && <StageEditor pipeline={p.key} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StageEditor({ pipeline }: { pipeline: PipelineKey }) {
  const { data: stages } = usePipelineStages(pipeline);
  const create = useCreatePipelineStage();
  const update = useUpdatePipelineStage();
  const del = useDeletePipelineStage();
  const toast = useToast();
  const [newLabel, setNewLabel] = useState("");

  const addStage = () => {
    if (!newLabel.trim()) return;
    const key = newLabel.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
    create.mutate(
      {
        pipeline_key: pipeline,
        key,
        label: newLabel.trim(),
        sort_order: (stages?.length ?? 0) + 1,
      },
      {
        onSuccess: () => setNewLabel(""),
        onError: (e) => toast.error(e instanceof Error ? e.message : "Could not add stage"),
      },
    );
  };

  return (
    <div className="border-t border-line px-4 py-3">
      <div className="space-y-1.5">
        {stages?.map((s) => (
          <div key={s.id} className="flex items-center gap-2 rounded-control px-2 py-1.5 hover:bg-surface-2">
            <Input
              defaultValue={s.label}
              className="h-8 flex-1 text-sm"
              onBlur={(e) => {
                if (e.target.value.trim() && e.target.value !== s.label) {
                  update.mutate({ id: s.id, body: { label: e.target.value.trim() } });
                }
              }}
            />
            {s.is_won && <Badge className="bg-success/12 text-success">Won</Badge>}
            {s.is_lost && <Badge className="bg-danger/12 text-danger">Lost</Badge>}
            <button
              onClick={() =>
                del.mutate(s.id, {
                  onError: (e) => toast.error(e instanceof Error ? e.message : "Could not delete — stage may be in use"),
                })
              }
              className="rounded p-1 text-muted hover:bg-line/60 hover:text-danger"
              aria-label="Delete stage"
            >
              <Icon name="trash" size={14} />
            </button>
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        <Input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="New stage name" className="h-8 text-sm" />
        <Button size="sm" variant="secondary" onClick={addStage} disabled={!newLabel.trim()}>
          <Icon name="plus" size={13} /> Add stage
        </Button>
      </div>
    </div>
  );
}
