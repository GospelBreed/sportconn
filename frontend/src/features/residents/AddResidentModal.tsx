import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listProperties } from "@/lib/db";
import { useCreateResident } from "@/hooks/queries";
import { useToast } from "@/components/ui/Toast";
import { Modal } from "@/components/ui/overlays";
import { Button, Field, Input, Select } from "@/components/ui/primitives";
import { RESIDENT_STATUSES, RESIDENT_STATUS_META } from "@/lib/constants";
import type { ResidentStatus } from "@/types";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function AddResidentModal({
  open,
  onClose,
  defaultPropertyId,
}: {
  open: boolean;
  onClose: () => void;
  defaultPropertyId?: string;
}) {
  const create = useCreateResident();
  const toast = useToast();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [propertyId, setPropertyId] = useState(defaultPropertyId ?? "");
  const [unit, setUnit] = useState("");
  const [status, setStatus] = useState<ResidentStatus>("active");
  const [moveIn, setMoveIn] = useState("");

  const { data: properties } = useQuery({
    queryKey: ["properties", ""],
    queryFn: () => listProperties(),
    enabled: open,
  });

  useEffect(() => {
    if (open) {
      setFullName("");
      setEmail("");
      setPhone("");
      setPropertyId(defaultPropertyId ?? "");
      setUnit("");
      setStatus("active");
      setMoveIn("");
    }
  }, [open, defaultPropertyId]);

  const submit = () => {
    if (!fullName.trim()) {
      toast.error("Name is required");
      return;
    }
    if (email && !EMAIL_RE.test(email)) {
      toast.error("Enter a valid email");
      return;
    }
    create.mutate(
      {
        full_name: fullName.trim(),
        email: email.trim() || null,
        phone: phone.trim() || null,
        property_id: propertyId || null,
        unit_number: unit.trim() || null,
        status,
        move_in_date: moveIn || null,
      },
      {
        onSuccess: () => {
          toast.success("Member added");
          onClose();
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : "Could not add member"),
      },
    );
  };

  return (
    <Modal open={open} onClose={onClose} title="Add member">
      <div className="space-y-4">
        <Field label="Full name" required>
          <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Jordan Lee" autoFocus />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Email">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jordan@example.com" />
          </Field>
          <Field label="Phone">
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(555) 010-0000" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Facility">
            <Select value={propertyId} onChange={(e) => setPropertyId(e.target.value)}>
              <option value="">Unassigned</option>
              {properties?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Unit">
            <Input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="412" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Status">
            <Select value={status} onChange={(e) => setStatus(e.target.value as ResidentStatus)}>
              {RESIDENT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {RESIDENT_STATUS_META[s].label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Move-in date">
            <Input type="date" value={moveIn} onChange={(e) => setMoveIn(e.target.value)} />
          </Field>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={create.isPending}>
            Add member
          </Button>
        </div>
      </div>
    </Modal>
  );
}
