import { useState } from "react";
import {
  useCreateDeliverable,
  useDeleteDeliverable,
  useUpdateDeliverable,
  useUpdateLead,
  useUsers,
} from "@/hooks/queries";
import { useRole } from "@/lib/auth";
import { useToast } from "@/components/ui/Toast";
import { ConfirmDialog } from "@/components/ui/overlays";
import { Badge, Button, Input, Progress, Select } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/Icon";
import { EmptyState } from "@/components/ui/states";
import { DELIVERABLE_STATUS_META, DELIVERABLE_STATUSES } from "@/lib/constants";
import { formatDate } from "@/lib/format";
import type { DeliverableStatus, Lead, LeadDetail, SponsorDeliverable } from "@/types";
import { DateField, Notice, SectionTitle } from "./SponsorDealTab";

/** Sponsor-only "Delivery" tab: every promised benefit, its owner, and proof it was delivered (SOP §9, §12). */
export function SponsorDeliveryTab({ lead }: { lead: LeadDetail }) {
  const { canWrite } = useRole();
  const toast = useToast();
  const updateLead = useUpdateLead();
  const create = useCreateDeliverable();
  const { data: users } = useUsers();
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [owner, setOwner] = useState("");

  const saveLead = (body: Partial<Lead>) =>
    updateLead.mutate(
      { id: lead.id, body },
      {
        onSuccess: () => toast.success("Saved"),
        onError: (e) => toast.error(e instanceof Error ? e.message : "Update failed"),
      },
    );

  const add = () => {
    if (!title.trim()) return;
    create.mutate(
      { lead_id: lead.id, title: title.trim(), due_date: due || null, owner: owner || null },
      {
        onSuccess: () => {
          setTitle("");
          setDue("");
          toast.success("Deliverable added");
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : "Could not add deliverable"),
      },
    );
  };

  const live = lead.deliverables.filter((d) => d.status !== "cancelled");
  const delivered = live.filter((d) => d.status === "delivered").length;
  const pct = live.length ? Math.round((delivered / live.length) * 100) : 0;

  return (
    <div className="space-y-5" key={lead.id}>
      <section className="card-base space-y-3 p-4">
        <SectionTitle icon="calendar" title="Campaign dates" hint="Agree the reporting period and success measures with the sponsor before launch." />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <DateField label="Campaign start" value={lead.campaign_start_date} disabled={!canWrite} onSave={(v) => saveLead({ campaign_start_date: v })} />
          <DateField label="Campaign end" value={lead.campaign_end_date} disabled={!canWrite} onSave={(v) => saveLead({ campaign_end_date: v })} />
        </div>
        {lead.payment_status !== "paid" && (
          <Notice tone="warning">Payment isn't confirmed yet. Don't launch or spend on prizes and production until it is.</Notice>
        )}
      </section>

      <section className="card-base space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <SectionTitle icon="check" title="Deliverables" hint="Everything promised in the contract. Keep proof of each one for the end-of-campaign report." />
          {live.length > 0 && (
            <span className="shrink-0 text-xs font-semibold text-muted">
              {delivered} / {live.length} delivered
            </span>
          )}
        </div>
        {live.length > 0 && <Progress value={pct} />}

        {canWrite && (
          <div className="space-y-2 rounded-control border border-line p-3">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Sponsor logo on Predict & Win page" aria-label="Deliverable" />
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Due date" />
              <Select value={owner} onChange={(e) => setOwner(e.target.value)} aria-label="Owner">
                <option value="">No owner</option>
                {users?.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.full_name}
                  </option>
                ))}
              </Select>
              <Button size="sm" onClick={add} loading={create.isPending} disabled={!title.trim()} className="sm:h-10">
                Add
              </Button>
            </div>
          </div>
        )}

        {lead.deliverables.length === 0 ? (
          <EmptyState className="py-6" title="No deliverables yet" subtitle="List each placement, post and activity in the agreement once it's signed." />
        ) : (
          <div className="space-y-2">
            {lead.deliverables.map((d) => (
              <DeliverableRow key={d.id} d={d} leadId={lead.id} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function DeliverableRow({ d, leadId }: { d: SponsorDeliverable; leadId: string }) {
  const { canWrite, canDelete } = useRole();
  const toast = useToast();
  const update = useUpdateDeliverable();
  const del = useDeleteDeliverable(leadId);
  const [proof, setProof] = useState(d.proof ?? "");
  const [confirm, setConfirm] = useState(false);
  const meta = DELIVERABLE_STATUS_META[d.status];

  const setStatus = (status: DeliverableStatus) => {
    if (status === "delivered" && !proof.trim()) {
      toast.error("Add proof first — a link or a short description of where it ran.");
      return;
    }
    update.mutate(
      { id: d.id, body: { status, proof: proof.trim() || null } },
      { onError: (e) => toast.error(e instanceof Error ? e.message : "Update failed") },
    );
  };

  return (
    <div className="rounded-control border border-line p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={d.status === "cancelled" ? "text-sm text-muted line-through" : "text-sm font-medium text-ink"}>{d.title}</p>
          <p className="text-xs text-muted">
            {d.due_date ? `Due ${formatDate(d.due_date)}` : "No due date"} · {d.owner_user?.full_name ?? "No owner"}
            {d.delivered_at && ` · delivered ${formatDate(d.delivered_at)}`}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Badge className={meta.cls}>{meta.label}</Badge>
          {canDelete && (
            <button onClick={() => setConfirm(true)} className="rounded p-1 text-muted hover:bg-line/60 hover:text-danger" aria-label="Delete deliverable">
              <Icon name="trash" size={14} />
            </button>
          )}
        </div>
      </div>
      {canWrite && (
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <Input
            value={proof}
            onChange={(e) => setProof(e.target.value)}
            onBlur={() => {
              if ((proof.trim() || null) !== (d.proof ?? null) && d.status !== "delivered") {
                update.mutate(
                  { id: d.id, body: { proof: proof.trim() || null } },
                  { onError: (e) => toast.error(e instanceof Error ? e.message : "Update failed") },
                );
              }
            }}
            placeholder="Proof: link to the post, screenshot location, or what was done"
            className="h-8 text-xs"
            aria-label="Proof of delivery"
            disabled={d.status === "delivered"}
          />
          <Select value={d.status} onChange={(e) => setStatus(e.target.value as DeliverableStatus)} className="h-8 text-xs sm:w-36" aria-label="Status">
            {DELIVERABLE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {DELIVERABLE_STATUS_META[s].label}
              </option>
            ))}
          </Select>
        </div>
      )}
      {!canWrite && d.proof && <p className="mt-1 break-all text-xs text-body">Proof: {d.proof}</p>}
      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Delete deliverable"
        message={`Remove "${d.title}" from this deal?`}
        loading={del.isPending}
        onConfirm={() =>
          del.mutate(d.id, {
            onSuccess: () => {
              setConfirm(false);
              toast.success("Deliverable removed");
            },
            onError: (e) => toast.error(e instanceof Error ? e.message : "Delete failed"),
          })
        }
      />
    </div>
  );
}
