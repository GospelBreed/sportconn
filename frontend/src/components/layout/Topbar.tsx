import { BRAND } from "@/lib/branding";
import { Icon } from "@/components/ui/Icon";
import { Kbd } from "@/components/ui/primitives";
import { BrandMark } from "./BrandMark";
import { HealthIndicator } from "./HealthIndicator";
import { NotificationBell } from "./NotificationBell";
import { openCommandPalette } from "./CommandPalette";

export function Topbar({ onMenu }: { onMenu: () => void }) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line bg-surface px-4">
      <button
        onClick={onMenu}
        className="rounded-control p-1.5 text-muted hover:bg-line/60 hover:text-ink md:hidden"
        aria-label="Open menu"
      >
        <Icon name="menu" size={20} />
      </button>

      <div className="flex items-center gap-2 md:hidden">
        <BrandMark size={26} />
        <span className="text-sm font-bold text-ink">{BRAND.shortName}</span>
      </div>

      <button
        onClick={openCommandPalette}
        className="ml-auto flex h-9 w-full max-w-sm items-center gap-2 rounded-control border border-line bg-surface-2 px-3 text-sm text-muted transition-colors hover:border-line hover:bg-line/40 md:ml-0"
      >
        <Icon name="search" size={15} />
        <span className="flex-1 text-left">Search members, facilities, cases…</span>
        <span className="hidden items-center gap-0.5 sm:flex">
          <Kbd>⌘</Kbd>
          <Kbd>K</Kbd>
        </span>
      </button>

      <div className="ml-auto flex items-center gap-1 md:ml-4">
        <HealthIndicator />
        <NotificationBell />
      </div>
    </header>
  );
}
