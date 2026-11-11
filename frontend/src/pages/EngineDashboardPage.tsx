import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Bar, BarChart, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useEngineDashboard } from "@/hooks/queries";
import { PageHeader } from "@/components/layout/PageHeader";
import { Select } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/Icon";
import { ErrorState } from "@/components/ui/states";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/format";
import { formatCompactMoney } from "@/lib/money";
import type { EngineDashboard } from "@/types";

// Chart colours (recharts takes literal colours; these are the design tokens' values).
const C_LEADS = "#2563EB";
const C_SENT = "#93C5FD";
const C_REPLIES = "#15803D";
const AXIS = "#6B7280";
const LINE = "#E9E9EF";

const RANGES = [
  { days: 7, label: "Last 7 days" },
  { days: 30, label: "Last 30 days" },
  { days: 90, label: "Last 90 days" },
];

function rangeFrom(days: number): { from: string; to: string } {
  const today = new Date(Date.now() + 3600_000); // Lagos date
  const to = today.toISOString().slice(0, 10);
  const from = new Date(today.getTime() - (days - 1) * 86_400_000).toISOString().slice(0, 10);
  return { from, to };
}

const pct = (n: number, d: number) => (d > 0 ? `${Math.round((n / d) * 1000) / 10}%` : "—");

/** Blueprint §8: is the engine producing qualified partnership conversations? */
export function EngineDashboardPage() {
  const [days, setDays] = useState(30);
  const { from, to } = rangeFrom(days);
  const { data, isLoading, isError, refetch } = useEngineDashboard(from, to);

  return (
    <div className="p-5 sm:p-6">
      <PageHeader
        eyebrow="AI Partnership Engine"
        title="Engine dashboard"
        subtitle="The number that matters is qualified partnership conversations — not emails sent."
        actions={
          <Select value={days} onChange={(e) => setDays(Number(e.target.value))} className="w-40" aria-label="Period">
            {RANGES.map((r) => (
              <option key={r.days} value={r.days}>
                {r.label}
              </option>
            ))}
          </Select>
        }
      />
      {isLoading ? (
        <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="skeleton h-24 rounded-card" />
          ))}
        </div>
      ) : isError || !data ? (
        <div className="mt-5 card-base">
          <ErrorState message="Could not load the engine dashboard. Has migration 0008 been applied?" onRetry={() => refetch()} />
        </div>
      ) : (
        <Body d={data} />
      )}
    </div>
  );
}

