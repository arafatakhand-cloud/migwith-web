"use client";

import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import {
  ANIMATED_GROUPS,
  EMOTE_CODES,
  GIF_GROUP,
  GIF_MOTION,
  isSprite,
  EMOTE_GROUPS,
  emoteSrc,
  isAnimated,
  readRecentEmotes,
  rememberEmote,
  splitEmotes,
} from "../../lib/emotes";

// ---------------------------------------------------------------------------
// One emote: a picture, or a ✨ Lottie animation (loaded only when needed).
// `playing = false` shows a still frame (the picker, so 100 animations don't run).
// ---------------------------------------------------------------------------

type LottieModule = typeof import("lottie-web/build/player/lottie_light");
let lottiePromise: Promise<LottieModule> | null = null;
const loadLottie = () => (lottiePromise ??= import("lottie-web/build/player/lottie_light"));
const animCache = new Map<string, Promise<unknown>>();
const loadAnim = (id: string) => {
  if (!animCache.has(id)) animCache.set(id, fetch(emoteSrc(id)).then((r) => r.json()));
  return animCache.get(id)!;
};

function AnimatedEmote({ id, size, playing }: { id: string; size: number; playing: boolean }) {
  const box = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    let anim: { destroy: () => void; goToAndStop: (v: number, f?: boolean) => void; totalFrames: number } | null = null;
    let cancelled = false;
    Promise.all([loadLottie(), loadAnim(id)])
      .then(([lottie, data]) => {
        if (cancelled) return;
        const mod = (lottie as unknown as { default?: LottieModule }).default ?? lottie;
        anim = (mod as any).loadAnimation({
          container: el,
          renderer: "svg",
          loop: true,
          autoplay: playing,
          // A fresh copy: lottie changes the data it is given.
          animationData: JSON.parse(JSON.stringify(data)),
        });
        if (!playing && anim) anim.goToAndStop(Math.floor(anim.totalFrames * 0.3), true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      anim?.destroy();
    };
  }, [id, playing]);
  return <span ref={box} className="inline-block align-middle" style={{ width: size, height: size }} aria-label={EMOTE_CODES[id]} />;
}

// 😆 MIGLIFE Animated: an 18-frame strip played by CSS (it plays in the picker too).
function SpriteEmote({ id, size }: { id: string; size: number }) {
  return (
    <span className={`inline-block align-middle mlg-${GIF_MOTION[id] || "BOUNCE"}`} style={{ width: size, height: size }} aria-label={EMOTE_CODES[id]}>
      <span className="mlg-frames block h-full w-full" style={{ backgroundImage: `url(${emoteSrc(id)})` }} />
    </span>
  );
}

export function EmoteView({ id, size, playing = true }: { id: string; size: number; playing?: boolean }) {
  if (isAnimated(id)) return <AnimatedEmote id={id} size={size} playing={playing} />;
  if (isSprite(id)) return <SpriteEmote id={id} size={size} />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={emoteSrc(id)}
      alt={EMOTE_CODES[id] || ""}
      width={size}
      height={size}
      loading="lazy"
      draggable={false}
      className="inline-block align-middle"
      style={{ width: size, height: size }}
    />
  );
}

/**
 * Text with emote codes (":c12", ";a3") and Google emoji drawn as pictures, the
 * size of the text around them (10/7 of the font size, like the app).
 * `renderText` renders the plain parts (e.g. @mentions).
 */
export function withEmotes(text: string, fontPx: number, renderText: (s: string, key: string) => ReactNode = (s) => s): ReactNode[] {
  const size = Math.round((fontPx * 10) / 7);
  return splitEmotes(text).map((p, i) =>
    "emote" in p ? (
      <EmoteView key={`e${i}`} id={p.emote} size={size} />
    ) : (
      <Fragment key={`t${i}`}>{renderText(p.text, `t${i}_`)}</Fragment>
    )
  );
}

