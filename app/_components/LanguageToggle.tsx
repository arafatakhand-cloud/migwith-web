"use client";

import { useEffect, useState } from "react";
import { getLang, setLang, type Lang } from "../../lib/i18n";

/* বাংলা ⇄ EN. Switching reloads the page so every text starts fresh. */
export function LanguageToggle() {
  const [lang, setL] = useState<Lang | null>(null);
  useEffect(() => setL(getLang()), []);
  if (!lang) return <span className="w-10" />;

  return (
    <button
      type="button"
      data-notranslate
      onClick={() => {
        setLang(lang === "bn" ? "en" : "bn");
        window.location.reload();
      }}
      title={lang === "bn" ? "Switch to English" : "বাংলায় দেখুন"}
      className="rounded-xl border border-[#BFD7F2] bg-white px-2.5 py-1.5 text-xs font-bold text-[#0B2A5B] transition hover:bg-[#E3F0FD]"
    >
      {lang === "bn" ? "EN" : "বাংলা"}
    </button>
  );
}
