import { Badge } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/Icon";
import { EmptyState } from "@/components/ui/states";
import { SCORE_FACTORS, prospectTier } from "@/lib/constants";
import { formatDate, formatRelative } from "@/lib/format";
import type { LeadDetail, LeadResearch, ResearchSource } from "@/types";

/** Research gathered by the AI Partnership Engine (0006). Read-only: the engine writes it. */
export function LeadResearchTab({ lead }: { lead: LeadDetail }) {
  const [latest, ...older] = lead.research;
  if (!latest) {
    return (
      <EmptyState
        icon={<Icon name="sparkle" />}
        title="No research yet"
        subtitle="When the AI Partnership Engine researches this company, its findings, sources and score appear here."
      />
    );
  }
  return (
    <div className="space-y-5">
      <ResearchProfile r={latest} />
      {older.length > 0 && (
        <section className="card-base p-4">
          <h3 className="mb-2 text-sm font-semibold text-ink">Earlier research</h3>
          <div className="space-y-2">
            {older.map((r) => (
              <details key={r.id} className="rounded-control border border-line px-3 py-2">
                <summary className="cursor-pointer text-sm text-body">
                  {formatDate(r.research_date)} · score {r.qualification_score ?? "—"} · {r.origin === "ai_engine" ? "AI engine" : r.author?.full_name ?? "Manual"}
                </summary>
                <div className="mt-3">
                  <ResearchProfile r={r} compact />
                </div>
              </details>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function ResearchProfile({ r, compact }: { r: LeadResearch; compact?: boolean }) {
  const tier = prospectTier(r.qualification_score);
  return (
    <div className="space-y-4">
      {!compact && (
        <section className="card-base space-y-3 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="flex items-center gap-1.5 text-sm font-semibold text-ink">
                <Icon name="sparkle" size={14} /> {r.origin === "ai_engine" ? "AI research" : "Research"}
              </h3>
              <p className="text-xs text-muted">
                Researched {formatDate(r.research_date)} · saved {formatRelative(r.created_at)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-lg font-bold text-ink">
                {r.qualification_score ?? "—"}
                <span className="text-xs font-medium text-muted"> / 100</span>
              </p>
              {tier && <Badge className={tier.badge}>{tier.label}</Badge>}
            </div>
          </div>
          {Object.keys(r.score_breakdown ?? {}).length > 0 && (
            <div className="space-y-1.5">
              {SCORE_FACTORS.map((f) => {
                const v = r.score_breakdown[f.key];
                if (typeof v !== "number") return null;
                return (
                  <div key={f.key} className="text-xs">
                    <div className="flex justify-between text-body">
                      <span>{f.label}</span>
                      <span className="text-muted">
                        {v} / {f.max}
                      </span>
                    </div>
                    <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-line">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, (v / f.max) * 100)}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      <section className="card-base space-y-3 p-4">
        <Para label="What the company does" text={r.company_overview} />
        <Para label="Audience" text={r.target_audience} />
        <Para label="Business objective" text={r.business_objective} />
        <Para label="Partnership gap" text={r.partnership_gap} />
        <Para label="SportConn opportunity" text={r.sportconn_opportunity} />
        <Para label="Potential value" text={r.potential_value} />
        <List label="Marketing activities" items={r.marketing_activities} />
        <List label="Sponsorship history" items={r.sponsorship_history} />
      </section>

      <section className="card-base space-y-3 p-4">
        <List label="Verified facts" items={r.verified_facts} tone="success" empty="No verified facts recorded." />
        <List
          label="Assumptions — check before using in an email"
          items={r.assumptions}
          tone="warning"
          empty="No assumptions recorded."
        />
      </section>

      <section className="card-base p-4">
        <h4 className="mb-2 text-xs font-semibold text-muted">Sources</h4>
        {r.sources.length === 0 ? (
          <p className="text-xs text-muted">No sources recorded.</p>
        ) : (
          <ul className="space-y-1.5">
            {r.sources.map((s, i) => {
              const src: ResearchSource = typeof s === "string" ? { url: s } : s;
              const safe = /^https?:\/\//i.test(src.url);
              return (
                <li key={i} className="flex items-start gap-2 text-xs">
                  <Icon name="external" size={12} className="mt-0.5 shrink-0 text-muted" />
                  <span className="min-w-0">
                    {safe ? (
                      <a href={src.url} target="_blank" rel="noopener noreferrer" className="break-all text-primary hover:underline">
                        {src.title || src.url}
                      </a>
                    ) : (
                      <span className="break-all text-body">{src.title || src.url}</span>
                    )}
                    {src.note && <span className="block text-muted">{src.note}</span>}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function Para({ label, text }: { label: string; text?: string | null }) {
  if (!text) return null;
  return (
    <div>
      <h4 className="text-xs font-semibold text-muted">{label}</h4>
      <p className="whitespace-pre-wrap text-sm text-body">{text}</p>
    </div>
  );
}

function itemText(item: unknown): string {
  if (typeof item === "string") return item;
  if (item && typeof item === "object") {
    const o = item as Record<string, unknown>;
    const main = o.text ?? o.title ?? o.fact ?? o.description ?? o.name;
    if (typeof main === "string") return typeof o.url === "string" ? `${main} (${o.url})` : main;
  }
  return JSON.stringify(item);
}

function List({
  label,
  items,
  tone,
  empty,
}: {
  label: string;
  items: unknown[];
  tone?: "success" | "warning";
  empty?: string;
}) {
  if (!items?.length) {
    return empty ? (
      <div>
        <h4 className="text-xs font-semibold text-muted">{label}</h4>
        <p className="text-xs text-muted">{empty}</p>
      </div>
    ) : null;
  }
  const dot = tone === "success" ? "bg-success" : tone === "warning" ? "bg-warning" : "bg-muted";
  return (
    <div>
      <h4 className="text-xs font-semibold text-muted">{label}</h4>
      <ul className="mt-1 space-y-1">
        {items.map((it, i) => (
          <li key={i} className="flex gap-2 text-sm text-body">
            <span className={`mt-2 h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
            <span>{itemText(it)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
