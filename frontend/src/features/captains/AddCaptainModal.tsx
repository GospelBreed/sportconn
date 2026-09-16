import { useEffect, useState } from "react";
import { useCreateCaptain } from "@/hooks/queries";
import { useToast } from "@/components/ui/Toast";
import { Modal } from "@/components/ui/overlays";
import { Button, Field, Input } from "@/components/ui/primitives";

export function AddCaptainModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const create = useCreateCaptain();
  const toast = useToast();
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [city, setCity] = useState("");
  const [area, setArea] = useState("");
  const [community, setCommunity] = useState("");
  const [playerCount, setPlayerCount] = useState("");

  useEffect(() => {
    if (open) {
      setFullName("");
      setPhone("");
      setEmail("");
      setWhatsapp("");
      setCity("");
      setArea("");
      setCommunity("");
      setPlayerCount("");
    }
  }, [open]);

  const submit = () => {
    if (!fullName.trim()) {
      toast.error("Name is required");
      return;
    }
    create.mutate(
      {
        full_name: fullName.trim(),
        phone: phone.trim() || null,
        email: email.trim() || null,
        whatsapp: whatsapp.trim() || null,
        location_city: city.trim() || null,
        area: area.trim() || null,
        community: community.trim() || null,
        player_count: playerCount ? Math.max(0, Number(playerCount)) : null,
      },
      {
        onSuccess: () => {
          toast.success("Captain added");
          onClose();
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : "Could not add captain"),
      },
    );
  };

  return (
    <Modal open={open} onClose={onClose} title="Add captain">
      <div className="space-y-4">
        <Field label="Full name" required>
          <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Chuka Obi" autoFocus />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Phone">
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+234 803 555 0184" />
          </Field>
          <Field label="WhatsApp">
            <Input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} />
          </Field>
        </div>
        <Field label="Email">
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
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
          <Field label="Community">
            <Input value={community} onChange={(e) => setCommunity(e.target.value)} placeholder="Lekki Pick-Up Game" />
          </Field>
          <Field label="Player count">
            <Input type="number" min={0} value={playerCount} onChange={(e) => setPlayerCount(e.target.value)} placeholder="24" />
          </Field>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={create.isPending}>
            Add captain
          </Button>
        </div>
      </div>
    </Modal>
  );
}
