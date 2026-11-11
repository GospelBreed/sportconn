import { useEffect, useState } from "react";
import { useEmailSettings, useUpdateEmailSettings, useUsers } from "@/hooks/queries";
import { useRole } from "@/lib/auth";
import { useToast } from "@/components/ui/Toast";
import { Button, Field, Input, Select } from "@/components/ui/primitives";
import { ErrorState, SkeletonRows } from "@/components/ui/states";
import { WEEKDAYS } from "@/lib/constants";
import { cn } from "@/lib/cn";
import type { EmailSettings } from "@/types";

/** Settings → Email sending (0007). Management/admins edit; everyone else reads. */
export function EmailSendingSettings() {
  const { canApprove } = useRole();
  const toast = useToast();
  const { data, isLoading, isError, refetch } = useEmailSettings();
  const { data: users } = useUsers();
  const update = useUpdateEmailSettings();
  const [form, setForm] = useState<EmailSettings | null>(null);
  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  const save = (patch: Partial<EmailSettings>, ok = "Sending settings saved") =>
    update.mutate(patch, {
      onSuccess: () => toast.success(ok),
      onError: (e) => {
        const msg = e instanceof Error ? e.message : "Could not save";
        toast.error(/email_settings_sender/.test(msg) ? "Choose a default sender before switching review off." : /email_settings_hours/.test(msg) ? "The end hour must be after the start hour." : msg);
      },
    });

  if (isLoading || !form) {
    return (
      <section className="card-base p-5">
        {isError ? <ErrorState message="Could not load sending settings. Has migration 0007 been applied?" onRetry={() => refetch()} /> : <SkeletonRows rows={3} />}
      </section>
    );
  }

  const num = (k: keyof EmailSettings, min: number, max: number) => (
    <Input
      type="number"
      min={min}
      max={max}
      value={form[k] as number}
      disabled={!canApprove}
      onChange={(e) => setForm({ ...form, [k]: Number(e.target.value) })}
      className="h-9"
    />
  );

  const dirty = data && JSON.stringify({ ...form, updated_at: "" }) !== JSON.stringify({ ...data, updated_at: "" });

  return (
    <section className="card-base p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-ink">Email sending</h3>
          <p className="text-xs text-muted">
            Limits for emails sent from the review queue. Start small (10–15 a day) and raise it only while bounces and spam
            reports stay low. {canApprove ? "" : "Only management or admins can change these."}
          </p>
        </div>
        {canApprove && (
          <Button
            size="sm"
            variant={form.sending_paused ? "primary" : "danger"}
            onClick={() => save({ sending_paused: !form.sending_paused }, form.sending_paused ? "Sending resumed" : "Sending paused")}
            loading={update.isPending}
          >
            {form.sending_paused ? "Resume sending" : "Pause sending"}
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="Emails per day (total)">{num("daily_send_limit", 0, 500)}</Field>
        <Field label="Per company per day">{num("per_domain_daily_limit", 1, 50)}</Field>
        <Field label="Days between emails to one person">{num("min_days_between_emails", 0, 365)}</Field>
        <Field label="Start sending at (Lagos)">{num("send_hour_start", 0, 23)}</Field>
        <Field label="Stop sending at (Lagos)">{num("send_hour_end", 1, 24)}</Field>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="Follow-ups per contact (max 2)">{num("max_followups", 0, 2)}</Field>
        <Field label="Days before follow-up 1">{num("followup_1_after_days", 1, 60)}</Field>
        <Field label="Days before follow-up 2">{num("followup_2_after_days", 1, 60)}</Field>
      </div>
      <p className="mt-1 text-xs text-muted">
        Follow-ups stop automatically as soon as anyone at the company replies. Each one is drafted by the engine and
        reviewed here like any other email.
      </p>

      <div className="mt-3">
        <span className="text-xs font-semibold text-muted">Sending days</span>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {WEEKDAYS.map((d) => {
            const on = form.send_days.includes(d.iso);
            return (
              <button
                key={d.iso}
                type="button"
                disabled={!canApprove}
                aria-pressed={on}
                onClick={() =>
                  setForm({ ...form, send_days: on ? form.send_days.filter((x) => x !== d.iso) : [...form.send_days, d.iso].sort() })
                }
                className={cn(
                  "rounded-control border px-2.5 py-1 text-xs font-medium",
                  on ? "border-primary bg-primary/10 text-primary" : "border-line text-muted",
                )}
              >
                {d.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-4 space-y-2 rounded-control border border-line p-3">
        <label className="flex items-start gap-2 text-sm text-body">
          <input
            type="checkbox"
            className="mt-1 h-4 w-4 accent-primary"
            checked={form.require_review}
            disabled={!canApprove}
            onChange={(e) => setForm({ ...form, require_review: e.target.checked })}
          />
          <span>
            Every AI draft needs a person's approval
            <span className="block text-xs text-muted">
              Keep this on during testing. If you switch it off, drafts to eligible contacts are queued automatically and sent
              under the default sender's name.
            </span>
          </span>
        </label>
        <Field label="Default sender (for automatically approved emails)">
          <Select
            value={form.default_sender_id ?? ""}
            disabled={!canApprove}
            onChange={(e) => setForm({ ...form, default_sender_id: e.target.value || null })}
          >
            <option value="">None</option>
            {users
              ?.filter((u) => !u.email.endsWith(".internal"))
              .map((u) => (
                <option key={u.id} value={u.id}>
                  {u.full_name} ({u.email})
                </option>
              ))}
          </Select>
        </Field>
      </div>

      {canApprove && (
        <div className="mt-4 flex justify-end">
          <Button
            onClick={() => {
              if (form.send_days.length === 0) return toast.error("Choose at least one sending day");
              const { updated_at: _u, ...rest } = form;
              save(rest);
            }}
            disabled={!dirty}
            loading={update.isPending}
          >
            Save sending settings
          </Button>
        </div>
      )}
    </section>
  );
}
