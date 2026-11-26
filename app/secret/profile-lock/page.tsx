"use client";

import { useEffect, useState } from "react";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "../../../lib/firebase";
import { useFounderPerms } from "../../../lib/founder";
import { FounderShell, card } from "../_Shell";

// 🔒 Profile Lock (miGlife only): app_settings/profile_lock { country }.
// ON → people can't change their country (a first-time choice is still allowed).
// The Firestore rules enforce it. Same as the app (ProfileLockTool).
export default function ProfileLockPage() {
  const f = useFounderPerms();
  const [country, setCountry] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; error: boolean } | null>(null);
  useEffect(() => {
    getDoc(doc(db, "app_settings", "profile_lock"))
      .then((d) => setCountry(d.get("country") === true))
      .catch(() => setCountry(false));
  }, []);
  const toggle = async () => {
    const v = !country;
    setBusy(true);
    setMsg(null);
    try {
      await setDoc(doc(db, "app_settings", "profile_lock"), { country: v, updatedAt: serverTimestamp() });
      setCountry(v);
      setMsg({ text: v ? "✅ Country locked" : "✅ Country unlocked", error: false });
    } catch (e: any) {
      setMsg({ text: e?.message || "Could not save.", error: true });
    }
    setBusy(false);
  };
  return (
    <FounderShell title="🔒 Profile Lock" allowed={f.can("profile_lock")} loaded={f.loaded}>
      <div className={`${card} space-y-3`}>
        <p className="text-[13px] text-[#45557A]">Stop people from changing parts of their profile. Staff can still change them.</p>
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[14.5px] font-bold text-[#1E3A6E]">🌍 Lock country</p>
            <p className="text-[11.5px] text-[#5B6B8C]">
              {country ? "ON — nobody can change their country (a first-time choice is still allowed)." : "OFF — people can change their country."}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={!!country}
            disabled={busy || country === null}
            onClick={toggle}
            className={`relative h-7 w-12 shrink-0 rounded-full transition ${country ? "bg-[#0E9F6E]" : "bg-[#CBD5E1]"} disabled:opacity-60`}
          >
            <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${country ? "left-[22px]" : "left-0.5"}`} />
          </button>
        </div>
        {msg && <p className={`text-[13px] font-bold ${msg.error ? "text-[#DC2626]" : "text-[#0E9F6E]"}`}>{msg.text}</p>}
      </div>
    </FounderShell>
  );
}
