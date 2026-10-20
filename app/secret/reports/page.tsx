"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { httpsCallable } from "firebase/functions";
import { functions } from "../../../lib/firebase";
import { useFounderPerms } from "../../../lib/founder";
import { REPORT_REASONS } from "../../_components/ReportDialog";
import { ImageViewerHost, openImageViewer } from "../../_components/ImageViewer";
import { FounderShell, card, input } from "../_Shell";
import { RefreshButton } from "../../_components/RefreshButton";

// 🚩 Reports — what users reported (profiles, room lines, private messages).
// miglife, or a founder given the "Reports" tool. Handle each one: open the
// profile / room, act (mute, kick, ban…), then Resolve, or Dismiss it.

type Report = {
  id: string;
  kind: string;
  reason: string;
  details: string;
  targetUsername: string;
  roomId: string;
  messageText: string;
  imageUrl: string;
  reporterUsername: string;
  status: string;
  note: string;
  handledBy: string;
  createdAt: number;
  handledAt: number;
};

const moderationReports = httpsCallable<Record<string, string>, { reports?: Report[]; ok?: boolean }>(functions, "moderationReports");

const KIND_LABEL: Record<string, string> = {
  user: "👤 Profile",
  room_message: "💬 Room message",
  private_message: "✉️ Private message",
  room: "🏠 Room",
};
const reasonLabel = (r: string) => REPORT_REASONS.find(([id]) => id === r)?.[1] || r;
const when = (ms: number) =>
  ms ? new Date(ms).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Dhaka" }) : "";

export default function ReportsPage() {
  const f = useFounderPerms();
  const allowed = f.can("reports");
  const [tab, setTab] = useState<"open" | "closed">("open");
  const [list, setList] = useState<Report[] | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState("");
  const [notes, setNotes] = useState<Record<string, string>>({});

  const load = useCallback(() => {
    setList(null);
    moderationReports({ action: "list", status: tab })
      .then((r) => setList(r.data.reports || []))
      .catch((e) => {
        setList([]);
        setMsg(e?.message || "Could not load reports.");
      });
  }, [tab]);

  useEffect(() => {
    if (allowed) load();
  }, [allowed, load]);

  const act = async (r: Report, action: "resolve" | "dismiss") => {
    setBusy(r.id);
    setMsg("");
    try {
      await moderationReports({ action, id: r.id, note: notes[r.id] || "" });
      setList((l) => (l || []).filter((x) => x.id !== r.id));
      setMsg(action === "resolve" ? "✓ Marked as handled." : "Dismissed.");
    } catch (e: any) {
      setMsg(e?.message || "Could not save.");
    } finally {
      setBusy("");
    }
  };

  return (
    <FounderShell title="🚩 Reports" allowed={allowed} loaded={f.loaded}>
      <ImageViewerHost />
      <div className="flex gap-2">
        {(["open", "closed"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`flex-1 rounded-xl py-2 text-sm font-bold ${tab === t ? "bg-[#174EA6] text-white" : "bg-white text-[#35507E] shadow-sm"}`}
          >
            {t === "open" ? "Open" : "Handled"}
          </button>
        ))}
        <RefreshButton onClick={load} className="rounded-xl bg-white px-3 text-sm font-bold text-[#35507E] shadow-sm" />
      </div>
      <p className="text-xs text-[#5B6B8C]">Check each report within 24 hours. Act in the room or on the profile (mute, kick, ban, delete), then mark it handled.</p>
      {msg && <p className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-[#174EA6] shadow-sm">{msg}</p>}
      {list === null ? (
        <p className="py-8 text-center text-sm text-[#5B6B8C]">Loading…</p>
      ) : list.length === 0 ? (
        <p className="py-8 text-center text-sm text-[#5B6B8C]">{tab === "open" ? "No open reports. 🎉" : "Nothing handled yet."}</p>
      ) : (
        list.map((r) => (
          <div key={r.id} className={`${card} space-y-2`}>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-full bg-[#FDECEC] px-2.5 py-0.5 font-bold text-[#B3261E]">{reasonLabel(r.reason)}</span>
              <span className="rounded-full bg-[#EEF3FA] px-2.5 py-0.5 font-semibold text-[#35507E]">{KIND_LABEL[r.kind] || r.kind}</span>
              <span className="ml-auto text-[#8A97A8]">{when(r.createdAt)}</span>
            </div>
            <p className="text-sm" data-notranslate>
              {r.targetUsername ? (
                <>
                  Reported:{" "}
                  <Link href={`/profile/${encodeURIComponent(r.targetUsername)}`} className="font-bold text-[#174EA6] underline">
                    {r.targetUsername}
                  </Link>
                </>
              ) : null}
              {r.roomId && (
                <>
                  {" "}· Room{" "}
                  <Link href={`/room/${encodeURIComponent(r.roomId)}`} className="font-bold text-[#174EA6] underline">
                    {r.roomId}
                  </Link>
                </>
              )}
              <span className="text-[#8A97A8]"> · by {r.reporterUsername}</span>
            </p>
            {r.messageText && (
              <p className="whitespace-pre-wrap break-words rounded-xl bg-[#F4F7FB] px-3 py-2 text-sm text-[#2A3B5C]" data-notranslate>
                “{r.messageText}”
              </p>
            )}
            {r.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={r.imageUrl} alt="Reported photo" onClick={() => openImageViewer(r.imageUrl)} className="max-h-48 cursor-zoom-in rounded-xl" />
            )}
            {r.details && <p className="text-sm text-[#41557A]">Note from reporter: {r.details}</p>}
            {tab === "open" ? (
              <>
                <input
                  value={notes[r.id] || ""}
                  onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))}
                  placeholder="What did you do? (e.g. banned 7 days)"
                  className={input}
                />
                <div className="flex gap-2">
                  <button type="button" disabled={busy === r.id} onClick={() => act(r, "resolve")} className="flex-1 rounded-xl bg-[#1E8E3E] py-2.5 text-sm font-black text-white disabled:opacity-50">
                    ✓ Handled
                  </button>
                  <button type="button" disabled={busy === r.id} onClick={() => act(r, "dismiss")} className="flex-1 rounded-xl border border-[#D4DDEB] bg-white py-2.5 text-sm font-bold text-[#5B6B8C] disabled:opacity-50">
                    Dismiss
                  </button>
                </div>
              </>
            ) : (
              <p className="text-xs text-[#5B6B8C]">
                {r.status === "resolved" ? "✓ Handled" : "Dismissed"} by {r.handledBy} · {when(r.handledAt)}
                {r.note ? ` — ${r.note}` : ""}
              </p>
            )}
          </div>
        ))
      )}
    </FounderShell>
  );
}
