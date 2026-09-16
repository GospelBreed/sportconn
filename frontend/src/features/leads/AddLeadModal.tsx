import { useEffect, useState } from "react";
import { useCreateLead, usePipelineStages, usePipelines } from "@/hooks/queries";
import { useToast } from "@/components/ui/Toast";
import { Modal } from "@/components/ui/overlays";
import { Button, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import {
  LEAD_SOURCE_LABEL,
  LEAD_SOURCES,
  LEAD_TYPE_LABEL,
  LEAD_TYPES,
  PRIORITIES,
  PRIORITY_META,
  TEMPERATURE_META,
  TEMPERATURES,
} from "@/lib/constants";
import type { LeadSource, LeadType, PipelineKey, Priority, Temperature } from "@/types";

const NON_KANBAN_PIPELINES: PipelineKey[] = ["facility", "captain"]; // those have their own modals

export function AddLeadModal({
  open,
  onClose,
  defaultPipeline,
}: {
  open: boolean;
  onClose: () => void;
  defaultPipeline?: PipelineKey;
}) {
  const create = useCreateLead();
  const toast = useToast();
  const { data: pipelines } = usePipelines();
  const pipelineOptions = (pipelines ?? []).filter((p) => !NON_KANBAN_PIPELINES.includes(p.key));

  const initial = {
    full_name: "",
    title: "",
    email: "",
    phone: "",
    whatsapp: "",
    company_name: "",
    location_city: "",
    location_country: "",
    lead_type: "other" as LeadType,
    pipeline: defaultPipeline ?? "sponsor",
    stage: "",
    source: "other" as LeadSource,
    priority: "medium" as Priority,
    temperature: "warm" as Temperature,
    expected_value: "",
    currency: "NGN",
    probability: "",
    sponsorship_category: "",
    investor_type: "",
    ticket_size: "",
    target_users: "",
    target_location: "",
    notes: "",
  };
  const [f, setF] = useState(initial);
  const { data: stages } = usePipelineStages(f.pipeline as PipelineKey);

  useEffect(() => {
    if (open) setF({ ...initial, pipeline: defaultPipeline ?? "sponsor" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultPipeline]);

  const set = <K extends keyof typeof initial>(k: K, v: (typeof initial)[K]) =>
    setF((p) => ({ ...p, [k]: v }));

  const submit = () => {
    if (!f.full_name.trim()) {
      toast.error("Contact name is required");
      return;
    }
    create.mutate(
      {
        full_name: f.full_name.trim(),
        title: f.title.trim() || null,
        email: f.email.trim() || null,
        phone: f.phone.trim() || null,
        whatsapp: f.whatsapp.trim() || null,
        company_name: f.company_name.trim() || null,
        location_city: f.location_city.trim() || null,
        location_country: f.location_country.trim() || null,
        lead_type: f.lead_type,
        pipeline: f.pipeline as PipelineKey,
        stage: f.stage || undefined,
        source: f.source,
        priority: f.priority,
        temperature: f.temperature,
        expected_value: f.expected_value ? Number(f.expected_value) : null,
        currency: f.currency,
        probability: f.probability ? Math.max(0, Math.min(100, Number(f.probability))) : null,
        sponsorship_category: f.pipeline === "sponsor" ? f.sponsorship_category.trim() || null : null,
        investor_type: f.pipeline === "investor" ? f.investor_type.trim() || null : null,
        ticket_size: f.pipeline === "investor" && f.ticket_size ? Number(f.ticket_size) : null,
        target_users: f.pipeline === "user_acquisition" && f.target_users ? Number(f.target_users) : null,
        target_location: f.pipeline === "user_acquisition" ? f.target_location.trim() || null : null,
        notes: f.notes.trim() || null,
      },
      {
        onSuccess: () => {
          toast.success("Lead added");
          onClose();
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : "Could not add lead"),
      },
    );
  };

  return (
    <Modal open={open} onClose={onClose} title="Add lead" width="max-w-xl">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Pipeline" required>
            <Select value={f.pipeline} onChange={(e) => set("pipeline", e.target.value as PipelineKey)}>
              {pipelineOptions.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Lead type">
            <Select value={f.lead_type} onChange={(e) => set("lead_type", e.target.value as LeadType)}>
              {LEAD_TYPES.map((t) => (
                <option key={t} value={t}>
                  {LEAD_TYPE_LABEL[t]}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Contact name" required>
            <Input value={f.full_name} onChange={(e) => set("full_name", e.target.value)} placeholder="Sarah Johnson" autoFocus />
          </Field>
          <Field label="Title">
            <Input value={f.title} onChange={(e) => set("title", e.target.value)} placeholder="Facility Manager" />
          </Field>
          <Field label="Email">
            <Input type="email" value={f.email} onChange={(e) => set("email", e.target.value)} />
          </Field>
          <Field label="Phone">
            <Input value={f.phone} onChange={(e) => set("phone", e.target.value)} />
          </Field>
          <Field label="WhatsApp">
            <Input value={f.whatsapp} onChange={(e) => set("whatsapp", e.target.value)} />
          </Field>
          <Field label="Organization / Company">
            <Input value={f.company_name} onChange={(e) => set("company_name", e.target.value)} placeholder="Titan Sports Group" />
          </Field>
          <Field label="City">
            <Input value={f.location_city} onChange={(e) => set("location_city", e.target.value)} placeholder="Lagos" />
          </Field>
          <Field label="Country">
            <Input value={f.location_country} onChange={(e) => set("location_country", e.target.value)} placeholder="Nigeria" />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Stage">
            <Select value={f.stage} onChange={(e) => set("stage", e.target.value)}>
              <option value="">First stage</option>
              {(stages ?? []).map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Source">
            <Select value={f.source} onChange={(e) => set("source", e.target.value as LeadSource)}>
              {LEAD_SOURCES.map((s) => (
                <option key={s} value={s}>
                  {LEAD_SOURCE_LABEL[s]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Temperature">
            <Select value={f.temperature} onChange={(e) => set("temperature", e.target.value as Temperature)}>
              {TEMPERATURES.map((t) => (
                <option key={t} value={t}>
                  {TEMPERATURE_META[t].label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Priority">
            <Select value={f.priority} onChange={(e) => set("priority", e.target.value as Priority)}>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_META[p].label}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Field label="Expected value">
            <Input type="number" min={0} value={f.expected_value} onChange={(e) => set("expected_value", e.target.value)} placeholder="10000000" />
          </Field>
          <Field label="Currency">
            <Select value={f.currency} onChange={(e) => set("currency", e.target.value)}>
              <option value="NGN">NGN</option>
              <option value="USD">USD</option>
              <option value="GBP">GBP</option>
              <option value="EUR">EUR</option>
            </Select>
          </Field>
          <Field label="Probability %">
            <Input type="number" min={0} max={100} value={f.probability} onChange={(e) => set("probability", e.target.value)} placeholder="50" />
          </Field>
        </div>

        {f.pipeline === "sponsor" && (
          <Field label="Sponsorship category">
            <Input
              value={f.sponsorship_category}
              onChange={(e) => set("sponsorship_category", e.target.value)}
              placeholder="Grassroots Football, Event Sponsorship…"
            />
          </Field>
        )}

        {f.pipeline === "investor" && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Investor type">
              <Input value={f.investor_type} onChange={(e) => set("investor_type", e.target.value)} placeholder="Angel, VC, Sports Investor…" />
            </Field>
            <Field label="Ticket size">
              <Input type="number" min={0} value={f.ticket_size} onChange={(e) => set("ticket_size", e.target.value)} placeholder="250000" />
            </Field>
          </div>
        )}

        {f.pipeline === "user_acquisition" && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Target users">
              <Input type="number" min={0} value={f.target_users} onChange={(e) => set("target_users", e.target.value)} placeholder="200" />
            </Field>
            <Field label="Target location / community">
              <Input value={f.target_location} onChange={(e) => set("target_location", e.target.value)} placeholder="Lekki, Lagos" />
            </Field>
          </div>
        )}

        <Field label="Notes">
          <Textarea value={f.notes} onChange={(e) => set("notes", e.target.value)} rows={3} />
        </Field>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={create.isPending}>
            Add lead
          </Button>
        </div>
      </div>
    </Modal>
  );
}
