"use client";

import { useEffect, useRef, useState } from "react";
import { TEXT_COLORS } from "../../lib/textStyle";
import { requestRoomTranslation, setRoomTranslation, useRoomTranslation } from "../../lib/roomTranslate";

// ✍️ S1 (miglife 2026-11): select words in any text box → a white bar above it:
//   Copy · Paste | B · I · 🎨 · 🌐 · @
// One bar for the whole site (mounted in layout.tsx). The box's own onChange runs as if
// typed (execCommand "insertText"), so every chat / Feed box works without changes.
// A box can opt out with data-nostyle.

type Box = HTMLTextAreaElement | HTMLInputElement | HTMLElement;
const isField = (el: Box): el is HTMLTextAreaElement | HTMLInputElement => el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement;

/** the selected words in a contenteditable box (the room / private chat boxes), or null */
function ceRange(el: HTMLElement): Range | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
  const r = sel.getRangeAt(0);
  return el.contains(r.commonAncestorContainer) ? r : null;
}

function styledBox(el: Element | null): Box | null {
  if (!el) return null;
  if (el instanceof HTMLElement && el.isContentEditable && el.dataset.nostyle === undefined) return el;
  if (el instanceof HTMLTextAreaElement) return el.dataset.nostyle !== undefined ? null : el;
  if (el instanceof HTMLInputElement && (el.type === "text" || el.type === "search") && el.dataset.nostyle === undefined) return el;
  return null;
}

/** contenteditable: put `str` in place of the range, as if typed (the box's onInput reads it back) */
function putCe(el: HTMLElement, range: Range, str: string) {
  el.focus();
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
  try {
    document.execCommand("insertText", false, str);
  } catch {}
}

/** replace [a, b) with `str` as if typed (keeps undo and React's onChange), then select [sa, sb) */
function put(el: HTMLTextAreaElement | HTMLInputElement, a: number, b: number, str: string, sa: number, sb: number) {
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
  const trJob = useRef<{ el: Box; a: number; b: number; range: Range | null; picked: string; retried: boolean } | null>(null);
  const tr = useRoomTranslation(trId);

  useEffect(() => {
    const check = () => {
      const el = styledBox(document.activeElement);
      const has = el ? (isField(el) ? (el.selectionEnd ?? 0) > (el.selectionStart ?? 0) : !!ceRange(el)) : false;
      if (!el || !has) {
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
      const { el, a, b, range, picked } = job;
      if (isField(el)) {
        if (el.value.slice(a, b) === picked) put(el, a, b, tr.text, a + tr.text.length, a + tr.text.length);
      } else if (range && range.toString() === picked) putCe(el, range, tr.text);
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
  // the selection, for either kind of box
  const pick = () => {
    if (!el) return null;
    if (isField(el)) {
      const a = Math.min(el.selectionStart ?? 0, el.selectionEnd ?? 0);
      const b = Math.max(el.selectionStart ?? 0, el.selectionEnd ?? 0);
      return { a, b, range: null as Range | null, text: el.value.slice(a, b) };
    }
    const r = ceRange(el);
    return r ? { a: 0, b: 0, range: r.cloneRange(), text: r.toString() } : null;
  };
  // put `str` in place of the selection; for a text field, select [sa, sb) of the result
  const replace = (p: NonNullable<ReturnType<typeof pick>>, str: string, sa: number, sb: number) => {
    if (!el) return;
    if (isField(el)) put(el, p.a, p.b, str, sa, sb);
    else if (p.range) putCe(el, p.range, str);
  };

  const wrap = (mark: string) => {
    const p = pick();
    if (!el || !p) return;
    if (isField(el)) {
      const t = el.value;
      const { a, b } = p;
      if (a >= mark.length && t.slice(a - mark.length, a) === mark && t.slice(b, b + mark.length) === mark) {
        put(el, a - mark.length, b + mark.length, t.slice(a, b), a - mark.length, b - mark.length);
        return;
      }
    }
    const lead = p.text.match(/^\s*/)?.[0] ?? "";
    const trail = p.text.match(/\s*$/)?.[0] ?? "";
    const core = p.text.trim();
    if (!core) return;
    const at = p.a + lead.length + mark.length;
    replace(p, lead + mark + core + mark + trail, at, at + core.length);
  };

  const color = (name: string) => {
    const p = pick();
    if (p && p.text) {
      const open = `{{${name}|`;
      replace(p, open + p.text + "}}", p.a + open.length, p.a + open.length + p.text.length);
    }
    setColorMode(false);
  };

  const mention = () => {
    const p = pick();
    if (!p) return;
    const word = p.text.trim().replace(/^@/, "").replace(/\s+/g, "");
    if (word) replace(p, `@${word}`, p.a + word.length + 1, p.a + word.length + 1);
  };

  const translate = () => {
    const p = pick();
    if (!el || !p || !p.text.trim()) return;
    trJob.current = { el, a: p.a, b: p.b, range: p.range, picked: p.text, retried: false };
    const id = `sel_${Date.now()}`;
    setTrId(id);
    setNote("🌐 Translating…");
    setTimeout(() => setNote((n) => (n === "🌐 Translating…" ? "" : n)), 2500);
    void requestRoomTranslation(id, p.text, "en");
  };

  const copy = () => {
    const p = pick();
    if (p) void navigator.clipboard?.writeText(p.text).catch(() => {});
  };
  const paste = () => {
    const p = pick();
    if (!p) return;
    navigator.clipboard
      ?.readText()
      .then((t) => t && replace(p, t, p.a + t.length, p.a + t.length))
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
