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

/** The "miG" bubble with the orange "life" ball (login page + splash). */
export function MigLoginLogo() {
  return (
    <div className="relative">
      <div className="flex h-28 w-52 items-center justify-center pr-5 rounded-[56px] bg-gradient-to-b from-[#4FA8E8] to-[#1F74C4] shadow-[inset_0_-6px_12px_rgba(0,0,0,0.18),0_10px_24px_rgba(0,0,0,0.25)]">
        <span className="text-6xl font-black tracking-tight text-white drop-shadow">miG</span>
      </div>
      <span className="absolute -right-6 -top-4 flex h-[72px] w-[72px] items-center justify-center rounded-full border-2 border-[#8A3A0E] bg-gradient-to-b from-[#F58A3A] to-[#D6521A] text-xl font-bold text-white shadow-lg">
        life
      </span>
    </div>
  );
}

// 💬 miGlife's own picture: a row of colourful chat bubbles (chat, smile, gift,
// games, love), drawn with plain shapes — no outside artwork. Same in the app.
// Each bubble is ONE shape with its tail built in (white outline + a glossy
// shine), set on a soft arc with the gift in the middle, and they float gently.
const BUBBLES: { emoji: string; from: string; to: string; tail: "left" | "right"; size: number; lift: number }[] = [
  { emoji: "💬", from: "#6CC4FF", to: "#1F6FD0", tail: "left", size: 60, lift: 0 },
  { emoji: "😄", from: "#FFC266", to: "#EE6A1A", tail: "left", size: 68, lift: 12 },
  { emoji: "🎁", from: "#8BE89A", to: "#1F9A55", tail: "left", size: 80, lift: 20 },
  { emoji: "🎮", from: "#C3A8FF", to: "#6638E0", tail: "right", size: 68, lift: 12 },
  { emoji: "❤️", from: "#FFA3C7", to: "#E23D7C", tail: "right", size: 60, lift: 0 },
];
// bubble with a tail at the bottom-left (100 × 96 box); flipped for the right
const BUBBLE_PATH = "M30 4H70Q96 4 96 30V50Q96 76 70 76H46L26 93L30 76Q4 75 4 50V30Q4 4 30 4Z";

export function ChatBubbleRow({ scale = 0.82 }: { scale?: number }) {
  return (
    <div className="flex items-end justify-center gap-[6px]" aria-hidden>
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
