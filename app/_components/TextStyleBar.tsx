"use client";

import { useEffect, useRef, useState } from "react";
import { TEXT_COLORS } from "../../lib/textStyle";
import { requestRoomTranslation, setRoomTranslation, useRoomTranslation } from "../../lib/roomTranslate";

// ✍️ S1 (miglife 2026-11): select words in any text box → a white bar above it:
//   Copy · Paste | B · I · 🎨 · 🌐 · @
// One bar for the whole site (mounted in layout.tsx). The box's own onChange runs as if
// typed (execCommand "insertText"), so every chat / Feed box works without changes.
// A box can opt out with data-nostyle.

type Box = HTMLTextAreaElement | HTMLInputElement;

function styledBox(el: Element | null): Box | null {
  if (!el) return null;
  if (el instanceof HTMLTextAreaElement) return el.dataset.nostyle !== undefined ? null : el;
  if (el instanceof HTMLInputElement && (el.type === "text" || el.type === "search") && el.dataset.nostyle === undefined) return el;
  return null;
}

/** replace [a, b) with `str` as if typed (keeps undo and React's onChange), then select [sa, sb) */
function put(el: Box, a: number, b: number, str: string, sa: number, sb: number) {
  el.focus();
  el.setSelectionRange(a, b);
  let ok = false;
  try {
    ok = document.execCommand("insertText", false, str);
  } catch {}
  if (!ok) {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, el.value.slice(0, a) + str + el.value.slice(b));
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }
  el.setSelectionRange(sa, sb);
}

