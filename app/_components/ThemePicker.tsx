"use client";

import { setThemeMode, useThemeMode, type ThemeMode } from "../../lib/theme";

// ☀️ Light / 🌙 Dark / 📱 Auto — the only theme choice (same as the app).
export function ThemePicker() {
  const mode = useThemeMode();
  const opts: [ThemeMode, string, string][] = [
    ["light", "☀️", "Light"],
    ["dark", "🌙", "Dark"],
    ["auto", "📱", "Auto"],
  ];
  return (
    <div>
      <div className="flex gap-2.5">
        {opts.map(([id, icon, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setThemeMode(id)}
            className={`flex flex-1 flex-col items-center rounded-[14px] border-2 bg-[#EEF1F8] py-2.5 ${
              mode === id ? "border-[#3D63D8]" : "border-transparent"
            }`}
          >
            <span className="text-[22px] leading-none">{icon}</span>
            <span className="mt-1 text-[13px] font-extrabold text-[#14182A]">{label}</span>
          </button>
        ))}
      </div>
      <p className="mt-2 pl-0.5 text-[11px] text-[#64748B]">Auto follows your phone&apos;s light / dark setting</p>
    </div>
  );
}
