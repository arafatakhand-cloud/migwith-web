"use client";

import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, type ClipboardEvent, type KeyboardEvent } from "react";
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
  /** ↵ chat boxes: on a phone Enter makes a new line (only ➤ sends); on a computer
   *  Shift+Enter makes a new line and Enter goes to onKeyDown (sends) */
  newLineOnEnter?: boolean;
  /** 🖼 a GIF / sticker / picture from the keyboard (Gboard…), a paste or a drop → sent like a photo */
  onImage?: (file: File) => void;
};

// the picture inside a paste / drop / keyboard insert, if any
function imageFileOf(dt: DataTransfer | null | undefined): File | null {
  if (!dt) return null;
  for (const f of Array.from(dt.files || [])) if (f.type.startsWith("image/")) return f;
  for (const it of Array.from(dt.items || [])) {
    if (it.kind === "file" && it.type.startsWith("image/")) {
      const f = it.getAsFile();
      if (f) return f;
    }
  }
  return null;
}

// a phone / tablet (touch screen, no mouse): Enter there means "new line"
function touchOnly(): boolean {
  try {
    return window.matchMedia("(pointer: coarse)").matches && !window.matchMedia("(any-pointer: fine)").matches;
  } catch {
    return false;
  }
}

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
    // (\u200B only holds a new line open at the very end — never part of the value)
    if (n.nodeType === Node.TEXT_NODE) out += (n.textContent ?? "").replace(/\u200B/g, "");
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
  { value, onChange, onCaret, onKeyDown, placeholder, className, disabled, newLineOnEnter, onImage },
  ref
) {
  const box = useRef<HTMLDivElement>(null);
  const imageRef = useRef(onImage);
  imageRef.current = onImage;
  const changeRef = useRef(onChange);
  changeRef.current = onChange;

  // 🖼 keyboard GIFs / stickers ("can't send images in this app" before): Chrome hands
  // them over as a beforeinput with the picture, or drops an <img> straight into the
  // box. Either way: take the picture out of the box and send it like a photo.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const onBefore = (e: InputEvent) => {
      const f = imageFileOf(e.dataTransfer);
      if (f && imageRef.current) {
        e.preventDefault();
        imageRef.current(f);
      }
    };
    el.addEventListener("beforeinput", onBefore);
    const mo = new MutationObserver((list) => {
      for (const m of list) {
        m.addedNodes.forEach((n) => {
          const imgs: HTMLImageElement[] =
            n instanceof HTMLImageElement ? [n] : n instanceof HTMLElement ? Array.from(n.querySelectorAll("img")) : [];
          for (const img of imgs) {
            if (img.dataset.code) continue; // our own emote pictures
            const src = img.currentSrc || img.src;
            img.remove();
            changeRef.current(toCodes(el));
            if (!src || !imageRef.current) continue;
            const send = imageRef.current;
            fetch(src)
              .then((r) => r.blob())
              .then((b) => {
                const type = b.type || "image/gif";
                const ext = type.includes("gif") ? "gif" : type.includes("webp") ? "webp" : type.includes("png") ? "png" : "jpg";
                send(new File([b], `keyboard.${ext}`, { type }));
              })
              .catch(() => {});
          }
        });
      }
    });
    mo.observe(el, { childList: true, subtree: true });
    return () => {
      el.removeEventListener("beforeinput", onBefore);
      mo.disconnect();
    };
  }, []);

  useImperativeHandle(ref, () => ({
    el: () => box.current,
    blur: () => box.current?.blur(),
    focus: () => {
      const el = box.current;
      if (!el) return;
      el.focus();
      if (document.activeElement === el) setCaretAt(el, toCodes(el).length);
    },
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
    if (toCodes(el) !== value) {
      render(el, value);
      // ⌨️ rebuilding the box loses the caret, and the phone then puts it at the
      // very start (miglife: "the cursor jumps to the left" after picking a
      // /gift name or an @mention) — while typing here, keep it at the end
      if (document.activeElement === el) setCaretAt(el, value.length);
    }
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
      onKeyDown={(e) => {
        // ↵ a new line where the caret is (the value gets it as "\n")
        if (newLineOnEnter && e.key === "Enter" && !e.nativeEvent.isComposing && (e.shiftKey || touchOnly())) {
          e.preventDefault();
          const el = e.currentTarget;
          const pos = caretOffset(el);
          const now = toCodes(el);
          const next = now.slice(0, pos) + "\n" + now.slice(pos);
          render(el, next);
          // a new line at the very end needs something after it to show
          if (pos === now.length) el.appendChild(document.createTextNode("\u200B"));
          setCaretAt(el, pos + 1);
          onChange(next);
          report();
          return;
        }
        onKeyDown?.(e);
      }}
      onKeyUp={report}
      onMouseUp={report}
      onDrop={(e) => {
        const f = imageFileOf(e.dataTransfer);
        if (f && onImage) {
          e.preventDefault();
          onImage(f);
        }
      }}
      onPaste={(e: ClipboardEvent<HTMLDivElement>) => {
        // plain text only, so pasted web formatting does not come along
        e.preventDefault();
        // 🖼 a pasted picture / GIF → sent like a photo
        const f = imageFileOf(e.clipboardData);
        if (f && onImage) {
          onImage(f);
          return;
        }
        const t = e.clipboardData.getData("text/plain");
        document.execCommand("insertText", false, t);
      }}
    />
  );
});
