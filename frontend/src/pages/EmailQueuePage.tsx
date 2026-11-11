import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  useEmailCount,
  useUnhandledReplyCount,
  useEmailMessages,
  useEmailSettings,
  useEmailsSentSince,
  useUpdateEmailMessage,
} from "@/hooks/queries";
import { useRealtime } from "@/hooks/useRealtime";
import { useRole } from "@/lib/auth";
import { useToast } from "@/components/ui/Toast";
import { PageHeader } from "@/components/layout/PageHeader";
import { Tabs } from "@/components/ui/overlays";
import { Badge, Button, Input, Progress, Textarea } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/Icon";
import { EmptyState, ErrorState, SkeletonRows } from "@/components/ui/states";
import { EMAIL_STATUS_META, WEEKDAYS, prospectTier } from "@/lib/constants";
import { formatDateTime, formatRelative } from "@/lib/format";
import { openPlaceholders } from "@/features/leads/emailTemplates";
import { RepliesPanel } from "@/features/email/RepliesPanel";
import type { EmailMessage, EmailMessageStatus } from "@/types";

type View = "review" | "queued" | "sent" | "problems" | "closed";

const VIEWS: Record<View, { label: string; statuses: EmailMessageStatus[]; empty: string }> = {
  review: { label: "To review", statuses: ["draft"], empty: "No drafts waiting. New AI drafts appear here for a person to approve." },
  queued: { label: "Queued", statuses: ["approved", "sending"], empty: "Nothing queued. Approved emails wait here until the next sending slot." },
  sent: { label: "Sent", statuses: ["sent", "delivered"], empty: "No emails sent from the queue yet." },
  problems: { label: "Problems", statuses: ["bounced", "complained", "failed"], empty: "No bounces, spam reports or failures." },
  closed: { label: "Rejected & cancelled", statuses: ["rejected", "cancelled"], empty: "Nothing rejected or cancelled." },
};

function lagosDayStartIso(): string {
  const date = new Date(Date.now() + 3600_000).toISOString().slice(0, 10);
  return new Date(`${date}T00:00:00+01:00`).toISOString();
}

export function EmailQueuePage() {
  const [view, setView] = useState<View | "replies">("review");
  useRealtime("email_messages", [["email-messages"]]);
  useRealtime("email_replies", [["email-replies"]]);
  const reviewCount = useEmailCount(VIEWS.review.statuses);
  const queuedCount = useEmailCount(VIEWS.queued.statuses);
  const problemCount = useEmailCount(VIEWS.problems.statuses);
  const replyCount = useUnhandledReplyCount();

  return (
    <div className="p-5 sm:p-6">
      <PageHeader
        eyebrow="AI Partnership Engine"
        title="Email review"
        subtitle="Every engine-written email is checked by a person before it goes out. Approved emails are sent in small batches within the daily limit."
      />
      <SendingStatus />
      <div className="mt-4 card-base p-4 sm:p-5">
        <Tabs
          active={view}
          onChange={setView}
          tabs={[
            { key: "replies" as const, label: "Replies", count: replyCount.data || undefined },
            { key: "review", label: VIEWS.review.label, count: reviewCount.data ?? 0 },
            { key: "queued", label: VIEWS.queued.label, count: queuedCount.data ?? 0 },
            { key: "sent", label: VIEWS.sent.label },
            { key: "problems", label: VIEWS.problems.label, count: problemCount.data || undefined },
            { key: "closed", label: VIEWS.closed.label },
          ]}
        />
        <div className="pt-4">
          {view === "replies" ? <RepliesPanel /> : <MessageList view={view} />}
        </div>
      </div>
    </div>
  );
}

