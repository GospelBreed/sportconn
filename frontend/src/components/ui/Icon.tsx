import type { SVGProps } from "react";

export type IconName =
  | "board"
  | "person"
  | "properties"
  | "analytics"
  | "followups"
  | "settings"
  | "activity"
  | "search"
  | "plus"
  | "logout"
  | "menu"
  | "close"
  | "phone"
  | "home"
  | "note"
  | "flag"
  | "folder"
  | "check"
  | "clock"
  | "dots"
  | "trash"
  | "edit"
  | "upload"
  | "chevron-right"
  | "chevron-left"
  | "chevron-down"
  | "external"
  | "wrench"
  | "dollar"
  | "file"
  | "heart"
  | "users"
  | "bell"
  | "calendar"
  | "arrow-right"
  | "filter"
  | "sparkle"
  | "alert"
  | "mail"
  | "building"
  | "user";

const PATHS: Record<IconName, string> = {
  board: "M4 4h6v16H4zM14 4h6v10h-6z",
  person: "M16 7a4 4 0 11-8 0 4 4 0 018 0zM4 21v-1a6 6 0 016-6h4a6 6 0 016 6v1",
  properties: "M3 21V8l6-4 6 4v13M9 21v-5h2v5M4 21h16M15 12h4v9",
  analytics: "M4 19V5M4 19h16M8 16v-5M12 16V8M16 16v-3M20 16v-7",
  followups: "M12 8v5l3 2M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  settings:
    "M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 13a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-2.82 1.17V21a2 2 0 11-4 0v-.09A1.65 1.65 0 006 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06A1.65 1.65 0 004 13a1.65 1.65 0 00-1.51-1H2a2 2 0 110-4h.09A1.65 1.65 0 004 6.6a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06A1.65 1.65 0 009 2.49V2a2 2 0 114 0v.09a1.65 1.65 0 002.83 1.17l.06-.06a2 2 0 112.83 2.83l-.06.06A1.65 1.65 0 0020 9c.66 0 1.26.39 1.51 1H22a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z",
  activity: "M3 12h4l2 7 4-16 2 9h6",
  search: "M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.3-4.3",
  plus: "M12 5v14M5 12h14",
  logout: "M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9",
  menu: "M3 6h18M3 12h18M3 18h18",
  close: "M18 6L6 18M6 6l12 12",
  phone:
    "M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.13.96.36 1.9.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0122 16.92z",
  home: "M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10",
  note: "M14 3v5h5M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V8zM8 13h8M8 17h6",
  flag: "M4 22V4a1 1 0 011-1h11l-2 4 2 4H5",
  folder: "M3 7a2 2 0 012-2h4l2 3h8a2 2 0 012 2v7a2 2 0 01-2 2H5a2 2 0 01-2-2z",
  check: "M20 6L9 17l-5-5",
  clock: "M12 7v5l3 2M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  dots: "M12 13a1 1 0 100-2 1 1 0 000 2zM19 13a1 1 0 100-2 1 1 0 000 2zM5 13a1 1 0 100-2 1 1 0 000 2z",
  trash: "M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6M10 11v6M14 11v6",
  edit: "M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4z",
  upload: "M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12",
  "chevron-right": "M9 18l6-6-6-6",
  "chevron-left": "M15 18l-6-6 6-6",
  "chevron-down": "M6 9l6 6 6-6",
  external: "M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3",
  wrench:
    "M14.7 6.3a4 4 0 01-5.4 5.4L4 17l3 3 5.3-5.3a4 4 0 005.4-5.4l-2.5 2.5-2.7-.7-.7-2.7z",
  dollar: "M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6",
  file: "M14 3v5h5M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V8z",
  heart: "M20.8 5.6a5.5 5.5 0 00-7.8 0L12 6.6l-1-1a5.5 5.5 0 00-7.8 7.8l1 1L12 22l7.8-7.6 1-1a5.5 5.5 0 000-7.8z",
  users:
    "M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75",
  bell: "M18 8a6 6 0 00-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0",
  calendar: "M3 4h18v18H3zM3 10h18M8 2v4M16 2v4",
  "arrow-right": "M5 12h14M13 5l7 7-7 7",
  filter: "M22 3H2l8 9.46V19l4 2v-8.54z",
  sparkle: "M12 3l1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2z",
  alert: "M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z",
  mail: "M4 4h16v16H4zM4 6l8 6 8-6",
  building: "M4 22V4a1 1 0 011-1h9a1 1 0 011 1v18M15 9h4a1 1 0 011 1v12M8 7h.01M8 11h.01M8 15h.01",
  user: "M12 12a4 4 0 100-8 4 4 0 000 8zM6 21v-1a4 4 0 014-4h4a4 4 0 014 4v1",
};

export function Icon({
  name,
  size = 18,
  ...props
}: { name: IconName; size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
