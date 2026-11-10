"use client";

import { useEffect, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "../../lib/firebase";

// 🔁 Mentor renew request (same server function as the app): the mentor asks
// from 5 days before the end (or after it ended); miGlife renews 30 days or
// declines, from the alert or Secret › Mentor Renewals.

export type RenewRequest = {
  uid: string;
  username: string;
  note: string;
  status: "pending" | "approved" | "declined" | "cancelled" | string;
  reason: string;
  untilMs: number;
  newUntilMs: number;
  createdAtMs: number;
  decidedAtMs: number;
};
type Mine = {
  mentor: boolean;
  untilMs?: number;
  daysLeft?: number | null;
  remindDays?: number;
  canRequest?: boolean;
  request?: RenewRequest | null;
};

const call = httpsCallable<Record<string, unknown>, Record<string, unknown>>(functions, "mentorRenewRequest");
const errText = (e: unknown, fallback: string) => {
  const t = e instanceof Error ? e.message : "";
  return t && !t.startsWith("internal") ? t : fallback;
};
export const dhakaDate = (ms: number) =>
  ms ? new Date(ms).toLocaleDateString("en-GB", { timeZone: "Asia/Dhaka", day: "numeric", month: "short", year: "numeric" }) : "";
const dhakaTime = (ms: number) =>
  ms ? new Date(ms).toLocaleString("en-GB", { timeZone: "Asia/Dhaka", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "";

/** Mentor Dashboard: my term, and the "Request renewal" button. */
export function MentorTermCard() {
  const [mine, setMine] = useState<Mine | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const load = () =>
    call({ action: "mine" })
      .then((r) => setMine(r.data as Mine))
      .catch(() => setMine({ mentor: false }));
  useEffect(() => {
    load();
  }, []);
  if (!mine || !mine.mentor || !mine.untilMs) return null;

  const days = mine.daysLeft ?? 0;
  const ended = days <= 0;
  const req = mine.request;
  const pending = req?.status === "pending";
  const act = async (action: "send" | "cancel") => {
    if (busy) return;
    setBusy(true);
    setMsg("");
    try {
      await call(action === "send" ? { action, note: note.trim() } : { action });
      if (action === "send") setNote("");
      await load();
    } catch (e) {
      setMsg(errText(e, "Please try again."));
    } finally {
      setBusy(false);
    }
  };
  // the bar: days left out of the 30-day term
  const pct = Math.max(0, Math.min(100, (days / 30) * 100));

  return (
    <div className="mx-3 mb-3 mt-1 rounded-[20px] bg-gradient-to-br from-[#2B5FD9] to-[#1B2A5C] p-4 text-white shadow-lg">
      <p className="text-[11px] font-extrabold uppercase tracking-[1px] text-white/75">My Mentorship</p>
      <p className="mt-0.5 text-[22px] font-black leading-7">
        {ended ? "Ended" : days === 1 ? "1 day left" : `${days} days left`}
      </p>
      <p className="text-[12px] text-white/80">
        {ended ? "Ended" : "Ends"} {dhakaDate(mine.untilMs)}
      </p>
      <div className="my-2.5 h-[7px] overflow-hidden rounded-full bg-white/20">
        <span className="block h-full rounded-full bg-[#FFB020]" style={{ width: `${pct}%` }} />
      </div>

      {pending ? (
        <>
          <div className="rounded-xl border border-dashed border-white/50 bg-white/10 px-3 py-2.5 text-[13px]">
            ⏳ <b>Renewal request sent</b>
            <div className="text-[12px] text-white/75">{dhakaTime(req!.createdAtMs)} · waiting for miGlife</div>
            {req!.note && <div className="mt-1 text-[12px] text-white/85">📝 {req!.note}</div>}
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => act("cancel")}
            className="mt-2.5 w-full rounded-xl bg-white/15 py-2.5 text-[14px] font-extrabold disabled:opacity-50"
          >
            {busy ? "…" : "Cancel request"}
          </button>
        </>
      ) : mine.canRequest ? (
        <>
          {req?.status === "declined" && (
            <p className="mb-2 rounded-xl bg-white/10 px-3 py-2 text-[12.5px]">
              ✖ Your last request was declined{req.reason ? `: "${req.reason}"` : "."} You can send a new one.
            </p>
          )}
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={300}
            placeholder="✍️ Note for miGlife (optional) — e.g. bKash TrxID"
            className="w-full rounded-xl bg-white px-3 py-2.5 text-[13px] text-[#16264A] outline-none placeholder:text-[#8A97A8]"
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => act("send")}
            className="mt-2.5 w-full rounded-xl bg-[#FFD35A] py-2.5 text-[14px] font-extrabold text-[#5A3B00] disabled:opacity-50"
          >
            {busy ? "Sending…" : "🔁 Request renewal (30 days)"}
          </button>
        </>
      ) : (
        <p className="text-[12px] text-white/70">
          🔁 You can ask for a renewal from {mine.remindDays ?? 5} days before it ends.
        </p>
      )}
      {msg && <p className="mt-2 text-[12.5px] font-bold text-[#FFD1D1]">{msg}</p>}
    </div>
  );
}

// miGlife: the latest list, shared by every request card on a page.
let listPromise: Promise<RenewRequest[]> | null = null;
export function loadRenewRequests(fresh = false): Promise<RenewRequest[]> {
  if (!listPromise || fresh)
    listPromise = call({ action: "list" })
      .then((r) => ((r.data as { requests?: RenewRequest[] }).requests || []))
      .catch(() => {
        listPromise = null;
        return [];
      });
  return listPromise;
}

/** miGlife: ✅ Renew 30 days / ✖ Decline for one mentor's request. */
export function RenewDecider({ uid, onDone }: { uid: string; onDone?: () => void }) {
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState("");
  useEffect(() => {
    loadRenewRequests().then((list) => setStatus(list.find((r) => r.uid === uid)?.status || "pending"));
  }, [uid]);
  const decide = async (approve: boolean) => {
    if (busy) return;
    setBusy(true);
    setMsg("");
    try {
      const r = await call({ action: "decide", uid, approve, reason: reason.trim() });
      const d = r.data as { mentorUntil?: number };
      setStatus(approve ? "approved" : "declined");
      setMsg(approve ? `✅ Renewed — now runs until ${dhakaDate(d.mentorUntil || 0)}.` : "✖ Declined. The mentor was told.");
      loadRenewRequests(true);
      onDone?.();
    } catch (e) {
      setMsg(errText(e, "Please try again."));
    } finally {
      setBusy(false);
    }
  };
  if (status === null) return null;
  if (status !== "pending")
    return (
      <p className="mt-2 rounded-xl bg-[#F4F7FB] px-3 py-2 text-[12.5px] font-bold text-[#55658F]">
        {msg ||
          (status === "approved" ? "✅ Renewed" : status === "declined" ? "✖ Declined" : status === "cancelled" ? "The mentor cancelled this request." : status)}
      </p>
    );
  return (
    <div className="mt-2.5">
      {declining && (
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={200}
          placeholder="Reason (optional) — e.g. Payment not received yet"
          className="mb-2 w-full rounded-xl border border-[#D4DDEB] bg-white px-3 py-2 text-[13px] text-[#16264A] outline-none"
        />
      )}
      <div className="flex gap-2">
        {!declining && (
          <button
            type="button"
            disabled={busy}
            onClick={() => decide(true)}
            className="flex-1 rounded-xl bg-[#22C55E] py-2.5 text-[13.5px] font-extrabold text-white disabled:opacity-50"
          >
            {busy ? "…" : "✅ Renew 30 days"}
          </button>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() => (declining ? decide(false) : setDeclining(true))}
          className="flex-1 rounded-xl border border-[#F3C4C4] bg-white py-2.5 text-[13.5px] font-extrabold text-[#B91C1C] disabled:opacity-50"
        >
          {busy && declining ? "…" : declining ? "✖ Send decline" : "✖ Decline"}
        </button>
        {declining && (
          <button type="button" onClick={() => setDeclining(false)} className="rounded-xl bg-[#EEF2F7] px-3 text-[13px] font-bold text-[#5B6B8C]">
            Back
          </button>
        )}
      </div>
      {msg && <p className="mt-2 text-[12.5px] font-bold text-[#B91C1C]">{msg}</p>}
    </div>
  );
}
