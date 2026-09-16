import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listResidents } from "@/lib/db";
import { useDebounced } from "@/hooks/useDebounced";
import { Input } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/Icon";

export function ResidentSelect({
  valueId,
  valueLabel,
  onSelect,
  onClear,
  placeholder = "Search members…",
}: {
  valueId: string | null;
  valueLabel: string;
  onSelect: (id: string, label: string, propertyId?: string | null) => void;
  onClear: () => void;
  placeholder?: string;
}) {
  const [q, setQ] = useState("");
  const term = useDebounced(q, 250);
  const { data } = useQuery({
    queryKey: ["resident-picker", term],
    queryFn: () => listResidents({ q: term }),
    enabled: term.trim().length > 0 && !valueId,
  });

  if (valueId) {
    return (
      <div className="flex items-center justify-between rounded-control border border-line bg-surface-2 px-3 py-2">
        <span className="text-sm text-ink">{valueLabel}</span>
        <button
          type="button"
          onClick={onClear}
          className="text-xs font-medium text-muted hover:text-danger"
        >
          Change
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <Icon
        name="search"
        size={15}
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
      />
      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={placeholder}
        className="pl-9"
      />
      {!!data?.length && q && (
        <div className="absolute z-20 mt-1 max-h-52 w-full overflow-y-auto rounded-control border border-line bg-surface shadow-pop">
          {data.slice(0, 8).map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => {
                onSelect(r.id, r.full_name, r.property_id);
                setQ("");
              }}
              className="block w-full px-3 py-2 text-left text-sm hover:bg-line/50"
            >
              <span className="font-medium text-ink">{r.full_name}</span>
              <span className="ml-2 text-xs text-muted">
                {[r.properties?.name, r.unit_number && `#${r.unit_number}`].filter(Boolean).join(" · ")}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
