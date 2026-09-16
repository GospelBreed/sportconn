import { NavLink, useNavigate } from "react-router-dom";
import { cn } from "@/lib/cn";
import { useAuth, useRole } from "@/lib/auth";
import { BRAND } from "@/lib/branding";
import { ROLE_BADGE, ROLE_LABEL } from "@/lib/constants";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Avatar, Badge } from "@/components/ui/primitives";
import { useDashboard } from "@/hooks/queries";
import { BrandMark } from "./BrandMark";
import type { NavKey } from "@/types";

interface NavItem {
  to: string;
  label: string;
  icon: IconName;
  key?: NavKey;
  badge?: "tasks" | "followups";
}

interface NavSection {
  label: string;
  items: NavItem[];
}

const SECTIONS: NavSection[] = [
  {
    label: "Main",
    items: [
      { to: "/dashboard", label: "Dashboard", icon: "home", key: "dashboard" },
      { to: "/leads", label: "Leads", icon: "person", key: "leads" },
      { to: "/pipeline", label: "Pipeline", icon: "board", key: "pipeline" },
    ],
  },
  {
    label: "Business Development",
    items: [
      { to: "/sponsors", label: "Sponsors", icon: "dollar", key: "sponsors" },
      { to: "/investors", label: "Investors", icon: "building", key: "investors" },
      { to: "/facilities", label: "Facilities", icon: "properties", key: "facilities" },
      { to: "/partners", label: "Partners", icon: "flag", key: "partners" },
    ],
  },
  {
    label: "Growth",
    items: [
      { to: "/user-acquisition", label: "User Acquisition", icon: "sparkle", key: "user_acquisition" },
      { to: "/captains", label: "Captains & Communities", icon: "users", key: "captains" },
      { to: "/campaigns", label: "Campaigns", icon: "external", key: "campaigns" },
    ],
  },
  {
    label: "Activity",
    items: [
      { to: "/tasks", label: "Tasks", icon: "followups", key: "tasks", badge: "tasks" },
      { to: "/activities", label: "Activities", icon: "activity", key: "activities" },
    ],
  },
  {
    label: "Insights",
    items: [{ to: "/analytics", label: "Reports & Analytics", icon: "analytics", key: "analytics" }],
  },
  {
    label: "System",
    items: [{ to: "/settings", label: "Settings", icon: "settings" }],
  },
];

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { user, signOut } = useAuth();
  const { navAllowed } = useRole();
  const navigate = useNavigate();
  const { data: dash } = useDashboard();

  const tasksDue = (dash?.tasks_overdue ?? 0) + (dash?.tasks_today ?? 0);
  const followupsDue = dash?.overdue_followups ?? 0;

  const logout = async () => {
    await signOut();
    navigate("/login");
  };

  return (
    <aside className="flex h-full w-60 flex-col border-r border-line bg-surface">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <BrandMark size={34} />
        <div className="leading-tight">
          <p className="text-sm font-bold tracking-tight text-ink">{BRAND.shortName}</p>
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted">
            {BRAND.tagline}
          </p>
        </div>
      </div>

      <nav className="flex-1 space-y-4 overflow-y-auto px-3 pb-3">
        {SECTIONS.map((section) => {
          const items = section.items.filter((i) => !i.key || navAllowed(i.key));
          if (items.length === 0) return null;
          return (
            <div key={section.label}>
              <p className="mb-1 px-3 text-[10px] font-bold uppercase tracking-wider text-muted/70">
                {section.label}
              </p>
              <div className="space-y-0.5">
                {items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      cn(
                        "flex items-center gap-3 rounded-control px-3 py-2 text-sm font-medium transition-colors",
                        isActive
                          ? "bg-primary/10 text-primary"
                          : "text-muted hover:bg-line/60 hover:text-ink",
                      )
                    }
                  >
                    <Icon name={item.icon} size={18} />
                    <span className="flex-1">{item.label}</span>
                    {item.badge === "tasks" && tasksDue > 0 && (
                      <span className="rounded-full bg-danger px-1.5 py-0.5 text-[10px] font-bold text-white">
                        {tasksDue}
                      </span>
                    )}
                    {item.badge === "followups" && followupsDue > 0 && (
                      <span className="rounded-full bg-danger px-1.5 py-0.5 text-[10px] font-bold text-white">
                        {followupsDue}
                      </span>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          );
        })}
      </nav>

      <div className="border-t border-line p-3">
        <div className="flex items-center gap-3 rounded-control px-2 py-2">
          <Avatar name={user?.full_name} size={36} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-ink">{user?.full_name}</p>
            <Badge className={ROLE_BADGE[user?.role ?? "business_development"]}>
              {ROLE_LABEL[user?.role ?? "business_development"]}
            </Badge>
          </div>
          <button
            onClick={logout}
            className="rounded-control p-1.5 text-muted hover:bg-line/60 hover:text-danger"
            aria-label="Sign out"
            title="Sign out"
          >
            <Icon name="logout" size={17} />
          </button>
        </div>
      </div>
    </aside>
  );
}
