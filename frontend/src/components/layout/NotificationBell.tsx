import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/cn";
import { formatRelative } from "@/lib/format";
import { Icon } from "@/components/ui/Icon";
import { Menu } from "@/components/ui/overlays";
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
} from "@/hooks/queries";
import type { AppNotification } from "@/types";

const ICON: Record<AppNotification["type"], "clock" | "folder" | "flag" | "alert" | "person" | "check"> = {
  follow_up_due: "clock",
  follow_up_overdue: "alert",
  stage_change: "flag",
  lead_assigned: "person",
  task_assigned: "check",
  task_due: "clock",
  task_overdue: "alert",
  deal_won: "check",
  deal_lost: "flag",
};

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const { data } = useNotifications();
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();
  const navigate = useNavigate();

  const rows = data ?? [];
  const unread = rows.filter((n) => !n.read_at).length;

  const onRow = (n: AppNotification) => {
    if (!n.read_at) markRead.mutate(n.id);
    setOpen(false);
    if (n.lead_id) navigate(`/leads?focus=${n.lead_id}`);
    else if (n.facility_id) navigate(`/facilities/${n.facility_id}`);
    else if (n.captain_id) navigate(`/captains?focus=${n.captain_id}`);
    else if (n.type === "task_assigned" || n.type === "task_due" || n.type === "task_overdue") navigate("/tasks");
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative rounded-control p-2 text-muted hover:bg-line/60 hover:text-ink"
        aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
      >
        <Icon name="bell" size={18} />
        {unread > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      <Menu open={open} onClose={() => setOpen(false)} align="right">
        <div className="w-[320px] max-w-[calc(100vw-2rem)]">
          <div className="flex items-center justify-between border-b border-line px-3 py-2">
            <span className="text-sm font-semibold text-ink">Notifications</span>
            {unread > 0 && (
              <button
                onClick={() => markAll.mutate()}
                className="text-xs font-medium text-primary hover:underline"
              >
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-[60vh] overflow-y-auto">
            {rows.length === 0 ? (
              <p className="px-3 py-8 text-center text-sm text-muted">You're all caught up.</p>
            ) : (
              rows.slice(0, 20).map((n) => (
                <button
                  key={n.id}
                  onClick={() => onRow(n)}
                  className={cn(
                    "flex w-full items-start gap-2.5 border-b border-line/70 px-3 py-2.5 text-left last:border-0 hover:bg-line/40",
                    !n.read_at && "bg-primary/[0.04]",
                  )}
                >
                  <span
                    className={cn(
                      "mt-0.5 shrink-0",
                      n.type === "follow_up_overdue" ? "text-danger" : "text-muted",
                    )}
                  >
                    <Icon name={ICON[n.type]} size={15} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-ink">{n.title}</span>
                    {n.body && <span className="block truncate text-xs text-muted">{n.body}</span>}
                    <span className="block text-[11px] text-muted/80">
                      {formatRelative(n.created_at)}
                    </span>
                  </span>
                  {!n.read_at && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />}
                </button>
              ))
            )}
          </div>
        </div>
      </Menu>
    </div>
  );
}
