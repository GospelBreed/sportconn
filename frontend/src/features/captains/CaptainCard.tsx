import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/format";
import { Icon } from "@/components/ui/Icon";
import type { Captain } from "@/types";

export function CaptainCard({
  captain,
  onOpen,
  dragDisabled,
}: {
  captain: Captain;
  onOpen: (id: string) => void;
  dragDisabled?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: captain.id,
    disabled: dragDisabled,
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "group rounded-card border border-line bg-surface p-3 shadow-card transition-shadow hover:shadow-pop",
        isDragging && "opacity-50",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <button onClick={() => onOpen(captain.id)} className="min-w-0 flex-1 text-left">
          <p className="truncate text-sm font-semibold text-ink">{captain.full_name}</p>
          <p className="truncate text-xs text-muted">{captain.community || captain.area || "—"}</p>
        </button>
        {!dragDisabled && (
          <span
            className="cursor-grab touch-none p-1 text-muted opacity-0 transition group-hover:opacity-100 active:cursor-grabbing"
            {...attributes}
            {...listeners}
            aria-label="Drag captain"
          >
            <Icon name="dots" size={15} />
          </span>
        )}
      </div>

      <div className="mt-2 flex items-center justify-between text-[11px] text-muted">
        <span className="flex items-center gap-1">
          <Icon name="users" size={12} /> {captain.player_count ?? 0} players
        </span>
        <span>{captain.games_coordinated} games</span>
      </div>

      <div className="mt-2 flex items-center justify-between border-t border-line pt-2 text-[11px] text-muted">
        <span className="truncate">{captain.assignee?.full_name ?? "Unassigned"}</span>
        {captain.next_game_at && <span>Next game {formatDate(captain.next_game_at)}</span>}
      </div>
    </div>
  );
}
