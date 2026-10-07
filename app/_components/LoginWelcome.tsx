"use client";

import { useEffect, useState } from "react";

// ✨ Welcome splash, shown once right after logging in (the app's
// MaLoginWelcomeSplash): the logo pops in, "Join the Fun!" drops in letter by
// letter with a golden shine, the mascots jump up, sparkles twinkle — then it fades into the page
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

/** The "mig" bubble with the orange "life" ball (login page + splash). */
export function MigLoginLogo() {
  return (
    <div className="relative">
      <div className="flex h-28 w-52 items-center justify-center rounded-[56px] bg-gradient-to-b from-[#4FA8E8] to-[#1F74C4] shadow-[inset_0_-6px_12px_rgba(0,0,0,0.18),0_10px_24px_rgba(0,0,0,0.25)]">
        <span className="text-6xl font-black tracking-tight text-white drop-shadow">mig</span>
      </div>
      <span className="absolute -right-6 -top-4 flex h-[72px] w-[72px] items-center justify-center rounded-full border-2 border-[#8A3A0E] bg-gradient-to-b from-[#F58A3A] to-[#D6521A] text-xl font-bold text-white shadow-lg">
        life
      </span>
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
        {/* the mascots jump up from below (after the logo) */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/login-mascots.webp" alt="" draggable={false} className="wf-mascots mt-[30px] w-[82vw] max-w-[440px] select-none" />
      </div>
    </div>
  );
}
