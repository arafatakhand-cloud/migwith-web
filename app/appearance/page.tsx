"use client";

import { useEffect, useState } from "react";
import { useRequireLogin } from "../../lib/useRequireLogin";
import { PageShell } from "../_components/PageShell";
import { PageTitle } from "../_components/LightCards";

// Settings › Appearance: the colour themes as big cards — name, a short line,
// the colour dots and a little chat preview in that theme. Tapping one changes
// the whole site at once (see scripts/gen-themes.mjs). Kept in this browser.
// (App mode — Modern / Classic — is at the top of Settings.)

// [id, name, short line, background, primary, secondary]
const THEMES: [string, string, string, string, string, string][] = [
  ["sky_blue", "miGlife Classic", "Blue + sky · Default", "#0E3452", "#2F80ED", "#56CCF2"],
  ["dark_night", "Dark Night", "Midnight + bright blue", "#060B1A", "#3B82F6", "#7DB4FF"],
  ["mint", "Mint Green", "Deep teal + mint · Fresh", "#072220", "#14B8A6", "#5EEAD4"],
  ["lavender", "Lavender", "Purple + pink · Soft", "#14102A", "#8B7CF0", "#F0A6CA"],
  ["rose_pink", "Rose Pink", "Wine + rose · Sweet", "#2A0F1C", "#E0629A", "#F5A3C7"],
  ["sunset", "Sunset Orange", "Warm orange · Bright", "#241108", "#F97316", "#FFB347"],
  ["sunshine", "Sunshine Yellow", "Golden yellow · Happy", "#2A2104", "#F5B800", "#FFD84D"],
  ["aqua", "Aqua Teal", "Cyan + teal · Tropical", "#04222A", "#06B6D4", "#67E8F9"],
  ["cherry", "Cherry Red", "Red + coral · Bold", "#240709", "#E23A55", "#FF8FA3"],
  ["teal", "Teal / Cyan", "Ocean teal · Calm", "#041B20", "#00BFA6", "#29E6D0"],
  ["emerald", "Emerald", "Forest green · Natural", "#071B13", "#16A34A", "#4ADE80"],
  ["ruby", "Ruby", "Deep red · Elegant", "#21080E", "#E11D48", "#FB7185"],
  ["purple", "Purple", "Royal violet · Rich", "#120A25", "#8B5CF6", "#C084FC"],
  ["black_gold", "Black & Gold", "Black + gold · Luxury", "#080808", "#D4AF37", "#FFD86B"],
  ["dark_luxury", "Dark Luxury", "Graphite + silver · Quiet", "#090B10", "#B8C6D9", "#E8EEF7"],
  ["light_clean", "Light / Clean", "White + blue · Light", "#F5F7FA", "#2563EB", "#60A5FA"],
  ["rose_gold", "Rose Gold", "Blush + gold · Warm", "#1F1216", "#E8A0A0", "#F6C9B8"],
];

// a colour mixed toward white (0..1)
function lighten(hex: string, t: number): string {
  const n = parseInt(hex.slice(1), 16);
  const mix = (c: number) => Math.round(c + (255 - c) * t);
  const r = mix((n >> 16) & 255), g = mix((n >> 8) & 255), b = mix(n & 255);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

export default function AppearancePage() {
  const ready = useRequireLogin();
  const [theme, setTheme] = useState("sky_blue");

  useEffect(() => {
    try {
      setTheme(localStorage.getItem("migwith.theme") || "sky_blue");
    } catch {
      // storage blocked
    }
  }, []);

  const pickTheme = (id: string) => {
    setTheme(id);
    try {
      localStorage.setItem("migwith.theme", id);
    } catch {
      // storage blocked
    }
    if (id === "sky_blue") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = id;
  };

  return (
    <PageShell light>
      <section className="mx-auto max-w-md px-3 pb-8 sm:px-6 lg:max-w-3xl">
        <PageTitle title="Appearance" subtitle="Choose your colours" icon="🎨" />
        {ready && (
          <>
            <div className="rounded-2xl bg-white p-3.5 shadow-sm">
              <p className="font-extrabold text-[#0B2A5B]">Choose your theme</p>
              <p className="text-xs text-[#5B6B8C]">Changes the colours of the whole site — buttons, bars and accents. Applies instantly.</p>
            </div>
            <div className="mt-3 grid gap-3 lg:grid-cols-2">
              {THEMES.map(([id, name, line, bg, primary, secondary]) => {
                const on = theme === id;
                const lightBg = id === "light_clean";
                const dots = ["#FFFFFF", lighten(secondary, 0.45), secondary, primary, bg];
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => pickTheme(id)}
                    aria-pressed={on}
                    className={`rounded-3xl p-3.5 text-left transition ${on ? "ring-[3px] ring-[#E0A800] shadow-lg" : "ring-1 ring-black/5 shadow-sm hover:shadow-md"}`}
                    style={{ background: `linear-gradient(160deg, ${bg}, ${lighten(bg, lightBg ? 0 : 0.08)})` }}
                  >
                    <span className="flex items-start gap-2">
                      <span className="min-w-0 flex-1">
                        <span className={`block text-[17px] font-black ${lightBg ? "text-[#0B2A5B]" : "text-white"}`}>{name}</span>
                        <span className={`block text-xs ${lightBg ? "text-[#5B6B8C]" : "text-white/70"}`}>{line}</span>
                      </span>
                      <span
                        className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2"
                        style={{ borderColor: on ? "#E0A800" : lightBg ? "#C5D0E0" : "rgba(255,255,255,.45)", background: on ? "#E0A800" : "transparent" }}
                      >
                        {on && <span className="text-xs font-black text-white">✓</span>}
                      </span>
                    </span>
                    <span className="mt-2.5 flex gap-1.5">
                      {dots.map((c, i) => (
                        <span key={i} className={`h-6 w-6 rounded-full ring-1 ${lightBg ? "ring-black/15" : "ring-white/30"}`} style={{ background: c }} />
                      ))}
                    </span>
                    {/* a little chat in this theme */}
                    <span className="mt-3 block rounded-2xl p-2.5" style={{ background: lightBg ? "#E8EEF7" : "rgba(255,255,255,.07)" }}>
                      <span
                        className="inline-block rounded-xl rounded-bl-sm px-2.5 py-1 text-[12px] font-semibold"
                        style={{ background: lightBg ? "#FFFFFF" : "rgba(255,255,255,.14)", color: lightBg ? "#0B2A5B" : "#fff" }}
                      >
                        hello! 👋
                      </span>
                      <span className="mt-2 flex items-center gap-1.5">
                        <span className="h-7 flex-1 rounded-full bg-white px-3 text-[11px] leading-7 text-[#9AA8C2]">Type a message…</span>
                        <span className="flex h-7 w-7 items-center justify-center rounded-full text-[12px] text-white" style={{ background: primary }}>
                          ➤
                        </span>
                      </span>
                      <span className="mt-2 block h-2 rounded-full" style={{ background: `linear-gradient(90deg, ${primary}, ${secondary})` }} />
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="mt-3 text-center text-xs text-[#5B6B8C]">Theme applies instantly · saved on this device</p>
          </>
        )}
      </section>
    </PageShell>
  );
}
