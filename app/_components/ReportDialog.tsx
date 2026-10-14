"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "../../lib/firebase";

// 🚩 Report a user, a room line or a private message (Google Play's rule for
// chat apps). The server reads the real message itself and saves the report
// for the miGlife team (reports/{id}); see Reports in the side menu.

export type ReportTarget =
  | { kind: "user"; targetUsername: string }
  | { kind: "room_message"; targetUsername: string; roomId: string; messageId: string; preview?: string }
  | { kind: "private_message"; targetUsername: string; messageId: string; preview?: string }
  | { kind: "room"; roomId: string };

export const REPORT_REASONS: [string, string][] = [
  ["spam", "Spam or advertising"],
  ["harassment", "Bullying or harassment"],
  ["hate", "Hate speech"],
  ["sexual", "Sexual or nude content"],
  ["violence", "Violence or threats"],
  ["scam", "Scam, fraud or selling coins"],
  ["underage", "Under 18"],
  ["impersonation", "Pretending to be someone"],
  ["other", "Something else"],
];

const reportContent = httpsCallable<Record<string, string>, { ok: boolean }>(functions, "reportContent");

let current: ReportTarget | null = null;
const subs = new Set<() => void>();
const set = (t: ReportTarget | null) => {
  current = t;
  subs.forEach((f) => f());
};
const subscribe = (f: () => void) => {
  subs.add(f);
  return () => subs.delete(f);
};

/** Opens the Report dialog for this user / message / room. */
export const openReport = (t: ReportTarget) => set(t);

/** Drawn once per page (PageShell). */
export function ReportDialogHost() {
  const target = useSyncExternalStore(subscribe, () => current, () => null);
  if (!target) return null;
  return <ReportDialog target={target} onClose={() => set(null)} />;
}

function ReportDialog({ target, onClose }: { target: ReportTarget; onClose: () => void }) {
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  const what =
    target.kind === "user"
      ? target.targetUsername
      : target.kind === "room"
        ? `room ${target.roomId}`
        : `${target.targetUsername}'s message`;
  const preview = target.kind === "room_message" || target.kind === "private_message" ? target.preview : "";

  const send = async () => {
    if (!reason) return setError("Choose a reason.");
    setBusy(true);
    setError("");
    try {
      const { kind, ...rest } = target as ReportTarget & Record<string, string>;
      await reportContent({ ...rest, kind, reason, details: details.trim() });
      setDone(true);
    } catch (e: any) {
      setError(e?.message || "Could not send the report.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[96] flex items-end justify-center bg-black/45 p-2 pb-safe sm:items-center" onClick={() => !busy && onClose()}>
      <div role="dialog" aria-label="Report" onClick={(e) => e.stopPropagation()} className="w-full max-w-md overflow-hidden rounded-3xl bg-white text-[#0B2A5B] shadow-2xl">
        <div className="flex items-center gap-2 px-5 pb-1 pt-4">
          <p className="flex-1 text-lg font-black">🚩 Report {what}</p>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Close" className="flex h-8 w-8 items-center justify-center rounded-full bg-[#F1F4F9] text-[#5B6B8C]">
            ✕
          </button>
        </div>
        {done ? (
          <div className="space-y-3 px-5 pb-5">
            <p className="rounded-2xl bg-[#EAF8EF] px-4 py-3 text-sm font-semibold text-[#14713A]">
              ✓ Thank you. The miGlife team will check it. You can also block this person so you don&apos;t see their messages.
            </p>
            <button type="button" onClick={onClose} className="w-full rounded-xl bg-[#2F80ED] py-3 text-sm font-black text-white">
              OK
            </button>
          </div>
        ) : (
          <div className="space-y-3 px-5 pb-5">
            {preview && (
              <p className="line-clamp-3 rounded-xl bg-[#F4F7FB] px-3 py-2 text-[13px] italic text-[#41557A]" data-notranslate>
                “{preview}”
              </p>
            )}
            <p className="text-xs text-[#5B6B8C]">Why are you reporting this? Reports are private — the person won&apos;t know who sent it.</p>
            <div className="max-h-[42vh] space-y-1 overflow-y-auto">
              {REPORT_REASONS.map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setReason(id)}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold ${reason === id ? "bg-[#FDECEC] text-[#B3261E]" : "bg-[#F6F8FB] hover:bg-[#EEF2F8]"}`}
                >
                  <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${reason === id ? "border-[#D93025] bg-[#D93025]" : "border-[#C5D0E0]"}`}>
                    {reason === id && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                  </span>
                  {label}
                </button>
              ))}
            </div>
            <textarea
              value={details}
              onChange={(e) => setDetails(e.target.value.slice(0, 1000))}
              rows={2}
              placeholder="More details (optional)"
              className="w-full resize-none rounded-xl border border-[#D5E3F5] bg-[#F4F9FF] px-3 py-2 text-sm outline-none focus:border-[#2F80ED]"
            />
            {error && <p className="text-sm text-rose-600">{error}</p>}
            <button type="button" onClick={send} disabled={busy} className="w-full rounded-xl bg-[#D93025] py-3 text-sm font-black text-white disabled:opacity-50">
              {busy ? "Sending…" : "Send report"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
