import { useEffect, useState } from "react";
import { useCreateProperty } from "@/hooks/queries";
import { useToast } from "@/components/ui/Toast";
import { Modal } from "@/components/ui/overlays";
import { Button, Field, Input, Select } from "@/components/ui/primitives";
import { PROPERTY_TYPES, PROPERTY_TYPE_LABEL } from "@/lib/constants";
import type { PropertyType } from "@/types";

export function AddPropertyModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const create = useCreateProperty();
  const toast = useToast();
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [postal, setPostal] = useState("");
  const [units, setUnits] = useState("");
  const [type, setType] = useState<PropertyType>("conventional");
  const [managerName, setManagerName] = useState("");
  const [managerEmail, setManagerEmail] = useState("");
  const [managerPhone, setManagerPhone] = useState("");

  useEffect(() => {
    if (open) {
      setName("");
      setAddress("");
      setCity("");
      setState("");
      setPostal("");
      setUnits("");
      setType("conventional");
      setManagerName("");
      setManagerEmail("");
      setManagerPhone("");
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
        address_line1: address.trim() || null,
        city: city.trim() || null,
        state: state.trim() || null,
        postal_code: postal.trim() || null,
        unit_count: units ? Math.max(0, Number(units)) : 0,
        property_type: type,
        manager_name: managerName.trim() || null,
        manager_email: managerEmail.trim() || null,
        manager_phone: managerPhone.trim() || null,
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
          <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="5800 Legacy Dr" />
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="City">
            <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Plano" />
          </Field>
          <Field label="State">
            <Input value={state} onChange={(e) => setState(e.target.value)} placeholder="TX" maxLength={2} />
          </Field>
          <Field label="Postal code">
            <Input value={postal} onChange={(e) => setPostal(e.target.value)} placeholder="75024" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Unit count">
            <Input type="number" min={0} value={units} onChange={(e) => setUnits(e.target.value)} placeholder="420" />
          </Field>
          <Field label="Type">
            <Select value={type} onChange={(e) => setType(e.target.value as PropertyType)}>
              {PROPERTY_TYPES.map((t) => (
                <option key={t} value={t}>
                  {PROPERTY_TYPE_LABEL[t]}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label="On-site manager">
            <Input value={managerName} onChange={(e) => setManagerName(e.target.value)} placeholder="Sarah Johnson" />
          </Field>
          <Field label="Manager email">
            <Input type="email" value={managerEmail} onChange={(e) => setManagerEmail(e.target.value)} placeholder="s.johnson@…" />
          </Field>
          <Field label="Manager phone">
            <Input value={managerPhone} onChange={(e) => setManagerPhone(e.target.value)} placeholder="(972) 555-0184" />
          </Field>
        </div>
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
