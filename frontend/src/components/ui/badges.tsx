import { cn } from "@/lib/cn";
import { daysInStage, followupBucket, formatDate } from "@/lib/format";
import {
  CATEGORY_META,
  FOLLOWUP_META,
  LEAD_STAGE_LABEL,
  PRIORITY_META,
  RESIDENT_STATUS_META,
  STAGE_LABEL,
  TEMPERATURE_META,
} from "@/lib/constants";
import type {
  CaseCategory,
  CasePriority,
  CaseStage,
  LeadStage,
  LeadTemperature,
  ResidentStatus,
} from "@/types";
import { Badge } from "./primitives";
import { Icon } from "./Icon";

export function PriorityBadge({ priority }: { priority: CasePriority }) {
  const m = PRIORITY_META[priority];
  return (
    <Badge className={m.badge} dot={m.dot}>
      {m.label}
    </Badge>
  );
}

export function StatusBadge({ status }: { status: ResidentStatus }) {
  const m = RESIDENT_STATUS_META[status];
  return (
    <Badge className={m.badge} dot={m.dot}>
      {m.label}
    </Badge>
  );
}

export function StageBadge({ stage }: { stage: CaseStage }) {
  return <Badge className="bg-line text-muted">{STAGE_LABEL[stage]}</Badge>;
}

export function CategoryTag({ category }: { category: CaseCategory }) {
  const m = CATEGORY_META[category];
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted">
      <Icon name={m.icon} size={13} />
      {m.label}
    </span>
  );
}

export function AgingBadge({ stageEnteredAt }: { stageEnteredAt: string }) {
  const d = daysInStage(stageEnteredAt);
  const cls =
    d >= 7 ? "bg-danger/12 text-danger" : d >= 3 ? "bg-warning/14 text-warning" : "bg-line text-muted";
  return (
    <span className={cn("rounded-control px-1.5 py-0.5 text-[10px] font-semibold", cls)}>
      {d}d in stage
    </span>
  );
}

export function FollowupBadge({
  at,
  className,
}: {
  at?: string | null;
  className?: string;
}) {
  const bucket = followupBucket(at);
  if (bucket === "none") return null;
  const m = FOLLOWUP_META[bucket];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-control px-1.5 py-0.5 text-[10px] font-semibold",
        m.badge,
        className,
      )}
      title={at ? `Follow-up ${formatDate(at)}` : undefined}
    >
      <Icon name="clock" size={11} />
      {m.label}
    </span>
  );
}

export function TemperatureBadge({ temperature }: { temperature: LeadTemperature }) {
  const m = TEMPERATURE_META[temperature];
  return (
    <Badge className={m.badge} dot={m.dot}>
      {m.label}
    </Badge>
  );
}

export function LeadStageBadge({ stage }: { stage: LeadStage }) {
  return <Badge className="bg-line text-muted">{LEAD_STAGE_LABEL[stage]}</Badge>;
}

export function ExperienceScore({ score }: { score?: number | null }) {
  if (score == null) return <span className="text-xs text-muted">—</span>;
  const tone =
    score >= 75 ? "text-success" : score >= 50 ? "text-warning" : "text-danger";
  const label =
    score >= 90
      ? "Leader"
      : score >= 75
        ? "Strong"
        : score >= 50
          ? "Growth Opp"
          : "At Risk";
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("text-sm font-semibold tabular-nums", tone)}>{score}</span>
      <span className="text-[11px] text-muted">{label}</span>
    </span>
  );
}
