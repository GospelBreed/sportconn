import { useEffect, useState } from "react";
import { useCreateFacility } from "@/hooks/queries";
import { useToast } from "@/components/ui/Toast";
import { Modal } from "@/components/ui/overlays";
import { Button, Field, Input, Select } from "@/components/ui/primitives";
import { FACILITY_TYPES, FACILITY_TYPE_LABEL } from "@/lib/constants";
import type { FacilityType } from "@/types";

export function AddFacilityModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const create = useCreateFacility();
  const toast = useToast();
  const [name, setName] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [area, setArea] = useState("");
  const [pitchCount, setPitchCount] = useState("");
  const [type, setType] = useState<FacilityType>("football_turf");
  const [expectedValue, setExpectedValue] = useState("");

  useEffect(() => {
    if (open) {
      setName("");
      setContactName("");
      setContactPhone("");
      setContactEmail("");
      setAddress("");
      setCity("");
      setArea("");
      setPitchCount("");
      setType("football_turf");
      setExpectedValue("");
    }
  }, [open]);

  const submit = () => {
    if (!name.trim()) {
      toast.error("Facility name is required");
      return;
    }
    create.mutate(
      {
        name: name.trim(),
        contact_name: contactName.trim() || null,
        contact_phone: contactPhone.trim() || null,
        contact_email: contactEmail.trim() || null,
        address_line1: address.trim() || null,
        city: city.trim() || null,
        area: area.trim() || null,
        pitch_count: pitchCount ? Math.max(0, Number(pitchCount)) : null,
        facility_type: type,
        expected_value: expectedValue ? Number(expectedValue) : null,
      },
      {
        onSuccess: () => {
          toast.success("Facility added");
          onClose();
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : "Could not add facility"),
      },
    );
  };

  return (
    <Modal open={open} onClose={onClose} title="Add facility" width="max-w-xl">
      <div className="space-y-4">
        <Field label="Name" required>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Downtown Sports Complex" autoFocus />
        </Field>
        <Field label="Address">
          <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="5 Adeola Odeku St" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="City">
            <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Lagos" />
          </Field>
          <Field label="Area">
            <Input value={area} onChange={(e) => setArea(e.target.value)} placeholder="Lekki" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Pitches / courts">
            <Input type="number" min={0} value={pitchCount} onChange={(e) => setPitchCount(e.target.value)} placeholder="2" />
          </Field>
          <Field label="Facility type">
            <Select value={type} onChange={(e) => setType(e.target.value as FacilityType)}>
              {FACILITY_TYPES.map((t) => (
                <option key={t} value={t}>
                  {FACILITY_TYPE_LABEL[t]}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Contact name">
            <Input value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="Sarah Johnson" />
          </Field>
          <Field label="Contact email">
            <Input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />
          </Field>
          <Field label="Contact phone">
            <Input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
          </Field>
        </div>
        <Field label="Expected value">
          <Input type="number" min={0} value={expectedValue} onChange={(e) => setExpectedValue(e.target.value)} placeholder="500000" />
        </Field>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={create.isPending}>
            Add facility
          </Button>
        </div>
      </div>
    </Modal>
  );
}
