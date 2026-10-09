"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { EmotePanel } from "./Emote";
import { removeLastEmoteOrChar } from "../../lib/emotes";

// 🙂 button (⌨️ while open, like the app) that opens the miglife emote panel (the app's emoji panel); a tap
// adds that emote's code (":c12", ";a3" …) at the cursor. With `dockTo` the
// panel opens UNDER the chat bar, in the keyboard's place, like the app.

export function EmojiPicker({
  inputRef,
  value,
  onChange,
  disabled,
  inline = false,
  dockTo,
}: {
  inputRef: React.RefObject<HTMLInputElement | HTMLTextAreaElement | null>;
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  /** Borderless 😊 sitting inside the text box (the popup opens to the left). */
  inline?: boolean;
  /** Element under the chat bar the panel opens in (the app's place for it). */
  dockTo?: HTMLElement | null;
}) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Close when tapping anywhere else (the text box too: the keyboard takes its place).
  // On "click", not "pointerdown": closing on the press moved the chat bar down
  // before the finger came up, so ➤ Send needed a second tap. Now the tap sends
  // first (one tap, like the app) and the panel closes after it.
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      const t = e.target as Node;
      if (boxRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [open]);

  // Like the app: the code goes in with a space after it, at the cursor.
  const insert = (code: string) => {
    const el = inputRef.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    const before = value.slice(0, start);
    const piece = (before && !/\s$/.test(before) ? " " : "") + code + " ";
    const next = (before + piece + value.slice(end)).slice(0, 1000);
    onChange(next);
    const caret = Math.min(start + piece.length, next.length);
    requestAnimationFrame(() => {
      el?.setSelectionRange(caret, caret);
    });
  };

  return (
    <div ref={boxRef} className="relative flex">
      <button
        type="button"
        onClick={() => {
          if (open) {
            // ⌨️ like the app: emotes away, the keyboard comes back.
            setOpen(false);
            inputRef.current?.focus();
            return;
          }
          // Docked like the app: the phone keyboard goes away while the emotes show.
          if (dockTo) inputRef.current?.blur();
          setOpen(true);
        }}
        disabled={disabled}
        title={open ? "Keyboard" : "Emoji"}
        aria-label={open ? "Keyboard" : "Emoji"}
        aria-expanded={open}
        className={
          inline
            ? "flex h-8 w-8 items-center justify-center rounded-full text-xl disabled:opacity-40"
            : `rounded-xl border px-2.5 text-lg sm:px-3 disabled:opacity-40 ${
                open ? "border-[#2F80ED] bg-[#DCEBFB]" : "border-[#D5E3F5] bg-[#F4F9FF] hover:bg-[#EAF4FE]"
              }`
        }
      >
        {open ? "⌨️" : "🙂"}
      </button>
      {open &&
        dockTo &&
        createPortal(
          <div ref={panelRef}>
            <EmotePanel docked onPick={insert} onBackspace={() => onChange(removeLastEmoteOrChar(value))} />
          </div>,
          dockTo
        )}
      {open && !dockTo && (
        <div ref={panelRef} className={`absolute bottom-full ${inline ? "right-0" : "left-0"} z-40 mb-3 w-[min(360px,calc(100vw-16px))]`}>
          <EmotePanel onPick={insert} onBackspace={() => onChange(removeLastEmoteOrChar(value))} />
        </div>
      )}
    </div>
  );
}
