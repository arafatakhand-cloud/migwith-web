"use client";

import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useCurrentUser } from "../../lib/useCurrentUser";

// 🛠 Site control (miGlife secret → Site control). app_settings/site_control:
//   refreshAt    — every open page reloads once when this time is new (new code / a clean start)
//   maintenance  — true: everyone sees the maintenance screen, except miglife
//   maintenanceText — the message on that screen
const SEEN_KEY = "migwith.siteRefreshSeen";

export function SiteControlGate() {
  const { username, loading } = useCurrentUser();
  const [ctl, setCtl] = useState<{ refreshAt: number; maintenance: boolean; maintenanceText: string } | null>(null);

  useEffect(
    () =>
      onSnapshot(
        doc(db, "app_settings", "site_control"),
        (d) => {
          if (!d.exists()) return setCtl(null);
          setCtl({
            refreshAt: Number(d.get("refreshAt") || 0),
            maintenance: d.get("maintenance") === true,
            maintenanceText: String(d.get("maintenanceText") || "").trim(),
          });
        },
        () => setCtl(null)
      ),
    []
  );

  // A new refreshAt reloads each open page once. The first time a browser sees it, it is only remembered.
  useEffect(() => {
    if (!ctl || !ctl.refreshAt) return;
    try {
      const seen = localStorage.getItem(SEEN_KEY);
      if (seen === null) {
        localStorage.setItem(SEEN_KEY, String(ctl.refreshAt));
        return;
      }
      if (ctl.refreshAt > Number(seen)) {
        localStorage.setItem(SEEN_KEY, String(ctl.refreshAt));
        window.location.reload();
      }
    } catch {
      // storage blocked: skip the reload
    }
  }, [ctl]);

  if (!ctl?.maintenance || loading || username === "miglife") return null;
  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-[#F4F7FC] px-6 text-center">
      <div className="text-5xl">🛠️</div>
      <p className="mt-4 text-xl font-black text-[#0B2A5B]">Maintenance</p>
      <p className="mt-2 max-w-sm text-sm text-[#5B6B8C]">
        {ctl.maintenanceText || "miGlife is being updated. Please try again in a few minutes."}
      </p>
    </div>
  );
}
