import { useState, type ReactNode } from "react";
import {
  useCreateDealApproval,
  useDecideDealApproval,
  useSponsorPackages,
  useUpdateLead,
} from "@/hooks/queries";
import { useRole } from "@/lib/auth";
import { useToast } from "@/components/ui/Toast";
import { Badge, Button, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { Icon, type IconName } from "@/components/ui/Icon";
import { EmptyState } from "@/components/ui/states";
import {
  APPROVAL_STATUS_META,
  APPROVAL_TYPE_LABEL,
  APPROVAL_TYPES,
  CONTRACT_STATUS_LABEL,
  CONTRACT_STATUSES,
  PAYMENT_STATUS_LABEL,
  PAYMENT_STATUSES,
  RENEWAL_STATUS_LABEL,
  RENEWAL_STATUSES,
  SCORE_FACTORS,
  VENDOR_REGISTRATION_LABEL,
  VENDOR_REGISTRATIONS,
  prospectTier,
} from "@/lib/constants";
import { cn } from "@/lib/cn";
import { formatDate, formatRelative } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import type { ApprovalType, DealApproval, Lead, LeadDetail, SponsorPackage } from "@/types";

/** Sponsor-only "Deal" tab: qualify → price → contract → get paid → renew (SOP §3–§9, §12). */
export function SponsorDealTab({ lead }: { lead: LeadDetail }) {
  const { canWrite } = useRole();
  const update = useUpdateLead();
  const toast = useToast();
  const { data: packages } = useSponsorPackages();

  const save = (body: Partial<Lead>, ok = "Saved") =>
    update.mutate(
      { id: lead.id, body },
      {
        onSuccess: () => toast.success(ok),
        onError: (e) => toast.error(e instanceof Error ? e.message : "Update failed"),
      },
    );

  const pkg = packages?.find((p) => p.id === lead.package_id) ?? null;
  const dealValue = lead.contract_value ?? lead.expected_value ?? null;
  const belowList = !!pkg && dealValue !== null && dealValue < pkg.list_price;
  const priceApproved = lead.approvals.some(
    (a) => a.status === "approved" && (a.approval_type === "pricing_exception" || a.approval_type === "discount"),
  );

  return (
    <div className="space-y-5" key={lead.id}>
      <Qualification lead={lead} canWrite={canWrite} save={save} />

      <section className="card-base space-y-3 p-4">
        <SectionTitle icon="dollar" title="Offer and price" hint="Lead with one package. If they ask for a discount, reduce the scope first." />
        <Field label="Package">
          <Select
            value={lead.package_id ?? ""}
            disabled={!canWrite}
            onChange={(e) => save({ package_id: e.target.value || null }, "Package updated")}
          >
            <option value="">No package chosen</option>
            {(packages ?? [])
              .filter((p) => p.is_active || p.id === lead.package_id)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {formatMoney(p.list_price, p.currency)}
                </option>
              ))}
          </Select>
        </Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <MoneyField
            label="Proposal value"
            value={lead.expected_value}
            disabled={!canWrite}
            onSave={(n) => save({ expected_value: n })}
          />
          <MoneyField
            label="Agreed contract value"
            value={lead.contract_value}
            disabled={!canWrite}
            onSave={(n) => save({ contract_value: n })}
          />
        </div>
        {pkg && <MarginCheck pkg={pkg} dealValue={dealValue} currency={lead.currency} />}
        {belowList && (
          <Notice tone={priceApproved ? "success" : "warning"}>
            {priceApproved
              ? "Below the package list price — an approved pricing exception or discount is on file."
              : "Below the package list price. Request a pricing exception or discount below; the deal can't be marked Won without it."}
          </Notice>
        )}
      </section>

      <section className="card-base space-y-3 p-4">
        <SectionTitle icon="file" title="Contract and payment" hint="A verbal yes is not a closed deal. Don't spend on prizes or production before payment." />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Contract">
            <Select
              value={lead.contract_status ?? "not_started"}
              disabled={!canWrite}
              onChange={(e) => save({ contract_status: e.target.value as Lead["contract_status"] })}
            >
              {CONTRACT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {CONTRACT_STATUS_LABEL[s]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Vendor registration" hint="Large brands often require supplier onboarding before paying.">
            <Select
              value={lead.vendor_registration ?? ""}
              disabled={!canWrite}
              onChange={(e) => save({ vendor_registration: (e.target.value || null) as Lead["vendor_registration"] })}
            >
              <option value="">Not checked yet</option>
              {VENDOR_REGISTRATIONS.map((s) => (
                <option key={s} value={s}>
                  {VENDOR_REGISTRATION_LABEL[s]}
                </option>
              ))}
            </Select>
          </Field>
          <TextField
            label="Invoice number"
            value={lead.invoice_number}
            disabled={!canWrite}
            onSave={(v) => save({ invoice_number: v })}
          />
          <Field label="Payment">
            <Select
              value={lead.payment_status ?? "not_invoiced"}
              disabled={!canWrite}
              onChange={(e) => save({ payment_status: e.target.value as Lead["payment_status"] })}
            >
              {PAYMENT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {PAYMENT_STATUS_LABEL[s]}
                </option>
              ))}
            </Select>
          </Field>
          <DateField
            label="Payment due"
            value={lead.payment_due_date}
            disabled={!canWrite}
            onSave={(v) => save({ payment_due_date: v })}
          />
          <MoneyField
            label="Amount received"
            value={lead.amount_received}
            disabled={!canWrite}
            onSave={(n) => save({ amount_received: n })}
          />
        </div>
        {lead.paid_at && <p className="text-xs text-success">Payment confirmed {formatDate(lead.paid_at)}.</p>}
        <WonReadiness
          contractSigned={lead.contract_status === "signed"}
          paid={lead.payment_status === "paid"}
          priceOk={!belowList || priceApproved}
        />
      </section>

      <Approvals lead={lead} />

      <section className="card-base space-y-3 p-4">
        <SectionTitle icon="calendar" title="Renewal" hint="Start the renewal conversation before the campaign ends, not after." />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Renewal">
            <Select
              value={lead.renewal_status ?? ""}
              disabled={!canWrite}
              onChange={(e) => save({ renewal_status: (e.target.value || null) as Lead["renewal_status"] })}
            >
              <option value="">Not applicable yet</option>
              {RENEWAL_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {RENEWAL_STATUS_LABEL[s]}
                </option>
              ))}
            </Select>
          </Field>
          <DateField
            label="Renewal conversation by"
            value={lead.renewal_due_date}
            disabled={!canWrite}
            onSave={(v) => save({ renewal_due_date: v })}
          />
        </div>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------

