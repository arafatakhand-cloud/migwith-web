"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type MutableRefObject } from "react";

// 📱 iPhone only: the message box as an editable <div> instead of a <textarea>.
// Safari puts its ⌃ ⌄ ✓ bar above the keyboard for form fields (textarea /
// input); an editable div usually doesn't get it. Everything else keeps the
// <textarea>.
//
// The rest of the chat code talks to the box like a textarea (focus, blur,
// selectionStart / selectionEnd, setSelectionRange, value, style,
// scrollHeight), so this box hands out a small stand-in with exactly those.

/** True on iPhone / iPad Safari (or when forced for testing with
 *  localStorage "migwith.editableBox" = "1"). */
export function useEditableBox(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    let forced = false;
    try {
      forced = localStorage.getItem("migwith.editableBox") === "1";
    } catch {
      // private mode
    }
    const ua = navigator.userAgent;
    const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
    setOn(forced || ios);
  }, []);
  return on;
}

type TextareaLike = Pick<HTMLTextAreaElement, "focus" | "blur" | "setSelectionRange"> & {
  readonly selectionStart: number;
  readonly selectionEnd: number;
  readonly value: string;
  readonly style: CSSStyleDeclaration;
  readonly scrollHeight: number;
};

// Text offset of a point (node, offset) inside the box.
function offsetOf(root: HTMLElement, node: Node, offset: number): number {
  const r = document.createRange();
  r.selectNodeContents(root);
  try {
    r.setEnd(node, offset);
  } catch {
    return (root.textContent || "").length;
  }
  return r.toString().length;
}

// The (node, offset) for a text offset inside the box.
function pointAt(root: HTMLElement, pos: number): [Node, number] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let left = pos;
  let last: Text | null = null;
  for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
    const len = n.data.length;
    if (left <= len) return [n, left];
    left -= len;
    last = n;
  }
  return last ? [last, last.data.length] : [root, 0];
}

export function PlainEditableBox({
  boxRef,
  value,
  onChange,
  onEnter,
  maxLength,
  disabled,
  placeholder,
  className,
}: {
  boxRef: MutableRefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: (v: string) => void;
  onEnter: () => void;
  maxLength?: number;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}) {
  const el = useRef<HTMLDivElement>(null);
  const composing = useRef(false);
  // the caret, kept so the stand-in can answer selectionStart after a blur
  const caret = useRef<[number, number]>([value.length, value.length]);

  const readCaret = () => {
    const d = el.current;
    const sel = window.getSelection();
    if (!d || !sel || sel.rangeCount === 0) return;
    const r = sel.getRangeAt(0);
    if (!d.contains(r.startContainer)) return;
    caret.current = [offsetOf(d, r.startContainer, r.startOffset), offsetOf(d, r.endContainer, r.endOffset)];
  };

  const placeCaret = (a: number, b: number) => {
    const d = el.current;
    if (!d) return;
    const len = (d.textContent || "").length;
    const s = Math.max(0, Math.min(a, len));
    const e = Math.max(0, Math.min(b, len));
    caret.current = [s, e];
    if (document.activeElement !== d) return;
    const sel = window.getSelection();
    if (!sel) return;
    const r = document.createRange();
    const [sn, so] = pointAt(d, s);
    const [en, eo] = pointAt(d, e);
    r.setStart(sn, so);
    r.setEnd(en, eo);
    sel.removeAllRanges();
    sel.addRange(r);
  };

  // The textarea stand-in for the rest of the chat code.
  useLayoutEffect(() => {
    const d = el.current;
    if (!d) return;
    const like: TextareaLike = {
      focus: (opts?: FocusOptions) => {
        d.focus(opts);
        placeCaret(caret.current[0], caret.current[1]);
      },
      blur: () => d.blur(),
      setSelectionRange: (a: number | null, b: number | null) => placeCaret(a ?? 0, b ?? a ?? 0),
      get selectionStart() {
        if (document.activeElement === d) readCaret();
        return caret.current[0];
      },
      get selectionEnd() {
        if (document.activeElement === d) readCaret();
        return caret.current[1];
      },
      get value() {
        return d.textContent || "";
      },
      get style() {
        return d.style;
      },
      get scrollHeight() {
        return d.scrollHeight;
      },
    };
    boxRef.current = like as unknown as HTMLTextAreaElement;
    return () => {
      if (boxRef.current === (like as unknown as HTMLTextAreaElement)) boxRef.current = null;
    };
  });

  // Text set from outside (cleared after sending, "/gift all " filled in, an
  // emote added …): put it in the box, the caret at the end of the change.
  useLayoutEffect(() => {
    const d = el.current;
    if (!d || composing.current) return;
    if ((d.textContent || "") === value) return;
    d.textContent = value;
    const [a] = caret.current;
    const pos = Math.min(Math.max(a, 0), value.length) || value.length;
    placeCaret(pos, pos);
  }, [value]);

  const style: CSSProperties = { WebkitUserSelect: "text", userSelect: "text" };

  return (
    <div
      ref={el}
      role="textbox"
      aria-multiline="false"
      aria-label={placeholder || "Message"}
      aria-disabled={disabled || undefined}
      data-placeholder={placeholder}
      // plaintext-only: no bold / pictures pasted in, just the words
      contentEditable={disabled ? false : ("plaintext-only" as unknown as boolean)}
      suppressContentEditableWarning
      spellCheck
      autoCorrect="on"
      enterKeyHint="send"
      inputMode="text"
      className={`editable-box ${className || ""}`}
      style={style}
      onCompositionStart={() => {
        composing.current = true;
      }}
      onCompositionEnd={() => {
        composing.current = false;
        const d = el.current;
        if (d) onChange((d.textContent || "").replace(/[\r\n]+/g, " "));
      }}
      onInput={() => {
        const d = el.current;
        if (!d) return;
        readCaret();
        let t = (d.textContent || "").replace(/[\r\n]+/g, " ");
        if (maxLength && t.length > maxLength) {
          t = t.slice(0, maxLength);
          d.textContent = t;
          placeCaret(t.length, t.length);
        }
        if (!composing.current) onChange(t);
      }}
      onKeyUp={readCaret}
      onMouseUp={readCaret}
      onBlur={readCaret}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.shiftKey && !composing.current) {
          e.preventDefault();
          onEnter();
        }
      }}
      onPaste={(e) => {
        // just the words, on one line
        e.preventDefault();
        const t = e.clipboardData.getData("text/plain").replace(/[\r\n]+/g, " ");
        document.execCommand("insertText", false, t);
      }}
    />
  );
}
