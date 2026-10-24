import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { sendLeadEmail } from "@/lib/db";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/components/ui/Toast";
import { Modal } from "@/components/ui/overlays";
import { Button, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/Icon";
import type { LeadDetail } from "@/types";
import { EMAIL_TEMPLATES, addressesIn, fillTemplate, openPlaceholders } from "./emailTemplates";

interface Recipient {
  email: string;
  name: string;
  label: string;
}

/** Recipients the send-email function will accept: addresses saved on the lead or its contacts. */
export function leadRecipients(lead: LeadDetail): Recipient[] {
  const out: Recipient[] = [];
  const seen = new Set<string>();
  const add = (email: string, name: string, who: string) => {
    if (seen.has(email)) return;
    seen.add(email);
    out.push({ email, name, label: `${who} <${email}>` });
  };
  addressesIn(lead.email).forEach((e) => add(e, lead.full_name, lead.full_name));
  lead.contacts.forEach((c) => addressesIn(c.email).forEach((e) => add(e, c.full_name, c.full_name)));
  return out;
}

function greetingName(name: string, company?: string | null): string {
  // Records named after the organisation ("Nike", "Bowen University") get a neutral greeting.
  if (company && name.trim().toLowerCase() === company.trim().toLowerCase()) return "there";
  if (!company && /\b(university|polytechnic|college|ltd|limited|plc|nigeria|bank|fc)\b/i.test(name)) return "there";
  return name.trim().split(/\s+/)[0] || "there";
}

export function EmailComposeModal({ lead, open, onClose }: { lead: LeadDetail; open: boolean; onClose: () => void }) {
  const { user } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const recipients = useMemo(() => leadRecipients(lead), [lead]);

  const [to, setTo] = useState("");
  const [template, setTemplate] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [idemKey, setIdemKey] = useState(() => crypto.randomUUID());

  useEffect(() => {
    if (!open) return;
    setTo(recipients[0]?.email ?? "");
    setTemplate("");
    setSubject("");
    setBody("");
    setIdemKey(crypto.randomUUID());
  }, [open, lead.id, recipients]);

  const recipient = recipients.find((r) => r.email === to);
  const vars = {
    first_name: greetingName(recipient?.name ?? lead.full_name, lead.company_name),
    company: lead.company_name || (recipient?.name === lead.full_name ? lead.full_name : "your company"),
    sender: user?.full_name ?? "SportConn Partnerships Team",
  };

  const applyTemplate = (key: string) => {
    setTemplate(key);
    const t = EMAIL_TEMPLATES.find((x) => x.key === key);
    if (!t) return;
    setSubject(fillTemplate(t.subject, vars));
    setBody(fillTemplate(t.body, vars));
  };

  const placeholders = openPlaceholders(subject + "\n" + body);

  const send = async () => {
    if (!to) return toast.error("Choose who to send to");
    if (!subject.trim()) return toast.error("Add a subject");
    if (!body.trim()) return toast.error("Write the email first");
    if (placeholders.length) {
      return toast.error(`Personalise ${placeholders.length === 1 ? "this part" : "these parts"} first: ${placeholders.join(", ")}`);
    }
    setSending(true);
    try {
      const res = await sendLeadEmail({ lead_id: lead.id, to, subject: subject.trim(), body: body.trim(), idempotency_key: idemKey });
      ["outreach", "activities", "sponsor-scorecard", "leads"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      qc.invalidateQueries({ queryKey: ["lead", lead.id] });
      if (res.warning) toast.info(res.warning);
      else toast.success(`Email sent to ${to}`);
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not send the email");
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={`Email ${lead.company_name || lead.full_name}`} width="max-w-2xl">
      {lead.email_opt_out ? (
        <div className="space-y-4">
          <p className="flex items-start gap-2 rounded-control bg-danger/10 px-3 py-2 text-sm text-danger">
            <Icon name="alert" size={15} className="mt-0.5 shrink-0" />
            This lead asked not to be emailed. If that has changed, turn off “Do not email” on the Overview tab first.
          </p>
          <div className="flex justify-end">
            <Button variant="secondary" onClick={onClose}>Close</Button>
          </div>
        </div>
      ) : recipients.length === 0 ? (
        <div className="space-y-4">
          <p className="text-sm text-muted">
            There's no email address on this lead yet. Add one on the Overview tab, or add a contact with an email.
          </p>
          <div className="flex justify-end">
            <Button variant="secondary" onClick={onClose}>Close</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="To">
              <Select value={to} onChange={(e) => setTo(e.target.value)}>
                {recipients.map((r) => (
                  <option key={r.email} value={r.email}>
                    {r.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Start from a template">
              <Select value={template} onChange={(e) => applyTemplate(e.target.value)}>
                <option value="">Blank email</option>
                {EMAIL_TEMPLATES.map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Subject">
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} />
          </Field>
          <Field label="Message" hint="Replies go to your own email address. The email is saved to this lead's timeline.">
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} className="min-h-[260px] font-[inherit]" />
          </Field>
          {placeholders.length > 0 && (
            <p className="flex items-start gap-2 rounded-control bg-warning/12 px-3 py-2 text-xs text-warning">
              <Icon name="alert" size={13} className="mt-0.5 shrink-0" />
              <span>Personalise before sending: {placeholders.join(", ")}</span>
            </p>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" onClick={onClose} disabled={sending}>
              Cancel
            </Button>
            <Button onClick={send} loading={sending}>
              <Icon name="mail" size={15} /> Send email
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
