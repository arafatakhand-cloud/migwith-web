"use client";

import { useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "../../../lib/firebase";
import { useFounderPerms } from "../../../lib/founder";
import { FounderShell, card, input } from "../_Shell";

// 📣 Support Mail (miGlife only): send one mail from "miGlife Support" to one member
// (by MIG ID) or to everyone who has a chosen role. It arrives in the Inbox and, if the
// member set a Recovery Email, a copy goes there too.

const sendSupportMail = httpsCallable<
  { target: "user" | "role"; username?: string; role?: string; subject: string; body: string },
  { ok: boolean; count: number }
>(functions, "sendSupportMail");

const ROLES: [string, string][] = [
  ["staff", "🪪 Staff"],
  ["admin", "🛡️ Admin"],
  ["mentor", "💼 Mentor"],
  ["merchant", "🏪 Merchant"],
  ["country_representative", "🌍 Country Representative"],
  ["executive_board", "🏅 Executive Board"],
  ["elite_user", "💠 Elite (Honor)"],
];

export default function SupportMailPage() {
  const f = useFounderPerms();
  const allowed = f.isMigwith;
  const [target, setTarget] = useState<"user" | "role">("role");
  const [role, setRole] = useState("staff");
  const [username, setUsername] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; error: boolean } | null>(null);

  const canSend =
    !busy && subject.trim().length > 0 && body.trim().length > 0 && (target === "role" ? !!role : username.trim().length > 0);

  const send = async () => {
    if (!canSend) return;
    if (!window.confirm("Send this mail now? It cannot be unsent.")) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await sendSupportMail({
        target,
        username: target === "user" ? username.trim() : undefined,
        role: target === "role" ? role : undefined,
        subject: subject.trim(),
        body: body.trim(),
      });
      setMsg({ text: `✅ Sent to ${r.data.count} member${r.data.count === 1 ? "" : "s"}.`, error: false });
      setSubject("");
      setBody("");
    } catch (e) {
      const text = e instanceof Error ? e.message : "";
      setMsg({ text: text && !text.startsWith("internal") ? text : "Could not send. Please try again.", error: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <FounderShell title="📣 Support Mail" allowed={allowed} loaded={f.loaded}>
      <div className={`${card} space-y-4`}>
        <p className="text-xs text-[#5B6B8C]">
          The mail comes from <b>miGlife Support</b>. Replies go to miGlife&apos;s inbox.
        </p>

        <div className="flex gap-2">
          {(["role", "user"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTarget(t)}
              aria-pressed={target === t}
              className={`flex-1 rounded-xl py-2 text-sm font-bold ${target === t ? "bg-[#2F80ED] text-white" : "bg-[#EEF3FB] text-[#1E3A6E]"}`}
            >
              {t === "role" ? "👥 Everyone with a role" : "👤 One member (MIG ID)"}
            </button>
          ))}
        </div>

        {target === "role" ? (
          <label className="block">
            <span className="text-sm font-bold">Role</span>
            <select value={role} onChange={(e) => setRole(e.target.value)} className={`${input} mt-1`}>
              {ROLES.map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label className="block">
            <span className="text-sm font-bold">MIG ID</span>
            <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="e.g. life" className={`${input} mt-1`} />
          </label>
        )}

        <label className="block">
          <span className="text-sm font-bold">Subject</span>
          <input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={120} className={`${input} mt-1`} />
        </label>

        <label className="block">
          <span className="text-sm font-bold">Message</span>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={5000}
            rows={8}
            className={`${input} mt-1 resize-y`}
          />
          <span className="mt-1 block text-right text-[11px] text-[#5B6B8C]">{body.length}/5000</span>
        </label>

        <p className="rounded-xl bg-[#F4F7FC] px-3 py-2 text-xs text-[#5B6B8C]">
          The Terms &amp; Conditions link and the miGlife Support signature are added automatically.
        </p>

        <button
          type="button"
          disabled={!canSend}
          onClick={send}
          className="w-full rounded-xl bg-gradient-to-r from-[#3F8EEA] to-[#174EA6] py-3 font-extrabold text-white disabled:opacity-40"
        >
          {busy ? "Sending…" : "📣 Send mail"}
        </button>

        {msg && <p className={`text-sm font-bold ${msg.error ? "text-[#B91C1C]" : "text-[#1F7A4A]"}`}>{msg.text}</p>}
      </div>
    </FounderShell>
  );
}
