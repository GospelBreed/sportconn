import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useCaptains, useDeleteCaptain, usePipelineStages, useUsers } from "@/hooks/queries";
import { useDebounced } from "@/hooks/useDebounced";
import { useRole } from "@/lib/auth";
import { useToast } from "@/components/ui/Toast";
import { PageHeader } from "@/components/layout/PageHeader";
import { Avatar, Badge, Button, Input, Select } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/Icon";
import { EmptyState, ErrorState, SkeletonRows } from "@/components/ui/states";
import { ConfirmDialog } from "@/components/ui/overlays";
import { formatRelative } from "@/lib/format";
import { CaptainSlideOver } from "@/features/captains/CaptainSlideOver";
import { AddCaptainModal } from "@/features/captains/AddCaptainModal";
import type { Captain } from "@/types";

export function CaptainsPage() {
  const [params, setParams] = useSearchParams();
  const { canWrite, canDelete } = useRole();
  const toast = useToast();

  const [search, setSearch] = useState("");
  const [stage, setStage] = useState("");
  const [owner, setOwner] = useState("");
  const q = useDebounced(search, 300);

  const { data: users } = useUsers();
  const { data: stages } = usePipelineStages("captain");
  const { data: captains, isLoading, isError, refetch } = useCaptains({
    q: q || undefined,
    stage: stage || undefined,
    assigned_to: owner || undefined,
  });

  const del = useDeleteCaptain();

  const [selected, setSelected] = useState<string | null>(params.get("focus"));
  const [addOpen, setAddOpen] = useState(false);
  const [toDelete, setToDelete] = useState<Captain | null>(null);

  useEffect(() => {
    if (params.get("new") === "1" && canWrite) {
      setAddOpen(true);
      params.delete("new");
      setParams(params, { replace: true });
    }
    const focus = params.get("focus");
    if (focus) setSelected(focus);
  }, [params, canWrite, setParams]);

  const closeSlideOver = () => {
    setSelected(null);
    if (params.get("focus")) {
      params.delete("focus");
      setParams(params, { replace: true });
    }
  };

  const stageLabel = (key: string) => stages?.find((s) => s.key === key)?.label ?? key;

  return (
    <div className="p-5 sm:p-6">
      <PageHeader
        eyebrow="Growth"
        title="Captains & Communities"
        subtitle="Local football captains organizing grassroots games and communities."
        actions={
          canWrite && (
            <Button onClick={() => setAddOpen(true)}>
              <Icon name="plus" size={16} /> Add captain
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
            placeholder="Search by name, community, or area…"
            className="pl-9"
          />
        </div>
        <Select value={stage} onChange={(e) => setStage(e.target.value)} className="lg:w-48">
          <option value="">All stages</option>
          {stages?.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </Select>
        <Select value={owner} onChange={(e) => setOwner(e.target.value)} className="lg:w-44">
          <option value="">All owners</option>
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
          <ErrorState message="Could not load captains." onRetry={() => refetch()} />
        ) : !captains || captains.length === 0 ? (
          <EmptyState
            icon={<Icon name="users" />}
            title="No captains yet"
            subtitle="Add the first local captain to start building the community pipeline."
            action={
              canWrite && (
                <Button onClick={() => setAddOpen(true)}>
                  <Icon name="plus" size={16} /> Add captain
                </Button>
              )
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line bg-surface-2 text-left text-[11px] uppercase tracking-wide text-muted">
                  <th className="px-4 py-3 font-semibold">Captain</th>
                  <th className="hidden px-4 py-3 font-semibold md:table-cell">Community / Area</th>
                  <th className="px-4 py-3 font-semibold">Stage</th>
                  <th className="hidden px-4 py-3 font-semibold lg:table-cell">Players</th>
                  <th className="hidden px-4 py-3 font-semibold lg:table-cell">Games</th>
                  <th className="hidden px-4 py-3 font-semibold lg:table-cell">Last activity</th>
                  <th className="px-4 py-3 text-right font-semibold">·</th>
                </tr>
              </thead>
              <tbody>
                {captains.map((c) => (
                  <tr
                    key={c.id}
                    onClick={() => setSelected(c.id)}
                    className="cursor-pointer border-b border-line/70 transition-colors last:border-0 hover:bg-surface-2"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar name={c.full_name} size={32} />
                        <div className="min-w-0">
                          <p className="font-medium text-ink">{c.full_name}</p>
                          <p className="truncate text-xs text-muted">{c.phone ?? c.email ?? "—"}</p>
                        </div>
                      </div>
                    </td>
                    <td className="hidden px-4 py-3 text-muted md:table-cell">
                      {c.community ?? c.area ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <Badge className={c.active ? "bg-success/12 text-success" : "bg-line text-muted"}>
                        {stageLabel(c.stage)}
                      </Badge>
                    </td>
                    <td className="hidden px-4 py-3 lg:table-cell">{c.player_count ?? "—"}</td>
                    <td className="hidden px-4 py-3 lg:table-cell">{c.games_coordinated}</td>
                    <td className="hidden px-4 py-3 text-muted lg:table-cell">{formatRelative(c.last_activity_at)}</td>
                    <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                      {canDelete && (
                        <button
                          onClick={() => setToDelete(c)}
                          className="rounded p-1 text-muted hover:bg-line/60 hover:text-danger"
                          aria-label="Delete captain"
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

      <CaptainSlideOver captainId={selected} open={selected !== null} onClose={closeSlideOver} />
      <AddCaptainModal open={addOpen} onClose={() => setAddOpen(false)} />
      <ConfirmDialog
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        title="Delete captain"
        message={`Permanently delete "${toDelete?.full_name}"? This cannot be undone.`}
        confirmLabel="Delete"
        tone="danger"
        loading={del.isPending}
        onConfirm={() =>
          toDelete &&
          del.mutate(toDelete.id, {
            onSuccess: () => {
              toast.success("Captain deleted");
              setToDelete(null);
            },
            onError: (e) => toast.error(e instanceof Error ? e.message : "Delete failed"),
          })
        }
      />
    </div>
  );
}
