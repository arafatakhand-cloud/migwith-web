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
const vercel = httpsCallable<{ action: "list" | "redeploy" | "rollback"; deploymentId?: string }, any>(functions, "founderVercel");
type Deploy = { id: string; url: string; state: string; created: number; message: string };
const LUXURY_ROOM = "🎰 Luxury Bet";
// ⏱ call time limits (minutes a day / a month; 0 = no limit)
const callLimits = httpsCallable<Record<string, unknown>, any>(functions, "callLimits");
type LimitUser = { username: string; dayMin: number; monthMin: number };

type Stuck = { roomId: string; game: string };

export default function SiteControlPage() {
  const f = useFounderPerms();
  const [maintenance, setMaintenance] = useState(false);
  const [callsOff, setCallsOff] = useState(false);
  const [defDay, setDefDay] = useState("0");
  const [defMonth, setDefMonth] = useState("0");
  const [limUsers, setLimUsers] = useState<LimitUser[] | null>(null);
  const [lu, setLu] = useState({ username: "", day: "", month: "" });
  const loadLimits = async () => {
    try {
      const r = await callLimits({ action: "get" });
      setDefDay(String(r.data.dayMin || 0));
      setDefMonth(String(r.data.monthMin || 0));
      setLimUsers(r.data.users || []);
    } catch (e: any) {
      setLimUsers([]);
      setMsg({ text: e?.message || "Could not load call limits.", bad: true });
    }
  };
  const limitAct = async (data: Record<string, unknown>, ok: string) => {
    setBusy(true);
    setMsg(null);
    try {
      await callLimits(data);
      setMsg({ text: ok, bad: false });
      await loadLimits();
    } catch (e: any) {
      setMsg({ text: e?.message || "Could not save.", bad: true });
    } finally {
      setBusy(false);
    }
  };
  const [text, setText] = useState("");
  const [msg, setMsg] = useState<{ text: string; bad: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [stuck, setStuck] = useState<Stuck[] | null>(null);
  const [deploys, setDeploys] = useState<Deploy[] | null>(null);
  const [vBusy, setVBusy] = useState(false);
  const loadDeploys = async () => {
    try {
      const r = await vercel({ action: "list" });
      setDeploys(r.data.deployments || []);
    } catch (e: any) {
      setDeploys([]);
      setMsg({ text: e?.message || "Could not load Vercel deployments.", bad: true });
    }
  };
  const vercelAct = async (action: "redeploy" | "rollback", d: Deploy) => {
    const ask = action === "redeploy"
      ? "Redeploy the live website now? It rebuilds and goes live again."
      : `Roll the website back to ${d.created ? new Date(d.created).toLocaleString() : d.url}?`;
    if (!window.confirm(ask)) return;
    setVBusy(true);
    setMsg(null);
    try {
      await vercel({ action, deploymentId: d.id });
      setMsg({ text: action === "redeploy" ? "✓ Redeploy started. It goes live in a few minutes." : "✓ Website rolled back.", bad: false });
      await loadDeploys();
    } catch (e: any) {
      setMsg({ text: e?.message || "Vercel did not accept it.", bad: true });
    } finally {
      setVBusy(false);
    }
  };

  const loadAll = async () => {
    const ctl = await getDoc(doc(db, "app_settings", "site_control")).catch(() => null);
    if (ctl?.exists()) {
      setMaintenance(ctl.get("maintenance") === true);
      setCallsOff(ctl.get("callsOff") === true);
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
    if (f.isMigwith) {
      void loadAll();
      void loadDeploys();
      void loadLimits();
    }
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

      <div id="calls" className={`${card} mt-4 space-y-3`}>
        <p className="font-extrabold">📞 Audio calls</p>
        <p className="text-xs text-[#5B6B8C]">Off: the 📞 button disappears from every private chat (web and app) and nobody can start a call. miglife can still call (to test).</p>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            const next = !callsOff;
            setCallsOff(next);
            void saveControl({ callsOff: next }, next ? "✓ Audio calls are OFF for everyone." : "✓ Audio calls are ON.");
          }}
          className={`flex w-full items-center justify-between rounded-xl px-4 py-3 text-sm font-bold disabled:opacity-60 ${callsOff ? "bg-[#FEE2E2] text-[#B91C1C]" : "bg-[#DCFCE7] text-[#15803D]"}`}
        >
          <span>{callsOff ? "Calls are OFF" : "Calls are ON"}</span>
          <span className={`relative h-[26px] w-[46px] rounded-full ${callsOff ? "bg-[#CBD5E1]" : "bg-[#22C55E]"}`}>
            <span className={`absolute top-[3px] h-5 w-5 rounded-full bg-white transition-all ${callsOff ? "left-[3px]" : "left-[23px]"}`} />
          </span>
        </button>
      </div>

      <div id="call-limits" className={`${card} mt-4 space-y-3`}>
        <p className="font-extrabold">⏱ Call limits</p>
        <p className="text-xs text-[#5B6B8C]">How many minutes a person may talk on calls (Bangladesh time). 0 = no limit. A call ends by itself when the smaller of the two friends&apos; time left is over. miglife has no limit.</p>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs font-bold text-[#5B6B8C]">Everyone — minutes a day
            <input className={input} inputMode="numeric" value={defDay} onChange={(e) => setDefDay(e.target.value.replace(/\D/g, ""))} />
          </label>
          <label className="text-xs font-bold text-[#5B6B8C]">Everyone — minutes a month
            <input className={input} inputMode="numeric" value={defMonth} onChange={(e) => setDefMonth(e.target.value.replace(/\D/g, ""))} />
          </label>
        </div>
        <button type="button" disabled={busy} onClick={() => void limitAct({ action: "setDefault", dayMin: Number(defDay || 0), monthMin: Number(defMonth || 0) }, "✓ Call limits for everyone saved.")} className="w-full rounded-xl bg-[#1D4ED8] py-2.5 text-sm font-bold text-white disabled:opacity-60">
          Save for everyone
        </button>
        <div className="border-t border-[#E3ECF7] pt-3">
          <p className="text-sm font-extrabold">One member&apos;s own limit</p>
          <div className="mt-2 grid grid-cols-3 gap-2">
            <input className={input} placeholder="MIG ID" value={lu.username} onChange={(e) => setLu({ ...lu, username: e.target.value })} />
            <input className={input} placeholder="Min / day" inputMode="numeric" value={lu.day} onChange={(e) => setLu({ ...lu, day: e.target.value.replace(/\D/g, "") })} />
            <input className={input} placeholder="Min / month" inputMode="numeric" value={lu.month} onChange={(e) => setLu({ ...lu, month: e.target.value.replace(/\D/g, "") })} />
          </div>
          <button type="button" disabled={busy || !lu.username.trim()} onClick={() => void limitAct({ action: "setUser", username: lu.username.trim(), dayMin: Number(lu.day || 0), monthMin: Number(lu.month || 0) }, `✓ ${lu.username.trim()}'s call limit saved.`).then(() => setLu({ username: "", day: "", month: "" }))} className="mt-2 w-full rounded-xl bg-[#16264A] py-2.5 text-sm font-bold text-white disabled:opacity-60">
            Save for this member
          </button>
          {limUsers && limUsers.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {limUsers.map((u) => (
                <li key={u.username} className="flex items-center gap-2 rounded-xl border border-[#E3ECF7] bg-white px-3 py-2 text-sm">
                  <span className="min-w-0 flex-1 truncate font-bold">{u.username}</span>
                  <span className="text-xs text-[#5B6B8C]">{u.dayMin || "∞"} / day · {u.monthMin || "∞"} / month</span>
                  <button type="button" disabled={busy} onClick={() => void limitAct({ action: "clearUser", username: u.username }, `✓ ${u.username} now follows the limit for everyone.`)} className="rounded-lg bg-[#FEE2E2] px-2 py-1 text-xs font-bold text-[#B91C1C]">Remove</button>
                </li>
              ))}
            </ul>
          )}
        </div>
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

      <div className={`${card} mt-4 space-y-3`}>
        <div className="flex items-center justify-between">
          <p className="font-extrabold">🌐 Website (Vercel)</p>
          <button type="button" onClick={() => void loadDeploys()} className="rounded-lg bg-[#EEF3FA] px-2.5 py-1.5 text-xs font-bold text-[#174EA6]">↻</button>
        </div>
        <p className="text-xs text-[#5B6B86]">If the site is slow or stuck: Redeploy the live version, or roll back to an earlier good one.</p>
        {deploys === null ? (
          <p className="text-sm text-[#5B6B86]">Loading…</p>
        ) : deploys.length === 0 ? (
          <p className="text-sm text-[#5B6B86]">No deployments found (check the VERCEL_TOKEN setting).</p>
        ) : (
          <ul className="space-y-2">
            {deploys.map((d, i) => (
              <li key={d.id} className="flex items-center gap-2 rounded-xl border border-[#E3ECF7] bg-white p-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold">
                    {i === 0 ? "● Live now" : d.state === "READY" ? "Earlier" : d.state} · {d.created ? new Date(d.created).toLocaleString() : ""}
                  </p>
                  <p className="truncate text-[11px] text-[#5B6B86]">{d.message || d.url}</p>
                </div>
                {i === 0 ? (
                  <button type="button" disabled={vBusy} onClick={() => vercelAct("redeploy", d)} className="rounded-lg bg-[#2F80ED] px-3 py-2 text-xs font-bold text-white disabled:opacity-60">
                    Redeploy
                  </button>
                ) : d.state === "READY" ? (
                  <button type="button" disabled={vBusy} onClick={() => vercelAct("rollback", d)} className="rounded-lg bg-[#16264A] px-3 py-2 text-xs font-bold text-white disabled:opacity-60">
                    Roll back here
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      {msg && <p className={`mt-4 rounded-xl px-3 py-2 text-sm font-bold ${msg.bad ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>{msg.text}</p>}
    </FounderShell>
  );
}
