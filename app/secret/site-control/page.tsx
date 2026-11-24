"use client";

import { useEffect, useState } from "react";
import { doc, getDoc, getDocs, collection, serverTimestamp, setDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../../../lib/firebase";
import { useFounderPerms } from "../../../lib/founder";
import { FounderShell, card, input } from "../_Shell";

// 🛠 Site control (miGlife only):
//  • Refresh everyone: every open page reloads once (new code, a clean start).
//  • Maintenance: everyone except miglife sees a maintenance screen.
//  • Stuck games: stop a room's running bot game; every entry is refunded (adminStopBot).
const stopBot = httpsCallable<{ roomId: string }, unknown>(functions, "adminStopBot");
const LUXURY_ROOM = "🎰 Luxury Bet";

type Stuck = { roomId: string; game: string };

export default function SiteControlPage() {
  const f = useFounderPerms();
  const [maintenance, setMaintenance] = useState(false);
  const [text, setText] = useState("");
  const [msg, setMsg] = useState<{ text: string; bad: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [stuck, setStuck] = useState<Stuck[] | null>(null);

  const loadAll = async () => {
    const ctl = await getDoc(doc(db, "app_settings", "site_control")).catch(() => null);
    if (ctl?.exists()) {
      setMaintenance(ctl.get("maintenance") === true);
      setText(String(ctl.get("maintenanceText") || ""));
    }
    const list: Stuck[] = [];
    const bots = await getDocs(collection(db, "room_bots")).catch(() => null);
    bots?.docs.forEach((d) => list.push({ roomId: d.id, game: String(d.get("bot") || "bot") }));
    const lux = await getDoc(doc(db, "room_game", LUXURY_ROOM)).catch(() => null);
    if (lux?.exists() && lux.get("botRunning") === true) list.push({ roomId: LUXURY_ROOM, game: "Luxury Bet" });
    setStuck(list);
  };
  useEffect(() => {
    if (f.isMigwith) void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f.isMigwith]);

  const saveControl = async (patch: Record<string, unknown>, ok: string) => {
    setBusy(true);
    setMsg(null);
    try {
      await setDoc(doc(db, "app_settings", "site_control"), { ...patch, updatedAt: serverTimestamp() }, { merge: true });
      setMsg({ text: ok, bad: false });
    } catch (e: any) {
      setMsg({ text: e?.message || "Could not save.", bad: true });
    } finally {
      setBusy(false);
    }
  };
  const refreshAll = () => saveControl({ refreshAt: Date.now() }, "✓ Every open page will reload once within a few seconds.");
  const saveMaintenance = () =>
    saveControl({ maintenance, maintenanceText: text.trim().slice(0, 200) }, maintenance ? "✓ Maintenance is ON for everyone except miglife." : "✓ Maintenance is OFF.");
  const stop = async (s: Stuck) => {
    setBusy(true);
    setMsg(null);
    try {
      await stopBot({ roomId: s.roomId });
      setMsg({ text: `✓ ${s.game} in ${s.roomId} stopped, every entry refunded.`, bad: false });
      await loadAll();
    } catch (e: any) {
      setMsg({ text: e?.message || "Could not stop it.", bad: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <FounderShell title="🛠 Site control" allowed={f.isMigwith} loaded={f.loaded}>
      <div className={`${card} space-y-3`}>
        <p className="font-extrabold">🔄 Refresh everyone</p>
        <p className="text-xs text-[#5B6B8C]">Every open page reloads once. Use it after a new version is published.</p>
        <button type="button" disabled={busy} onClick={refreshAll} className="w-full rounded-xl bg-[#2F80ED] py-2.5 text-sm font-bold text-white disabled:opacity-60">
          Refresh all open pages
        </button>
      </div>

      <div className={`${card} mt-4 space-y-3`}>
        <p className="font-extrabold">🚧 Maintenance</p>
        <label className="flex items-center gap-2 text-sm font-bold">
          <input type="checkbox" checked={maintenance} onChange={(e) => setMaintenance(e.target.checked)} />
          Maintenance on (everyone except miglife sees a maintenance screen)
        </label>
        <input className={input} value={text} onChange={(e) => setText(e.target.value)} placeholder="Message (optional)" maxLength={200} />
        <button type="button" disabled={busy} onClick={saveMaintenance} className="w-full rounded-xl bg-[#16264A] py-2.5 text-sm font-bold text-white disabled:opacity-60">
          Save maintenance setting
        </button>
      </div>

      <div className={`${card} mt-4 space-y-3`}>
        <div className="flex items-center justify-between">
          <p className="font-extrabold">🎲 Stuck game rooms</p>
          <button type="button" onClick={() => void loadAll()} className="rounded-lg bg-[#EEF3FA] px-2.5 py-1.5 text-xs font-bold text-[#174EA6]">↻</button>
        </div>
        {stuck === null ? (
          <p className="text-sm text-[#5B6B8C]">Loading…</p>
        ) : stuck.length === 0 ? (
          <p className="text-sm text-[#5B6B8C]">No game is running in any room.</p>
        ) : (
          <ul className="space-y-2">
            {stuck.map((s) => (
              <li key={s.roomId} className="flex items-center gap-2 rounded-xl border border-[#E3ECF7] bg-white p-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{s.roomId}</p>
                  <p className="text-xs text-[#5B6B8C]">{s.game} running</p>
                </div>
                <button type="button" disabled={busy} onClick={() => stop(s)} className="rounded-lg bg-[#E5484D] px-3 py-2 text-xs font-bold text-white disabled:opacity-60">
                  Stop & refund
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="text-[11px] text-[#5B6B8C]">Stopping refunds every entry in that game. Use it only when a game is stuck.</p>
      </div>

      {msg && <p className={`mt-4 rounded-xl px-3 py-2 text-sm font-bold ${msg.bad ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>{msg.text}</p>}
    </FounderShell>
  );
}
