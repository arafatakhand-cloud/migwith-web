"use client";

import { useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "../../../lib/firebase";
import { useFounderPerms } from "../../../lib/founder";
import { FounderShell, input } from "../_Shell";

// ✉ Change Recovery Email (founder tool), like the app: through ceoChangeUserEmail.

const ceoChangeUserEmail = httpsCallable<{ username: string; newEmail: string }, { username?: string; oldEmail?: string }>(
  functions,
  "ceoChangeUserEmail"
);

export default function ChangeEmailPage() {
  const f = useFounderPerms();
  const [migId, setMigId] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; error: boolean } | null>(null);

  const change = async () => {
    if (!migId) return setMsg({ text: "Enter the MIG ID.", error: true });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setMsg({ text: "Enter a valid email.", error: true });
    if (!window.confirm(`Change email?\n\nChange the recovery email of "${migId}" to ${email}? The ID keeps signing in with its MIG ID.`)) return;
    setBusy(true);
    setMsg(null);
    try {
      const { data } = await ceoChangeUserEmail({ username: migId, newEmail: email });
      setMsg({ text: `✓ ${data?.username || migId}: ${data?.oldEmail || "(none)"} → ${email}`, error: false });
      setMigId("");
      setEmail("");
    } catch (e: any) {
      setMsg({ text: e?.message || "Could not change the email.", error: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <FounderShell title="✉ Change Email" allowed={f.can("change_email")} loaded={f.loaded}>
      <div className="space-y-2.5 rounded-[18px] border border-[#E0A82E] bg-white p-4">
        <p className="text-lg font-extrabold">✉ Change Recovery Email</p>
        <p className="text-xs text-gray-500">
          Changes the real email saved for an ID (password-reset codes go there). The ID keeps signing in with its MIG ID and password.
        </p>
        <input value={migId} onChange={(e) => (setMigId(e.target.value.trim()), setMsg(null))} placeholder="MIG ID" disabled={busy} className={input} />
        <input
          value={email}
          onChange={(e) => (setEmail(e.target.value.trim()), setMsg(null))}
          placeholder="New recovery email"
          type="email"
          disabled={busy}
          className={input}
        />
        {msg && <p className={`text-[13px] font-bold ${msg.error ? "text-[#B3261E]" : "text-[#0A9F4A]"}`}>{msg.text}</p>}
        <button type="button" disabled={busy} onClick={change} className="w-full rounded-full bg-[#E0A82E] py-2.5 font-bold text-black">
          {busy ? "CHANGING..." : "CHANGE EMAIL"}
        </button>
      </div>
    </FounderShell>
  );
}