// ---------------------------------------------------------------------------
// ✨ The emote panel (the app's MigEmoticonPicker): a tab bar — 🕒 Recent, each
// group, ✨ animated — and ⌫. Tapping an emote inserts its code; the panel
// stays open for more. The last 24 picked are kept under 🕒 in this browser.
// ---------------------------------------------------------------------------

// Tab icons of the ✨ animated groups, in order (like the app).
const ANIM_GLYPHS = ["✨", "🎉", "💖", "🐾", "🍕", "🎈", "🌸"];

type Section = { key: string; title: string; tabId: string | null; glyph: string | null; ids: string[] };

export function EmotePanel({ onPick, onBackspace }: { onPick: (code: string) => void; onBackspace?: () => void }) {
  const [recent] = useState<string[]>(() => (typeof window === "undefined" ? [] : readRecentEmotes()));
  const sections: Section[] = [
    ...(recent.length ? [{ key: "recent", title: "Recent", tabId: null, glyph: "🕒", ids: recent }] : []),
    { key: GIF_GROUP.key, title: "😆 MIGLIFE Animated", tabId: null, glyph: "😆", ids: GIF_GROUP.ids },
    ...EMOTE_GROUPS.map((g) => ({ key: g.key, title: g.title, tabId: g.tab, glyph: null, ids: g.ids })),
    ...ANIMATED_GROUPS.map((g, i) => ({ key: g.key, title: `✨ ${g.title}`, tabId: null, glyph: ANIM_GLYPHS[i] ?? "✨", ids: g.ids })),
  ];
  const [active, setActive] = useState(0);
  const sec = sections[Math.min(active, sections.length - 1)];

  return (
    <div className="w-full overflow-hidden rounded-t-[18px] border border-b-0 border-[#D5E3F5] bg-white shadow-[0_-6px_20px_rgba(11,42,91,.15)]">
      <div className="mx-auto mt-1.5 h-1 w-9 rounded-full bg-gray-300" />
      <div className="flex items-center gap-1 px-1.5 py-1.5">
        <div className="no-scrollbar flex min-w-0 flex-1 gap-0.5 overflow-x-auto">
          {sections.map((s, i) => (
            <button
              key={s.key}
              type="button"
              title={s.title}
              onClick={() => setActive(i)}
              className="flex shrink-0 flex-col items-center"
            >
              <span
                className={`flex h-10 w-10 items-center justify-center rounded-xl text-xl ${i === active ? "bg-[#174EA6]/15" : ""}`}
              >
                {s.tabId ? <EmoteView id={s.tabId} size={26} playing={false} /> : s.glyph}
              </span>
              <span className={`mt-0.5 h-[3px] w-[18px] rounded-full ${i === active ? "bg-[#174EA6]" : "bg-transparent"}`} />
            </button>
          ))}
        </div>
        {onBackspace && (
          <button
            type="button"
            onClick={onBackspace}
            aria-label="Delete"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-lg font-bold text-[#0B1F3A]"
          >
            ⌫
          </button>
        )}
      </div>
      <div className="h-px bg-gray-200" />
      <div className="h-[250px] overflow-y-auto px-1.5 pb-2">
        <p className="px-1.5 pb-1 pt-2 text-[11px] font-bold tracking-[0.8px] text-gray-500">
          {sec.title.toUpperCase()} · {sec.ids.length}
        </p>
        <div className="grid grid-cols-8 gap-0.5">
          {sec.ids.map((id) => (
            <button
              key={`${sec.key}_${id}`}
              type="button"
              title={EMOTE_CODES[id]}
              onClick={() => {
                const code = EMOTE_CODES[id];
                if (!code) return;
                onPick(code);
                rememberEmote(id);
              }}
              className="flex aspect-square items-center justify-center rounded-[10px] p-1 hover:bg-[#EAF4FE] active:scale-90"
            >
              <EmoteView id={id} size={30} playing={false} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
