import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { listCaptains, listFacilities, listLeads, listTasks } from "@/lib/db";
import { useDebounced } from "@/hooks/useDebounced";
import { useRole } from "@/lib/auth";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Kbd } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";

const OPEN_EVENT = "sportconn:open-command";
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

  const { data: leads } = useQuery({
    queryKey: ["cmd-leads", term],
    queryFn: () => listLeads({ q: term }),
    enabled,
  });
  const { data: facilities } = useQuery({
    queryKey: ["cmd-facilities", term],
    queryFn: () => listFacilities({ q: term }),
    enabled,
  });
  const { data: captains } = useQuery({
    queryKey: ["cmd-captains", term],
    queryFn: () => listCaptains({ q: term }),
    enabled,
  });
  const { data: tasks } = useQuery({
    queryKey: ["cmd-tasks"],
    queryFn: () => listTasks(),
    enabled,
  });

  const quickActions = useMemo<Row[]>(() => {
    const base: Row[] = [
      { id: "qa-dashboard", label: "Go to Dashboard", sub: "Growth command centre", icon: "home", to: "/dashboard", group: "Actions" },
      { id: "qa-pipeline", label: "Open Pipeline", sub: "All pipelines, one board", icon: "board", to: "/pipeline", group: "Actions" },
      { id: "qa-tasks", label: "Open Tasks", sub: "Due today & overdue", icon: "followups", to: "/tasks", group: "Actions" },
      { id: "qa-analytics", label: "Open Reports & Analytics", sub: "KPIs & trends", icon: "analytics", to: "/analytics", group: "Actions" },
      { id: "qa-settings", label: "Go to Settings", sub: "Profile, team & pipelines", icon: "settings", to: "/settings", group: "Actions" },
    ];
    if (canWrite) {
      base.unshift(
        { id: "qa-new-lead", label: "New lead", sub: "Add to the dealflow pipeline", icon: "plus", to: "/leads?new=1", group: "Actions" },
        { id: "qa-new-facility", label: "New facility", sub: "Add a venue opportunity", icon: "plus", to: "/facilities?new=1", group: "Actions" },
        { id: "qa-new-captain", label: "New captain", sub: "Add to Captains & Communities", icon: "plus", to: "/captains?new=1", group: "Actions" },
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
    (leads ?? []).slice(0, 6).forEach((l) =>
      out.push({
        id: l.id,
        label: l.full_name,
        sub: [l.company_name, l.pipeline].filter(Boolean).join(" · ") || "Lead",
        icon: "person",
        to: `/leads?focus=${l.id}`,
        group: "Leads",
      }),
    );
    (facilities ?? []).slice(0, 5).forEach((f) =>
      out.push({
        id: f.id,
        label: f.name,
        sub: [f.city, f.area].filter(Boolean).join(", ") || "Facility",
        icon: "properties",
        to: `/facilities/${f.id}`,
        group: "Facilities",
      }),
    );
    (captains ?? []).slice(0, 5).forEach((c) =>
      out.push({
        id: c.id,
        label: c.full_name,
        sub: [c.community, c.area].filter(Boolean).join(" · ") || "Captain",
        icon: "users",
        to: `/captains?focus=${c.id}`,
        group: "Captains",
      }),
    );
    (tasks ?? [])
      .filter((task) => task.title.toLowerCase().includes(t))
      .slice(0, 5)
      .forEach((task) =>
        out.push({
          id: task.id,
          label: task.title,
          sub: task.leads?.full_name ?? task.facilities?.name ?? task.captains?.full_name ?? "Task",
          icon: "followups",
          to: `/tasks?focus=${task.id}`,
          group: "Tasks",
        }),
      );
    const actions = quickActions.filter(
      (a) => a.label.toLowerCase().includes(t) || a.sub.toLowerCase().includes(t),
    );
    return [...actions, ...out];
  }, [enabled, term, leads, facilities, captains, tasks, quickActions]);

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
            placeholder="Search leads, sponsors, investors, facilities, captains — or type a command…"
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