function SendingStatus() {
  const since = useMemo(lagosDayStartIso, []);
  const settings = useEmailSettings();
  const sent = useEmailsSentSince(since);
  if (settings.isLoading) return <SkeletonRows rows={1} className="mt-5" />;
  if (settings.isError || !settings.data) {
    return (
      <div className="mt-5 card-base">
        <ErrorState message="Could not load sending settings. Has migration 0007 been applied?" onRetry={() => settings.refetch()} />
      </div>
    );
  }
  const s = settings.data;
  const n = sent.data ?? 0;
  const days = WEEKDAYS.filter((d) => s.send_days.includes(d.iso)).map((d) => d.label).join(", ");
  return (
    <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
      <div className="card-base p-4">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Sent today</p>
        <p className="mt-1 text-xl font-bold text-ink">
          {n}
          <span className="text-xs font-medium text-muted"> / {s.daily_send_limit}</span>
        </p>
        <Progress value={s.daily_send_limit ? (n / s.daily_send_limit) * 100 : 100} className="mt-2" />
      </div>
      <div className="card-base p-4 sm:col-span-2">
        {s.sending_paused ? (
          <p className="flex items-center gap-2 text-sm font-semibold text-danger">
            <Icon name="alert" size={15} /> Sending is paused. Approved emails stay queued until it's resumed.
          </p>
        ) : (
          <p className="text-sm text-body">
            Sends {days}, {String(s.send_hour_start).padStart(2, "0")}:00–{String(s.send_hour_end).padStart(2, "0")}:00 Lagos time · at most{" "}
            {s.per_domain_daily_limit} a day to one company · {s.min_days_between_emails} days between emails to the same person.
          </p>
        )}
        <p className="mt-1 text-xs text-muted">
          {s.require_review ? "Every draft needs a person's approval." : "Review is switched off: eligible drafts are approved automatically."}{" "}
          <Link to="/settings" className="text-primary hover:underline">
            Sending settings
          </Link>
        </p>
      </div>
    </div>
  );
}

function MessageList({ view }: { view: View }) {
  const { data, isLoading, isError, refetch } = useEmailMessages(VIEWS[view].statuses);
  if (isLoading) return <SkeletonRows rows={3} />;
  if (isError) return <ErrorState message="Could not load emails." onRetry={() => refetch()} />;
  if (!data || data.length === 0) return <EmptyState icon={<Icon name="mail" />} title="Nothing here" subtitle={VIEWS[view].empty} />;
  return (
    <div className="space-y-3">
      {data.map((m) => (
        <EmailCard key={m.id} m={m} />
      ))}
    </div>
  );
}

function listText(item: unknown): string {
  if (typeof item === "string") return item;
  if (item && typeof item === "object") {
    const o = item as Record<string, unknown>;
    const main = o.text ?? o.fact ?? o.evidence ?? o.title ?? o.description;
    if (typeof main === "string") return typeof o.url === "string" ? `${main} (${o.url})` : main;
  }
  return JSON.stringify(item);
}

