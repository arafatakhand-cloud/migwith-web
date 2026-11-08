"use client";

// 🌐 Feed › Translate. The server translates (blog "translate": Google
// Translate, kept per Mig), so it works on every phone — the browser's own
// translator only worked in desktop Chrome (miglife: "no translate button").
// Into this phone's language; a Mig already in it → English (English → Bangla).
// Tap again to see the original.
import { httpsCallable } from "firebase/functions";
import { functions } from "../../lib/firebase";
import { hideRoomTranslation, languageName, setRoomTranslation, useRoomTranslation } from "../../lib/roomTranslate";

const blogCall = httpsCallable<Record<string, unknown>, { title?: string; text?: string; from?: string; to?: string }>(functions, "blog");

export function requestFeedTranslation(postId: string) {
  const id = key(postId);
  setRoomTranslation(id, { kind: "loading" });
  const to = (typeof navigator !== "undefined" ? navigator.language : "en").split("-")[0].toLowerCase() || "en";
  blogCall({ action: "translate", postId, to })
    .then(({ data }) => {
      const title = String(data.title || "");
      const text = String(data.text || "");
      if (!title && !text) return setRoomTranslation(id, { kind: "failed", reason: "No translation" });
      setRoomTranslation(id, { kind: "done", text: title + SEP + text, from: String(data.from || "") });
    })
    .catch((e: any) => setRoomTranslation(id, { kind: "failed", reason: e?.message || "Couldn't translate right now" }));
}

/** Translate / See original — for a ⋯ menu or a link. */
export function useFeedTranslateToggle(postId: string) {
  const t = useRoomTranslation(key(postId));
  const on = t?.kind === "done";
  const busy = t?.kind === "loading" || t?.kind === "downloading";
  const toggle = () => {
    if (on || t?.kind === "failed") return hideRoomTranslation(key(postId));
    if (!busy) requestFeedTranslation(postId);
  };
  return { t, on, busy, toggle };
}

/** "🌐 See translation" under a Mig's words; when on: "Translated from X · See original". */
export function TranslateLink({ postId, dark = false }: { postId: string; dark?: boolean }) {
  const { t, on, busy, toggle } = useFeedTranslateToggle(postId);
  const ink = dark ? "text-white/90" : "text-[#4F46E5]";
  const sub = dark ? "text-white/70" : "text-[#7A7FA6]";
  return (
    <span className="mt-2 block text-[12.5px] font-bold" onClick={(e) => e.stopPropagation()}>
      <button type="button" onClick={toggle} className={`${ink} active:opacity-60`}>
        {busy ? "🌐 Translating…" : on ? "🌐 See original" : "🌐 See translation"}
      </button>
      {on && t?.kind === "done" && t.from && <span className={`ml-1.5 font-semibold ${sub}`}>· from {languageName(t.from)}</span>}
      {t?.kind === "failed" && <span className="ml-1.5 font-semibold text-[#B45309]">{t.reason}</span>}
    </span>
  );
}

const key = (postId: string) => `feed:${postId}`;
const SEP = "\n\n¶\n\n";

/** The post's text without photo lines (what gets translated). */
export const feedPlainText = (body: string) =>
  body
    .split("\n")
    .filter((l) => !/^!\[\]\(https:\/\/[^)\s]+\)$/.test(l.trim()))
    .join("\n")
    .replace(/\*\*/g, "")
    .trim();

/** null = not translated; otherwise the English title and text. */
export function useFeedTranslation(postId: string): { title: string; text: string; from: string } | null {
  const t = useRoomTranslation(key(postId));
  if (!t || t.kind !== "done") return null;
  const [title, ...rest] = t.text.split(/\s*¶\s*/);
  return { title: title.trim(), text: rest.join("\n").trim(), from: t.from };
}

export function TranslateChip({ postId, title, text }: { postId: string; title: string; text: string }) {
  const t = useRoomTranslation(key(postId));
  const on = t?.kind === "done";
  const busy = t?.kind === "loading" || t?.kind === "downloading";
  return (
    <span className="flex shrink-0 flex-col items-end">
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (on || t?.kind === "failed") return hideRoomTranslation(key(postId));
          if (!busy) requestFeedTranslation(postId);
        }}
        className={`flex h-7 items-center gap-1 rounded-full px-2.5 text-[11.5px] font-extrabold transition active:scale-95 ${
          on ? "bg-gradient-to-br from-[#38BDF8] to-[#6366F1] text-white" : "bg-[#EEF2FF] text-[#4F46E5] hover:bg-[#E0E7FF]"
        }`}
      >
        🌐 {busy ? (t?.kind === "downloading" ? "Downloading…" : "Translating…") : on ? "Original" : "Translate"}
      </button>
      {t?.kind === "failed" && <span className="mt-0.5 max-w-[180px] text-right text-[10.5px] leading-tight text-[#B45309]">{t.reason}</span>}
      {on && t.kind === "done" && <span className="mt-0.5 text-[10px] text-[#7A7FA6]">from {languageName(t.from)}</span>}
    </span>
  );
}
