"use client";

import { useEffect, useState } from "react";
import { collection, doc, getDocs, limit, onSnapshot, query, setDoc, where } from "firebase/firestore";
import { db } from "../../../lib/firebase";
import { useFounderPerms } from "../../../lib/founder";
import { OFFICIAL_COUNTRY_ROOMS, OFFICIAL_GAME_ROOMS, ROOM_PRESENCE_STALE_MS } from "../../../lib/rooms";
import { FounderShell, input } from "../_Shell";

// ℹ Room info (founder tool), like the app's RoomInfoPage: every room with its
// owner and capacity; change the owner or the capacity.

type Row = {
  name: string;
  docExists: boolean;
  category: string;
  ownerName: string | null;
  privacy: string;
  maxUsers: number;
  description: string;
  createdAtMs: number | null;
};

function LiveCount({ room }: { room: string }) {
  const [n, setN] = useState<number | null>(null);
  useEffect(() => {
    getDocs(collection(db, "room_presence", room, "users"))
      .then((snap) => {
        const cutoff = Date.now() - ROOM_PRESENCE_STALE_MS;
        setN(snap.docs.filter((d) => (d.get("lastSeen")?.toMillis?.() ?? 0) >= cutoff || Number(d.get("parkedUntil") || 0) > Date.now()).length);
      })
      .catch(() => setN(null));
  }, [room]);
  return <>{n ?? "…"}</>;
}

