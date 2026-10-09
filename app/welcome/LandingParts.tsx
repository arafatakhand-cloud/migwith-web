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
      className={`group relative inline-flex items-center gap-3 overflow-hidden rounded-2xl border border-[#D7EBDD] bg-white text-left text-[#071330] shadow-[0_10px_40px_-10px_rgba(61,220,132,0.6)] transition hover:-translate-y-0.5 ${
        big ? "px-6 py-4" : "px-5 py-3"
      }`}
    >
      <span className="lp-shine pointer-events-none absolute inset-0" />
      <svg viewBox="0 0 24 24" width={big ? 30 : 26} height={big ? 30 : 26} fill="#1FB866" aria-hidden>
        <path d={ANDROID_PATH} />
      </svg>
      <span>
        <span className="block text-[10px] font-bold uppercase tracking-[0.18em] text-[#4B5B78]">Free download</span>
        <span className={`block font-black leading-tight ${big ? "text-xl" : "text-lg"}`}>
          Android app{version && <span className="ml-1.5 align-middle text-xs font-bold text-[#1FB866]">v{version}</span>}
        </span>
      </span>
    </a>
  );
}

/** The headline's last word changes: Chat → Play → Gift → Level up. */
export function RotatingWord() {
  const words = ["chat.", "play.", "gift.", "level up."];
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((n) => (n + 1) % words.length), 2200);
    return () => clearInterval(t);
  }, [words.length]);
  return (
    <span className="relative inline-block min-h-[1.1em]">
      <span key={i} className="lp-word inline-block bg-gradient-to-r from-[#FF7A00] via-[#FF3D6E] to-[#E0249A] bg-clip-text pb-2 text-transparent ">
        {words[i]}
      </span>
    </span>
  );
}

// ─── The live demo phone ────────────────────────────────────────────────────
type Line =
  | { k: "enter"; name: string; lv: number }
  | { k: "msg"; who: string; color: string; text: string }
  | { k: "gift"; text: string }
  | { k: "bot"; text: string }
  | { k: "fun"; text: string };

const SCENES: { id: string; label: string; room: string; lines: Line[] }[] = [
  {
    id: "chat",
    label: "💬 Chat",
    room: "Bangladesh",
    lines: [
      { k: "enter", name: "rafi", lv: 24 },
      { k: "msg", who: "nila", color: "#FF6B8A", text: "good evening everyone 🌇" },
      { k: "msg", who: "rafi", color: "#5AA8FF", text: "hey nila! 👋" },
      { k: "fun", text: "tania gives rafi a warm tight hug! 🤗" },
      { k: "msg", who: "sumon", color: "#3DDC84", text: "who's up for a game later? 🎮" },
    ],
  },
  {
    id: "play",
    label: "🏏 Play",
    room: "Cricket",
    lines: [
      { k: "bot", text: "🏏 Cricket Bot: Match starts! Type !bat" },
      { k: "msg", who: "rafi", color: "#5AA8FF", text: "!bat" },
      { k: "bot", text: "🏏 Over 3.2 · rafi hits a SIX! 🔥" },
      { k: "msg", who: "nila", color: "#FF6B8A", text: "what a shot 😮" },
      { k: "bot", text: "🏆 rafi wins the match · +XP" },
    ],
  },
  {
    id: "gift",
    label: "🎁 Gift",
    room: "Friends",
    lines: [
      { k: "msg", who: "sumon", color: "#3DDC84", text: "happy birthday nila 🎂" },
      { k: "gift", text: "🎁 sumon[31] gives a Rose 🌹 to nila! Hurray!" },
      { k: "gift", text: "🎁 *GIFT SHOWER* rafi[24] gives a Cake 🎂 to nila, sumon and 4 other! Hurray!" },
      { k: "msg", who: "nila", color: "#FF6B8A", text: "thank you all 🥹💖" },
    ],
  },
];

