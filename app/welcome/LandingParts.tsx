"use client";

import { useEffect, useState } from "react";
import { useAppDownload } from "../../lib/appDownload";

// The landing page lives on miglife.app; the app itself on web.miglife.app.
// On the bare domain every "open the app" link goes to web.miglife.app (the
// login there is a different site), elsewhere (web.miglife.app, previews) it
// stays on this site.
const WEB_APP = "https://web.miglife.app";

function useWebBase(): string {
  const [base, setBase] = useState("");
  useEffect(() => {
    if (/^(www\.)?miglife\.app$/i.test(window.location.hostname)) setBase(WEB_APP);
  }, []);
  return base;
}

export function WebLink({ path = "/", className, children }: { path?: string; className?: string; children: React.ReactNode }) {
  const base = useWebBase();
  return (
    <a href={`${base}${path}`} className={className}>
      {children}
    </a>
  );
}

const ANDROID_PATH =
  "M17.6 9.48l1.84-3.18a.38.38 0 0 0-.66-.38l-1.87 3.23A11.4 11.4 0 0 0 12 8.2c-1.77 0-3.43.37-4.9.95L5.23 5.92a.38.38 0 1 0-.66.38L6.4 9.48A10.8 10.8 0 0 0 1 18h22a10.8 10.8 0 0 0-5.4-8.52zM7 15.25a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5zm10 0a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5z";

/** "Get the Android app" — the newest APK (app_config/latest), hidden until a link is set. */
export function DownloadButton({ big = false }: { big?: boolean }) {
  const { url, version } = useAppDownload();
  if (!url) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={`group inline-flex items-center gap-3 rounded-2xl bg-[#0E2A52] text-left text-white shadow-lg shadow-[#0E2A52]/25 transition hover:-translate-y-0.5 hover:bg-[#123566] ${
        big ? "px-6 py-4" : "px-5 py-3"
      }`}
    >
      <svg viewBox="0 0 24 24" width={big ? 30 : 26} height={big ? 30 : 26} fill="#3DDC84" aria-hidden>
        <path d={ANDROID_PATH} />
      </svg>
      <span>
        <span className="block text-[11px] font-semibold uppercase tracking-wider text-white/70">Free download</span>
        <span className={`block font-black leading-tight ${big ? "text-xl" : "text-lg"}`}>
          Android app{version && <span className="ml-1.5 align-middle text-xs font-bold text-[#3DDC84]">v{version}</span>}
        </span>
      </span>
    </a>
  );
}

/** A small live-looking chat room, drawn with HTML (no screenshots needed). */
export function PhoneMock() {
  const lines: { who?: string; color?: string; text: string; kind?: "enter" | "gift" | "bot" }[] = [
    { kind: "enter", text: "Bangladesh: rafi [24] has entered." },
    { who: "nila", color: "#E5484D", text: "good evening everyone 🌇" },
    { who: "rafi", color: "#2F80ED", text: "who's up for cricket? 🏏" },
    { kind: "gift", text: "🎁 *GIFT SHOWER* sumon[31] gives a Rose 🌹 to nila, rafi and 4 other! Hurray!" },
    { kind: "bot", text: "Cricket Bot: Over 3 · rafi hits a SIX! 🔥" },
    { who: "tania", color: "#1E8E3E", text: "/hug rafi 🤗" },
  ];
  return (
    <div className="relative mx-auto w-[280px] sm:w-[300px]">
      <div className="absolute -inset-6 -z-10 rounded-[48px] bg-gradient-to-br from-[#2F80ED]/25 via-[#56CCF2]/20 to-[#F2994A]/25 blur-2xl" />
      <div className="rounded-[40px] border-[10px] border-[#0E2A52] bg-[#0E2A52] shadow-2xl">
        <div className="overflow-hidden rounded-[30px] bg-gradient-to-b from-[#D6ECFB] to-[#BFE0F7]">
          {/* status bar */}
          <div className="flex items-center justify-between bg-white px-5 pb-1 pt-2 text-[10px] font-bold text-[#0B2A5B]">
            <span>9:41</span>
            <span className="h-[14px] w-16 rounded-full bg-[#0E2A52]" />
            <span>4G ▮▮▮</span>
          </div>
          {/* top bar */}
          <div className="flex items-center gap-2 border-b border-[#BFD7F2] bg-white px-3 py-2">
            <span className="text-[#0B2A5B]">☰</span>
            <span className="rounded-lg bg-[#2F80ED] px-2.5 py-1 text-[11px] font-bold text-white">💬 Bangladesh</span>
            <span className="ml-auto text-sm">🔔</span>
          </div>
          {/* messages */}
          <div className="space-y-1.5 bg-white/70 px-3 py-3 text-[11.5px] leading-snug text-[#0B2A5B]">
            {lines.map((l, i) =>
              l.kind === "enter" ? (
                <p key={i}>
                  <span className="font-bold text-[#E8833A]">Bangladesh:</span> rafi [24] has entered.
                </p>
              ) : l.kind === "gift" ? (
                <p key={i} className="rounded-md bg-[#FFE6F2] px-2 py-1.5 text-[#FF2D95]">
                  {l.text}
                </p>
              ) : l.kind === "bot" ? (
                <p key={i} className="font-semibold text-[#7B3FE4]">
                  {l.text}
                </p>
              ) : (
                <p key={i}>
                  <span className="font-bold" style={{ color: l.color }}>
                    {l.who}:
                  </span>{" "}
                  {l.text}
                </p>
              )
            )}
          </div>
          {/* chat bar */}
          <div className="flex items-center gap-1.5 bg-[#0E2A52] px-2.5 py-2">
            <span className="h-6 w-6 rounded-full bg-white/15" />
            <span className="h-6 w-6 rounded-full bg-gradient-to-b from-[#F06292] to-[#C2185B]" />
            <span className="flex h-7 flex-1 items-center rounded-full bg-white px-3 text-[10.5px] text-[#7A8599]">Type a message…</span>
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#2F80ED] text-[11px] text-white">➤</span>
          </div>
          <div className="h-8 bg-gradient-to-b from-[#D6ECFB] to-[#BFE0F7]" />
        </div>
      </div>
    </div>
  );
}
