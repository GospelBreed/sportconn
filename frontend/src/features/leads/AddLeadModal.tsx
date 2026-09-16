import { useEffect, useState } from "react";
import { useCreateLead } from "@/hooks/queries";
import { useToast } from "@/components/ui/Toast";
import { Modal } from "@/components/ui/overlays";
import { Button, Field, Input, Select } from "@/components/ui/primitives";
import {
  LEAD_SOURCE_LABEL,
  LEAD_STAGES,
  PROPERTY_TYPES,
  PROPERTY_TYPE_LABEL,
  TEMPERATURE_META,
} from "@/lib/constants";
import type { LeadSource, LeadStage, LeadTemperature, PropertyType } from "@/types";

const TEMPS: LeadTemperature[] = ["hot", "warm", "cold"];
const SOURCES: LeadSource[] = [
  "res_exp_check",
  "cold_email",
  "linkedin",
  "referral",
  "website",
  "import",
  "other",
];

export function AddLeadModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const create = useCreateLead();
  const toast = useToast();
  const initial = {
    full_name: "",
    title: "",
    email: "",
    phone: "",
    company_name: "",
    property_name: "",
    location_city: "",
    location_state: "",
    unit_count: "",
    asset_type: "conventional",
    temperature: "warm",
    stage: "new_lead",
    source: "other",
    estimated_arr: "",
    experience_score: "",
  };
  const [f, setF] = useState<Record<string, string>>(initial);

  useEffect(() => {
    if (open) setF(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));

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
        company_name: f.company_name.trim() || null,
        property_name: f.property_name.trim() || null,
        location_city: f.location_city.trim() || null,
        location_state: f.location_state.trim() || null,
        unit_count: f.unit_count ? Number(f.unit_count) : null,
        asset_type: f.asset_type as PropertyType,
        temperature: f.temperature as LeadTemperature,
        stage: f.stage as LeadStage,
        source: f.source as LeadSource,
        estimated_arr: f.estimated_arr ? Number(f.estimated_arr) : 0,
        experience_score: f.experience_score
          ? Math.max(0, Math.min(100, Number(f.experience_score)))
          : null,
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
          <Field label="Management company">
            <Input value={f.company_name} onChange={(e) => set("company_name", e.target.value)} placeholder="Titan Sports Group" />
          </Field>
          <Field label="Facility name">
            <Input value={f.property_name} onChange={(e) => set("property_name", e.target.value)} placeholder="Downtown Sports Complex" />
          </Field>
          <Field label="City">
            <Input value={f.location_city} onChange={(e) => set("location_city", e.target.value)} placeholder="Plano" />
          </Field>
          <Field label="State">
            <Input value={f.location_state} onChange={(e) => set("location_state", e.target.value)} placeholder="TX" maxLength={2} />
          </Field>
          <Field label="Unit count">
            <Input type="number" min={0} value={f.unit_count} onChange={(e) => set("unit_count", e.target.value)} placeholder="420" />
          </Field>
          <Field label="Asset type">
            <Select value={f.asset_type} onChange={(e) => set("asset_type", e.target.value)}>
              {PROPERTY_TYPES.map((t) => (
                <option key={t} value={t}>
                  {PROPERTY_TYPE_LABEL[t]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Temperature">
            <Select value={f.temperature} onChange={(e) => set("temperature", e.target.value)}>
              {TEMPS.map((t) => (
                <option key={t} value={t}>
                  {TEMPERATURE_META[t].label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Stage">
            <Select value={f.stage} onChange={(e) => set("stage", e.target.value)}>
              {LEAD_STAGES.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Source">
            <Select value={f.source} onChange={(e) => set("source", e.target.value)}>
              {SOURCES.map((s) => (
                <option key={s} value={s}>
                  {LEAD_SOURCE_LABEL[s]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Estimated ARR (USD/yr)">
            <Input type="number" min={0} value={f.estimated_arr} onChange={(e) => set("estimated_arr", e.target.value)} placeholder="18000" />
          </Field>
          <Field label="Experience score (0–100)">
            <Input type="number" min={0} max={100} value={f.experience_score} onChange={(e) => set("experience_score", e.target.value)} placeholder="68" />
          </Field>
        </div>
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
