"use client";

import { useEffect, useState } from "react";
import { MigLoginLogo } from "./LoginWelcome";

// 🚀 Opening splash (like the app's splash screen): the miGlife logo on the sky
// background for a moment when the web app is first opened in a tab, then it
// fades into the page. Once per tab; never on the landing page. The script in
// layout.tsx decides before the first paint (html.no-boot-splash = skip), so
// the page never flashes before it. Tap to skip.

export function BootSplash() {
  const [phase, setPhase] = useState<"show" | "fade" | "gone">("show");
  useEffect(() => {
    if (document.documentElement.classList.contains("no-boot-splash")) {
      setPhase("gone");
      return;
    }
    const a = setTimeout(() => setPhase("fade"), 1100);
    const b = setTimeout(() => setPhase("gone"), 1500);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
    };
  }, []);
  if (phase === "gone") return null;
  return (
    <div
      id="boot-splash"
      aria-hidden
      onClick={() => setPhase("gone")}
      className={`fixed inset-0 z-[200] flex flex-col items-center justify-center bg-gradient-to-b from-[#0B1E3F] via-[#0A1E3E] to-[#03101F] text-white transition-opacity duration-300 ${
        phase === "fade" ? "opacity-0" : "opacity-100"
      }`}
    >
      {/* 🌌 6D neon: a glowing cyan halo and stacked dark depth under the logo */}
      <div
        className="boot-splash-pop"
        style={{ filter: "drop-shadow(0 0 14px rgba(77,208,255,.75)) drop-shadow(0 6px 0 #03101F) drop-shadow(0 10px 0 #020B17)" }}
      >
        <MigLoginLogo />
      </div>
      <p className="mt-8 px-4 text-center text-xs font-semibold tracking-[0.3em] text-[#7FE3FF] sm:text-sm">CHAT · PLAY · MAKE FRIENDS</p>
      <span className="mt-10 h-7 w-7 animate-spin rounded-full border-[3px] border-[#4DD0FF]/30 border-t-[#7FE3FF]" />
    </div>
  );
}
