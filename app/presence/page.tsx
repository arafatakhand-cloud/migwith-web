"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { doc, getDoc, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useSession } from "../_components/AppSession";
import { useRequireLogin } from "../../lib/useRequireLogin";
import { PageShell } from "../_components/PageShell";
import { PageTitle } from "../_components/LightCards";

// Presence Status, like the app's (tap the status dot on Home).

const STATUSES: [string, string][] = [
  ["ONLINE", "🟢"],
  ["BUSY", "🔴"],
  ["AWAY", "🟠"],
  ["INVISIBLE", "⚪"],
  ["OFFLINE", "⚪"],
];

export default function PresencePage() {
  const ready = useRequireLogin();
  const router = useRouter();
  const { user } = useSession();
  const [selected, setSelected] = useState("ONLINE");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!ready || !user) return;
    getDoc(doc(db, "users", user.uid))
      .then((d) => {
        const saved = String(d.get("presenceStatus") || "ONLINE").trim().toUpperCase();
        setSelected(STATUSES.some(([s]) => s === saved) ? saved : "ONLINE");
      })
      .catch((e) => setError(e?.message || "Could not load presence status."))
      .finally(() => setLoading(false));
  }, [ready, user]);

  const save = async () => {
    if (!user) return setError("You are not signed in.");
    setSaving(true);
    setError("");
    try {
      await updateDoc(doc(db, "users", user.uid), { presenceStatus: selected, statusUpdatedAt: serverTimestamp() });
      router.back();
    } catch (e: any) {
      setError(e?.message || "Could not save presence status.");
      setSaving(false);
    }
  };

  return (
    <PageShell light>
      <section className="mx-auto max-w-md px-3 pb-8 sm:px-6">
        <PageTitle title="Presence Status" />
        <p className="text-[13px] text-[#5B6B8C]">Choose how your presence appears to other users.</p>
        <div className="mt-3.5 space-y-2">
          {STATUSES.map(([status, icon]) => (
            <button
              key={status}
              type="button"
              disabled={loading || saving}
              onClick={() => {
                setSelected(status);
                setError("");
              }}
              className={`flex w-full items-center gap-3 rounded-2xl border bg-white p-3.5 text-left ${
                selected === status ? "border-[#D4AF37]" : "border-[#E0E5EE]"
              }`}
            >
              <span className="text-2xl">{icon}</span>
              <span className="flex-1 font-bold text-[#0B2A5B]">{status}</span>
              <span className="text-xl text-[#D4AF37]">{selected === status ? "✓" : ""}</span>
            </button>
          ))}
        </div>
        {error && <p className="mt-2 text-xs text-[#B3261E]">{error}</p>}
        <button
          type="button"
          onClick={save}
          disabled={loading || saving}
          className="mt-3 w-full rounded-full bg-[#2F80ED] py-3 text-sm font-bold text-white disabled:opacity-50"
        >
          {saving ? "Saving…" : "SAVE"}
        </button>
      </section>
    </PageShell>
  );
}
