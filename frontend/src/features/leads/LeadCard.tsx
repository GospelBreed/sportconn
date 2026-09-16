import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/cn";
import { daysInStage } from "@/lib/format";
import { Icon } from "@/components/ui/Icon";
import { ExperienceScore, FollowupBadge, TemperatureBadge } from "@/components/ui/badges";
import { formatCompactUsd } from "@/lib/money";
import type { Lead } from "@/types";

export function LeadCard({
  lead,
  onOpen,
  dragDisabled,
}: {
  lead: Lead;
  onOpen: (id: string) => void;
  dragDisabled?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: lead.id,
    disabled: dragDisabled,
  });
  const days = daysInStage(lead.stage_entered_at);

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "group rounded-card border border-line bg-surface p-3 shadow-card transition-shadow hover:shadow-pop",
        isDragging && "opacity-50",
        lead.temperature === "hot" && "border-l-[3px] border-l-danger",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <button onClick={() => onOpen(lead.id)} className="min-w-0 flex-1 text-left">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
            {lead.company_name ?? "—"}
          </p>
          <p className="truncate text-sm font-semibold text-ink">
            {lead.property_name ?? lead.full_name}
          </p>
          <p className="truncate text-xs text-muted">
            {lead.full_name}
            {lead.title ? ` · ${lead.title}` : ""}
          </p>
        </button>
        {!dragDisabled && (
          <span
            className="cursor-grab touch-none p-1 text-muted opacity-0 transition group-hover:opacity-100 active:cursor-grabbing"
            {...attributes}
            {...listeners}
            aria-label="Drag lead"
          >
            <Icon name="dots" size={15} />
          </span>
        )}
      </div>

      <div className="mt-2 flex items-center justify-between">
        <span className="text-sm font-bold text-ink">{formatCompactUsd(lead.estimated_arr)}/yr</span>
        <TemperatureBadge temperature={lead.temperature} />
      </div>

      <div className="mt-2 flex items-center justify-between border-t border-line pt-2">
        <span className="flex items-center gap-1 text-[11px] text-muted">
          <Icon name="properties" size={12} />
          {lead.unit_count ? `${lead.unit_count} units` : "—"}
        </span>
        {lead.experience_score != null ? (
          <ExperienceScore score={lead.experience_score} />
        ) : (
          <span className="text-[11px] text-muted">{days}d in stage</span>
        )}
      </div>

      <div className="mt-1.5 flex items-center justify-between">
        <span className="text-[11px] text-muted">{days}d in stage</span>
        <FollowupBadge at={lead.next_follow_up_at} />
      </div>
    </div>
  );
}
