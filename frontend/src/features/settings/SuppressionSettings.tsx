import { useMemo, useState } from "react";
import { useAddSuppression, useRemoveSuppression, useSuppressions } from "@/hooks/queries";
import { useDebounced } from "@/hooks/useDebounced";
import { useRole } from "@/lib/auth";
import { useToast } from "@/components/ui/Toast";
import { ConfirmDialog } from "@/components/ui/overlays";
import { Badge, Button, Input, Select } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/Icon";
import { ErrorState, SkeletonRows } from "@/components/ui/states";
import { SUPPRESSION_REASON_LABEL, SUPPRESSION_REASONS } from "@/lib/constants";
import { formatDate } from "@/lib/format";
import type { Suppression, SuppressionReason } from "@/types";

/**
 * Settings → Do-not-contact list (0006). Permanent: it outlives deleted leads.
 * Anyone who can write adds entries; only management/admins remove them.
 */
export function SuppressionSettings() {
  const { canWrite, canApprove } = useRole();
  const toast = useToast();
  const { data, isLoading, isError, refetch } = useSuppressions();
  const add = useAddSuppression();
  const remove = useRemoveSuppression();
  const [value, setValue] = useState("");
  const [reason, setReason] = useState<SuppressionReason>("do_not_contact");
  const [search, setSearch] = useState("");
  const q = useDebounced(search, 300).trim().toLowerCase();
  const [toRemove, setToRemove] = useState<Suppression | null>(null);

  const rows = useMemo(
    () => (data ?? []).filter((s) => !q || (s.email ?? s.domain ?? "").includes(q)),
    [data, q],
  );

  const submit = () => {
    const v = value.trim();
    if (!v) return;
    const body = v.includes("@") ? { email: v, reason } : { domain: v, reason };
    add.mutate(body, {
      onSuccess: () => {
        setValue("");
        toast.success(`${v} won't be contacted`);
      },
      onError: (e) => {
        const msg = e instanceof Error ? e.message : "Could not add";
        toast.error(/duplicate key/i.test(msg) ? `${v} is already on the list` : msg);
      },
    });
  };

  return (
    <section className="card-base p-5">
      <h3 className="text-sm font-semibold text-ink">Do-not-contact list</h3>
      <p className="mb-4 text-xs text-muted">
        Email addresses and whole domains that must never be emailed or re-added as prospects — unsubscribes, opt-out
        requests, bounces. Entries stay even if the lead is deleted. A domain also covers its sub-domains.
        {canApprove ? "" : " Only management or admins can remove entries."}
      </p>

      {canWrite && (
        <div className="mb-4 flex flex-col gap-2 sm:flex-row">
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="name@company.com or company.com"
            aria-label="Email or domain to block"
          />
          <Select value={reason} onChange={(e) => setReason(e.target.value as SuppressionReason)} className="sm:w-56" aria-label="Reason">
            {SUPPRESSION_REASONS.map((r) => (
              <option key={r} value={r}>
                {SUPPRESSION_REASON_LABEL[r]}
              </option>
            ))}
          </Select>
          <Button onClick={submit} loading={add.isPending} disabled={!value.trim()}>
            Add
          </Button>
        </div>
      )}

      {isLoading ? (
        <SkeletonRows rows={3} />
      ) : isError ? (
        <ErrorState message="Could not load the list. Has migration 0006 been applied?" onRetry={() => refetch()} />
      ) : !data || data.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted">Nobody is on the list yet.</p>
      ) : (
        <>
          {data.length > 8 && (
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search the list" className="mb-2 h-8 text-xs" aria-label="Search the list" />
          )}
          <div className="max-h-80 divide-y divide-line/70 overflow-y-auto">
            {rows.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm text-ink">
                    {s.email ?? (
                      <>
                        <span className="text-muted">all of </span>
                        {s.domain}
                      </>
                    )}
                  </p>
                  <p className="text-xs text-muted">
                    {formatDate(s.created_at)} · {s.source === "lead_opt_out" ? "from a lead's Do not email box" : s.source === "engine" ? "added by the AI engine" : s.author?.full_name ?? "added manually"}
                    {s.note ? ` · ${s.note}` : ""}
                  </p>
                </div>
                <span className="flex shrink-0 items-center gap-2">
                  <Badge className="bg-line text-muted">{SUPPRESSION_REASON_LABEL[s.reason]}</Badge>
                  {canApprove && (
                    <button onClick={() => setToRemove(s)} className="rounded p-1 text-muted hover:bg-line/60 hover:text-danger" aria-label={`Remove ${s.email ?? s.domain}`}>
                      <Icon name="trash" size={14} />
                    </button>
                  )}
                </span>
              </div>
            ))}
            {rows.length === 0 && <p className="py-4 text-center text-sm text-muted">No matches.</p>}
          </div>
        </>
      )}

      <ConfirmDialog
        open={!!toRemove}
        onClose={() => setToRemove(null)}
        title="Allow contact again?"
        message={`${toRemove?.email ?? toRemove?.domain} will be removed from the do-not-contact list and can be emailed again. Only do this if they asked to hear from SportConn.`}
        confirmLabel="Remove from list"
        loading={remove.isPending}
        onConfirm={() =>
          toRemove &&
          remove.mutate(toRemove.id, {
            onSuccess: () => {
              setToRemove(null);
              toast.success("Removed from the list");
            },
            onError: (e) => toast.error(e instanceof Error ? e.message : "Could not remove"),
          })
        }
      />
    </section>
  );
}
