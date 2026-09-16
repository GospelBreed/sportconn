import { cn } from "@/lib/cn";
import { daysInStage, followupBucket, formatDate } from "@/lib/format";
import { FOLLOWUP_BUCKET_META, PRIORITY_META, TEMPERATURE_META } from "@/lib/constants";
import type { OpportunityStatus, Priority, Temperature } from "@/types";
import { Badge } from "./primitives";
import { Icon } from "./Icon";

export function PriorityBadge({ priority }: { priority: Priority }) {
  const m = PRIORITY_META[priority];
  return (
    <Badge className={m.badge} dot={m.dot}>
      {m.label}
    </Badge>
  );
}

export function TemperatureBadge({ temperature }: { temperature: Temperature }) {
  const m = TEMPERATURE_META[temperature];
  return (
    <Badge className={m.badge} dot={m.dot}>
      {m.label}
    </Badge>
  );
}

/** Stage labels are configurable (Settings → Pipelines), so the caller resolves the label. */
export function StageBadge({ label }: { label: string }) {
  return <Badge className="bg-line text-muted">{label}</Badge>;
}

const STATUS_META: Record<OpportunityStatus, { label: string; badge: string; dot: string }> = {
  open: { label: "Open", badge: "bg-info/12 text-info", dot: "bg-info" },
  won: { label: "Won", badge: "bg-success/12 text-success", dot: "bg-success" },
  lost: { label: "Lost", badge: "bg-danger/12 text-danger", dot: "bg-danger" },
  nurture: { label: "Nurture", badge: "bg-line text-muted", dot: "bg-muted" },
};

export function StatusBadge({ status }: { status: OpportunityStatus }) {
  const m = STATUS_META[status];
  return (
    <Badge className={m.badge} dot={m.dot}>
      {m.label}
    </Badge>
  );
}

export function AgingBadge({ stageEnteredAt }: { stageEnteredAt: string }) {
  const d = daysInStage(stageEnteredAt);
  const cls =
    d >= 14 ? "bg-danger/12 text-danger" : d >= 7 ? "bg-warning/14 text-warning" : "bg-line text-muted";
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
  const m = FOLLOWUP_BUCKET_META[bucket];
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

/** Flags an opportunity that hasn't moved in a while — an operational nudge, not an automatic Lost (§36). */
export function AtRiskFlag({ stageEnteredAt, days = 14 }: { stageEnteredAt: string; days?: number }) {
  if (daysInStage(stageEnteredAt) < days) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-control bg-danger/10 px-1.5 py-0.5 text-[10px] font-semibold text-danger">
      <Icon name="alert" size={11} />
      At Risk
    </span>
  );
}
