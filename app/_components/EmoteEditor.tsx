"use client";

import { forwardRef, useImperativeHandle, useLayoutEffect, useRef, type ClipboardEvent, type KeyboardEvent } from "react";
import { emoteSrc, isAnimated, isSprite, splitEmotes } from "../../lib/emotes";

// ✍️ A writing box where an emote shows as its PICTURE (like the app), not its code.
// The value is still the codes (":)", ";m18" …), so what is saved and sent is unchanged.

export type EmoteEditorHandle = {
  el: () => HTMLDivElement | null;
  blur: () => void;
  focus: () => void;
  getCaret: () => number;
  /** focus = false: only remember the spot (the emote panel is open, the
   *  phone keyboard must stay away) */
  setCaret: (pos: number, focus?: boolean) => void;
};

type Props = {
  value: string;
  onChange: (value: string) => void;
  onCaret?: (pos: number) => void;
  onKeyDown?: (e: KeyboardEvent<HTMLElement>) => void;
  placeholder: string;
  className?: string;
  disabled?: boolean;
};

// 🖼 the picture shown in the writing box. A MIGLIFE Animated emote is an
// 18-frame strip, and an animated Google emoji is a Lottie file — shown as an
// <img> as they are, the strip came out as squeezed stripes and the Lottie as a
// broken picture (miglife: "see how emojis show while sending"). The box shows
// the strip's first frame and the emoji's own still glyph instead.
function editorSrc(id: string): string {
  if (isAnimated(id)) {
    const cp = parseInt(id.replace(/^[a-z]+_/, "").split("_")[0], 16);
    const ch = Number.isFinite(cp) ? String.fromCodePoint(cp) : "🙂";
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text x="50" y="54" font-size="84" text-anchor="middle" dominant-baseline="middle">${ch}</text></svg>`;
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  }
  return emoteSrc(id);
}

// value (codes) -> the box's content: text, and a picture for every emote code
function render(el: HTMLElement, value: string) {
  el.textContent = "";
  for (const p of splitEmotes(value)) {
    if ("text" in p) {
      el.appendChild(document.createTextNode(p.text));
    } else {
      const img = document.createElement("img");
      img.src = editorSrc(p.emote);
      img.alt = p.raw;
      img.dataset.code = p.raw;
      img.draggable = false;
      img.contentEditable = "false";
      img.className = "inline-block h-[1.3em] w-[1.3em] align-[-0.3em]";
      // the strip's first frame only (not the whole strip squeezed into one square)
      if (isSprite(p.emote)) {
        img.style.objectFit = "cover";
        img.style.objectPosition = "0 50%";
      }
      el.appendChild(img);
    }
  }
}

// the box's content -> value (codes)
function toCodes(node: Node): string {
  let out = "";
  node.childNodes.forEach((n) => {
    if (n.nodeType === Node.TEXT_NODE) out += n.textContent ?? "";
    else if (n instanceof HTMLImageElement && n.dataset.code) out += n.dataset.code;
    else if (n instanceof HTMLBRElement) out += "\n";
    else if (n instanceof HTMLElement) {
      if (n.tagName === "DIV" && out && !out.endsWith("\n")) out += "\n";
      out += toCodes(n);
    }
  });
  return out;
}

// the caret, counted in codes (an emote picture counts as its code)
function caretOffset(el: HTMLElement): number {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return toCodes(el).length;
  const r = sel.getRangeAt(0);
  if (!el.contains(r.endContainer)) return toCodes(el).length;
  const pre = document.createRange();
  pre.selectNodeContents(el);
  pre.setEnd(r.endContainer, r.endOffset);
  const tmp = document.createElement("div");
  tmp.appendChild(pre.cloneContents());
  return toCodes(tmp).length;
}

// puts the caret at a position counted in codes
function setCaretAt(el: HTMLElement, pos: number) {
  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();
  let left = pos;
  let placed = false;
  for (const n of Array.from(el.childNodes)) {
    const tmp = document.createElement("div");
    tmp.appendChild(n.cloneNode(true));
    const len = toCodes(tmp).length;
    if (left <= len) {
      if (n.nodeType === Node.TEXT_NODE) range.setStart(n, left);
      else range.setStartAfter(n);
      placed = true;
      break;
    }
    left -= len;
  }
  if (!placed) range.selectNodeContents(el);
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
}

export const EmoteEditor = forwardRef<EmoteEditorHandle, Props>(function EmoteEditor(
  { value, onChange, onCaret, onKeyDown, placeholder, className, disabled },
  ref
) {
  const box = useRef<HTMLDivElement>(null);

  useImperativeHandle(ref, () => ({
    el: () => box.current,
    blur: () => box.current?.blur(),
    focus: () => box.current?.focus(),
    getCaret: () => (box.current ? caretOffset(box.current) : 0),
    setCaret: (pos: number, focus = true) => {
      const el = box.current;
      if (!el || !focus) return;
      el.focus();
      setCaretAt(el, pos);
    },
  }));

  // the value changed from outside (a mention, an inserted emote, a draft loaded)
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    if (toCodes(el) !== value) render(el, value);
  }, [value]);

  const report = () => {
    const el = box.current;
    if (el && onCaret) onCaret(caretOffset(el));
  };

  return (
    <div
      ref={box}
      role="textbox"
      aria-multiline="true"
      contentEditable={!disabled}
      suppressContentEditableWarning
      data-placeholder={placeholder}
      className={`emote-editor ${className ?? ""}`}
      onInput={(e) => {
        onChange(toCodes(e.currentTarget));
        report();
      }}
      onKeyDown={(e) => onKeyDown?.(e)}
      onKeyUp={report}
      onMouseUp={report}
      onPaste={(e: ClipboardEvent<HTMLDivElement>) => {
        // plain text only, so pasted web formatting does not come along
        e.preventDefault();
        const t = e.clipboardData.getData("text/plain");
        document.execCommand("insertText", false, t);
      }}
    />
  );
});
