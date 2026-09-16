import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/components/ui/Toast";
import { createNotification } from "@/lib/db";
import { useFollowups, useNotifications } from "./queries";

/**
 * While the app is open, turn a lead/facility opportunity whose follow-up has
 * lapsed (overdue) or is due today into a `notifications` row for the
 * assigned user — once, deduped on (record, bucket, day). Production would
 * move this to pg_cron + an Edge Function; the shape here is the same.
 */
export function useFollowupSweep() {
  const { user } = useAuth();
  const { data: followups } = useFollowups();
  const { data: notifications } = useNotifications();
  const toast = useToast();
  const qc = useQueryClient();
  const seen = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!user || !followups) return;
    const today = new Date().toISOString().slice(0, 10);

    const existing = new Set(
      (notifications ?? [])
        .filter((n) => n.type === "follow_up_due" || n.type === "follow_up_overdue")
        .map((n) => `${n.lead_id ?? n.facility_id}:${(n.created_at ?? "").slice(0, 10)}`),
    );

    const due = followups.filter(
      (f) =>
        (f.bucket === "overdue" || f.bucket === "today") &&
        f.record.assigned_to === user.id,
    );

    let created = 0;
    (async () => {
      for (const f of due) {
        const key = `${f.record.id}:${today}`;
        if (seen.current.has(key) || existing.has(key)) continue;
        seen.current.add(key);
        const label = f.kind === "lead" ? (f.record as { full_name: string }).full_name : (f.record as { name: string }).name;
        try {
          await createNotification({
            user_id: user.id,
            lead_id: f.kind === "lead" ? f.record.id : null,
            facility_id: f.kind === "facility" ? f.record.id : null,
            type: f.bucket === "overdue" ? "follow_up_overdue" : "follow_up_due",
            title: f.bucket === "overdue" ? "Follow-up overdue" : "Follow-up due today",
            body: label,
          });
          created += 1;
        } catch {
          seen.current.delete(key);
        }
      }
      if (created > 0) {
        qc.invalidateQueries({ queryKey: ["notifications"] });
        toast.info(
          created === 1 ? "A follow-up needs attention" : `${created} follow-ups need attention`,
        );
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, followups, notifications]);
}
