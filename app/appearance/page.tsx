"use client";

import { useEffect, useState } from "react";
import { useRequireLogin } from "../../lib/useRequireLogin";
import { PageShell } from "../_components/PageShell";
import { PageTitle } from "../_components/LightCards";

// Settings › Appearance, like the app: colour themes (the whole site changes
// colour; see scripts/gen-themes.mjs) and the four font styles. Kept in this browser.

// [id, name, background, primary, secondary] — the app's LoginThemes colours.
const APP_THEMES: [string, string, string, string, string][] = [
  ["sky_blue", "MIG Classic", "#0E3452", "#2F80ED", "#56CCF2"],
  ["dark_night", "Dark Night", "#060B1A", "#3B82F6", "#7DB4FF"],
  ["mint", "Mint Green", "#072220", "#14B8A6", "#5EEAD4"],
  ["lavender", "Lavender", "#14102A", "#8B7CF0", "#F0A6CA"],
  ["rose_pink", "Rose Pink", "#2A0F1C", "#E0629A", "#F5A3C7"],
  ["sunset", "Sunset Orange", "#241108", "#F97316", "#FFB347"],
  ["sunshine", "Sunshine Yellow", "#2A2104", "#F5B800", "#FFD84D"],
  ["aqua", "Aqua Teal", "#04222A", "#06B6D4", "#67E8F9"],
  ["cherry", "Cherry Red", "#240709", "#E23A55", "#FF8FA3"],
];
const MORE_THEMES: [string, string, string, string, string][] = [
  ["teal", "Teal / Cyan", "#041B20", "#00BFA6", "#29E6D0"],
  ["emerald", "Emerald", "#071B13", "#16A34A", "#4ADE80"],
  ["ruby", "Ruby", "#21080E", "#E11D48", "#FB7185"],
  ["purple", "Purple", "#120A25", "#8B5CF6", "#C084FC"],
  ["black_gold", "Black & Gold", "#080808", "#D4AF37", "#FFD86B"],
  ["dark_luxury", "Dark Luxury", "#090B10", "#B8C6D9", "#E8EEF7"],
  ["light_clean", "Light / Clean", "#F5F7FA", "#2563EB", "#60A5FA"],
  ["rose_gold", "Rose Gold", "#1F1216", "#E8A0A0", "#F6C9B8"],
];

const FONTS: [string, string, string][] = [
  ["modern", "Modern", "inherit"],
  ["classic", "Classic Serif", 'Georgia, "Times New Roman", serif'],
  ["luxury", "Elegant Light", '"Helvetica Neue", Arial, sans-serif'],
  ["rounded", "Friendly Casual", '"Comic Sans MS", "Chalkboard SE", "Comic Neue", cursive, sans-serif'],
];

export default function AppearancePage() {
  const ready = useRequireLogin();
  const [font, setFont] = useState("modern");
  const [theme, setTheme] = useState("sky_blue");

  useEffect(() => {
    try {
      setFont(localStorage.getItem("migwith.font") || "modern");
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

  const ThemeGrid = ({ list }: { list: [string, string, string, string, string][] }) => (
    <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
      {list.map(([id, name, bg, primary, secondary]) => (
        <button
          key={id}
          type="button"
          onClick={() => pickTheme(id)}
          className={`overflow-hidden rounded-2xl border-2 text-left ${theme === id ? "border-[#D4AF37]" : "border-transparent"}`}
        >
          <span className="relative block h-14" style={{ background: bg }}>
            <span className="absolute bottom-2 left-2 right-8 h-3 rounded-full" style={{ background: primary }} />
            <span className="absolute bottom-2 right-2 h-3 w-4 rounded-full" style={{ background: secondary }} />
            {theme === id && <span className="absolute right-1.5 top-1 text-sm font-bold text-[#D4AF37]">✓</span>}
          </span>
          <span className="block truncate bg-white px-2 py-1 text-[11px] font-semibold text-[#0B2A5B]">{name}</span>
        </button>
      ))}
    </div>
  );

  const pick = (id: string) => {
    setFont(id);
    try {
      localStorage.setItem("migwith.font", id);
    } catch {
      // storage blocked
    }
    if (id === "modern") delete document.documentElement.dataset.font;
    else document.documentElement.dataset.font = id;
  };

  return (
    <PageShell light>
      <section className="mx-auto max-w-md px-3 pb-8 sm:px-6">
        <PageTitle title="Appearance" subtitle="Customize the MIGlife visual style" icon="🎨" />
        {ready && (
          <>
            <p className="text-sm font-bold text-[#0B2A5B]">APP THEMES</p>
            <ThemeGrid list={APP_THEMES} />
            <p className="mt-4 text-sm font-bold text-[#0B2A5B]">MORE THEMES</p>
            <ThemeGrid list={MORE_THEMES} />
            <p className="mt-2 text-xs text-[#5B6B8C]">Your choice changes the whole site at once.</p>

            <p className="mt-5 text-sm font-bold text-[#0B2A5B]">FONT</p>
            <div className="mt-2 space-y-2">
              {FONTS.map(([id, name, family]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => pick(id)}
                  className={`flex w-full items-center gap-3 rounded-2xl border bg-white px-4 py-3 text-left ${
                    font === id ? "border-[#D4AF37] shadow" : "border-[#E0E5EE]"
                  }`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold text-[#0B2A5B]" style={{ fontFamily: family, fontWeight: id === "luxury" ? 300 : undefined }}>
                      {name}
                    </span>
                    <span className="block text-sm text-[#5B6B8C]" style={{ fontFamily: family, fontWeight: id === "luxury" ? 300 : undefined }}>
                      Hello · বাংলা · MIG LIFE
                    </span>
                  </span>
                  <span className="text-xl text-[#D4AF37]">{font === id ? "✓" : ""}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </section>
    </PageShell>
  );
}
