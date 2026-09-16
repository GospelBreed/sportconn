/**
 * Sportconn branding slot.
 *
 * `primary` is the brand accent color. Changing it here reskins the whole app —
 * `applyBrand()` writes its RGB channels into the `--brand` / `--brand-dark`
 * CSS variables that the Tailwind `primary` color reads.
 *
 * `logoUrl`, when set, replaces the wordmark mark in the sidebar and on the
 * login screen. Leave it null to use the built-in monogram.
 */
export const BRAND = {
  name: "Sportconn CRM",
  shortName: "Sportconn",
  tagline: "Sports Operations",
  primary: "#2563EB",
  logoUrl: null as string | null,
};

function hexToRgbChannels(hex: string): string {
  const m = hex.replace("#", "");
  const int = parseInt(
    m.length === 3
      ? m
          .split("")
          .map((c) => c + c)
          .join("")
      : m,
    16,
  );
  const r = (int >> 16) & 255;
  const g = (int >> 8) & 255;
  const b = int & 255;
  return `${r} ${g} ${b}`;
}

function darken(hex: string, amount = 0.16): string {
  const [r, g, b] = hexToRgbChannels(hex).split(" ").map(Number);
  const d = (c: number) => Math.max(0, Math.round(c * (1 - amount)));
  return `${d(r)} ${d(g)} ${d(b)}`;
}

export function applyBrand(): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.style.setProperty("--brand", hexToRgbChannels(BRAND.primary));
  root.style.setProperty("--brand-dark", darken(BRAND.primary));
}
