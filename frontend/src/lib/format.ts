export function formatRelative(dateStr?: string | null): string {
  if (!dateStr) return "—";
  const date = new Date(dateStr);
  const diff = Date.now() - date.getTime();
  const past = diff >= 0;
  const abs = Math.abs(diff);
  const sec = Math.round(abs / 1000);
  const min = Math.round(sec / 60);
  const hr = Math.round(min / 60);
  const day = Math.round(hr / 24);
  const fmt = (n: number, u: string) => `${n} ${u}${n === 1 ? "" : "s"}${past ? " ago" : ""}`;
  if (sec < 45) return past ? "just now" : "in a moment";
  if (min < 60) return past ? fmt(min, "min") : `in ${min} min`;
  if (hr < 24) return past ? fmt(hr, "hour") : `in ${hr} hour${hr === 1 ? "" : "s"}`;
  if (day < 30) return past ? fmt(day, "day") : `in ${day} day${day === 1 ? "" : "s"}`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function formatDate(dateStr?: string | null): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatDateTime(dateStr?: string | null): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** For <input type="datetime-local"> value binding. */
export function toDateTimeLocal(dateStr?: string | null): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
    d.getMinutes(),
  )}`;
}

export function daysInStage(stageEnteredAt?: string | null): number {
  if (!stageEnteredAt) return 0;
  const diff = Date.now() - new Date(stageEnteredAt).getTime();
  return Math.max(0, Math.floor(diff / 86_400_000));
}

export type FollowupBucket = "overdue" | "today" | "upcoming" | "none";

export function followupBucket(nextFollowUpAt?: string | null): FollowupBucket {
  if (!nextFollowUpAt) return "none";
  const due = new Date(nextFollowUpAt);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfToday = new Date(startOfToday.getTime() + 86_400_000 - 1);
  if (due < now && due < startOfToday) return "overdue";
  if (due < now) return "overdue"; // earlier today, already lapsed
  if (due <= endOfToday) return "today";
  const inThreeDays = new Date(startOfToday.getTime() + 3 * 86_400_000);
  if (due <= inThreeDays) return "upcoming";
  return "none";
}

export function initials(name?: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function pluralize(n: number, singular: string, plural?: string): string {
  return `${n} ${n === 1 ? singular : plural ?? singular + "s"}`;
}