function Qualification({
  lead,
  canWrite,
  save,
}: {
  lead: LeadDetail;
  canWrite: boolean;
  save: (body: Partial<Lead>, ok?: string) => void;
}) {
  const tier = prospectTier(lead.prospect_score);
  return (
    <section className="card-base space-y-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <SectionTitle icon="sparkle" title="Prospect score" hint="A high score means a promising lead, not confirmed budget." />
        <div className="text-right">
          <p className="text-lg font-bold text-ink">{lead.prospect_score ?? "—"}<span className="text-xs font-medium text-muted"> / 10</span></p>
          {tier ? <Badge className={tier.badge}>{tier.label}</Badge> : <span className="text-xs text-muted">Not scored yet</span>}
        </div>
      </div>
      <div className="divide-y divide-line/70">
        {SCORE_FACTORS.map((f) => (
          <div key={f.field} className="flex items-center justify-between gap-3 py-2">
            <span className="text-sm text-body">{f.label}</span>
            <Select
              aria-label={f.label}
              value={lead[f.field] ?? ""}
              disabled={!canWrite}
              onChange={(e) =>
                save({ [f.field]: e.target.value === "" ? null : Number(e.target.value) } as Partial<Lead>, "Score updated")
              }
              className="h-8 w-20 shrink-0 text-xs"
            >
              <option value="">—</option>
              <option value="0">0</option>
              <option value="1">1</option>
              <option value="2">2</option>
            </Select>
          </div>
        ))}
      </div>
      <Field label="Why they fit">
        <Textarea
          defaultValue={lead.fit_reason ?? ""}
          disabled={!canWrite}
          placeholder="The business fit and the route to the person who controls the budget."
          className="min-h-[64px]"
          onBlur={(e) => {
            if (e.target.value !== (lead.fit_reason ?? "")) save({ fit_reason: e.target.value || null });
          }}
        />
      </Field>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <TextField label="Decision-maker" value={lead.decision_maker} disabled={!canWrite} onSave={(v) => save({ decision_maker: v })} />
        <TextField
          label="Budget route"
          value={lead.budget_status}
          disabled={!canWrite}
          placeholder="e.g. Q1 budget, needs business case"
          onSave={(v) => save({ budget_status: v })}
        />
        <DateField
          label="Expected decision date"
          value={lead.expected_decision_date}
          disabled={!canWrite}
          onSave={(v) => save({ expected_decision_date: v })}
        />
        <Field label="Probability (%)">
          <Input
            type="number"
            min={0}
            max={100}
            defaultValue={lead.probability ?? ""}
            disabled={!canWrite}
            onBlur={(e) => {
              const raw = e.target.value;
              const n = raw === "" ? null : Math.max(0, Math.min(100, Math.round(Number(raw))));
              if (n !== (lead.probability ?? null)) save({ probability: n });
            }}
          />
        </Field>
      </div>
    </section>
  );
}

