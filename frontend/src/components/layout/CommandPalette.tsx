import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { listCases, listLeads, listProperties, listResidents } from "@/lib/db";
import { useDebounced } from "@/hooks/useDebounced";
import { useRole } from "@/lib/auth";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Kbd } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";
import { STAGE_LABEL } from "@/lib/constants";

const OPEN_EVENT = "roseway:open-command";
export function openCommandPalette() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

interface Row {
  id: string;
  label: string;
  sub: string;
  icon: IconName;
  to: string;
  group: string;
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const { canWrite } = useRole();

  useEffect(() => {
    const openHandler = () => setOpen(true);
    const keyHandler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener(OPEN_EVENT, openHandler);
    window.addEventListener("keydown", keyHandler);
    return () => {
      window.removeEventListener(OPEN_EVENT, openHandler);
      window.removeEventListener("keydown", keyHandler);
    };
  }, []);

  useEffect(() => {
    if (open) {
      setQ("");
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 20);
    }
  }, [open]);

  const term = useDebounced(q, 200);
  const enabled = open && term.trim().length > 0;

  const { data: residents } = useQuery({
    queryKey: ["cmd-residents", term],
    queryFn: () => listResidents({ q: term }),
    enabled,
  });
  const { data: properties } = useQuery({
    queryKey: ["cmd-properties", term],
    queryFn: () => listProperties(term),
    enabled,
  });
  const { data: cases } = useQuery({
    queryKey: ["cmd-cases"],
    queryFn: () => listCases(),
    enabled,
  });
  const { data: leads } = useQuery({
    queryKey: ["cmd-leads", term],
    queryFn: () => listLeads({ q: term }),
    enabled,
  });

  const quickActions = useMemo<Row[]>(() => {
    const base: Row[] = [
      { id: "qa-dashboard", label: "Go to Dashboard", sub: "Portfolio overview", icon: "home", to: "/dashboard", group: "Actions" },
      { id: "qa-tasks", label: "Open Tasks", sub: "Due today & overdue", icon: "followups", to: "/tasks", group: "Actions" },
      { id: "qa-analytics", label: "Open Reports & Analytics", sub: "KPIs & trends", icon: "analytics", to: "/analytics", group: "Actions" },
      { id: "qa-settings", label: "Go to Settings", sub: "Profile & team", icon: "settings", to: "/settings", group: "Actions" },
    ];
    if (canWrite) {
      base.unshift(
        { id: "qa-new-lead", label: "New lead", sub: "Add to the dealflow pipeline", icon: "plus", to: "/pipeline?new=1", group: "Actions" },
        { id: "qa-new-case", label: "New case", sub: "Add a resident case", icon: "plus", to: "/cases?new=1", group: "Actions" },
        { id: "qa-new-resident", label: "New resident", sub: "Add to the directory", icon: "plus", to: "/residents?new=1", group: "Actions" },
        { id: "qa-new-task", label: "New task", sub: "Add a to-do", icon: "plus", to: "/tasks?new=1", group: "Actions" },
      );
    }
    return base;
  }, [canWrite]);

  const results = useMemo<Row[]>(() => {
    if (!enabled) {
      return quickActions;
    }
    const t = term.toLowerCase();
    const out: Row[] = [];
    (leads ?? []).slice(0, 5).forEach((l) =>
      out.push({
        id: l.id,
        label: l.property_name ?? l.full_name,
        sub: [l.company_name, l.full_name].filter(Boolean).join(" · ") || "Lead",
        icon: "residents",
        to: `/leads?focus=${l.id}`,
        group: "Leads",
      }),
    );
    (residents ?? []).slice(0, 5).forEach((r) =>
      out.push({
        id: r.id,
        label: r.full_name,
        sub: [r.properties?.name, r.unit_number && `Unit ${r.unit_number}`].filter(Boolean).join(" · ") || "Member",
        icon: "residents",
        to: `/residents?focus=${r.id}`,
        group: "Members",
      }),
    );
    (properties ?? []).slice(0, 4).forEach((p) =>
      out.push({
        id: p.id,
        label: p.name,
        sub: [p.city, p.state].filter(Boolean).join(", ") || "Facility",
        icon: "properties",
        to: `/properties/${p.id}`,
        group: "Facilities",
      }),
    );
    (cases ?? [])
      .filter((c) => c.title.toLowerCase().includes(t) || c.residents?.full_name?.toLowerCase().includes(t))
      .slice(0, 5)
      .forEach((c) =>
        out.push({
          id: c.id,
          label: c.title,
          sub: `${c.residents?.full_name ?? c.properties?.name ?? "—"} · ${STAGE_LABEL[c.stage]}`,
          icon: "board",
          to: `/cases?case=${c.id}`,
          group: "Cases",
        }),
      );
    const actions = quickActions.filter(
      (a) => a.label.toLowerCase().includes(t) || a.sub.toLowerCase().includes(t),
    );
    return [...actions, ...out];
  }, [enabled, term, residents, properties, cases, quickActions]);

  const go = (r: Row) => {
    setOpen(false);
    navigate(r.to);
  };

  if (!open) return null;

  const groups = Array.from(new Set(results.map((r) => r.group)));

  return (
    <div className="fixed inset-0 z-[90] flex items-start justify-center px-4 pt-[10vh]">
      <div className="absolute inset-0 bg-ink/40 backdrop-blur-[2px] animate-fade-in" onClick={() => setOpen(false)} />
      <div className="card-base relative z-10 w-full max-w-xl overflow-hidden shadow-pop animate-scale-in">
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Icon name="search" size={17} className="text-muted" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => Math.min(a + 1, results.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(a - 1, 0));
              } else if (e.key === "Enter" && results[active]) {
                go(results[active]);
              }
            }}
            placeholder="Search members, facilities, cases — or type a command…"
            className="h-14 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-muted"
          />
          <Kbd>ESC</Kbd>
        </div>

        <div className="max-h-[52vh] overflow-y-auto p-2">
          {enabled && results.length === 0 && (
            <p className="px-3 py-8 text-center text-sm text-muted">No matches for "{term}".</p>
          )}
          {groups.map((g) => {
            const items = results.filter((r) => r.group === g);
            if (!items.length) return null;
            return (
              <div key={g} className="mb-1">
                <p className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
                  {g}
                </p>
                {items.map((r) => {
                  const idx = results.indexOf(r);
                  return (
                    <button
                      key={r.id}
                      onMouseEnter={() => setActive(idx)}
                      onClick={() => go(r)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-control px-3 py-2 text-left",
                        active === idx ? "bg-primary/10" : "hover:bg-line/50",
                      )}
                    >
                      <span
                        className={cn(
                          "flex h-7 w-7 shrink-0 items-center justify-center rounded-control",
                          active === idx ? "bg-primary/15 text-primary" : "bg-surface-2 text-muted",
                        )}
                      >
                        <Icon name={r.icon} size={15} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-ink">{r.label}</span>
                        <span className="block truncate text-xs text-muted">{r.sub}</span>
                      </span>
                      <Icon name="chevron-right" size={15} className="text-muted" />
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
