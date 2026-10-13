"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { doc, getDoc, serverTimestamp, updateDoc } from "firebase/firestore";
import { auth, db } from "../../lib/firebase";
import { canBeInvisible } from "../../lib/invisible";

// 🟢 Presence Status as a small popup (tap your status dot anywhere): tap a
// status and it is saved at once. Same choices and rules as the app — only
// the Founder, Admins and Staff see INVISIBLE.

const STATUSES: { id: string; label: string; hint: string; dot: string }[] = [
  { id: "ONLINE", label: "Online", hint: "Everyone sees you're here", dot: "#34C759" },
  { id: "BUSY", label: "Busy", hint: "Do not disturb", dot: "#FF3B30" },
  { id: "AWAY", label: "Away", hint: "Back soon", dot: "#FF9500" },
  { id: "INVISIBLE", label: "Invisible", hint: "Online, but hidden", dot: "#B0B8C4" },
  { id: "OFFLINE", label: "Offline", hint: "Shown as offline", dot: "#8E8E93" },
];

let open = false;
const subs = new Set<() => void>();
const setOpen = (v: boolean) => {
  open = v;
  subs.forEach((f) => f());
};
const subscribe = (f: () => void) => {
  subs.add(f);
  return () => subs.delete(f);
};

/** Opens the Presence Status popup. */
export const openPresencePopup = () => setOpen(true);

/** Drawn once per page (PageShell); shows the popup while it is open. */
export function PresencePopupHost({ onClosed }: { onClosed?: () => void } = {}) {
  const isOpen = useSyncExternalStore(subscribe, () => open, () => false);
  if (!isOpen) return null;
  return (
    <PresencePopup
      onClose={() => {
        setOpen(false);
        onClosed?.();
      }}
    />
  );
}

export function PresencePopup({ onClose }: { onClose: () => void }) {
  const [current, setCurrent] = useState<string | null>(null);
  const [canInvisible, setCanInvisible] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return setError("You are not signed in.");
    getDoc(doc(db, "users", uid))
      .then(async (d) => {
        const can = await canBeInvisible(uid, d.get("username"), d.get("role"));
        setCanInvisible(can);
        const saved = String(d.get("presenceStatus") || "ONLINE").trim().toUpperCase();
        setCurrent(saved === "INVISIBLE" && !can ? "ONLINE" : STATUSES.some((s) => s.id === saved) ? saved : "ONLINE");
      })
      .catch((e) => setError(e?.message || "Could not load your status."));
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const pick = async (id: string) => {
    const uid = auth.currentUser?.uid;
    if (!uid || saving) return;
    if (id === current) return onClose();
    setSaving(id);
    setError("");
    try {
      await updateDoc(doc(db, "users", uid), { presenceStatus: id, statusUpdatedAt: serverTimestamp() });
      setCurrent(id);
      setTimeout(onClose, 250);
    } catch (e: any) {
      setError(e?.message || "Could not save your status.");
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/35 p-4 backdrop-blur-[2px]" onClick={onClose}>
      <div
        role="dialog"
        aria-label="Presence Status"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[300px] overflow-hidden rounded-3xl bg-white shadow-2xl"
      >
        <div className="flex items-center px-4 pb-2 pt-4">
          <p className="flex-1 text-[15px] font-extrabold text-[#0B2A5B]">Presence Status</p>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-7 w-7 items-center justify-center rounded-full bg-[#F1F4F9] text-sm text-[#5B6B8C]">
            ✕
          </button>
        </div>
        <div className="px-2 pb-3">
          {STATUSES.filter((s) => s.id !== "INVISIBLE" || canInvisible).map((s) => {
            const on = current === s.id;
            return (
              <button
                key={s.id}
                type="button"
                disabled={current === null || !!saving}
                onClick={() => pick(s.id)}
                className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors ${on ? "bg-[#EEF5FF]" : "hover:bg-[#F6F8FB]"}`}
              >
                <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: s.dot, boxShadow: `0 0 0 3px ${s.dot}33` }} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-bold text-[#0B2A5B]">{s.label}</span>
                  <span className="block text-[11px] text-[#7A879E]">{s.hint}</span>
                </span>
                <span className="w-4 text-center text-[13px] font-bold text-[#2F80ED]">{saving === s.id ? "…" : on ? "✓" : ""}</span>
              </button>
            );
          })}
          {error && <p className="px-3 pt-1 text-[11px] text-[#B3261E]">{error}</p>}
        </div>
      </div>
    </div>
  );
}
