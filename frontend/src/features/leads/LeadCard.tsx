import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/cn";
import { daysInStage, formatDate } from "@/lib/format";
import { Icon } from "@/components/ui/Icon";
import { AtRiskFlag, FollowupBadge, TemperatureBadge } from "@/components/ui/badges";
import { formatCompactMoney } from "@/lib/money";
import { LEAD_TYPE_LABEL } from "@/lib/constants";
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
  const isUserAcq = lead.pipeline === "user_acquisition";

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
          <p className="truncate text-sm font-semibold text-ink">
            {lead.company_name || lead.full_name}
          </p>
          <p className="truncate text-xs text-muted">
            {LEAD_TYPE_LABEL[lead.lead_type]}
            {lead.company_name ? ` · ${lead.full_name}` : ""}
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
        {isUserAcq ? (
          <span className="text-sm font-bold text-ink">
            {lead.actual_users ?? 0}/{lead.target_users ?? "—"} users
          </span>
        ) : (
          <span className="text-sm font-bold text-ink">
            {formatCompactMoney(lead.expected_value, lead.currency)}
          </span>
        )}
        <TemperatureBadge temperature={lead.temperature} />
      </div>

      {isUserAcq && lead.target_users ? (
        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-line">
          <div
            className="h-full rounded-full bg-primary"
            style={{ width: `${Math.min(100, Math.round(((lead.actual_users ?? 0) / lead.target_users) * 100))}%` }}
          />
        </div>
      ) : null}

      <div className="mt-2 flex items-center justify-between border-t border-line pt-2 text-[11px] text-muted">
        <span className="truncate">{lead.assignee?.full_name ?? "Unassigned"}</span>
        <span className="truncate">{lead.location_city ?? "—"}</span>
      </div>

      <div className="mt-1.5 flex items-center justify-between gap-1">
        <span className="text-[11px] text-muted">{days}d in stage</span>
        <div className="flex items-center gap-1">
          <AtRiskFlag stageEnteredAt={lead.stage_entered_at} />
          <FollowupBadge at={lead.next_follow_up_at} />
        </div>
      </div>
      {lead.next_follow_up_at && (
        <p className="mt-1 text-[11px] text-muted">Next: {formatDate(lead.next_follow_up_at)}</p>
      )}
    </div>
  );
}
