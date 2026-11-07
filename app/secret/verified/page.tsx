"use client";

import { useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "../../../lib/firebase";
import { useFounderPerms } from "../../../lib/founder";
import { FounderShell, card, input } from "../_Shell";

// ✔ Verified badge (miGlife only). Turns the tick on or off for one member by MIG ID.
// Feed, profiles and the app read users/{username}.verified.

const setVerified = httpsCallable<{ username: string; verified: boolean }, { ok: boolean; username: string; verified: boolean }>(
  functions,
  "setVerified"
);
const syncAutoVerifiedAll = httpsCallable<Record<string, never>, { ok: boolean; count: number }>(functions, "syncAutoVerifiedAll");

export default function VerifiedPage() {
  const f = useFounderPerms();
  const allowed = f.isMigwith;
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; error: boolean } | null>(null);

  const catchUp = async () => {
    if (busy) return;
    if (!window.confirm("Give the ✔ tick to all staff, admin, country representatives, executive board and miGlife who do not have it yet?")) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await syncAutoVerifiedAll({});
      setMsg({ text: `✅ Done. ${r.data.count} member${r.data.count === 1 ? "" : "s"} got the tick.`, error: false });
    } catch (e) {
      const text = e instanceof Error ? e.message : "";
      setMsg({ text: text && !text.startsWith("internal") ? text : "Could not run the catch-up. Please try again.", error: true });
    } finally {
      setBusy(false);
    }
  };

  const change = async (on: boolean) => {
    const name = username.trim().replace(/^@/, "");
    if (!name || busy) return;
    if (!window.confirm(on ? `Give the ✔ verified tick to @${name}?` : `Remove the ✔ verified tick from @${name}?`)) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await setVerified({ username: name, verified: on });
      setMsg({ text: r.data.verified ? `✅ @${r.data.username} is now verified.` : `✅ Verified tick removed from @${r.data.username}.`, error: false });
    } catch (e) {
      const text = e instanceof Error ? e.message : "";
      setMsg({ text: text && !text.startsWith("internal") ? text : "Could not change verification. Please try again.", error: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <FounderShell title="✔ Verified" allowed={allowed} loaded={f.loaded}>
      <div className={`${card} space-y-4`}>
        <p className="text-xs text-[#5B6B8C]">
          Verify adds the ✔ tick next to a member&apos;s name on the Feed, profile and in the app. Remove takes it away.
        </p>

        <label className="block">
          <span className="text-sm font-bold">MIG ID</span>
          <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="e.g. life" className={`${input} mt-1`} />
        </label>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => change(true)}
            disabled={busy || !username.trim()}
            className="flex-1 rounded-xl bg-[#2E7D32] py-3 text-sm font-bold text-white disabled:opacity-50"
          >
            {busy ? "Saving…" : "✔ Verify"}
          </button>
          <button
            type="button"
            onClick={() => change(false)}
            disabled={busy || !username.trim()}
            className="flex-1 rounded-xl bg-[#B91C1C] py-3 text-sm font-bold text-white disabled:opacity-50"
          >
            Remove
          </button>
        </div>

        <div className="space-y-2 rounded-xl bg-[#EEF3FB] p-3">
          <p className="text-xs text-[#5B6B8C]">
            Staff, admin, country representatives and executive board get the tick automatically. Press once to give it to people who already hold these roles.
          </p>
          <button type="button" onClick={catchUp} disabled={busy} className="w-full rounded-xl bg-[#1D9BF0] py-2.5 text-sm font-bold text-white disabled:opacity-50">
            ✔ Auto-verify all roles
          </button>
        </div>

        {msg && <p className={`text-sm ${msg.error ? "text-[#B91C1C]" : "text-[#2E7D32]"}`}>{msg.text}</p>}
      </div>
    </FounderShell>
  );
}