export function LiveDemo() {
  const [scene, setScene] = useState(0);
  const [shown, setShown] = useState(1);
  const s = SCENES[scene];
  // Lines appear one by one; at the end the next scene starts by itself.
  useEffect(() => {
    if (shown < s.lines.length) {
      const t = setTimeout(() => setShown((n) => n + 1), 1100);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => {
      setScene((n) => (n + 1) % SCENES.length);
      setShown(1);
    }, 2600);
    return () => clearTimeout(t);
  }, [shown, s.lines.length]);

  return (
    <div className="relative mx-auto w-[290px] sm:w-[310px]">
      {/* floating chips around the phone */}
      <span className="lp-float absolute -left-10 top-16 z-20 hidden rounded-2xl border border-white bg-white/85 px-3 py-2 text-xs font-bold text-[#0B2A5B] shadow-xl backdrop-blur-md sm:block">
        ⭐ +2 XP
      </span>
      <span className="lp-float-slow absolute -right-12 top-40 z-20 hidden rounded-2xl border border-white bg-white/85 px-3 py-2 text-xs font-bold text-[#0B2A5B] shadow-xl backdrop-blur-md sm:block">
        🥈 Level 12
      </span>
      <span className="lp-float absolute -left-6 bottom-24 z-20 hidden rounded-2xl border border-white bg-white/85 px-3 py-2 text-xs font-bold text-[#0B2A5B] shadow-xl backdrop-blur-md sm:block">
        🌹 Gift sent
      </span>

      <div className="absolute -inset-8 -z-10 rounded-[60px] bg-gradient-to-br from-[#3B82F6]/40 via-[#C86BFA]/30 to-[#FF8A3D]/40 blur-3xl" />
      <div className="rounded-[44px] border border-white/15 bg-gradient-to-b from-[#1B2A4E] to-[#0B1430] p-[9px] shadow-[0_30px_80px_-20px_rgba(0,0,0,0.7)]">
        <div className="overflow-hidden rounded-[36px] bg-[#0E1A38]">
          <div className="flex items-center justify-between px-6 pb-1 pt-3 text-[10px] font-bold text-white/80">
            <span>9:41</span>
            <span className="h-[18px] w-20 rounded-full bg-black" />
            <span>5G ▮▮▮</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-xs text-white">☰</span>
            <span className="rounded-full bg-gradient-to-r from-[#3B82F6] to-[#6366F1] px-3 py-1 text-[11px] font-bold text-white">
              💬 {s.room}
            </span>
            <span className="ml-auto flex items-center gap-1 text-[10px] font-semibold text-[#3DDC84]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#3DDC84]" /> live
            </span>
          </div>
          <div className="flex h-[330px] flex-col justify-end gap-1.5 overflow-hidden bg-gradient-to-b from-[#0E1A38] to-[#13234A] px-3 py-3 text-[11.5px] leading-snug text-white/90">
            {s.lines.slice(0, shown).map((l, i) => (
              <div key={`${s.id}-${i}`} className="lp-in">
                {l.k === "enter" ? (
                  <p className="text-white/60">
                    <span className="font-bold text-[#FFB547]">{s.room}:</span> {l.name} [{l.lv}] has entered.
                  </p>
                ) : l.k === "msg" ? (
                  <p className="w-fit max-w-[92%] rounded-2xl rounded-tl-md bg-white/[0.07] px-2.5 py-1.5">
                    <span className="font-bold" style={{ color: l.color }}>
                      {l.who}:
                    </span>{" "}
                    {l.text}
                  </p>
                ) : l.k === "gift" ? (
                  <p className="rounded-xl bg-gradient-to-r from-[#FF4FA3]/25 to-[#FF8A3D]/20 px-2.5 py-1.5 font-semibold text-[#FFB3D9]">{l.text}</p>
                ) : l.k === "bot" ? (
                  <p className="rounded-xl border border-[#C86BFA]/30 bg-[#C86BFA]/10 px-2.5 py-1.5 font-semibold text-[#E2B8FF]">{l.text}</p>
                ) : (
                  <p className="font-bold italic text-[#7FD3FF]">{l.text}</p>
                )}
              </div>
            ))}
            {shown < s.lines.length && (
              <p className="flex items-center gap-1 pl-1 text-white/40">
                <span className="lp-dot h-1.5 w-1.5 rounded-full bg-white/50" />
                <span className="lp-dot h-1.5 w-1.5 rounded-full bg-white/50 [animation-delay:150ms]" />
                <span className="lp-dot h-1.5 w-1.5 rounded-full bg-white/50 [animation-delay:300ms]" />
              </p>
            )}
          </div>
          <div className="flex items-center gap-1.5 border-t border-white/10 bg-[#0B1430] px-2.5 py-2.5">
            <span className="h-7 w-7 rounded-full bg-white/10" />
            <span className="h-7 w-7 rounded-full bg-gradient-to-b from-[#FF4FA3] to-[#C2185B]" />
            <span className="flex h-8 flex-1 items-center rounded-full bg-white/10 px-3 text-[10.5px] text-white/45">Type a message…</span>
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-[#3B82F6] to-[#6366F1] text-[11px] text-white">➤</span>
          </div>
        </div>
      </div>

      {/* scene switcher */}
      <div className="mt-6 flex justify-center gap-1.5 rounded-full border border-white bg-white/60 p-1 shadow-sm backdrop-blur-md">
        {SCENES.map((sc, k) => (
          <button
            key={sc.id}
            type="button"
            onClick={() => {
              setScene(k);
              setShown(1);
            }}
            className={`flex-1 rounded-full px-3 py-1.5 text-xs font-bold transition ${
              k === scene ? "bg-[#1F74C4] text-white shadow" : "text-[#3D5A80] hover:text-[#1F74C4]"
            }`}
          >
            {sc.label}
          </button>
        ))}
      </div>
    </div>
  );
}
