"use client";

import { useEffect, useState } from "react";
import { useRequireLogin } from "../../lib/useRequireLogin";
import { PageShell } from "../_components/PageShell";
import { PageTitle } from "../_components/LightCards";

// Settings › Appearance: the app's four font styles, kept in this browser.

const FONTS: [string, string, string][] = [
  ["modern", "Modern", "inherit"],
  ["classic", "Classic Serif", 'Georgia, "Times New Roman", serif'],
  ["luxury", "Elegant Light", '"Helvetica Neue", Arial, sans-serif'],
  ["rounded", "Friendly Casual", '"Comic Sans MS", "Chalkboard SE", "Comic Neue", cursive, sans-serif'],
];

export default function AppearancePage() {
  const ready = useRequireLogin();
  const [font, setFont] = useState("modern");

  useEffect(() => {
    try {
      setFont(localStorage.getItem("migwith.font") || "modern");
    } catch {
      // storage blocked
    }
  }, []);

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
        <PageTitle title="Appearance" subtitle="Customize the MIGwith visual style" icon="🎨" />
        {ready && (
          <>
            <p className="text-sm font-bold text-[#0B2A5B]">FONT</p>
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
                      Hello · বাংলা · MIG WITH
                    </span>
                  </span>
                  <span className="text-xl text-[#D4AF37]">{font === id ? "✓" : ""}</span>
                </button>
              ))}
            </div>
            <p className="mt-4 rounded-2xl bg-white/70 p-3 text-xs text-[#5B6B8C]">
              Colour themes (Mint, Lavender, Dark Night …) are in the MIGwith app. The website uses MIG Classic.
            </p>
          </>
        )}
      </section>
    </PageShell>
  );
}
