"use client";

import { useEffect, useState } from "react";
import { useSession } from "./AppSession";
import { acceptCall, declineCall, hangUp, listenIncoming, onCallView, ringIncoming, toggleMute, toggleSpeaker, type CallView } from "../../lib/calls";

// 📞 The call screens (2026-11-24): a friend calling (Decline / Accept) and the
// call itself (time, Mute, Speaker, End). Shown over every page.

function fmt(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}` : `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

const LABEL: Record<string, string> = {
  starting: "Calling…",
  ringing: "Ringing…",
  connecting: "Connecting…",
  declined: "Call declined",
  cancelled: "Call ended",
  missed: "No answer",
  ended: "Call ended",
  busy: "On another call",
};

export default function CallHost() {
  const { user, username } = useSession();
  const [v, setV] = useState<CallView | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const off = onCallView(setV);
    return () => void off();
  }, []);
  useEffect(() => {
    if (!user?.uid) return;
    return listenIncoming({ uid: user.uid }, (id, from) => ringIncoming({ uid: user.uid }, id, from));
  }, [user?.uid]);
  useEffect(() => {
    if (!v || v.status !== "accepted") return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [v]);
  // leaving the page with a call open hangs it up
  useEffect(() => {
    if (!v) return;
    const bye = () => void hangUp();
    window.addEventListener("pagehide", bye);
    return () => window.removeEventListener("pagehide", bye);
  }, [v]);

  if (!v || !username) return null;
  const incoming = v.role === "callee" && v.status === "ringing";
  const live = v.status === "accepted";
  const sub = live ? fmt(now - v.acceptedAtMs) : v.error || LABEL[v.status] || "";

  return (
    <div data-nodark className="fixed inset-0 z-[90] flex justify-center bg-black/40" role="dialog" aria-label="Audio call">
      <div className="relative flex h-full w-full max-w-[480px] flex-col items-center bg-gradient-to-b from-[#0B1E4A] via-[#123A86] to-[#1D4ED8] pt-[max(70px,env(safe-area-inset-top))] text-white">
        <div className="text-[13px] tracking-[2px] text-white/75">{incoming ? "INCOMING AUDIO CALL" : "AUDIO CALL"}</div>
        <div className="mt-3 max-w-[90%] truncate text-[30px] font-bold" data-notranslate>
          {v.peer}
        </div>
        <div className={`mt-1.5 text-[16px] ${live ? "text-[20px] tabular-nums" : ""} ${v.error ? "text-[#FECACA]" : "text-white/80"}`}>{sub}</div>
        <div className="relative mt-11 h-[150px] w-[150px]">
          {(incoming || v.status === "ringing") && (
            <>
              <span className="absolute -inset-[38px] animate-ping rounded-full border-2 border-white/10 [animation-duration:2.4s]" />
              <span className="absolute -inset-[18px] rounded-full border-2 border-white/25" />
            </>
          )}
          {live && <span className="absolute -inset-[18px] rounded-full border-2 border-white/25" />}
          <span className="flex h-full w-full items-center justify-center rounded-full border-4 border-white bg-[#FFE7A8] text-[64px] font-black text-[#0B2A5B]">
            {(v.peer[0] || "?").toUpperCase()}
          </span>
        </div>
        {live && <div className="mt-10 text-[14px] text-white/80">🔒 Only you two can hear this call</div>}
        {(v.status === "connecting" || v.status === "ringing") && v.relay !== false && v.relayCheck && (
          <div className="mt-6 text-[12px] text-white/70">{v.relayCheck === "ok" ? "🛰 Relay: OK" : "🛰 Relay: not reachable from this network"}</div>
        )}
        {v.status === "connecting" && v.relay === false && (
          <div className="mx-8 mt-8 rounded-xl bg-black/25 px-4 py-2.5 text-center text-[12.5px] text-[#FDE68A]">
            ⚠️ No relay server (TURN) — calls on mobile data may not connect. Try Wi-Fi.
          </div>
        )}

        <div className="absolute inset-x-0 bottom-[max(56px,env(safe-area-inset-bottom))] flex justify-around px-6">
          {incoming ? (
            <>
              <CallBtn label="Decline" bg="bg-[#EF4444]" onClick={() => void declineCall()}>✕</CallBtn>
              <CallBtn label="Accept" bg="bg-[#22C55E]" onClick={() => void acceptCall()}>📞</CallBtn>
            </>
          ) : (
            <>
              <CallBtn label={v.muted ? "Unmute" : "Mute"} bg={v.muted ? "bg-white text-[#1D4ED8]" : "bg-white/15"} onClick={toggleMute}>
                {v.muted ? "🔇" : "🎙️"}
              </CallBtn>
              <CallBtn label="Speaker" bg={v.speaker ? "bg-white text-[#1D4ED8]" : "bg-white/15"} onClick={toggleSpeaker}>
                🔊
              </CallBtn>
              <CallBtn label="End" bg="bg-[#EF4444]" onClick={() => void hangUp()}>
                <span className="inline-block rotate-[135deg]">📞</span>
              </CallBtn>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function CallBtn({ label, bg, onClick, children }: { label: string; bg: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="flex flex-col items-center gap-2 text-[13px]">
      <span className={`flex h-[68px] w-[68px] items-center justify-center rounded-full text-[28px] transition active:scale-95 ${bg}`}>{children}</span>
      {label}
    </button>
  );
}
