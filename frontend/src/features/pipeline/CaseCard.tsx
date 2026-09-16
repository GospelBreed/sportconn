import { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/cn";
import { useRole } from "@/lib/auth";
import { createActivity } from "@/lib/db";
import { useToast } from "@/components/ui/Toast";
import { Icon } from "@/components/ui/Icon";
import { Button, Textarea } from "@/components/ui/primitives";
import { Menu, MenuItem } from "@/components/ui/overlays";
import { AgingBadge, CategoryTag, FollowupBadge, PriorityBadge } from "@/components/ui/badges";
import type { Case } from "@/types";

export function CaseCard({
  c,
  onOpen,
  onDelete,
  dragDisabled,
}: {
  c: Case;
  onOpen: (id: string) => void;
  onDelete: (c: Case) => void;
  dragDisabled?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: c.id,
    disabled: dragDisabled,
  });
  const { canWrite } = useRole();
  const toast = useToast();
  const [menuOpen, setMenuOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const subject = c.residents?.full_name ?? c.properties?.name ?? "Unassigned";
  const sub = c.residents
    ? [c.properties?.name, c.residents.unit_number && `#${c.residents.unit_number}`]
        .filter(Boolean)
        .join(" · ")
    : "Facility-level case";

  const saveNote = async () => {
    if (!note.trim()) return;
    setSaving(true);
    try {
      await createActivity({
        case_id: c.id,
        resident_id: c.resident_id ?? null,
        property_id: c.property_id ?? null,
        type: "note",
        description: note.trim(),
      });
      toast.success("Note logged");
      setNote("");
      setNoteOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save note");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "group rounded-card border border-line bg-surface p-3 shadow-card transition-shadow hover:shadow-pop",
        isDragging && "opacity-50",
        c.priority === "urgent" && "border-l-[3px] border-l-danger",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <button
          onClick={() => onOpen(c.id)}
          className="min-w-0 flex-1 text-left"
          title="Open case"
        >
          <p className="line-clamp-2 text-sm font-semibold text-ink">{c.title}</p>
        </button>
        <div className="relative flex items-center">
          {canWrite && (
            <span
              className="cursor-grab touch-none p-1 text-muted opacity-0 transition group-hover:opacity-100 active:cursor-grabbing"
              {...attributes}
              {...listeners}
              aria-label="Drag case"
            >
              <Icon name="dots" size={15} />
            </span>
          )}
          <button
            onClick={() => setMenuOpen((o) => !o)}
            className="rounded p-1 text-muted hover:bg-line/60 hover:text-ink"
            aria-label="Case actions"
          >
            <Icon name="chevron-down" size={14} />
          </button>
          <Menu open={menuOpen} onClose={() => setMenuOpen(false)}>
            <MenuItem icon={<Icon name="external" size={14} />} onClick={() => { onOpen(c.id); setMenuOpen(false); }}>
              Open case
            </MenuItem>
            {canWrite && (
              <MenuItem icon={<Icon name="note" size={14} />} onClick={() => { setNoteOpen(true); setMenuOpen(false); }}>
                Quick note
              </MenuItem>
            )}
            {canWrite && (
              <MenuItem danger icon={<Icon name="trash" size={14} />} onClick={() => { onDelete(c); setMenuOpen(false); }}>
                Delete
              </MenuItem>
            )}
          </Menu>
        </div>
      </div>

      <div className="mt-1.5 flex items-center gap-1.5 text-xs text-muted">
        <Icon name={c.residents ? "user" : "building"} size={13} />
        <span className="truncate font-medium text-body">{subject}</span>
      </div>
      {sub && <p className="truncate text-[11px] text-muted">{sub}</p>}

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <PriorityBadge priority={c.priority} />
        <CategoryTag category={c.category} />
      </div>

      <div className="mt-2 flex items-center justify-between gap-2">
        <AgingBadge stageEnteredAt={c.stage_entered_at} />
        <FollowupBadge at={c.next_follow_up_at} />
      </div>

      {noteOpen && (
        <div className="mt-2 space-y-2 border-t border-line pt-2">
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Log a quick note…"
            className="min-h-[56px] text-xs"
            autoFocus
          />
          <div className="flex justify-end gap-1.5">
            <Button size="sm" variant="ghost" onClick={() => setNoteOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={saveNote} loading={saving}>
              Save
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
