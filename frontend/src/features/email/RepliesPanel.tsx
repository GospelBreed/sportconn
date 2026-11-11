import { useState } from "react";
import { Link } from "react-router-dom";
import { useReplies, useUpdateReply } from "@/hooks/queries";
import { useRole } from "@/lib/auth";
import { useToast } from "@/components/ui/Toast";
import { Badge, Button, Select } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/Icon";
import { EmptyState, ErrorState, SkeletonRows } from "@/components/ui/states";
import { REPLY_CLASS_META, REPLY_CLASSES } from "@/lib/constants";
import { cn } from "@/lib/cn";
import { formatDateTime, formatRelative } from "@/lib/format";
import type { EmailReply, ReplyClassification } from "@/types";

type Filter = "unhandled" | "handled" | "unmatched";

const FILTERS: { key: Filter; label: string; empty: string }[] = [
  { key: "unhandled", label: "Needs a response", empty: "No replies waiting. Replies to queue emails appear here and are forwarded to whoever approved the email." },
  { key: "handled", label: "Handled", empty: "Nothing marked handled yet." },
  { key: "unmatched", label: "Not matched to a lead", empty: "Every reply has been matched to a lead." },
];

/** Replies to queue emails (0008): read, see the AI's take, answer, mark handled. */
export function RepliesPanel() {
  const [filter, setFilter] = useState<Filter>("unhandled");
  const { data, isLoading, isError, refetch } = useReplies(filter);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            aria-pressed={filter === f.key}
            className={cn(
              "rounded-control border px-2.5 py-1 text-xs font-medium",
              filter === f.key ? "border-primary bg-primary/10 text-primary" : "border-line text-muted hover:text-ink",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>
      {isLoading ? (
        <SkeletonRows rows={3} />
      ) : isError ? (
        <ErrorState message="Could not load replies. Has migration 0008 been applied?" onRetry={() => refetch()} />
      ) : !data || data.length === 0 ? (
        <EmptyState icon={<Icon name="mail" />} title="Nothing here" subtitle={FILTERS.find((f) => f.key === filter)!.empty} />
      ) : (
        data.map((r) => <ReplyCard key={r.id} r={r} />)
      )}
    </div>
  );
}

function ReplyCard({ r }: { r: EmailReply }) {
  const { canWrite } = useRole();
  const toast = useToast();
  const update = useUpdateReply();
  const [expanded, setExpanded] = useState(false);
  const body = r.body_text ?? "";
  const long = body.length > 700;
  const meta = r.classification ? REPLY_CLASS_META[r.classification] : null;
  const subject = r.subject?.toLowerCase().startsWith("re:") ? r.subject : `Re: ${r.subject ?? ""}`;
  const mailto = `mailto:${encodeURIComponent(r.from_email)}?subject=${encodeURIComponent(subject ?? "")}${
    r.suggested_response ? `&body=${encodeURIComponent(r.suggested_response)}` : ""
  }`;

  const save = (patch: Partial<EmailReply>, ok: string) =>
    update.mutate(
      { id: r.id, body: patch },
      {
        onSuccess: () => toast.success(ok),
        onError: (e) => toast.error(e instanceof Error ? e.message : "Update failed"),
      },
    );

  return (
    <div className="rounded-card border border-line p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink">
            {r.from_name ? `${r.from_name} ` : ""}
            <span className="font-normal text-muted">&lt;{r.from_email}&gt;</span>
          </p>
          <p className="text-xs text-muted">
            {r.leads ? (
              <Link to={`/leads?focus=${r.lead_id}`} className="text-primary hover:underline">
                {r.leads.company_name || r.leads.full_name}
              </Link>
            ) : (
              "No matching lead"
            )}
            {r.email ? ` · replied to “${r.email.subject}”${r.email.sequence_step > 1 ? ` (follow-up ${r.email.sequence_step - 1})` : ""}` : ""}
            {` · ${formatRelative(r.received_at)}`}
          </p>
        </div>
        <span className="flex shrink-0 flex-wrap items-center gap-1.5">
          {meta ? (
            <Badge className={meta.cls}>
              {meta.label}
              {r.classified_by === "ai" ? " (AI)" : ""}
            </Badge>
          ) : (
            <Badge className="bg-warning/14 text-warning">Not read by AI yet</Badge>
          )}
          {r.handled && <Badge className="bg-line text-muted">Handled</Badge>}
        </span>
      </div>

      <p className="mt-3 text-sm font-medium text-ink">{r.subject || "(no subject)"}</p>
      <p className="mt-1 whitespace-pre-wrap rounded-control bg-surface-2 p-3 text-sm text-body">
        {long && !expanded ? body.slice(0, 700) + "…" : body}
      </p>
      {long && (
        <button onClick={() => setExpanded(!expanded)} className="mt-1 text-xs font-medium text-primary hover:underline">
          {expanded ? "Show less" : "Show the whole reply"}
        </button>
      )}

      {(r.summary || r.suggested_response) && (
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {r.summary && (
            <div className="rounded-control bg-surface-2 p-3 text-xs">
              <p className="font-semibold text-muted">AI summary</p>
              <p className="mt-1 text-body">{r.summary}</p>
            </div>
          )}
          {r.suggested_response && (
            <div className="rounded-control bg-primary/5 p-3 text-xs">
              <p className="font-semibold text-primary">Suggested response — check before sending</p>
              <p className="mt-1 whitespace-pre-wrap text-body">{r.suggested_response}</p>
            </div>
          )}
        </div>
      )}

      <div className="mt-3 flex flex-col gap-2 border-t border-line pt-3 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
        <span>
          {r.matched_by === "sender_address" ? "Matched by the sender's address" : r.matched_by === "reply_address" ? "Matched to the exact email" : "Not matched"}
          {r.handled && r.handler ? ` · handled by ${r.handler.full_name}${r.handled_at ? ` ${formatDateTime(r.handled_at)}` : ""}` : ""}
        </span>
        {canWrite && (
          <span className="flex flex-wrap items-center gap-2">
            <Select
              value={r.classification ?? ""}
              onChange={(e) => save({ classification: (e.target.value || null) as ReplyClassification | null }, "Category updated")}
              className="h-8 w-44 text-xs"
              aria-label="Category"
            >
              <option value="">No category</option>
              {REPLY_CLASSES.map((c) => (
                <option key={c} value={c}>
                  {REPLY_CLASS_META[c].label}
                </option>
              ))}
            </Select>
            <a
              href={mailto}
              className="inline-flex h-8 items-center gap-1.5 rounded-control border border-line px-3 text-xs font-medium text-body hover:bg-surface-2"
            >
              <Icon name="mail" size={13} /> Reply
            </a>
            <Button size="sm" variant={r.handled ? "secondary" : "primary"} onClick={() => save({ handled: !r.handled }, r.handled ? "Moved back to Needs a response" : "Marked handled")} loading={update.isPending}>
              {r.handled ? "Not handled" : "Mark handled"}
            </Button>
          </span>
        )}
      </div>
    </div>
  );
}
