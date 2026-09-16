import { useState } from "react";
import { Icon } from "./Icon";
import { Button, Input } from "./primitives";

export function InlineEdit({
  label,
  value,
  onSave,
  type = "text",
  placeholder = "Add…",
  disabled,
}: {
  label: string;
  value: string;
  onSave: (v: string) => void;
  type?: string;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState(value);

  return (
    <div className="flex items-center justify-between gap-3 border-b border-line/70 py-2.5 last:border-0">
      <span className="text-xs font-semibold text-muted">{label}</span>
      {editing ? (
        <div className="flex items-center gap-1.5">
          <Input
            type={type}
            value={v}
            autoFocus
            onChange={(e) => setV(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                onSave(v);
                setEditing(false);
              }
              if (e.key === "Escape") setEditing(false);
            }}
            className="h-8 w-44 text-sm"
          />
          <Button
            size="sm"
            onClick={() => {
              onSave(v);
              setEditing(false);
            }}
          >
            Save
          </Button>
        </div>
      ) : (
        <button
          disabled={disabled}
          onClick={() => {
            setV(value);
            setEditing(true);
          }}
          className="group flex items-center gap-1.5 text-sm text-body enabled:hover:text-primary disabled:cursor-default"
        >
          {value || <span className="text-muted">{placeholder}</span>}
          {!disabled && (
            <Icon name="edit" size={12} className="opacity-0 transition group-hover:opacity-100" />
          )}
        </button>
      )}
    </div>
  );
}
