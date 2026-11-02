"use client";

import { useEffect, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "../../lib/firebase";

// miglife-only: how often the game watchdogs (the backup that finishes a stuck
// round) do their work — 1, 5 or 10 minutes. Changed by the Cloud Function
// setWatchdogSpeed; the web never writes it.

type SpeedResult = { everyMinutes: number; allowed: number[] };
const getWatchdogSpeed = httpsCallable<void, SpeedResult>(functions, "getWatchdogSpeed");
const setWatchdogSpeed = httpsCallable<{ minutes: number }, { everyMinutes: number }>(functions, "setWatchdogSpeed");

const OPTIONS = [1, 5, 10];

export function WatchdogSpeedCard() {
  const [current, setCurrent] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    getWatchdogSpeed()
      .then((r) => setCurrent(r.data.everyMinutes))
      .catch((e) => setMsg(e?.message || "Could not load the watchdog speed."));
  }, []);

  async function choose(minutes: number) {
    if (busy || minutes === current) return;
    setBusy(true);
    setMsg("");
    try {
      const r = await setWatchdogSpeed({ minutes });
      setCurrent(r.data.everyMinutes);
      setMsg(`✅ Watchdog now runs every ${r.data.everyMinutes} minute(s).`);
    } catch (e: unknown) {
      setMsg((e as { message?: string })?.message || "Could not change the watchdog speed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 rounded-2xl bg-white p-4 shadow-sm">
      <p className="text-sm font-bold text-[#1b2430]">⏱ Watchdog Speed</p>
      <p className="text-xs text-[#5b6675]">
        The game backup timer. Lower = a stuck game is fixed sooner, but costs more. Higher = cheaper.
      </p>
      <div className="flex gap-2">
        {OPTIONS.map((m) => (
          <button
            key={m}
            type="button"
            disabled={busy}
            onClick={() => choose(m)}
            className={`flex-1 rounded-full px-3 py-2 text-sm font-bold ${
              current === m ? "bg-[#133552] text-white" : "bg-[#e7eff4] text-[#133552]"
            }`}
          >
            {m} min
          </button>
        ))}
      </div>
      {current === null && !msg && <p className="text-xs text-[#5b6675]">Loading…</p>}
      {msg && <p className="text-xs font-bold text-[#133552]">{msg}</p>}
    </div>
  );
}
