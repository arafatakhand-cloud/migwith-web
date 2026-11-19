"use client";

import { useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "../../../lib/firebase";
import { useFounderPerms } from "../../../lib/founder";
import { FounderShell, card } from "../_Shell";

// 🔒 Public Profiles (miGlife only): copy every account's public data
// (no balance, no private fields) into profiles/{uid}. Run once after deploying
// profileMirror; after that it stays in step by itself.
const backfillProfiles = httpsCallable<Record<string, never>, { ok: boolean; copied: number }>(functions, "backfillProfiles");

export default function PublicProfilesPage() {
  const f = useFounderPerms();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; error: boolean } | null>(null);
  const run = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const r = (await backfillProfiles({})).data;
      setMsg({ text: `✅ Copied ${r.copied.toLocaleString()} profiles.`, error: false });
    } catch (e: any) {
      setMsg({ text: e?.message || "Could not copy. Please try again.", error: true });
    }
    setBusy(false);
  };
  return (
    <FounderShell title="🔒 Public Profiles" allowed={f.isMigwith} loaded={f.loaded}>
      <div className={`${card} space-y-3`}>
        <p className="text-[13px] text-[#45557A]">
          Everyone now sees other people&apos;s profiles from a public copy without the coin balance and private data. Press this once after
          deploying, so the copy has every account. New changes are copied by themselves.
        </p>
        <button type="button" disabled={busy} onClick={run} className="w-full rounded-xl bg-[#0B1F3A] py-3 text-[14px] font-bold text-white disabled:opacity-60">
          {busy ? "Copying… (can take a few minutes)" : "Copy all profiles now"}
        </button>
        {msg && <p className={`text-[13px] font-bold ${msg.error ? "text-[#DC2626]" : "text-[#0E9F6E]"}`}>{msg.text}</p>}
      </div>
    </FounderShell>
  );
}