function EmailCard({ m }: { m: EmailMessage }) {
  const { canWrite } = useRole();
  const toast = useToast();
  const update = useUpdateEmailMessage();
  const editable = canWrite && m.status === "draft";
  const [subject, setSubject] = useState(m.subject);
  const [body, setBody] = useState(m.body);
  const [note, setNote] = useState("");
  useEffect(() => {
    setSubject(m.subject);
    setBody(m.body);
  }, [m.subject, m.body]);

  const dirty = subject !== m.subject || body !== m.body;
  const placeholders = openPlaceholders(subject + "\n" + body);
  const meta = EMAIL_STATUS_META[m.status];
  const tier = prospectTier(m.leads?.prospect_score);

  const act = (patch: Partial<EmailMessage>, ok: string) =>
    update.mutate(
      { id: m.id, body: patch },
      {
        onSuccess: () => toast.success(ok),
        onError: (e) => toast.error(e instanceof Error ? e.message : "Update failed"),
      },
    );

  const approve = () => {
    if (placeholders.length) return toast.error(`Fill in ${placeholders.join(", ")} first`);
    if (dirty) {
      // save the edits, then approve
      update.mutate(
        { id: m.id, body: { subject: subject.trim(), body: body.trim() } },
        {
          onSuccess: () => act({ status: "approved" }, "Approved — queued for sending"),
          onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save edits"),
        },
      );
      return;
    }
    act({ status: "approved" }, "Approved — queued for sending");
  };

  return (
    <div className="rounded-card border border-line p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <Link to={`/leads?focus=${m.lead_id}`} className="text-sm font-semibold text-ink hover:text-primary">
            {m.leads?.company_name || m.leads?.full_name || "Lead"}
          </Link>
          <p className="truncate text-xs text-muted">
            To {m.to_name ? `${m.to_name} <${m.to_email}>` : m.to_email}
            {m.sequence_step > 1 ? ` · follow-up ${m.sequence_step - 1}` : ""}
          </p>
        </div>
        <span className="flex shrink-0 flex-wrap items-center gap-1.5">
          {m.origin === "ai_engine" && <Badge className="bg-primary/10 text-primary">AI draft</Badge>}
          {typeof m.confidence === "number" && <Badge className="bg-line text-muted">Confidence {Math.round(m.confidence * 100)}%</Badge>}
          {tier && <Badge className={tier.badge}>Score {m.leads?.prospect_score}</Badge>}
          <Badge className={meta.cls}>{meta.label}</Badge>
        </span>
      </div>

      <div className="mt-3 space-y-2">
        {editable ? (
          <>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} aria-label="Subject" />
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} className="min-h-[200px]" aria-label="Message" />
            <p className="text-[11px] text-muted">An opt-out line (“If this isn't relevant, just reply ‘no thanks’ or use this link…”) is added automatically when the email is sent.</p>
          </>
        ) : (
          <>
            <p className="text-sm font-medium text-ink">{m.subject}</p>
            <details className="text-sm">
              <summary className="cursor-pointer text-xs text-primary">Show message</summary>
              <p className="mt-1 whitespace-pre-wrap rounded-control bg-surface-2 p-3 text-body">{m.body}</p>
            </details>
          </>
        )}
      </div>

      {(m.partnership_concept || m.personalization_evidence.length > 0 || m.facts_to_verify.length > 0) && (
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {(m.partnership_concept || m.personalization_evidence.length > 0) && (
            <div className="rounded-control bg-surface-2 p-3 text-xs">
              {m.partnership_concept && (
                <p className="mb-1 text-body">
                  <span className="font-semibold">Concept:</span> {m.partnership_concept}
                </p>
              )}
              {m.personalization_evidence.length > 0 && (
                <>
                  <p className="font-semibold text-muted">Why it's personal</p>
                  <ul className="mt-1 list-disc space-y-0.5 pl-4 text-body">
                    {m.personalization_evidence.map((x, i) => (
                      <li key={i}>{listText(x)}</li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}
          {m.facts_to_verify.length > 0 && (
            <div className="rounded-control bg-warning/10 p-3 text-xs">
              <p className="font-semibold text-warning">Check before approving</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4 text-body">
                {m.facts_to_verify.map((x, i) => (
                  <li key={i}>{listText(x)}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {placeholders.length > 0 && m.status === "draft" && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-warning">
          <Icon name="alert" size={13} /> Fill in before approving: {placeholders.join(", ")}
        </p>
      )}
      {m.error && (
        <p className="mt-2 flex items-start gap-1.5 text-xs text-danger">
          <Icon name="alert" size={13} className="mt-0.5 shrink-0" /> {m.error}
        </p>
      )}

      <div className="mt-3 flex flex-col gap-2 border-t border-line pt-3 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
        <span>
          {m.reviewed_at && m.reviewer ? `${m.status === "rejected" ? "Rejected" : "Approved"} by ${m.reviewer.full_name} ${formatRelative(m.reviewed_at)}` : `Drafted ${formatRelative(m.created_at)}`}
          {m.sent_at ? ` · sent ${formatDateTime(m.sent_at)}` : ""}
          {m.delivered_at ? " · delivered" : ""}
          {m.review_note ? ` · “${m.review_note}”` : ""}
        </span>
        {canWrite && (
          <span className="flex flex-wrap items-center gap-2">
            {m.status === "draft" && (
              <>
                {dirty && (
                  <Button size="sm" variant="secondary" onClick={() => act({ subject: subject.trim(), body: body.trim() }, "Edits saved")} disabled={update.isPending}>
                    Save edits
                  </Button>
                )}
                <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reason (for reject)" className="h-8 w-40 text-xs" aria-label="Reject reason" />
                <Button size="sm" variant="secondary" onClick={() => act({ status: "rejected", review_note: note.trim() || null }, "Draft rejected")} disabled={update.isPending}>
                  Reject
                </Button>
                <Button size="sm" onClick={approve} loading={update.isPending}>
                  Approve
                </Button>
              </>
            )}
            {m.status === "approved" && (
              <>
                <Button size="sm" variant="secondary" onClick={() => act({ status: "draft" }, "Moved back to drafts")} disabled={update.isPending}>
                  Back to draft
                </Button>
                <Button size="sm" variant="secondary" onClick={() => act({ status: "cancelled" }, "Cancelled")} disabled={update.isPending}>
                  Cancel
                </Button>
              </>
            )}
            {m.status === "failed" && (
              <Button size="sm" onClick={() => act({ status: "approved" }, "Queued to try again")} loading={update.isPending}>
                Try again
              </Button>
            )}
            {m.status === "rejected" && (
              <Button size="sm" variant="secondary" onClick={() => act({ status: "draft" }, "Back in review")} disabled={update.isPending}>
                Review again
              </Button>
            )}
          </span>
        )}
      </div>
    </div>
  );
}
