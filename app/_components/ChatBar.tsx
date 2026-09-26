"use client";

import { useEffect, useRef, useState } from "react";
import { EmojiPicker } from "./EmojiPicker";

// The chat text bar, same as the app's: a navy bar with ⋮ (more: gifts),
// 🖼️ photo and 🎤 voice as round buttons, a white rounded box with 😊 inside,
// and a round white ➤ send button. Used by chat rooms and private chat.

const round =
  "flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#1E2B47] text-lg shadow-inner disabled:opacity-40";

export function ChatBar({
  text,
  setText,
  inputRef,
  onSend,
  canSend,
  placeholder,
  maxLength,
  disabled,
  onGift,
  giftDisabled,
  photo,
  voice,
  voiceActive,
  reply,
}: {
  text: string;
  setText: (v: string) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onSend: () => void;
  canSend: boolean;
  placeholder: string;
  maxLength: number;
  disabled?: boolean;
  onGift?: () => void;
  giftDisabled?: boolean;
  photo: { onFile: (f: File | undefined) => void; disabled: boolean; uploading: boolean; title: string };
  /** The <VoiceRecorder>; while it records it takes over the row. */
  voice: React.ReactNode;
  voiceActive: boolean;
  /** Replying to someone (swipe right on their message): shown above the bar. */
  reply?: { sender: string; snippet: string; onCancel: () => void } | null;
}) {
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!moreOpen) return;
    const close = (e: PointerEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [moreOpen]);

  return (
    <div>
    {reply && (
      <div className="flex items-center gap-2 border-l-[3px] border-[#2F80ED] bg-[#F3F5F9] px-3 py-2">
        <span className="text-base text-[#2F80ED]">↩</span>
        <div className="min-w-0 flex-1">
          <p data-notranslate className="truncate text-[13px] font-bold text-[#2F80ED]">
            {reply.sender}
          </p>
          <p data-notranslate className="truncate text-xs text-[#6B7A99]">
            {reply.snippet}
          </p>
        </div>
        <button type="button" onClick={reply.onCancel} aria-label="Cancel reply" className="px-1 text-sm text-[#6B7A99]">
          ✕
        </button>
      </div>
    )}
    <div className="flex items-center gap-1.5 rounded-t-[28px] bg-[#0B1F3A] px-2 pt-2 pb-safe sm:gap-2 sm:px-3">
      {/* ⋮ more */}
      <div ref={moreRef} className="relative shrink-0">
        <button
          type="button"
          onClick={() => setMoreOpen((v) => !v)}
          aria-label="More"
          aria-expanded={moreOpen}
          className="flex h-11 w-7 items-center justify-center rounded-full bg-[#1E2B47] text-lg font-black text-white"
        >
          ⋮
        </button>
        {moreOpen && (
          <div className="absolute bottom-full left-0 z-40 mb-2 w-44 overflow-hidden rounded-2xl border border-[#D5E3F5] bg-white text-sm text-[#0B2A5B] shadow-xl">
            {onGift && (
              <button
                type="button"
                disabled={giftDisabled}
                onClick={() => {
                  setMoreOpen(false);
                  onGift();
                }}
                className="flex w-full items-center gap-2 px-4 py-3 text-left font-semibold hover:bg-[#EAF4FE] disabled:opacity-40"
              >
                🎁 Send a gift
              </button>
            )}
          </div>
        )}
      </div>

      {/* 🖼️ photo */}
      <label
        title={photo.title}
        className={`${round} cursor-pointer border-2 border-[#8C7B3E] ${
          photo.disabled || photo.uploading ? "pointer-events-none opacity-40" : ""
        }`}
      >
        {photo.uploading ? "⏳" : "🖼️"}
        <input
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            photo.onFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </label>

      {/* 🎤 voice */}
      {voice}

      {!voiceActive && (
        <>
          {/* White box with 😊 inside */}
          <div className="flex h-12 min-w-0 flex-1 items-center rounded-full border-2 border-[#1E4FA8] bg-white pl-4 pr-1">
            <input
              ref={inputRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (canSend) onSend();
                }
              }}
              maxLength={maxLength}
              disabled={disabled}
              placeholder={placeholder}
              className="min-w-0 flex-1 bg-transparent text-sm text-[#0B2A5B] outline-none placeholder:tracking-wide placeholder:text-[#7A8599]"
            />
            <EmojiPicker inputRef={inputRef} value={text} onChange={(v) => setText(v.slice(0, maxLength))} disabled={disabled} inline />
          </div>

          {/* ➤ send */}
          <button
            type="button"
            onClick={onSend}
            disabled={!canSend}
            aria-label="Send"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white text-2xl text-[#4A7BE0] shadow-md disabled:text-[#A9BDE6]"
          >
            ➤
          </button>
        </>
      )}
    </div>
    </div>
  );
}
