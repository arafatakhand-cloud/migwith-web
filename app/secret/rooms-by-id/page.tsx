"use client";

import { useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "../../../lib/firebase";
import { useFounderPerms } from "../../../lib/founder";
import { FounderShell, card } from "../_Shell";

// 🏠 Rooms by ID (miGlife / a founder with Room info): type a MIG ID → every
// room that ID created, newest first (roomsByOwner). Same as the app (RoomsByOwnerTool).

type Room = { name: string; privacy: string; category: string; description: string; members: number; maxUsers: number; createdAt: number };
type Res = { ok: boolean; username: string; level: number; rooms: Room[]; counter: number };
const roomsByOwner = httpsCallable<{ username: string }, Res>(functions, "roomsByOwner");

export default function RoomsByIdPage() {
  const f = useFounderPerms();
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<Res | null>(null);
  const [err, setErr] = useState("");

  const check = async () => {
    const name = q.trim().replace(/^@/, "");
    if (!name || busy) return;
    setBusy(true);
    setErr("");
    setRes(null);
    try {
      setRes((await roomsByOwner({ username: name })).data);
    } catch (e) {
      const text = e instanceof Error ? e.message : "";
      setErr(text && !text.startsWith("internal") ? text : "Could not check. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <FounderShell title="🏠 Rooms by ID" allowed={f.can("room_info")} loaded={f.loaded}>
      <div className={`${card} space-y-3`}>
        <p className="text-xs text-[#5B6B8C]">Type a MIG ID and tap Check to see every room that ID created.</p>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            check();
          }}
        >
          <input
            value={q}
            onChange={(e) => setQ(e.target.value.slice(0, 40))}
            placeholder="MIG ID"
            className="min-w-0 flex-1 rounded-xl border border-[#D5DEEA] px-3 py-2.5 text-sm text-[#1E3A6E] outline-none focus:border-[#2563EB]"
          />
          <button type="submit" disabled={busy || !q.trim()} className="rounded-xl bg-[#1E63D6] px-4 text-sm font-black text-white disabled:opacity-50">
            {busy ? "…" : "CHECK"}
          </button>
        </form>
        {err && <p className="text-sm text-[#B91C1C]">{err}</p>}
      </div>
      {res && (
        <div className="mt-3 space-y-2.5">
          <div className={card}>
            <p className="text-[16px] font-extrabold text-[#1E3A6E]">
              @{res.username} · Lv.{res.level}
            </p>
            <p className="text-[12.5px] text-[#5B6B8C]">
              {res.rooms.length === 0
                ? "Has not created any room."
                : `Created ${res.rooms.length} room${res.rooms.length === 1 ? "" : "s"} · room counter ${res.counter}`}
            </p>
          </div>
          {res.rooms.map((r) => (
            <div key={r.name} className="flex items-center gap-2.5 rounded-2xl bg-white p-3 shadow-[0_3px_0_#B9CCE4]">
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[19px] ${r.privacy === "Public" ? "bg-[#E3F7EA]" : "bg-[#EDE6FF]"}`}>
                {r.privacy === "Public" ? "🌐" : "🔒"}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14.5px] font-bold text-[#1E3A6E]">{r.name}</span>
                <span className="block truncate text-[11.5px] text-[#5B6B8C]">
                  {[r.privacy || null, `👥 ${r.members}${r.maxUsers > 0 ? ` / ${r.maxUsers}` : ""}`, r.createdAt ? `📅 ${new Date(r.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}` : null]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
                {r.description && <span className="block truncate text-[11.5px] text-[#7A8AA8]">{r.description}</span>}
              </span>
            </div>
          ))}
        </div>
      )}
    </FounderShell>
  );
}
