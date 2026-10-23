"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { EmojiPicker } from "./EmojiPicker";
import { withEmotes } from "./Emote";
import { useIsClassic } from "../../lib/uiStyle";

// The chat text bar, same as the app's: a navy bar with ⋮ (more: gifts),
// 🖼️ photo and 🎤 voice as round buttons, a white rounded box with 😊 inside,
// and a round white ➤ send button. Used by chat rooms and private chat.

// Chat bar glyphs (the app's "style B"): drawn, not emoji, so they look the
// same everywhere. Photo = pink → purple, mic = sky → blue, send = purple → blue.
export const BAR_BTN = "flex h-8 w-8 shrink-0 items-center justify-center rounded-full";
export const PHOTO_BG = { background: "linear-gradient(135deg, #EC4677, #C13A93, #9B3DAB)", boxShadow: "0 2px 6px rgba(193,58,147,.45)" };
export const MIC_BG = { background: "linear-gradient(135deg, #00B8FF, #0A74FF)", boxShadow: "0 2px 6px rgba(10,116,255,.45)" };
export const MIC_REC_BG = { background: "linear-gradient(135deg, #FF5252, #D32F2F)", boxShadow: "0 2px 5px rgba(229,57,53,.5)" };
export const SEND_BG = { background: "linear-gradient(135deg, #833AB4, #5B5BF0, #0072FF)", boxShadow: "0 2px 6px rgba(91,91,240,.45)" };
// 📟 Classic: the photo and send buttons are orange.
export const CLASSIC_BTN_BG = { background: "linear-gradient(180deg, #FF9D2E, #F07A00)", boxShadow: "0 1px 3px rgba(240,122,0,.45)" };
export const SEND_VOICE_BG = { background: "linear-gradient(135deg, #43E97B, #00B37E)", boxShadow: "0 2px 6px rgba(0,179,126,.45)" };

export function PhotoGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
      {/* white picture with grey sun and hills, like the app */}
      <rect x="2.5" y="4" width="19" height="16" rx="3" fill="#FFFFFF" />
      <circle cx="8.5" cy="9.2" r="2.1" fill="#B4B4B8" />
      <path d="M2.5 17.5 L8.5 11.8 L12.5 15.6 L15.8 12.4 L21.5 18 L21.5 18 Q21.5 20 19.5 20 L4.5 20 Q2.5 20 2.5 18Z" fill="#B4B4B8" />
    </svg>
  );
}

export function MicGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden fill="none" stroke="#FFFFFF" strokeWidth="2.2" strokeLinecap="round">
      <rect x="8.5" y="2.5" width="7" height="12" rx="3.5" fill="#FFFFFF" stroke="none" />
      <path d="M5.5 11 A6.5 6.5 0 0 0 18.5 11" />
      <path d="M12 17.5 V21 M8.5 21 H15.5" />
    </svg>
  );
}