export default function RoomInfoPage() {
  const f = useFounderPerms();
  const [stored, setStored] = useState<Record<string, Row>>({});
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [dialog, setDialog] = useState<{ kind: "owner" | "capacity"; row: Row } | null>(null);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState("");

  useEffect(() => {
    if (!f.can("room_info")) return;
    return onSnapshot(collection(db, "rooms"), (snap) => {
      const out: Record<string, Row> = {};
      snap.docs.forEach((d) => {
        const name = String(d.get("name") || "").trim();
        if (!name) return;
        out[name] = {
          name,
          docExists: true,
          category: String(d.get("category") || "user"),
          ownerName: d.get("ownerName") ? String(d.get("ownerName")) : null,
          privacy: String(d.get("privacy") || "Public"),
          maxUsers: Number(d.get("maxUsers") ?? 50),
          description: String(d.get("description") || ""),
          createdAtMs: d.get("createdAt")?.toMillis?.() ?? null,
        };
      });
      setStored(out);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f.loaded]);

  const rows = Array.from(new Set([...OFFICIAL_COUNTRY_ROOMS, ...OFFICIAL_GAME_ROOMS, ...Object.keys(stored)]))
    .map(
      (name) =>
        stored[name] || { name, docExists: false, category: "official", ownerName: null, privacy: "Public", maxUsers: 50, description: "", createdAtMs: null }
    )
    .filter((r) => !search.trim() || r.name.toLowerCase().includes(search.trim().toLowerCase()) || (r.ownerName || "").toLowerCase().includes(search.trim().toLowerCase()))
    .sort((a, b) => Number(a.category !== "user") - Number(b.category !== "user") || a.name.toLowerCase().localeCompare(b.name.toLowerCase()));

  const save = async () => {
    if (!dialog) return;
    const row = dialog.row;
    setError("");
    if (dialog.kind === "owner") {
      const target = text.trim();
      if (!target) return setError("Type the new owner's username.");
      setSaving(true);
      try {
        let found = (await getDocs(query(collection(db, "users"), where("username", "==", target), limit(1)))).docs[0];
        if (!found && target !== target.toLowerCase())
          found = (await getDocs(query(collection(db, "users"), where("username", "==", target.toLowerCase()), limit(1)))).docs[0];
        if (!found) {
          setSaving(false);
          return setError(`No user named "${target}".`);
        }
        const newName = String(found.get("username") || target);
        await setDoc(
          doc(db, "rooms", row.name),
          { name: row.name, ownerUid: found.id, ownerName: newName, ...(row.docExists ? {} : { category: "official" }) },
          { merge: true }
        );
        setResult(`Owner of "${row.name}" is now ${newName}.`);
        setDialog(null);
      } catch {
        setError("Could not change the owner. Please try again.");
      } finally {
        setSaving(false);
      }
    } else {
      const value = Number(text);
      if (!Number.isInteger(value) || value < 1 || value > 10000) return setError("Enter a number from 1 to 10000.");
      setSaving(true);
      try {
        await setDoc(
          doc(db, "rooms", row.name),
          { name: row.name, maxUsers: value, capacityByLevel: false, ...(row.docExists ? {} : { category: "official" }) },
          { merge: true }
        );
        setResult(`Capacity of "${row.name}" is now ${value}.`);
        setDialog(null);
      } catch {
        setError("Could not save the capacity. Please try again.");
      } finally {
        setSaving(false);
      }
    }
  };

  return (
    <FounderShell title="ℹ Room Info" allowed={f.can("room_info")} loaded={f.loaded}>
      <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search room or owner" className={input} />
      {result && <p className="text-[13px] font-semibold text-[#2E7D32]">{result}</p>}
      {rows.map((r) => (
        <div key={r.name} className="cursor-pointer rounded-xl bg-white p-3.5 shadow-sm" onClick={() => setOpen(open === r.name ? null : r.name)}>
          <div className="flex items-center">
            <p className="flex-1 truncate text-[15px] font-bold" data-notranslate>
              {r.name}
            </p>
            <span className={`text-xs font-semibold ${r.privacy === "Private" ? "text-[#B3261E]" : "text-[#2E7D32]"}`}>{r.privacy}</span>
          </div>
          <p className="mt-1 text-[13px] text-[#40505F]">Owner: {r.ownerName || "System"}</p>
          <p className="text-[13px] text-[#40505F]">Capacity: {r.maxUsers}</p>
          {open === r.name && (
            <div className="mt-1.5 space-y-0.5 text-xs text-[#6C87B0]">
              <p>Type: {r.category}</p>
              <p>
                In the room now: <LiveCount room={r.name} />
              </p>
              {r.createdAtMs && <p>Created: {new Date(r.createdAtMs).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" })}</p>}
              {r.description && <p>Description: {r.description}</p>}
              <div className="flex gap-2 pt-2" onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  onClick={() => (setDialog({ kind: "owner", row: r }), setText(""), setError(""))}
                  className="flex-1 rounded-[10px] bg-[#16374F] py-2 text-[13px] text-white"
                >
                  Change owner
                </button>
                <button
                  type="button"
                  onClick={() => (setDialog({ kind: "capacity", row: r }), setText(""), setError(""))}
                  className="flex-1 rounded-[10px] bg-[#16374F] py-2 text-[13px] text-white"
                >
                  Capacity
                </button>
              </div>
            </div>
          )}
        </div>
      ))}

      {dialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" onClick={() => !saving && setDialog(null)}>
          <div className="w-full max-w-md space-y-2.5 rounded-3xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
            <p className="text-lg font-semibold">{dialog.kind === "owner" ? "Change owner" : "Room capacity"}</p>
            <p className="whitespace-pre-line text-[13px] text-[#40505F]">
              {dialog.row.name}
              {"\n"}
              {dialog.kind === "owner" ? `Current owner: ${dialog.row.ownerName || "System"}` : `Current capacity: ${dialog.row.maxUsers}`}
            </p>
            <input
              value={text}
              onChange={(e) => (setText(dialog.kind === "capacity" ? e.target.value.replace(/\D/g, "").slice(0, 5) : e.target.value), setError(""))}
              placeholder={dialog.kind === "owner" ? "New owner username" : "New capacity (1–10000)"}
              inputMode={dialog.kind === "capacity" ? "numeric" : undefined}
              className={input}
            />
            {dialog.kind === "capacity" && (
              <p className="text-[11px] text-[#7A8792]">A capacity set here stays as it is — it is no longer changed automatically when the owner levels up.</p>
            )}
            {error && <p className="text-[13px] text-[#B3261E]">{error}</p>}
            <div className="flex justify-end gap-3">
              <button type="button" disabled={saving} onClick={() => setDialog(null)} className="font-bold text-[#2F80ED]">
                Cancel
              </button>
              <button type="button" disabled={saving} onClick={save} className="rounded-full bg-[#2F80ED] px-5 py-2 font-bold text-white">
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </FounderShell>
  );
}
