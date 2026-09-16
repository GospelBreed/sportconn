import { useState } from "react";
import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { HealthBanner } from "./HealthIndicator";
import { CommandPalette } from "./CommandPalette";
import { useRealtime } from "@/hooks/useRealtime";
import { useFollowupSweep } from "@/hooks/useFollowupSweep";

export function AppShell() {
  const [mobileOpen, setMobileOpen] = useState(false);

  // Live updates across the app.
  useRealtime("cases", [["cases"], ["analytics-summary"]]);
  useRealtime("activities", [["activities"]]);
  useRealtime("notifications", [["notifications"]]);
  useRealtime("residents", [["residents"], ["analytics-summary"]]);

  // Turn lapsed follow-ups into notifications while the app is open.
  useFollowupSweep();

  return (
    <div className="flex h-screen overflow-hidden bg-bg">
      <div className="hidden md:block">
        <Sidebar />
      </div>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-ink/40" onClick={() => setMobileOpen(false)} />
          <div className="absolute left-0 top-0 h-full animate-slide-in">
            <Sidebar onNavigate={() => setMobileOpen(false)} />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onMenu={() => setMobileOpen(true)} />
        <HealthBanner />
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>

      <CommandPalette />
    </div>
  );
}
