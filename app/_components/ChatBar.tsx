"use client";

import { useEffect, useRef, useState } from "react";
import { EmojiPicker } from "./EmojiPicker";

// The chat text bar, same as the app's: a navy bar with ⋮ (more: gifts),
// 🖼️ photo and 🎤 voice as round buttons, a white rounded box with 😊 inside,
// and a round white ➤ send button. Used by chat rooms and private chat.

// Chat bar glyphs (the app's "style B"): drawn, not emoji, so they look the
// same everywhere. Photo = pink → purple, mic = sky → blue, send = purple → blue.
export const BAR_BTN = "flex h-8 w-8 shrink-0 items-center justify-center rounded-full";
export const PHOTO_BG = { background: "linear-gradient(135deg, #FF5F6D, #C13584, #833AB4)", boxShadow: "0 2px 5px rgba(193,53,132,.45)" };
export const MIC_BG = { background: "linear-gradient(135deg, #00C6FF, #0072FF)", boxShadow: "0 2px 5px rgba(0,114,255,.45)" };
export const MIC_REC_BG = { background: "linear-gradient(135deg, #FF5252, #D32F2F)", boxShadow: "0 2px 5px rgba(229,57,53,.5)" };
export const SEND_BG = { background: "linear-gradient(135deg, #833AB4, #5B5BF0, #0072FF)", boxShadow: "0 2px 6px rgba(91,91,240,.45)" };
export const SEND_VOICE_BG = { background: "linear-gradient(135deg, #43E97B, #00B37E)", boxShadow: "0 2px 6px rgba(0,179,126,.45)" };

export function PhotoGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
      <rect x="3" y="4" width="18" height="16" rx="3.5" fill="#FFFFFF" />
      <circle cx="9" cy="9.5" r="2" fill="rgba(0,0,0,.3)" />
      <path d="M3 17 L8.5 11.5 L12.5 15.5 L15.5 12.5 L21 18 L21 18.5 Q21 20 19.5 20 L4.5 20 Q3 20 3 18.5Z" fill="rgba(0,0,0,.3)" />
    </svg>
  );
}

export function MicGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden fill="none" stroke="#FFFFFF" strokeWidth="2.2" strokeLinecap="round">
      <rect x="8.5" y="2.5" width="7" height="12" rx="3.5" fill="#FFFFFF" stroke="none" />
      <path d="M5.5 11 A6.5 6.5 0 0 0 18.5 11" />
      <path d="M12 17.5 V21 M8.5 21 H15.5" />
    </svg>
  );
}

export function SendGlyph({ fly }: { fly?: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden className={fly ? "chat-send-fly" : undefined}>
      <path
        d="M3.4 11.1 L19.8 3.6 Q21.4 3.2 21 4.8 L13.5 21.2 Q12.7 22.4 11.8 21.1 L10.2 14.8 L3.9 13.2 Q2.6 12.2 3.4 11.1Z"
        fill="#FFFFFF"
      />
      <path d="M10.2 13.8 L20.4 4" stroke="rgba(0,0,0,.18)" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

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
  onMore,
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
  /** ⋮ opens the caller's own menu (the room menu) instead of the small gift menu. */
  onMore?: () => void;
  giftDisabled?: boolean;
  photo: { onFile: (f: File | undefined) => void; disabled: boolean; uploading: boolean; title: string };
  /** The <VoiceRecorder>; while it records it takes over the row. */
  voice: React.ReactNode;
  voiceActive: boolean;
  /** Replying to someone (swipe right on their message): shown above the bar. */
  reply?: { sender: string; snippet: string; color?: string; onCancel: () => void } | null;
}) {
  const [moreOpen, setMoreOpen] = useState(false);
  // ➤ the paper plane flies off and comes back on every send
  const [fly, setFly] = useState(0);
  const send = () => {
    setFly((n) => n + 1);
    onSend();
  };
  const moreRef = useRef<HTMLDivElement>(null);
  // 😊 emotes open here, under the bar (like the app's emoji box)
  const [emoteSlot, setEmoteSlot] = useState<HTMLDivElement | null>(null);

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
          <p data-notranslate className="truncate text-[13px] font-bold" style={{ color: reply.color || "#2F80ED" }}>
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
    <div className="flex items-center gap-1 rounded-t-[22px] bg-[#0B1F3A] px-2 pt-1.5 pb-safe sm:gap-2 sm:px-3">
      {/* ⋮ more */}
      <div ref={moreRef} className="relative shrink-0">
        <button
          type="button"
          onClick={() => (onMore ? onMore() : setMoreOpen((v) => !v))}
          aria-label="More"
          aria-expanded={moreOpen}
          className="flex h-9 w-6 items-center justify-center rounded-full bg-[#1E2B47] text-base font-black text-white"
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
        className={`${BAR_BTN} cursor-pointer text-sm ${photo.disabled || photo.uploading ? "pointer-events-none opacity-40" : ""}`}
        style={PHOTO_BG}
      >
        {photo.uploading ? "⏳" : <PhotoGlyph />}
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
          <div className="flex h-[34px] min-w-0 flex-1 items-center rounded-[17px] border border-[#1E4FA8] bg-white pl-3.5 pr-0.5">
            <input
              ref={inputRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (canSend) send();
                }
              }}
              maxLength={maxLength}
              disabled={disabled}
              placeholder={placeholder}
              className="min-w-0 flex-1 bg-transparent text-[14px] text-[#0B2A5B] outline-none placeholder:text-[#7A8599]/80"
            />
            <EmojiPicker
              inputRef={inputRef}
              value={text}
              onChange={(v) => setText(v.slice(0, maxLength))}
              disabled={disabled}
              inline
              dockTo={emoteSlot}
            />
          </div>

          {/* ➤ send */}
          <button
            type="button"
            onClick={send}
            disabled={!canSend}
            aria-label="Send"
            className={`${BAR_BTN} relative overflow-hidden ${canSend ? "chat-send-shine" : "opacity-60"}`}
            style={SEND_BG}
          >
            <SendGlyph key={fly} fly={fly > 0} />
          </button>
        </>
      )}
    </div>
    <div ref={setEmoteSlot} />
    </div>
  );
}