function MarginCheck({ pkg, dealValue, currency }: { pkg: SponsorPackage; dealValue: number | null; currency: string }) {
  if (pkg.delivery_cost === null || pkg.delivery_cost === undefined) {
    return (
      <Notice tone="warning">
        The cost of delivering "{pkg.name}" hasn't been set. Add it in Settings → Sponsor packages before selling it, so
        you know the deal makes money.
      </Notice>
    );
  }
  if (!dealValue) {
    return (
      <p className="text-xs text-muted">
        Delivery cost {formatMoney(pkg.delivery_cost, currency)} · minimum margin {pkg.min_margin_pct}%.
      </p>
    );
  }
  const margin = Math.round(((dealValue - pkg.delivery_cost) / dealValue) * 100);
  const ok = margin >= pkg.min_margin_pct;
  return (
    <Notice tone={ok ? "success" : "danger"}>
      Margin {margin}% at {formatMoney(dealValue, currency)} (delivery cost {formatMoney(pkg.delivery_cost, currency)}, floor{" "}
      {pkg.min_margin_pct}%).{ok ? "" : " Below the floor — reduce scope or get approval."}
    </Notice>
  );
}

function WonReadiness({ contractSigned, paid, priceOk }: { contractSigned: boolean; paid: boolean; priceOk: boolean }) {
  const items = [
    { ok: contractSigned, label: "Contract signed" },
    { ok: paid, label: "Payment confirmed" },
    { ok: priceOk, label: "Price at list, or exception approved" },
  ];
  return (
    <div className="rounded-control bg-surface-2 p-3">
      <p className="mb-2 text-xs font-semibold text-muted">Ready to mark Won</p>
      <ul className="space-y-1">
        {items.map((i) => (
          <li key={i.label} className={cn("flex items-center gap-2 text-xs", i.ok ? "text-success" : "text-muted")}>
            <Icon name={i.ok ? "check" : "clock"} size={13} />
            {i.label}
            <span className="sr-only">{i.ok ? "done" : "not done"}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Approvals({ lead }: { lead: LeadDetail }) {
  const { canWrite, canApprove } = useRole();
  const toast = useToast();
  const create = useCreateDealApproval();
  const [type, setType] = useState<ApprovalType>("discount");
  const [summary, setSummary] = useState("");

  const request = () => {
    if (!summary.trim()) {
      toast.error("Describe what needs approving");
      return;
    }
    create.mutate(
      { lead_id: lead.id, approval_type: type, summary: summary.trim() },
      {
        onSuccess: () => {
          setSummary("");
          toast.success("Approval requested");
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : "Could not request approval"),
      },
    );
  };

  return (
    <section className="card-base space-y-3 p-4">
      <SectionTitle
        icon="flag"
        title="Approvals"
        hint="Pricing exceptions, discounts, exclusivity, contract commitments and unusual deliverables need a written decision."
      />
      {canWrite && (
        <div className="space-y-2 rounded-control border border-line p-3">
          <Select value={type} onChange={(e) => setType(e.target.value as ApprovalType)} className="h-8 text-xs" aria-label="Approval type">
            {APPROVAL_TYPES.map((t) => (
              <option key={t} value={t}>
                {APPROVAL_TYPE_LABEL[t]}
              </option>
            ))}
          </Select>
          <Input
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="What's being asked, e.g. ₦800k instead of ₦1m for a 2-week pilot"
            aria-label="Approval summary"
          />
          <div className="flex justify-end">
            <Button size="sm" onClick={request} loading={create.isPending} disabled={!summary.trim()}>
              Request approval
            </Button>
          </div>
        </div>
      )}
      {lead.approvals.length === 0 ? (
        <EmptyState className="py-6" title="No approvals on this deal" subtitle={canApprove ? undefined : "Requests go to management for a decision."} />
      ) : (
        <div className="space-y-2">
          {lead.approvals.map((a) => (
            <ApprovalRow key={a.id} approval={a} canDecide={canApprove} />
          ))}
        </div>
      )}
    </section>
  );
}

export function ApprovalRow({ approval: a, canDecide, showLead }: { approval: DealApproval; canDecide: boolean; showLead?: boolean }) {
  const decide = useDecideDealApproval();
  const toast = useToast();
  const [note, setNote] = useState("");
  const meta = APPROVAL_STATUS_META[a.status];

  const act = (status: "approved" | "rejected") =>
    decide.mutate(
      { id: a.id, status, note: note.trim() || null },
      {
        onSuccess: () => toast.success(status === "approved" ? "Approved" : "Rejected"),
        onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save the decision"),
      },
    );

  return (
    <div className="rounded-control border border-line p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink">
            {APPROVAL_TYPE_LABEL[a.approval_type]}
            {showLead && a.leads && <span className="font-normal text-muted"> · {a.leads.company_name || a.leads.full_name}</span>}
          </p>
          <p className="text-sm text-body">{a.summary}</p>
          <p className="mt-0.5 text-xs text-muted">
            Asked by {a.requester?.full_name ?? "—"} · {formatRelative(a.requested_at)}
            {a.decided_at && ` · ${a.status} by ${a.decider?.full_name ?? "—"} ${formatRelative(a.decided_at)}`}
          </p>
          {a.decision_note && <p className="mt-1 text-xs text-body">“{a.decision_note}”</p>}
        </div>
        <Badge className={meta.cls}>{meta.label}</Badge>
      </div>
      {canDecide && a.status === "pending" && (
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Decision note (optional)" className="h-8 text-xs" aria-label="Decision note" />
          <div className="flex gap-2">
            <Button size="sm" onClick={() => act("approved")} loading={decide.isPending}>
              Approve
            </Button>
            <Button size="sm" variant="secondary" onClick={() => act("rejected")} disabled={decide.isPending}>
              Reject
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// small field helpers (save on blur, like the Overview tab)

export function SectionTitle({ icon, title, hint }: { icon: IconName; title: string; hint?: string }) {
  return (
    <div>
      <h3 className="flex items-center gap-1.5 text-sm font-semibold text-ink">
        <Icon name={icon} size={14} /> {title}
      </h3>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function Notice({ tone, children }: { tone: "success" | "warning" | "danger"; children: ReactNode }) {
  const cls = {
    success: "bg-success/10 text-success",
    warning: "bg-warning/12 text-warning",
    danger: "bg-danger/10 text-danger",
  }[tone];
  return (
    <p className={cn("flex items-start gap-2 rounded-control px-3 py-2 text-xs", cls)}>
      <Icon name={tone === "success" ? "check" : "alert"} size={13} className="mt-0.5 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

function MoneyField({
  label,
  value,
  disabled,
  onSave,
}: {
  label: string;
  value?: number | null;
  disabled: boolean;
  onSave: (n: number | null) => void;
}) {
  return (
    <Field label={label}>
      <Input
        type="number"
        min={0}
        defaultValue={value ?? ""}
        disabled={disabled}
        onBlur={(e) => {
          const n = e.target.value === "" ? null : Number(e.target.value);
          if (n !== (value ?? null)) onSave(n);
        }}
      />
    </Field>
  );
}

function TextField({
  label,
  value,
  disabled,
  placeholder,
  onSave,
}: {
  label: string;
  value?: string | null;
  disabled: boolean;
  placeholder?: string;
  onSave: (v: string | null) => void;
}) {
  return (
    <Field label={label}>
      <Input
        defaultValue={value ?? ""}
        disabled={disabled}
        placeholder={placeholder}
        onBlur={(e) => {
          const v = e.target.value.trim() || null;
          if (v !== (value ?? null)) onSave(v);
        }}
      />
    </Field>
  );
}

export function DateField({
  label,
  value,
  disabled,
  onSave,
}: {
  label: string;
  value?: string | null;
  disabled: boolean;
  onSave: (v: string | null) => void;
}) {
  return (
    <Field label={label}>
      <Input
        type="date"
        defaultValue={value ?? ""}
        disabled={disabled}
        onBlur={(e) => {
          const v = e.target.value || null;
          if (v !== (value ?? null)) onSave(v);
        }}
      />
    </Field>
  );
}