/** ⋮ drawn as three dots (the app's round grey "more" button). */
export function MoreGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden fill="#FFFFFF">
      <circle cx="12" cy="5" r="2.3" />
      <circle cx="12" cy="12" r="2.3" />
      <circle cx="12" cy="19" r="2.3" />
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
  extra,
  reply,
}: {
  text: string;
  setText: (v: string) => void;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
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
  /** Extra round buttons after ⋮ (Luxury Bet's ▶), hidden while recording. */
  extra?: React.ReactNode;
  /** Replying to someone (swipe right on their message): shown above the bar. */
  reply?: { sender: string; snippet: string; color?: string; onCancel: () => void } | null;
}) {
  const [moreOpen, setMoreOpen] = useState(false);
  const classic = useIsClassic();
  // ➤ the paper plane flies off and comes back on every send
  const [fly, setFly] = useState(0);
  const send = () => {
    setFly((n) => n + 1);
    onSend();
  };
  const moreRef = useRef<HTMLDivElement>(null);
  // The message box grows with the text, up to 4 lines.
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    // Empty: one line, whatever the hint text does in a narrow box.
    if (!text) {
      el.style.height = "";
      return;
    }
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 80)}px`;
  }, [text, voiceActive, inputRef]);
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
            {withEmotes(reply.snippet, 12)}
          </p>
        </div>
        <button type="button" onClick={reply.onCancel} aria-label="Cancel reply" className="px-1 text-sm text-[#6B7A99]">
          ✕
        </button>
      </div>
    )}
    {/* The app's bar: a dark navy pill (round at all four corners) a little
        in from the sides, 32 px round buttons 5 px apart, and a 39 px white
        message pill. The phone's safe area goes under it, not inside it. */}
    {/* Round at all four corners, a little in from the sides, like the app. */}
    <div className="chat-bar-glass keep-round mx-1.5 mb-1 flex items-end gap-[5px] rounded-[26px] bg-[#0B1F3A] px-2 py-1.5 shadow-[0_4px_14px_rgba(11,31,58,.25)] sm:mx-1 sm:my-1 sm:gap-2 sm:px-3 sm:py-1.5">
      {/* ⋮ more */}
      <div ref={moreRef} className="relative mb-[4px] shrink-0">
        <button
          type="button"
          onClick={() => (onMore ? onMore() : setMoreOpen((v) => !v))}
          aria-label="More"
          aria-expanded={moreOpen}
          className={`${BAR_BTN} glass-bubble glass-shine bg-[#2E3E56]`}
        >
          <MoreGlyph />
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

      {!voiceActive && extra}

      {/* While recording (or a clip waits) the recorder takes over the row. It
          always stays in the same slot below, so it keeps its state. */}
      {!voiceActive && (
          /* The message box: a soft blue → purple → sky edge, 🖼️ photo inside
              on the left, 🙂 on the right; it grows to 4 lines. Round in
              Classic too, like the app. */
          <div
            className="keep-round min-w-0 flex-1 rounded-[21px] p-[1.5px]"
            style={{ background: classic ? "linear-gradient(90deg, #FF9D2E, #F07A00)" : "linear-gradient(90deg, #5B8DEF, #8B6CF0, #3FB6F2)" }}
          >
            <div className="chat-field keep-round flex min-h-[37px] items-end gap-1 rounded-[19.5px] bg-white py-[3px] pl-[3px] pr-1">
              <label
                title={photo.title}
                className={`glass-shine flex h-[31px] w-[31px] shrink-0 cursor-pointer items-center justify-center rounded-full text-sm ${photo.disabled || photo.uploading ? "pointer-events-none opacity-40" : ""}`}
                style={classic ? CLASSIC_BTN_BG : PHOTO_BG}
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
              {/* A textarea, not an input: Chrome and Safari show no password /
                  card / address AutoFill bar above the keyboard for it. Enter sends. */}
              <textarea
                ref={inputRef}
                rows={1}
                value={text}
                onChange={(e) => setText(e.target.value.replace(/[\r\n]+/g, " "))}
                autoComplete="off"
                autoCorrect="on"
                name="migwith-chat-message"
                enterKeyHint="send"
                data-1p-ignore
                data-lpignore="true"
                data-form-type="other"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    if (canSend) send();
                  }
                }}
                maxLength={maxLength}
                disabled={disabled}
                placeholder={placeholder}
                className="my-[5.5px] h-5 min-w-0 flex-1 resize-none overflow-y-auto bg-transparent px-1.5 py-0 text-[15px] leading-5 text-[#0B2A5B] outline-none placeholder:text-[13px] placeholder:text-[#7A8599]/80"
              />
              <span className="flex h-[31px] shrink-0 items-center">
                <EmojiPicker
                  inputRef={inputRef}
                  value={text}
                  onChange={(v) => setText(v.slice(0, maxLength))}
                  disabled={disabled}
                  inline
                  dockTo={emoteSlot}
                />
              </span>
            </div>
          </div>
      )}

          {text.trim() && !voiceActive ? (
            // ➤ send
            <button
              type="button"
              // Like the app: tapping ➤ never takes the focus off the message box,
              // so the keyboard stays open for the next line.
              onPointerDown={(e) => e.preventDefault()}
              onMouseDown={(e) => e.preventDefault()}
              onClick={send}
              disabled={!canSend}
              aria-label="Send"
              className={`glass-shine relative flex h-[38px] w-[38px] shrink-0 items-center justify-center overflow-hidden rounded-full disabled:opacity-50 ${canSend ? "chat-send-shine" : ""}`}
              style={classic ? CLASSIC_BTN_BG : SEND_BG}
            >
              <SendGlyph key={fly} fly={fly > 0} />
            </button>
          ) : (
            // 🎤 when the box is empty
            voice
          )}
    </div>
    {/* only the phone's real safe area (iPhone home bar) — no extra strip
        between the bar and the keyboard / Android buttons */}
    <div style={{ height: "env(safe-area-inset-bottom)" }} />
    <div ref={setEmoteSlot} />
    </div>
  );
}
