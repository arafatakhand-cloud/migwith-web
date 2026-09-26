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
      className="rounded-xl border border-white/15 bg-white/5 px-2.5 py-2 text-xs font-bold text-white/80 transition hover:bg-white/10"
    >
      {lang === "bn" ? "EN" : "বাংলা"}
    </button>
  );
}
