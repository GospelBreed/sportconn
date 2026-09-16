import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listProperties } from "@/lib/db";
import { useCreateCase } from "@/hooks/queries";
import { useToast } from "@/components/ui/Toast";
import { Modal } from "@/components/ui/overlays";
import { Button, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { CASE_CATEGORIES, CATEGORY_META, PRIORITIES, PRIORITY_META, STAGES } from "@/lib/constants";
import { ResidentSelect } from "@/features/shared/ResidentSelect";
import type { CaseCategory, CasePriority, CaseStage } from "@/types";

export function AddCaseModal({
  open,
  onClose,
  defaultStage = "intake",
  fixedResident,
}: {
  open: boolean;
  onClose: () => void;
  defaultStage?: CaseStage;
  fixedResident?: { id: string; name: string; propertyId?: string | null } | null;
}) {
  const toast = useToast();
  const create = useCreateCase();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<CaseCategory>("maintenance");
  const [priority, setPriority] = useState<CasePriority>("medium");
  const [stage, setStage] = useState<CaseStage>(defaultStage);
  const [residentId, setResidentId] = useState<string | null>(fixedResident?.id ?? null);
  const [residentLabel, setResidentLabel] = useState(fixedResident?.name ?? "");
  const [propertyId, setPropertyId] = useState<string>(fixedResident?.propertyId ?? "");
  const [followUp, setFollowUp] = useState("");

  const { data: properties } = useQuery({
    queryKey: ["properties", ""],
    queryFn: () => listProperties(),
    enabled: open,
  });

  useEffect(() => {
    if (open) {
      setStage(defaultStage);
      setResidentId(fixedResident?.id ?? null);
      setResidentLabel(fixedResident?.name ?? "");
      setPropertyId(fixedResident?.propertyId ?? "");
      setTitle("");
      setDescription("");
      setCategory("maintenance");
      setPriority("medium");
      setFollowUp("");
    }
  }, [open, defaultStage, fixedResident]);

  const submit = () => {
    if (!title.trim()) {
      toast.error("Give the case a title");
      return;
    }
    if (!residentId && !propertyId) {
      toast.error("Attach a resident or a property");
      return;
    }
    create.mutate(
      {
        title: title.trim(),
        description: description.trim() || null,
        category,
        priority,
        stage,
        resident_id: residentId,
        property_id: propertyId || null,
        next_follow_up_at: followUp ? new Date(followUp).toISOString() : null,
      },
      {
        onSuccess: () => {
          toast.success("Case added to the pipeline");
          onClose();
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : "Could not create case"),
      },
    );
  };

  return (
    <Modal open={open} onClose={onClose} title="New case">
      <div className="space-y-4">
        <Field label="Title" required>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Locker room lighting issue"
            autoFocus
          />
        </Field>

        {!fixedResident && (
          <Field label="Member" hint="Search by name — or leave empty for a facility-level case">
            <ResidentSelect
              valueId={residentId}
              valueLabel={residentLabel}
              onSelect={(id, label, pid) => {
                setResidentId(id);
                setResidentLabel(label);
                if (pid) setPropertyId(pid);
              }}
              onClear={() => {
                setResidentId(null);
                setResidentLabel("");
              }}
            />
          </Field>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Facility">
            <Select value={propertyId} onChange={(e) => setPropertyId(e.target.value)}>
              <option value="">None</option>
              {properties?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Category">
            <Select value={category} onChange={(e) => setCategory(e.target.value as CaseCategory)}>
              {CASE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_META[c].label}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Priority">
            <Select value={priority} onChange={(e) => setPriority(e.target.value as CasePriority)}>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_META[p].label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Stage">
            <Select value={stage} onChange={(e) => setStage(e.target.value as CaseStage)}>
              {STAGES.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label="Next follow-up" hint="Drives the Due Today / Overdue view and reminders">
          <Input
            type="datetime-local"
            value={followUp}
            onChange={(e) => setFollowUp(e.target.value)}
          />
        </Field>

        <Field label="Description">
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What did the resident report? Any context for the team."
          />
        </Field>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={create.isPending}>
            Create case
          </Button>
        </div>
      </div>
    </Modal>
  );
}
