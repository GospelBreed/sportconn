import { useState, type ChangeEvent } from "react";
import { useCreateLeadContact, useDeleteLeadContact } from "@/hooks/queries";
import { useRole } from "@/lib/auth";
import { useToast } from "@/components/ui/Toast";
import { ConfirmDialog } from "@/components/ui/overlays";
import { Button, Input } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/Icon";
import type { LeadContact, LeadDetail } from "@/types";

const EMPTY = { full_name: "", title: "", email: "", phone: "", linkedin_url: "", relevance: "" };

/** Other people at the same organisation (SOP: identify two relevant contacts per company). */
export function LeadContacts({ lead }: { lead: LeadDetail }) {
  const { canWrite, canDelete } = useRole();
  const toast = useToast();
  const create = useCreateLeadContact();
  const del = useDeleteLeadContact(lead.id);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [toDelete, setToDelete] = useState<LeadContact | null>(null);

  const set = (k: keyof typeof EMPTY) => (e: ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  const save = () => {
    if (!form.full_name.trim()) {
      toast.error("Add the contact's name");
      return;
    }
    const clean = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v.trim() || null]));
    create.mutate(
      { ...clean, full_name: form.full_name.trim(), lead_id: lead.id },
      {
        onSuccess: () => {
          setForm(EMPTY);
          setAdding(false);
          toast.success("Contact added");
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : "Could not add contact"),
      },
    );
  };

  return (
    <div className="card-base p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-ink">
          <Icon name="users" size={14} /> Other contacts
        </h3>
        {canWrite && !adding && (
          <button onClick={() => setAdding(true)} className="text-xs font-medium text-primary hover:underline">
            Add contact
          </button>
        )}
      </div>
      {lead.contacts.length === 0 && !adding && (
        <p className="text-xs text-muted">No other contacts yet. Aim for two relevant people per company (e.g. Brand Manager, Head of Marketing).</p>
      )}
      <div className="space-y-2">
        {lead.contacts.map((c) => (
          <div key={c.id} className="flex items-start justify-between gap-3 rounded-control bg-surface-2 px-3 py-2">
            <div className="min-w-0 text-xs">
              <p className="text-sm font-medium text-ink">{c.full_name}</p>
              <p className="text-muted">{c.title ?? "—"}</p>
              <p className="truncate text-body">{[c.email, c.phone, c.linkedin_url].filter(Boolean).join(" · ") || "No contact details"}</p>
              {c.relevance && <p className="text-muted">Why: {c.relevance}</p>}
            </div>
            {canDelete && (
              <button onClick={() => setToDelete(c)} className="rounded p-1 text-muted hover:bg-line/60 hover:text-danger" aria-label={`Remove ${c.full_name}`}>
                <Icon name="trash" size={14} />
              </button>
            )}
          </div>
        ))}
      </div>
      {adding && (
        <div className="mt-2 space-y-2 rounded-control border border-line p-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Input value={form.full_name} onChange={set("full_name")} placeholder="Full name *" aria-label="Full name" />
            <Input value={form.title} onChange={set("title")} placeholder="Title" aria-label="Title" />
            <Input value={form.email} onChange={set("email")} placeholder="Email" type="email" aria-label="Email" />
            <Input value={form.phone} onChange={set("phone")} placeholder="Phone" aria-label="Phone" />
            <Input value={form.linkedin_url} onChange={set("linkedin_url")} placeholder="LinkedIn URL" aria-label="LinkedIn URL" />
            <Input value={form.relevance} onChange={set("relevance")} placeholder="Why they're relevant" aria-label="Why they're relevant" />
          </div>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="secondary" onClick={() => { setAdding(false); setForm(EMPTY); }}>
              Cancel
            </Button>
            <Button size="sm" onClick={save} loading={create.isPending}>
              Save contact
            </Button>
          </div>
        </div>
      )}
      <ConfirmDialog
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        title="Remove contact"
        message={`Remove ${toDelete?.full_name} from this lead?`}
        confirmLabel="Remove"
        loading={del.isPending}
        onConfirm={() =>
          toDelete &&
          del.mutate(toDelete.id, {
            onSuccess: () => {
              setToDelete(null);
              toast.success("Contact removed");
            },
            onError: (e) => toast.error(e instanceof Error ? e.message : "Could not remove contact"),
          })
        }
      />
    </div>
  );
}
