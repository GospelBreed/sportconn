import { useEffect, useState } from "react";
import { useLeadEligibility, useSaveEligibility } from "@/hooks/queries";
import { useRole } from "@/lib/auth";
import { useToast } from "@/components/ui/Toast";
import { Modal } from "@/components/ui/overlays";
import { Badge, Button, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/Icon";
import { ErrorState, Skeleton } from "@/components/ui/states";
import {
  ELIGIBILITY_META,
  LAWFUL_BASES,
  LAWFUL_BASIS_LABEL,
  SOURCE_TYPES,
  SOURCE_TYPE_LABEL,
  VERIFICATION_LABEL,
  VERIFICATION_STATUSES,
} from "@/lib/constants";
import { formatDate } from "@/lib/format";
import type { ContactSourceType, LawfulBasis, LeadDetail, LeadEmailEligibility, VerificationStatus } from "@/types";

/**
 * Email permissions (0007): for every address on the lead, can it be emailed,
 * and the evidence behind that — where it came from, lawful basis, verification.
 */
export function LeadEligibility({ lead }: { lead: LeadDetail }) {
  const { data, isLoading, isError, refetch } = useLeadEligibility(lead.id);
  const { canWrite } = useRole();
  const [editing, setEditing] = useState<LeadEmailEligibility | null>(null);

  return (
    <div className="card-base p-4">
      <h3 className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-ink">
        <Icon name="mail" size={14} /> Email permissions
      </h3>
      <p className="mb-2 text-xs text-muted">
        An address can be emailed from the queue only when its source and lawful basis are recorded and it has been
        verified — or management has approved it.
      </p>
      {isLoading ? (
        <Skeleton className="h-10" />
      ) : isError ? (
        <ErrorState message="Could not load email permissions. Has migration 0007 been applied?" onRetry={() => refetch()} />
      ) : !data || data.length === 0 ? (
        <p className="text-xs text-muted">No email addresses on this lead yet.</p>
      ) : (
        <div className="space-y-2">
          {data.map((r) => {
            const meta = ELIGIBILITY_META[r.status];
            return (
              <div key={r.email} className="flex items-start justify-between gap-3 rounded-control bg-surface-2 px-3 py-2">
                <div className="min-w-0 text-xs">
                  <p className="truncate text-sm font-medium text-ink">{r.email}</p>
                  <p className="text-muted">{r.contact_name ?? ""}</p>
                  <p className="text-body">{r.reason}</p>
                  {(r.source_type || r.verification_status) && (
                    <p className="text-muted">
                      {r.source_type ? SOURCE_TYPE_LABEL[r.source_type] : "Source not recorded"} ·{" "}
                      {r.lawful_basis ? LAWFUL_BASIS_LABEL[r.lawful_basis] : LAWFUL_BASIS_LABEL.none_recorded} ·{" "}
                      {r.verification_status ? VERIFICATION_LABEL[r.verification_status] : VERIFICATION_LABEL.unverified}
                      {r.verified_at ? ` (${formatDate(r.verified_at)})` : ""}
                    </p>
                  )}
                </div>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  <Badge className={meta.cls}>{meta.label}</Badge>
                  {canWrite && (
                    <button onClick={() => setEditing(r)} className="text-xs font-medium text-primary hover:underline">
                      Edit
                    </button>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      )}
      {editing && <EligibilityModal lead={lead} row={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function EligibilityModal({ lead, row, onClose }: { lead: LeadDetail; row: LeadEmailEligibility; onClose: () => void }) {
  const { canApprove } = useRole();
  const toast = useToast();
  const save = useSaveEligibility();
  const [sourceType, setSourceType] = useState<ContactSourceType | "">(row.source_type ?? "");
  const [sourceUrl, setSourceUrl] = useState(row.source_url ?? "");
  const [basis, setBasis] = useState<LawfulBasis>(row.lawful_basis ?? "none_recorded");
  const [basisNote, setBasisNote] = useState(row.basis_note ?? "");
  const [verification, setVerification] = useState<VerificationStatus>(row.verification_status ?? "unverified");
  const [override, setOverride] = useState<"" | "eligible" | "ineligible">(row.override ?? "");
  const [overrideReason, setOverrideReason] = useState(row.override_reason ?? "");
  useEffect(() => setOverrideReason(row.override_reason ?? ""), [row]);

  const submit = () => {
    if (sourceUrl.trim() && !/^https?:\/\//i.test(sourceUrl.trim())) {
      toast.error("The source must be a web address starting with http:// or https://");
      return;
    }
    if (canApprove && override && !overrideReason.trim()) {
      toast.error("Give a reason for the override");
      return;
    }
    save.mutate(
      {
        input: {
          email: row.email,
          lead_id: lead.id,
          source_type: sourceType || null,
          source_url: sourceUrl.trim() || null,
          lawful_basis: basis,
          basis_note: basisNote.trim() || null,
          verification_status: verification,
          override: override || null,
          override_reason: overrideReason.trim() || null,
        },
        includeOverride: canApprove,
      },
      {
        onSuccess: () => {
          toast.success("Email permissions saved");
          onClose();
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save"),
      },
    );
  };

  return (
    <Modal open onClose={onClose} title={`Email permissions — ${row.email}`} width="max-w-lg">
      <div className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Where the address came from">
            <Select value={sourceType} onChange={(e) => setSourceType(e.target.value as ContactSourceType | "")}>
              <option value="">Not recorded</option>
              {SOURCE_TYPES.map((s) => (
                <option key={s} value={s}>
                  {SOURCE_TYPE_LABEL[s]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Verification">
            <Select value={verification} onChange={(e) => setVerification(e.target.value as VerificationStatus)}>
              {VERIFICATION_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {VERIFICATION_LABEL[s]}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Source link" hint="The page where the address is published, e.g. the company's team page.">
          <Input value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="https://…" />
        </Field>
        <Field label="Lawful basis for contacting them">
          <Select value={basis} onChange={(e) => setBasis(e.target.value as LawfulBasis)}>
            {LAWFUL_BASES.map((b) => (
              <option key={b} value={b}>
                {LAWFUL_BASIS_LABEL[b]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Why this basis applies (optional)">
          <Textarea value={basisNote} onChange={(e) => setBasisNote(e.target.value)} className="min-h-[56px]"
            placeholder="e.g. Published as the brand's partnerships contact; offer is relevant to their sponsorship role." />
        </Field>
        {canApprove ? (
          <div className="space-y-2 rounded-control border border-line p-3">
            <Field label="Management decision (optional)" hint="Overrides the automatic check. It can't make an unsubscribed or invalid address emailable.">
              <Select value={override} onChange={(e) => setOverride(e.target.value as "" | "eligible" | "ineligible")}>
                <option value="">No override — use the checks above</option>
                <option value="eligible">Allow emailing</option>
                <option value="ineligible">Never email</option>
              </Select>
            </Field>
            {override && (
              <Input value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} placeholder="Reason (required)" aria-label="Override reason" />
            )}
          </div>
        ) : (
          row.override && (
            <p className="text-xs text-muted">
              Management decision: {row.override === "eligible" ? "allow emailing" : "never email"} — {row.override_reason}
            </p>
          )
        )}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={save.isPending}>
            Save
          </Button>
        </div>
      </div>
    </Modal>
  );
}