function Body({ d }: { d: EngineDashboard }) {
  const noActivity = d.leads_created === 0 && d.emails_sent === 0 && d.replies === 0;
  return (
    <div className="mt-5 space-y-5">
      <p className="text-xs text-muted">
        {formatDate(d.from)} – {formatDate(d.to)} · Lagos time
      </p>

      {(d.drafts_waiting > 0 || d.replies_unread > 0) && (
        <div className="flex flex-col gap-2 sm:flex-row">
          {d.replies_unread > 0 && (
            <Link to="/email-review" className="flex flex-1 items-center gap-2 rounded-card bg-success/10 p-3 text-sm font-medium text-success hover:bg-success/15">
              <Icon name="mail" size={16} /> {d.replies_unread} {d.replies_unread === 1 ? "reply needs" : "replies need"} a response
            </Link>
          )}
          {d.drafts_waiting > 0 && (
            <Link to="/email-review" className="flex flex-1 items-center gap-2 rounded-card bg-warning/12 p-3 text-sm font-medium text-warning hover:bg-warning/20">
              <Icon name="edit" size={16} /> {d.drafts_waiting} {d.drafts_waiting === 1 ? "draft is" : "drafts are"} waiting for review
            </Link>
          )}
        </div>
      )}

      <Section title="Pipeline outcomes">
        <Kpi label="Positive replies" value={d.positive_replies} sub={`${pct(d.positive_replies, d.delivered)} of delivered`} accent />
        <Kpi label="Meeting requests" value={d.meeting_requests} />
        <Kpi label="Meetings held" value={d.meetings_held} />
        <Kpi label="Proposals sent" value={d.proposals} />
        <Kpi label="Partnerships closed" value={d.deals_won} />
        <Kpi label="Revenue received" value={formatCompactMoney(d.revenue)} />
        <Kpi label="Open pipeline" value={formatCompactMoney(d.pipeline_value)} sub="engine leads, expected value" />
        <Kpi label="All replies" value={d.replies} sub={d.replies_unmatched ? `+${d.replies_unmatched} not matched to a lead` : undefined} />
      </Section>

      <Section title="Research">
        <Kpi label="Qualified leads added" value={d.leads_created} />
        <Kpi label="Priority (80+)" value={d.priority_80_plus} sub={pct(d.priority_80_plus, d.leads_created)} />
        <Kpi label="Qualified (65–79)" value={d.qualified_65_79} sub={pct(d.qualified_65_79, d.leads_created)} />
        <Kpi label="Average score" value={d.avg_score ?? "—"} />
        <Kpi label="Contacts found" value={d.contacts_found} />
        <Kpi label="Verified contact rate" value={pct(d.contacts_verified, d.contacts_found)} sub={`${d.contacts_verified} verified`} />
        <Kpi label="Eligible-to-contact rate" value={pct(d.contacts_eligible, d.contacts_found)} sub={`${d.contacts_eligible} can be emailed`} />
      </Section>

      <Section title="Email delivery">
        <Kpi label="Emails sent" value={d.emails_sent} sub={`${d.first_emails_sent} first · ${d.followups_sent} follow-ups`} />
        <Kpi label="Delivery rate" value={pct(d.delivered, d.emails_sent)} sub={`${d.delivered} delivered`} />
        <Kpi label="Bounce rate" value={pct(d.bounced, d.emails_sent)} sub={`${d.bounced} bounced`} tone={d.emails_sent > 0 && d.bounced / d.emails_sent > 0.03 ? "danger" : undefined} />
        <Kpi label="Spam complaints" value={d.complaints} tone={d.complaints > 0 ? "danger" : undefined} />
        <Kpi label="Unsubscribes" value={d.unsubscribes} sub={pct(d.unsubscribes, d.delivered)} />
        <Kpi label="Waiting for review" value={d.drafts_waiting} />
        <Kpi label="Queued to send" value={d.queued} />
      </Section>

      <section className="card-base p-5">
        <h3 className="text-sm font-semibold text-ink">Day by day</h3>
        <p className="mb-3 text-xs text-muted">New qualified leads, emails sent and replies received.</p>
        {noActivity ? (
          <p className="py-10 text-center text-sm text-muted">No engine activity in this period yet.</p>
        ) : (
          <div className="h-64" role="img" aria-label="Daily leads, emails sent and replies">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={d.daily.map((x) => ({ ...x, day: x.date.slice(5) }))}>
                <XAxis dataKey="day" tick={{ fill: AXIS, fontSize: 10 }} axisLine={{ stroke: LINE }} tickLine={false} minTickGap={8} />
                <YAxis allowDecimals={false} tick={{ fill: AXIS, fontSize: 11 }} axisLine={false} tickLine={false} width={28} />
                <Tooltip cursor={{ fill: "rgba(0,0,0,0.04)" }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="leads" name="Leads" fill={C_LEADS} radius={[3, 3, 0, 0]} />
                <Bar dataKey="sent" name="Emails sent" fill={C_SENT} radius={[3, 3, 0, 0]} />
                <Bar dataKey="replies" name="Replies" fill={C_REPLIES} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>
      <p className="text-xs text-muted">
        Bounce rates above 3% or any spam complaints are a signal to slow down and check contact quality before sending more.
      </p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">{title}</h3>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{children}</div>
    </section>
  );
}

function Kpi({ label, value, sub, accent, tone }: { label: string; value: string | number; sub?: string; accent?: boolean; tone?: "danger" }) {
  return (
    <div className={cn("card-base p-4", accent && "ring-1 ring-primary/30")}>
      <p className="text-xs text-muted">{label}</p>
      <p className={cn("mt-1 text-xl font-bold", tone === "danger" ? "text-danger" : accent ? "text-primary" : "text-ink")}>{value}</p>
      {sub && <p className="text-[11px] text-muted">{sub}</p>}
    </div>
  );
}
