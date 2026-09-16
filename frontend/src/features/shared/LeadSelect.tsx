import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listLeads } from "@/lib/db";
import { useDebounced } from "@/hooks/useDebounced";
import { Input } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/Icon";

export function LeadSelect({
  valueId,
  valueLabel,
  onSelect,
  onClear,
}: {
  valueId: string | null;
  valueLabel: string;
  onSelect: (id: string, label: string) => void;
  onClear: () => void;
}) {
  const [q, setQ] = useState("");
  const term = useDebounced(q, 250);
  const { data } = useQuery({
    queryKey: ["lead-picker", term],
    queryFn: () => listLeads({ q: term }),
    enabled: term.trim().length > 0 && !valueId,
  });

  if (valueId) {
    return (
      <div className="flex items-center justify-between rounded-control border border-line bg-surface-2 px-3 py-2">
        <span className="text-sm text-ink">{valueLabel}</span>
        <button type="button" onClick={onClear} className="text-xs font-medium text-muted hover:text-danger">
          Change
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <Icon name="search" size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search leads…" className="pl-9" />
      {!!data?.length && q && (
        <div className="absolute z-20 mt-1 max-h-52 w-full overflow-y-auto rounded-control border border-line bg-surface shadow-pop">
          {data.slice(0, 8).map((l) => (
            <button
              key={l.id}
              type="button"
              onClick={() => {
                onSelect(l.id, `${l.full_name}${l.company_name ? ` · ${l.company_name}` : ""}`);
                setQ("");
              }}
              className="block w-full px-3 py-2 text-left text-sm hover:bg-line/50"
            >
              <span className="font-medium text-ink">{l.full_name}</span>
              <span className="ml-2 text-xs text-muted">{l.company_name ?? l.property_name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
