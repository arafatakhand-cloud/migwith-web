"use client";

// 🌐 Feed › Translate to English — the small chip beside a post's title.
// Free: the browser translates on this device (same as the room translator,
// lib/roomTranslate.ts). The title and the writing are translated together;
// tap again to see the original.
import { hideRoomTranslation, languageName, requestRoomTranslation, useRoomTranslation } from "../../lib/roomTranslate";

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
          if (!busy) requestRoomTranslation(key(postId), title + SEP + text, "en", 5000);
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
