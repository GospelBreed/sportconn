import { useEffect, useState } from "react";
import { useCreateTask, useUsers } from "@/hooks/queries";
import { useToast } from "@/components/ui/Toast";
import { Modal } from "@/components/ui/overlays";
import { Button, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { PRIORITIES, PRIORITY_META } from "@/lib/constants";
import type { CasePriority } from "@/types";

export function AddTaskModal({
  open,
  onClose,
  leadId,
  residentId,
  caseId,
}: {
  open: boolean;
  onClose: () => void;
  leadId?: string;
  residentId?: string;
  caseId?: string;
}) {
  const create = useCreateTask();
  const { data: users } = useUsers();
  const toast = useToast();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<CasePriority>("medium");
  const [due, setDue] = useState("");
  const [assignee, setAssignee] = useState("");

  useEffect(() => {
    if (open) {
      setTitle("");
      setDescription("");
      setPriority("medium");
      setDue("");
      setAssignee("");
    }
  }, [open]);

  const submit = () => {
    if (!title.trim()) {
      toast.error("Task title is required");
      return;
    }
    create.mutate(
      {
        title: title.trim(),
        description: description.trim() || null,
        priority,
        due_at: due ? new Date(due).toISOString() : null,
        assigned_to: assignee || null,
        lead_id: leadId ?? null,
        resident_id: residentId ?? null,
        case_id: caseId ?? null,
      },
      {
        onSuccess: () => {
          toast.success("Task added");
          onClose();
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : "Could not add task"),
      },
    );
  };

  return (
    <Modal open={open} onClose={onClose} title="New task">
      <div className="space-y-4">
        <Field label="Title" required>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Send proposal draft to…" autoFocus />
        </Field>
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
          <Field label="Due">
            <Input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} />
          </Field>
        </div>
        <Field label="Assign to">
          <Select value={assignee} onChange={(e) => setAssignee(e.target.value)}>
            <option value="">Unassigned</option>
            {users?.map((u) => (
              <option key={u.id} value={u.id}>
                {u.full_name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Notes">
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={create.isPending}>
            Add task
          </Button>
        </div>
      </div>
    </Modal>
  );
}
