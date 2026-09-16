import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/cn";
import { daysInStage, formatDate } from "@/lib/format";
import { Icon } from "@/components/ui/Icon";
import { AtRiskFlag, FollowupBadge } from "@/components/ui/badges";
import { formatCompactMoney } from "@/lib/money";
import { FACILITY_TYPE_LABEL } from "@/lib/constants";
import type { Facility } from "@/types";

export function FacilityCard({
  facility,
  onOpen,
  dragDisabled,
}: {
  facility: Facility;
  onOpen: (id: string) => void;
  dragDisabled?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: facility.id,
    disabled: dragDisabled,
  });
  const days = daysInStage(facility.updated_at);

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
        <button onClick={() => onOpen(facility.id)} className="min-w-0 flex-1 text-left">
          <p className="truncate text-sm font-semibold text-ink">{facility.name}</p>
          <p className="truncate text-xs text-muted">
            {FACILITY_TYPE_LABEL[facility.facility_type]}
            {facility.area ? ` · ${facility.area}` : ""}
          </p>
        </button>
        {!dragDisabled && (
          <span
            className="cursor-grab touch-none p-1 text-muted opacity-0 transition group-hover:opacity-100 active:cursor-grabbing"
            {...attributes}
            {...listeners}
            aria-label="Drag facility"
          >
            <Icon name="dots" size={15} />
          </span>
        )}
      </div>

      <div className="mt-2 flex items-center justify-between">
        <span className="text-sm font-bold text-ink">{formatCompactMoney(facility.expected_value, facility.currency)}</span>
      </div>

      <div className="mt-2 flex items-center justify-between border-t border-line pt-2 text-[11px] text-muted">
        <span className="truncate">{facility.assignee?.full_name ?? "Unassigned"}</span>
        <span className="truncate">{[facility.city, facility.area].filter(Boolean).join(", ") || "—"}</span>
      </div>

      <div className="mt-1.5 flex items-center justify-between gap-1">
        <span className="text-[11px] text-muted">{days}d in stage</span>
        <div className="flex items-center gap-1">
          <AtRiskFlag stageEnteredAt={facility.updated_at} />
          <FollowupBadge at={facility.next_follow_up_at} />
        </div>
      </div>
      {facility.next_follow_up_at && (
        <p className="mt-1 text-[11px] text-muted">Next: {formatDate(facility.next_follow_up_at)}</p>
      )}
    </div>
  );
}
