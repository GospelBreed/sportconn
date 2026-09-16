import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAssessments } from "@/hooks/queries";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge, Button } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/Icon";
import { Modal } from "@/components/ui/overlays";
import { EmptyState, ErrorState, SkeletonRows } from "@/components/ui/states";
import { ScoreRing } from "@/components/ui/ScoreRing";
import { PILLARS } from "@/lib/constants";
import { formatDate } from "@/lib/format";
import type { ExperienceAssessment } from "@/types";

function bucketOf(score: number) {
  if (score >= 90) return { label: "Leader", cls: "bg-success/12 text-success" };
  if (score >= 75) return { label: "Strong", cls: "bg-info/12 text-info" };
  if (score >= 50) return { label: "Growth Opp", cls: "bg-warning/14 text-warning" };
  return { label: "At Risk", cls: "bg-danger/12 text-danger" };
}

export function ExperiencePage() {
  const { data, isLoading, isError, refetch } = useAssessments();
  const [selected, setSelected] = useState<ExperienceAssessment | null>(null);

  const summary = useMemo(() => {
    const all = data ?? [];
    const avg = all.length
      ? Math.round(all.reduce((s, a) => s + a.overall_score, 0) / all.length)
      : 0;
    return {
      count: all.length,
      avg,
      atRisk: all.filter((a) => a.overall_score < 50).length,
      leader: all.filter((a) => a.overall_score >= 90).length,
    };
  }, [data]);

  return (
    <div className="p-5 sm:p-6">
      <PageHeader
        eyebrow="Diagnostics"
        title="Member Experience"
        subtitle="Community experience scores, pillar performance, and recommended scope."
      />

      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Assessments" value={String(summary.count)} />
        <Stat label="Average score" value={`${summary.avg}/100`} />
        <Stat label="At risk (<50)" value={String(summary.atRisk)} tone="danger" />
        <Stat label="Experience leaders" value={String(summary.leader)} tone="success" />
      </div>

      <div className="mt-5">
        {isLoading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="card-base p-5">
                <SkeletonRows rows={4} />
              </div>
            ))}
          </div>
        ) : isError ? (
          <ErrorState message="Could not load assessments." onRetry={() => refetch()} />
        ) : !data || data.length === 0 ? (
          <EmptyState
            icon={<Icon name="sparkle" />}
            title="No assessments yet"
            subtitle="Diagnostics submitted through the Member Experience checklist appear here."
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {data.map((a) => {
              const b = bucketOf(a.overall_score);
              return (
                <button
                  key={a.id}
                  onClick={() => setSelected(a)}
                  className="card-base p-5 text-left transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-pop"
                >
                  <div className="flex items-center gap-4">
                    <ScoreRing score={a.overall_score} size={64} />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-ink">
                        {a.leads?.property_name ?? a.properties?.name ?? a.leads?.full_name ?? "Community"}
                      </p>
                      <p className="truncate text-xs text-muted">{a.leads?.company_name ?? "—"}</p>
                      <Badge className={`mt-1 ${b.cls}`}>{b.label}</Badge>
                    </div>
                  </div>
                  <p className="mt-3 line-clamp-2 text-xs text-muted">{a.synthesis}</p>
                  <p className="mt-2 text-[11px] text-muted">Submitted {formatDate(a.submitted_at)}</p>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <AssessmentModal assessment={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "danger" | "success";
}) {
  return (
    <div className="card-base p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p
        className={
          "mt-1 text-xl font-bold " +
          (tone === "danger" ? "text-danger" : tone === "success" ? "text-success" : "text-ink")
        }
      >
        {value}
      </p>
    </div>
  );
}

function AssessmentModal({
  assessment,
  onClose,
}: {
  assessment: ExperienceAssessment | null;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  if (!assessment) return null;
  const a = assessment;
  const pillars = PILLARS.map((p) => ({
    label: p.label,
    value: (a[p.key as keyof ExperienceAssessment] as number | null) ?? null,
  }));

  return (
    <Modal open onClose={onClose} title="Member Experience Diagnostic" width="max-w-2xl">
      <div className="space-y-5">
        <div className="flex items-center gap-4">
          <ScoreRing score={a.overall_score} size={80} />
          <div>
            <p className="text-base font-semibold text-ink">
              {a.leads?.property_name ?? a.properties?.name ?? "Community"}
            </p>
            <p className="text-sm text-muted">{a.leads?.company_name ?? "—"}</p>
            {a.lead_id && (
              <Button
                size="sm"
                variant="secondary"
                className="mt-2"
                onClick={() => {
                  onClose();
                  navigate(`/leads?focus=${a.lead_id}`);
                }}
              >
                Open lead
              </Button>
            )}
          </div>
        </div>

        {a.synthesis && (
          <p className="rounded-control bg-surface-2 p-3 text-sm leading-relaxed text-body">
            {a.synthesis}
          </p>
        )}

        <div>
          <h4 className="mb-2 text-sm font-semibold text-ink">Pillar performance</h4>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {pillars.map((p) => (
              <div key={p.label}>
                <div className="mb-1 flex justify-between text-xs">
                  <span className="text-body">{p.label}</span>
                  <span className="font-semibold text-muted">{p.value ?? "—"}%</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-line">
                  <div
                    className={
                      "h-full rounded-full " +
                      ((p.value ?? 0) >= 70 ? "bg-success" : (p.value ?? 0) >= 50 ? "bg-warning" : "bg-danger")
                    }
                    style={{ width: `${p.value ?? 0}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {a.recommended_scope.length > 0 && (
          <div>
            <h4 className="mb-2 text-sm font-semibold text-primary">Recommended scope</h4>
            <div className="flex flex-wrap gap-1.5">
              {a.recommended_scope.map((s) => (
                <Badge key={s} className="bg-primary/10 text-primary">
                  {s}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {a.responses.length > 0 && (
          <div>
            <h4 className="mb-2 text-sm font-semibold text-ink">Diagnostic intake responses</h4>
            <div className="space-y-2">
              {a.responses.map((r, i) => (
                <div key={i} className="rounded-control border border-line p-3">
                  <p className="text-sm font-medium text-body">{r.q}</p>
                  <p className="mt-1 text-sm text-muted">"{r.a}"</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
