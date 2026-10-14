"use client";

import { useEffect, useState } from "react";

// ✨ Welcome splash, shown once right after logging in (the app's
// MaLoginWelcomeSplash): the logo pops in, "Join the Fun!" drops in letter by
// letter with a golden shine, the chat bubbles jump up, sparkles twinkle — then it fades into the page
// (~2.6 s). Tap anywhere to skip.

const FLAG = "migwith.welcomeSplash";
const EVENT = "migwith:welcome";
const WORDS = "Join the Fun!";

/** Called by the login page just before it opens Home. */
export function requestWelcomeSplash() {
  try {
    sessionStorage.setItem(FLAG, "1");
  } catch {
    // storage blocked — the event below still shows it
  }
  window.dispatchEvent(new Event(EVENT));
}

/** miGlife's logo: a blue and an orange chat bubble side by side with the
 *  "miGlife" word and "CHAT · FRIENDS · FUN" (login page + splash). Same in the app. */
export function MigLoginLogo() {
  return (
    <div className="flex items-center gap-3" aria-label="miGlife">
      <div className="relative h-[86px] w-[92px] shrink-0">
        <svg viewBox="0 0 100 96" width={70} height={67} className="mig-bubble absolute left-0 top-0 drop-shadow-[0_6px_10px_rgba(0,40,90,.3)]">
          <defs>
            <linearGradient id="mlBlue" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#4FB3FF" /><stop offset="1" stopColor="#1C5FC0" /></linearGradient>
          </defs>
          <path d={BUBBLE_PATH} fill="url(#mlBlue)" stroke="white" strokeWidth={4} strokeLinejoin="round" />
        </svg>
        <svg viewBox="0 0 100 96" width={56} height={54} style={{ animationDelay: "1.2s" }} className="mig-bubble absolute bottom-0 right-0 drop-shadow-[0_6px_10px_rgba(0,40,90,.3)]">
          <defs>
            <linearGradient id="mlOrange" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#FFB45C" /><stop offset="1" stopColor="#E8561C" /></linearGradient>
          </defs>
          <g transform="translate(100 0) scale(-1 1)">
            <path d={BUBBLE_PATH} fill="url(#mlOrange)" stroke="white" strokeWidth={4} strokeLinejoin="round" />
          </g>
        </svg>
      </div>
      <div className="leading-none">
        {/* letters pop in one by one; a golden shine keeps sweeping over "life" */}
        <div className="ml-word text-[44px] font-black tracking-tight drop-shadow">
          {"miG".split("").map((c, i) => (
            <span key={i} className="ml-pop text-white" style={{ animationDelay: `${i * 70}ms` }}>{c}</span>
          ))}
          {"life".split("").map((c, i) => (
            <span key={i} className="ml-pop" style={{ animationDelay: `${(i + 3) * 70}ms` }}>
              <span className="ml-life">{c}</span>
            </span>
          ))}
        </div>
        <div className="ml-tag mt-1 whitespace-nowrap text-[13px] font-bold tracking-[0.2em] text-white/85">CHAT · FRIENDS · FUN</div>
      </div>
    </div>
  );
}

// 💬 miGlife's own picture: a row of colourful chat bubbles (chat, smile, friends,
// gift, love), drawn with plain shapes — no outside artwork. Same in the app.
// Each bubble is ONE shape with its tail built in (white outline + a glossy
// shine), in one lively row, and they float gently.
const BUBBLES: { emoji: string; from: string; to: string; tail: "left" | "right"; size: number; lift: number }[] = [
  { emoji: "💬", from: "#6CC4FF", to: "#1F6FD0", tail: "left", size: 64, lift: 10 },
  { emoji: "😄", from: "#FFC266", to: "#EE6A1A", tail: "right", size: 76, lift: 0 },
  { emoji: "👥", from: "#8BE89A", to: "#1F9A55", tail: "left", size: 70, lift: 16 },
  { emoji: "💝", from: "#C3A8FF", to: "#6638E0", tail: "right", size: 76, lift: 2 },
  { emoji: "❤️", from: "#FFA3C7", to: "#E23D7C", tail: "left", size: 64, lift: 12 },
];
// bubble with a tail at the bottom-left (100 × 96 box); flipped for the right
const BUBBLE_PATH = "M30 4H70Q96 4 96 30V50Q96 76 70 76H46L26 93L30 76Q4 75 4 50V30Q4 4 30 4Z";

