"use client";

import { useEffect, useState } from "react";
import { pushStatus, turnPushOff, turnPushOn, type PushStatus } from "../../lib/push";

/* "Notifications on this device" card (Alerts page). */
export function PushToggle() {
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    pushStatus().then(setStatus);
  }, []);

  if (status === null || status === "unsupported") return null;

  const toggle = async () => {
    setBusy(true);
    setError("");
    try {
      if (status === "on") await turnPushOff();
      else await turnPushOn();
    } catch (err: any) {
      setError(err?.message || "Something went wrong. Please try again.");
    } finally {
      setStatus(await pushStatus());
      setBusy(false);
    }
  };

  return (
    <div className="mt-3 rounded-2xl bg-white p-4 text-[#0B2A5B] shadow-sm">
      <div className="flex items-center gap-3">
        <span className="text-2xl">{status === "on" ? "🔔" : "🔕"}</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold">
            {status === "on" ? "Notifications are on" : "Get notifications on this device"}
          </p>
          <p className="text-xs text-[#5B6B8C]">
            {status === "ios-install"
              ? "On iPhone, first add MIGwith to your Home Screen (Share → Add to Home Screen), then open it from there."
              : status === "blocked"
                ? "Notifications are blocked. Allow them for this site in your browser settings."
                : "Messages, gifts, friend requests and invites — even when MIGwith is closed."}
          </p>
        </div>
        {(status === "on" || status === "off") && (
          <button
            type="button"
            onClick={toggle}
            disabled={busy}
            className={`shrink-0 rounded-xl px-4 py-2 text-sm font-bold disabled:opacity-50 ${
              status === "on" ? "border border-[#D5E3F5] text-[#5B6B8C]" : "bg-[#2F80ED] text-white"
            }`}
          >
            {busy ? "Please wait…" : status === "on" ? "Turn off" : "Turn on"}
          </button>
        )}
      </div>
      {error && <p className="mt-2 text-xs text-rose-600">{error}</p>}
    </div>
  );
}
