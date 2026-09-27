"use client";

import { useEffect, useRef, useState } from "react";

// 😊 button that opens a small emoji grid above the chat box; a tap adds the
// emoji to the message at the cursor.

const EMOJIS = (
  "😀 😃 😄 😁 😆 😅 😂 🤣 😊 😇 🙂 😉 😍 🥰 😘 😗 😋 😛 😜 🤪 😎 🤩 🥳 😏 " +
  "😒 😔 😢 😭 😤 😠 😡 🤯 😳 🥺 😱 😴 🤔 🤫 🤭 🙄 😬 🤗 🤝 👍 👎 👏 🙌 🙏 " +
  "💪 👋 ✌️ 🤞 👌 ❤️ 🧡 💛 💚 💙 💜 🖤 💔 💕 💯 🔥 ✨ ⭐ 🌹 🌸 🎉 🎁 🎂 🏆 " +
  "👑 💎 💰 🪙 🎮 🎲 🃏 🏏 ⚽ 🍀 ☕ 🍕 🍔 🍫 🌙 ☀️ 🌈 🇧🇩"
).split(" ");

export function EmojiPicker({
  inputRef,
  value,
  onChange,
  disabled,
  inline = false,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  /** Borderless 😊 sitting inside the text box (the popup opens to the left). */
  inline?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  // Close when tapping anywhere else.
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  const insert = (emoji: string) => {
    const el = inputRef.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    const next = (value.slice(0, start) + emoji + value.slice(end)).slice(0, 1000);
    onChange(next);
    const caret = Math.min(start + emoji.length, next.length);
    requestAnimationFrame(() => {
      el?.setSelectionRange(caret, caret);
    });
  };

  return (
    <div ref={boxRef} className="relative flex">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        title="Emoji"
        aria-label="Emoji"
        aria-expanded={open}
        className={
          inline
            ? "flex h-8 w-8 items-center justify-center rounded-full text-xl disabled:opacity-40"
            : `rounded-xl border px-2.5 text-lg sm:px-3 disabled:opacity-40 ${
                open ? "border-[#2F80ED] bg-[#DCEBFB]" : "border-[#D5E3F5] bg-[#F4F9FF] hover:bg-[#EAF4FE]"
              }`
        }
      >
        😊
      </button>
      {open && (
        <div className={`absolute bottom-full ${inline ? "right-0" : "left-0"} z-40 mb-3 grid max-h-56 w-[272px] grid-cols-8 gap-0.5 overflow-y-auto rounded-2xl border border-[#D5E3F5] bg-white p-2 shadow-xl`}>
          {EMOJIS.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => insert(e)}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-xl hover:bg-[#EAF4FE]"
            >
              {e}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