export function ChatBubbleRow({ scale = 0.82 }: { scale?: number }) {
  return (
    <div className="flex items-end justify-center gap-2" aria-hidden>
      {BUBBLES.map((b, i) => {
        const sz = b.size * scale;
        return (
          <span key={i} className="mig-bubble relative inline-block" style={{ marginBottom: b.lift * scale, animationDelay: `${i * 0.35}s` }}>
            <svg width={sz} height={sz * 0.96} viewBox="0 0 100 96" className="block drop-shadow-[0_6px_10px_rgba(0,40,90,.28)]">
              <defs>
                <linearGradient id={`mb${i}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor={b.from} />
                  <stop offset="1" stopColor={b.to} />
                </linearGradient>
              </defs>
              <g transform={b.tail === "right" ? "translate(100 0) scale(-1 1)" : undefined}>
                <path d={BUBBLE_PATH} fill={`url(#mb${i})`} stroke="white" strokeOpacity={0.85} strokeWidth={4} strokeLinejoin="round" />
              </g>
              {/* glossy shine */}
              <path d="M28 11Q50 6 72 11Q66 17 50 17Q34 17 28 11Z" fill="white" fillOpacity={0.32} />
            </svg>
            <span className="absolute inset-x-0 top-0 flex items-center justify-center" style={{ height: sz * 0.78, fontSize: sz * 0.44 }}>
              {b.emoji}
            </span>
          </span>
        );
      })}
    </div>
  );
}

// Fixed sparkle spots (the same every time, like the app's seeded Random(7)).
const SPARKLES = Array.from({ length: 34 }, (_, k) => {
  const r = (n: number) => {
    const x = Math.sin(k * 12.9898 + n * 78.233) * 43758.5453;
    return x - Math.floor(x);
  };
  return { left: r(1) * 100, top: r(2) * 100, size: 2.4 + r(3) * 5.2, gold: k % 3 === 0, delay: -((k * 0.37) % 1) * 1.8 };
});

export function LoginWelcomeSplash() {
  const [show, setShow] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const check = () => {
      let on = false;
      try {
        on = sessionStorage.getItem(FLAG) === "1";
        sessionStorage.removeItem(FLAG);
      } catch {
        on = true; // came from the event
      }
      if (on) {
        setLeaving(false);
        setShow(true);
      }
    };
    check();
    window.addEventListener(EVENT, check);
    return () => window.removeEventListener(EVENT, check);
  }, []);

  useEffect(() => {
    if (!show) return;
    // logo 480 ms → letters (75 ms each) → hold 1 s → fade
    const t = setTimeout(() => setLeaving(true), 480 + WORDS.length * 75 + 1000);
    return () => clearTimeout(t);
  }, [show]);

  useEffect(() => {
    if (!leaving) return;
    const t = setTimeout(() => setShow(false), 320);
    return () => clearTimeout(t);
  }, [leaving]);

  if (!show) return null;
  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center overflow-hidden transition-opacity duration-300"
      style={{ background: "linear-gradient(180deg, #6CCFF6, #36B1EC 50%, #1A8FD6)", opacity: leaving ? 0 : 1 }}
      onClick={() => setLeaving(true)}
      role="presentation"
    >
      {SPARKLES.map((s, i) => (
        <span
          key={i}
          className="wf-twinkle absolute rounded-full"
          style={{
            left: `${s.left}%`,
            top: `${s.top}%`,
            width: s.size,
            height: s.size,
            background: s.gold ? "#FFD54F" : "#FFFFFF",
            animationDelay: `${s.delay}s`,
          }}
        />
      ))}
      <div className="flex flex-col items-center">
        <div className="wf-logo">
          <MigLoginLogo />
        </div>
        <div className="mt-[34px] flex" aria-label={WORDS}>
          {Array.from(WORDS).map((ch, i) => (
            <span
              key={i}
              aria-hidden
              className="wf-letter text-[34px] font-extrabold"
              style={{ animationDelay: `${480 + i * 75}ms, ${i * 45}ms` }}
            >
              {ch === " " ? " " : ch}
            </span>
          ))}
        </div>
        {/* miGlife's own chat bubbles jump up from below (after the logo) */}
        <div className="wf-mascots mt-[30px]">
          <ChatBubbleRow />
        </div>
      </div>
    </div>
  );
}
