"use client";

import { useEffect, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { collection, getDocs, limit, query } from "firebase/firestore";
import { db, functions } from "../../../lib/firebase";
import { useFounderPerms } from "../../../lib/founder";
import { FounderShell } from "../_Shell";

// 🪑 Always in Room (miglife only): seat any ID in rooms — it shows in
// "Currently in this room" and 🟢 Online for friends, without logging in.
// "has entered" once when seated, "has left" when removed / when the time ends.

type Seat = { uid: string; username: string; rooms: string[]; untilMs: number };
const call = httpsCallable<Record<string, unknown>, { ok?: boolean; seats?: Seat[] }>(functions, "ceoAlwaysInRoom");
const QUICK = ["Bangladesh", "Pakistan", "India", "Nepal", "🎰 Luxury Bet"];
const HOW_LONG: [number, string][] = [[0, "♾️ Always"], [1, "1 day"], [7, "7 days"], [30, "30 days"]];

function leftLabel(untilMs: number): string {
  if (!untilMs) return "♾️ Always";
  const d = Math.ceil((untilMs - Date.now()) / 86400000);
  return d <= 1 ? "ends today" : `${d} days left`;
}

export default function AlwaysInRoomPage() {
  const f = useFounderPerms();
  const [seats, setSeats] = useState<Seat[]>([]);
  const [name, setName] = useState("");
  const [rooms, setRooms] = useState<string[]>([]);
  const [days, setDays] = useState(0);
  const [allRooms, setAllRooms] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  const load = () =>
    call({ action: "list" })
      .then(({ data }) => setSeats(data.seats || []))
      .catch((e) => setStatus(e?.message || "Could not load."));
  useEffect(() => {
    if (!f.isMigwith) return;
    void load();
    getDocs(query(collection(db, "rooms"), limit(400)))
      .then((s) => setAllRooms(s.docs.map((d) => d.id).sort((a, b) => a.localeCompare(b))))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f.loaded]);

  const toggle = (r: string) => setRooms((x) => (x.includes(r) ? x.filter((y) => y !== r) : [...x, r]));
  const found = q.trim() ? allRooms.filter((r) => r.toLowerCase().includes(q.trim().toLowerCase()) && !QUICK.includes(r)).slice(0, 8) : [];

  const add = async () => {
    setStatus("");
    if (!name.trim()) return setStatus("Write a MIG ID.");
    if (!rooms.length) return setStatus("Pick at least one room.");
    setBusy(true);
    try {
      await call({ action: "add", username: name.trim(), rooms, days });
      setStatus(`✅ ${name.trim()} is now in ${rooms.join(", ")}.`);
      setName("");
      setRooms([]);
      await load();
    } catch (e: any) {
      setStatus(e?.message || "Could not seat this ID.");
    } finally {
      setBusy(false);
    }
  };
  const remove = async (s: Seat) => {
    if (!confirm(`Remove ${s.username} from ${s.rooms.join(", ")}? Each room will show "has left".`)) return;
    setBusy(true);
    try {
      await call({ action: "remove", uid: s.uid });
      await load();
    } catch (e: any) {
      setStatus(e?.message || "Could not remove.");
    } finally {
      setBusy(false);
    }
  };

  const chip = (on: boolean) => `rounded-full px-3 py-1.5 text-[12.5px] font-bold ${on ? "bg-gradient-to-r from-[#14B8A6] to-[#0EA5E9] text-white" : "bg-[#F1F5F9] text-[#334155]"}`;

  return (
    <FounderShell title="🪑 Always in Room" allowed={f.isMigwith} loaded={f.loaded}>
      <div className="space-y-2 rounded-2xl bg-white p-3.5">
        <p className="text-[15px] font-extrabold">➕ Seat an ID</p>
        <p className="text-[11px] font-extrabold tracking-wide text-[#64748b]">MIG ID</p>
        <input value={name} onChange={(e) => setName(e.target.value.trim().slice(0, 30))} placeholder="e.g. rafi99" className="w-full rounded-xl border border-[#CBD5E1] px-3 py-2.5 text-sm outline-none" />
        <p className="text-[11px] font-extrabold tracking-wide text-[#64748b]">ROOMS</p>
        <div className="flex flex-wrap gap-2">
          {[...QUICK, ...rooms.filter((r) => !QUICK.includes(r))].map((r) => (
            <button key={r} type="button" onClick={() => toggle(r)} className={chip(rooms.includes(r))}>
              {r}
              {rooms.includes(r) ? " ✓" : ""}
            </button>
          ))}
        </div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 Find another room…" className="w-full rounded-xl border border-[#E2E8F0] px-3 py-2 text-sm outline-none" />
        {found.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {found.map((r) => (
              <button key={r} type="button" onClick={() => (toggle(r), setQ(""))} className={chip(rooms.includes(r))}>
                {r}
              </button>
            ))}
          </div>
        )}
        <p className="text-[11px] font-extrabold tracking-wide text-[#64748b]">HOW LONG</p>
        <div className="flex flex-wrap gap-2">
          {HOW_LONG.map(([d, label]) => (
            <button key={d} type="button" onClick={() => setDays(d)} className={chip(days === d)}>
              {label}
            </button>
          ))}
        </div>
        <button type="button" disabled={busy} onClick={add} className="mt-1 w-full rounded-xl bg-gradient-to-r from-[#8B5CF6] to-[#EC4899] py-3 text-sm font-extrabold text-white shadow disabled:opacity-60">
          {busy ? "Please wait…" : "🪑 Seat in the room"}
        </button>
        {status && <p className="text-xs text-[#475569]">{status}</p>}
      </div>

      <div className="rounded-2xl bg-white p-3.5">
        <p className="text-[15px] font-extrabold">Seated now</p>
        {seats.length === 0 && <p className="py-3 text-sm text-[#64748b]">Nobody yet.</p>}
        {seats.map((s) => (
          <div key={s.uid} className="flex items-center gap-2.5 border-t border-[#EEF2F7] py-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#60A5FA] to-[#A78BFA] font-extrabold text-white">
              {(s.username[0] || "?").toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold">
                {s.username} <span className="text-[11px] font-semibold text-[#16a34a]">● Online</span>
              </p>
              <p className="truncate text-xs text-[#64748b]">
                {s.rooms.join(", ")} · {leftLabel(s.untilMs)}
              </p>
            </div>
            <button type="button" disabled={busy} onClick={() => remove(s)} className="rounded-full bg-[#FEE2E2] px-3 py-1 text-xs font-extrabold text-[#DC2626]">
              Remove
            </button>
          </div>
        ))}
      </div>
    </FounderShell>
  );
}