export function TextStyleBar() {
  const [box, setBox] = useState<Box | null>(null);
  const [pos, setPos] = useState({ left: 8, top: 8 });
  const [colorMode, setColorMode] = useState(false);
  const [note, setNote] = useState("");
  const [trId, setTrId] = useState("");
  const trJob = useRef<{ el: Box; a: number; b: number; picked: string; retried: boolean } | null>(null);
  const tr = useRoomTranslation(trId);

  useEffect(() => {
    const check = () => {
      const el = styledBox(document.activeElement);
      const a = el?.selectionStart ?? 0;
      const b = el?.selectionEnd ?? 0;
      if (!el || b <= a) {
        setBox(null);
        setColorMode(false);
        return;
      }
      const r = el.getBoundingClientRect();
      const W = 300;
      setPos({
        left: Math.max(8, Math.min(r.left + 8, window.innerWidth - W - 8)),
        top: r.top > 64 ? r.top - 54 : r.bottom + 8,
      });
      setBox(el);
    };
    document.addEventListener("selectionchange", check);
    window.addEventListener("scroll", check, true);
    return () => {
      document.removeEventListener("selectionchange", check);
      window.removeEventListener("scroll", check, true);
    };
  }, []);

  // 🌐 the translation came back → put it in place of the picked words
  useEffect(() => {
    const job = trJob.current;
    if (!tr || !job) return;
    if (tr.kind === "done") {
      const { el, a, b, picked } = job;
      if (el.value.slice(a, b) === picked) put(el, a, b, tr.text, a + tr.text.length, a + tr.text.length);
      trJob.current = null;
      setRoomTranslation(trId, null);
      setTrId("");
    } else if (tr.kind === "failed") {
      setRoomTranslation(trId, null);
      if (!job.retried && tr.reason.startsWith("Already in")) {
        job.retried = true;
        const id = `sel_${Date.now()}`;
        setTrId(id);
        void requestRoomTranslation(id, job.picked, (navigator.language || "en").split("-")[0]);
        return;
      }
      trJob.current = null;
      setTrId("");
      setNote(tr.reason);
      setTimeout(() => setNote(""), 3500);
    }
  }, [tr, trId]);

  if (!box && !note) return null;
  const el = box;
  const sel = () => {
    const a = el?.selectionStart ?? 0;
    const b = el?.selectionEnd ?? 0;
    return { a: Math.min(a, b), b: Math.max(a, b) };
  };

  const wrap = (mark: string) => {
    if (!el) return;
    const { a, b } = sel();
    const t = el.value;
    if (a >= mark.length && t.slice(a - mark.length, a) === mark && t.slice(b, b + mark.length) === mark) {
      put(el, a - mark.length, b + mark.length, t.slice(a, b), a - mark.length, b - mark.length);
      return;
    }
    let x = a;
    let y = b;
    while (x < y && /\s/.test(t[x])) x++;
    while (y > x && /\s/.test(t[y - 1])) y--;
    if (y <= x) return;
    put(el, x, y, mark + t.slice(x, y) + mark, x + mark.length, y + mark.length);
  };

  const color = (name: string) => {
    if (!el) return;
    const { a, b } = sel();
    const open = `{{${name}|`;
    put(el, a, b, open + el.value.slice(a, b) + "}}", a + open.length, b + open.length);
    setColorMode(false);
  };

  const mention = () => {
    if (!el) return;
    const { a, b } = sel();
    const word = el.value.slice(a, b).trim().replace(/^@/, "").replace(/\s+/g, "");
    if (word) put(el, a, b, `@${word}`, a + word.length + 1, a + word.length + 1);
  };

  const translate = () => {
    if (!el) return;
    const { a, b } = sel();
    const picked = el.value.slice(a, b);
    if (!picked.trim()) return;
    trJob.current = { el, a, b, picked, retried: false };
    const id = `sel_${Date.now()}`;
    setTrId(id);
    setNote("🌐 Translating…");
    setTimeout(() => setNote((n) => (n === "🌐 Translating…" ? "" : n)), 2500);
    void requestRoomTranslation(id, picked, "en");
  };

  const copy = () => {
    if (!el) return;
    const { a, b } = sel();
    void navigator.clipboard?.writeText(el.value.slice(a, b)).catch(() => {});
  };
  const paste = () => {
    if (!el) return;
    const { a, b } = sel();
    navigator.clipboard
      ?.readText()
      .then((t) => t && put(el, a, b, t, a + t.length, a + t.length))
      .catch(() => {});
  };

  const key = "flex h-9 min-w-9 items-center justify-center rounded-[10px] px-2.5 text-[13.5px] font-bold text-[#1E1B4B] hover:bg-[#F1F4FB] active:bg-[#E6EBF6]";
  return (
    <div
      // keep the cursor (and the selection) in the text box while a key is pressed
      onPointerDown={(e) => e.preventDefault()}
      onMouseDown={(e) => e.preventDefault()}
      className="fixed z-[70] flex items-center gap-0.5 whitespace-nowrap rounded-[14px] bg-white p-1 shadow-[0_8px_20px_rgba(30,27,75,.2)]"
      style={pos}
    >
      {note && !box ? (
        <span className="px-3 py-2 text-[12.5px] font-bold text-[#1E1B4B]">{note}</span>
      ) : colorMode ? (
        <>
          {TEXT_COLORS.map(([name, hex]) => (
            <button key={name} type="button" aria-label={name} onClick={() => color(name)} className="flex h-9 w-8 items-center justify-center">
              <span className="h-[22px] w-[22px] rounded-full border-2 border-white shadow-[0_0_0_1px_#D6DBE8]" style={{ background: hex }} />
            </button>
          ))}
          <button type="button" onClick={() => setColorMode(false)} className={key}>
            ✕
          </button>
        </>
      ) : (
        <>
          <button type="button" onClick={copy} className={key}>
            Copy
          </button>
          <button type="button" onClick={paste} className={key}>
            Paste
          </button>
          <span className="mx-0.5 h-[22px] w-px bg-[#E6E9F2]" />
          <button type="button" aria-label="Bold" onClick={() => wrap("**")} className={`${key} font-black`}>
            B
          </button>
          <button type="button" aria-label="Italic" onClick={() => wrap("__")} className={`${key} italic`} style={{ fontFamily: "Georgia, serif" }}>
            I
          </button>
          <button type="button" aria-label="Colour" onClick={() => setColorMode(true)} className={key}>
            🎨
          </button>
          <button type="button" aria-label="Translate" onClick={translate} className={key}>
            🌐
          </button>
          <button type="button" aria-label="Mention" onClick={mention} className={key}>
            @
          </button>
        </>
      )}
    </div>
  );
}
