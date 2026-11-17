"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { placeHere, searchPlaces } from "../../lib/places";

// ✍️ Story text & stickers (miglife, Nov 2026). The writer puts words and stickers
// on a story — drag to move, two fingers to size / turn (or the − + ⟲ ⟳ buttons),
// drop on 🗑 to remove. Saved with the story as `overlays` (the server checks them):
//   x, y = where (0…1 of the story frame) · z = size · r = turn (degrees)
//   text: s, c (colour 0-6), bg (a colour box behind), f (font 0-3)
//   emoji: s · place: s (area name, 🎯 GPS or picked) · time: s · mention: s (a username)
// The same frame is used to make and to show a story (full height, at most 480 wide),
// and sizes follow the frame's width, so it looks the same on every screen.

export type StoryOverlay = {
  k: "text" | "emoji" | "place" | "time" | "mention";
  s: string;
  x: number;
  y: number;
  z: number;
  r: number;
  c?: number;
  bg?: boolean;
  f?: number;
};

export const STORY_TEXT_COLORS = ["#FFFFFF", "#111111", "#E11D74", "#FFBF00", "#22C55E", "#3B82F6", "#A855F7"];
const FONTS = [
  { name: "Bold", css: { fontFamily: "system-ui, sans-serif", fontWeight: 900 } },
  { name: "Neon", css: { fontFamily: "system-ui, sans-serif", fontWeight: 800 } },
  { name: "Classic", css: { fontFamily: "Georgia, 'Times New Roman', serif", fontWeight: 700, fontStyle: "italic" as const } },
  { name: "Type", css: { fontFamily: "'Courier New', ui-monospace, monospace", fontWeight: 700 } },
];
const STICKER_EMOJI = [
  "🥰", "😍", "😂", "🤣", "🔥", "💯", "🎉", "🥳", "👑", "😎", "💖", "❤️", "🫶", "🌸", "🌹", "✨",
  "⭐", "🌈", "☀️", "🌙", "🙏", "😘", "🤩", "😇", "🤔", "🙈", "😭", "💔", "👍", "💪", "👀", "🚀",
  "🍕", "☕", "🎂", "🎁", "⚽", "🏏", "🇧🇩", "💤",
];
const MAX_ITEMS = 12;

/** parse what the server saved (anything odd is dropped) */
export function readOverlays(raw: unknown): StoryOverlay[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((o) => o && typeof o === "object" && typeof (o as StoryOverlay).s === "string")
    .map((o) => {
      const v = o as StoryOverlay;
      return {
        k: (["text", "emoji", "place", "time", "mention"].includes(v.k) ? v.k : "emoji") as StoryOverlay["k"],
        s: v.s,
        x: Number(v.x) || 0.5,
        y: Number(v.y) || 0.5,
        z: Number(v.z) || 1,
        r: Number(v.r) || 0,
        c: Number(v.c) || 0,
        bg: v.bg === true,
        f: Number(v.f) || 0,
      };
    })
    .slice(0, MAX_ITEMS);
}

function inkOn(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const l = 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  return l > 160 ? "#111111" : "#FFFFFF";
}

/** one item, drawn at its place (base = 1/100 of the frame's width, in px) */
function OverlayView({ o, base }: { o: StoryOverlay; base: number }) {
  if (o.k === "emoji") return <span style={{ fontSize: base * 14, lineHeight: 1, filter: "drop-shadow(0 3px 3px rgba(0,0,0,.3))" }}>{o.s}</span>;
  if (o.k === "text") {
    const col = STORY_TEXT_COLORS[o.c || 0] || "#FFFFFF";
    const font = FONTS[o.f || 0] || FONTS[0];
    const neon = (o.f || 0) === 1;
    return (
      <span
        style={{
          ...font.css,
          display: "inline-block",
          fontSize: base * 6.4,
          lineHeight: 1.2,
          padding: o.bg ? `${base * 1.2}px ${base * 2.6}px` : 0,
          borderRadius: base * 2,
          background: o.bg ? col : "transparent",
          color: o.bg ? inkOn(col) : col,
          textShadow: o.bg ? "none" : neon ? `0 0 ${base * 1.5}px ${col}, 0 0 ${base * 3.5}px ${col}` : "0 1px 4px rgba(0,0,0,.55)",
          whiteSpace: "pre-wrap",
          textAlign: "center",
          maxWidth: base * 86,
          wordBreak: "break-word",
        }}
      >
        {o.s}
      </span>
    );
  }
  const icon = o.k === "place" ? "📍" : o.k === "time" ? "🕒" : "@";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: base * 1.2,
        background: "#fff",
        color: o.k === "mention" ? "#4F46E5" : "#16264A",
        borderRadius: base * 2.4,
        padding: `${base * 1.4}px ${base * 2.6}px`,
        fontWeight: 900,
        fontSize: base * 4.4,
        whiteSpace: "nowrap",
        boxShadow: "0 3px 0 rgba(0,0,0,.18)",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <span>{icon}</span>
      {o.k === "mention" ? o.s : o.s}
    </span>
  );
}

function useFrameBase(ref: React.RefObject<HTMLElement | null>) {
  const [base, setBase] = useState(4);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBase(el.clientWidth / 100));
    ro.observe(el);
    setBase(el.clientWidth / 100);
    return () => ro.disconnect();
  }, [ref]);
  return base;
}

const place = (o: StoryOverlay): React.CSSProperties => ({
  position: "absolute",
  left: `${o.x * 100}%`,
  top: `${o.y * 100}%`,
  transform: `translate(-50%, -50%) rotate(${o.r}deg) scale(${o.z})`,
  transformOrigin: "center",
});

/** the words and stickers over a story (taps go through to the story) */
export function StoryOverlayLayer({ overlays }: { overlays: StoryOverlay[] | undefined }) {
  const box = useRef<HTMLDivElement>(null);
  const base = useFrameBase(box);
  if (!overlays || overlays.length === 0) return null;
  return (
    <div ref={box} className="pointer-events-none absolute inset-0 z-[5] select-none overflow-hidden">
      {overlays.map((o, i) => (
        <div key={i} style={place(o)}>
          <OverlayView o={o} base={base} />
        </div>
      ))}
    </div>
  );
}

/** the full-screen editor: Aa words, 😊 stickers, drag / size / turn, 🗑 */
export function StoryDecorEditor({
  background,
  initial,
  onDone,
  onCancel,
}: {
  background: ReactNode;
  initial: StoryOverlay[];
  onDone: (items: StoryOverlay[]) => void;
  onCancel: () => void;
}) {
  const [items, setItems] = useState<StoryOverlay[]>(initial);
  const [sel, setSel] = useState<number | null>(null);
  const [mode, setMode] = useState<null | "text" | "stickers">(null);
  const [editing, setEditing] = useState<number | null>(null); // which text is being typed (null = a new one)
  const [draft, setDraft] = useState({ s: "", c: 0, bg: false, f: 0 });
  const [tab, setTab] = useState<"emoji" | "info">("emoji");
  const [placeQ, setPlaceQ] = useState("");
  const [placeBusy, setPlaceBusy] = useState("");
  const [mention, setMention] = useState("");
  const [dragging, setDragging] = useState(false);
  const [overTrash, setOverTrash] = useState(false);
  const frame = useRef<HTMLDivElement>(null);
  const base = useFrameBase(frame);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ i: number; start: StoryOverlay; d0: number; a0: number; cx: number; cy: number; wasSel: boolean } | null>(null);
  const full = items.length >= MAX_ITEMS;

  const add = (o: Omit<StoryOverlay, "x" | "y" | "z" | "r">) => {
    if (full) return;
    // new things go to different spots, so they don't land on top of each other
    const SPOTS = [[0.5, 0.32], [0.5, 0.62], [0.3, 0.47], [0.7, 0.47], [0.5, 0.78], [0.5, 0.2]];
    setItems((xs) => {
      const [x, y] = SPOTS[xs.length % SPOTS.length];
      return [...xs, { x, y, z: 1, r: 0, ...o }];
    });
    setSel(items.length);
    setMode(null);
  };
  const update = (i: number, p: Partial<StoryOverlay>) => setItems((xs) => xs.map((o, k) => (k === i ? { ...o, ...p } : o)));
  const remove = (i: number) => {
    setItems((xs) => xs.filter((_, k) => k !== i));
    setSel(null);
  };

  const openText = (i: number | null) => {
    const o = i !== null ? items[i] : null;
    setEditing(i);
    setDraft({ s: o?.s || "", c: o?.c || 0, bg: !!o?.bg, f: o?.f || 0 });
    setMode("text");
  };
  const saveText = () => {
    const s = draft.s.trim().slice(0, 80);
    if (editing !== null) {
      if (s) update(editing, { s, c: draft.c, bg: draft.bg, f: draft.f });
      else remove(editing);
    } else if (s) add({ k: "text", s, c: draft.c, bg: draft.bg, f: draft.f });
    setMode(null);
  };

  // ✋ one finger moves, two fingers size and turn
  const twoInfo = () => {
    const ps = Array.from(pointers.current.values());
    const [a, b] = ps;
    return { d: Math.hypot(b.x - a.x, b.y - a.y), ang: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI };
  };
  const onDown = (i: number) => (e: React.PointerEvent) => {
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const wasSel = sel === i;
    setSel(i);
    const two = pointers.current.size >= 2 ? twoInfo() : { d: 1, ang: 0 };
    gesture.current = { i, start: { ...items[i] }, d0: two.d, a0: two.ang, cx: e.clientX, cy: e.clientY, wasSel };
    if (pointers.current.size === 1) setDragging(true);
  };
  const onMove = (e: React.PointerEvent) => {
    const g = gesture.current;
    if (!g || !pointers.current.has(e.pointerId) || !frame.current) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const rect = frame.current.getBoundingClientRect();
    if (pointers.current.size >= 2) {
      const t = twoInfo();
      update(g.i, { z: Math.min(4, Math.max(0.4, g.start.z * (t.d / Math.max(1, g.d0)))), r: Math.max(-180, Math.min(180, g.start.r + (t.ang - g.a0))) });
    } else {
      const nx = Math.min(1, Math.max(0, g.start.x + (e.clientX - g.cx) / rect.width));
      const ny = Math.min(1, Math.max(0, g.start.y + (e.clientY - g.cy) / rect.height));
      update(g.i, { x: nx, y: ny });
      setOverTrash(e.clientY > rect.bottom - 90 && Math.abs(e.clientX - (rect.left + rect.width / 2)) < 60);
    }
  };
  const onUp = (e: React.PointerEvent) => {
    const g = gesture.current;
    const wasOne = pointers.current.size === 1;
    pointers.current.delete(e.pointerId);
    if (g && wasOne) {
      if (overTrash) remove(g.i);
      else if (items[g.i]?.k === "text" && Math.abs(e.clientX - g.cx) < 4 && Math.abs(e.clientY - g.cy) < 4 && g.wasSel) openText(g.i); // a 2nd tap on a text = edit it
      gesture.current = null;
      setDragging(false);
      setOverTrash(false);
    } else if (g && pointers.current.size === 1) {
      // one finger left: keep moving from here
      const [p] = Array.from(pointers.current.values());
      gesture.current = { i: g.i, start: { ...items[g.i] }, d0: 1, a0: 0, cx: p.x, cy: p.y, wasSel: false };
    }
  };

  const fillGps = async () => {
    setPlaceBusy("Finding you…");
    try {
      const p = await placeHere();
      add({ k: "place", s: p.name });
      setPlaceBusy("");
    } catch (err) {
      setPlaceBusy(
        (err as { code?: number })?.code === 1
          ? "Location is blocked — allow Location for this site, or pick a place below."
          : "Couldn't find your location — pick a place below."
      );
    }
  };

  const s = sel !== null ? items[sel] : null;
  return (
    <div className="fixed inset-0 z-[70] flex justify-center bg-black" role="dialog" aria-label="Text and stickers">
      <div ref={frame} className="relative h-full w-full max-w-[480px] touch-none select-none overflow-hidden" onPointerDown={() => setSel(null)}>
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">{background}</div>

        {items.map((o, i) => (
          <div
            key={i}
            style={{ ...place(o), cursor: "grab", outline: sel === i ? "2px dashed rgba(255,255,255,.9)" : "none", outlineOffset: 6, borderRadius: 8 }}
            onPointerDown={onDown(i)}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
          >
            <OverlayView o={o} base={base} />
          </div>
        ))}

        {/* top: ✕ · Aa · 😊 · Done */}
        {!mode && (
          <>
            <div className="absolute left-0 right-0 top-0 flex items-center gap-2 p-3" onPointerDown={(e) => e.stopPropagation()}>
              <button type="button" onClick={onCancel} className="grid h-10 w-10 place-items-center rounded-full bg-black/45 text-[16px] font-bold text-white">✕</button>
              <span className="flex-1" />
              <button type="button" disabled={full} onClick={() => openText(null)} className="grid h-11 w-11 place-items-center rounded-full bg-white text-[17px] font-black text-[#7f53ff] shadow disabled:opacity-40" aria-label="Add text">Aa</button>
              <button type="button" disabled={full} onClick={() => setMode("stickers")} className="grid h-11 w-11 place-items-center rounded-full bg-black/45 text-[20px] disabled:opacity-40" aria-label="Add a sticker">😊</button>
            </div>
            {/* the picked item: smaller / bigger / turn / edit / delete (for a mouse) */}
            {s && sel !== null && !dragging && (
              <div className="absolute bottom-20 left-1/2 flex -translate-x-1/2 gap-1.5 rounded-full bg-black/55 p-1.5" onPointerDown={(e) => e.stopPropagation()}>
                {[
                  ["−", () => update(sel, { z: Math.max(0.4, s.z / 1.15) })],
                  ["+", () => update(sel, { z: Math.min(4, s.z * 1.15) })],
                  ["⟲", () => update(sel, { r: Math.max(-180, s.r - 10) })],
                  ["⟳", () => update(sel, { r: Math.min(180, s.r + 10) })],
                  ...(s.k === "text" ? ([["✏️", () => openText(sel)]] as const) : []),
                  ["🗑", () => remove(sel)],
                ].map(([label, run]) => (
                  <button key={label as string} type="button" onClick={run as () => void} className="grid h-9 w-9 place-items-center rounded-full bg-white/15 text-[16px] font-black text-white">
                    {label as string}
                  </button>
                ))}
              </div>
            )}
            {dragging && (
              <div className={`pointer-events-none absolute bottom-6 left-1/2 grid h-14 w-14 -translate-x-1/2 place-items-center rounded-full text-[22px] transition ${overTrash ? "scale-125 bg-[#E11D48]" : "bg-black/50"}`}>🗑</div>
            )}
            {!dragging && (
              <div className="absolute bottom-0 left-0 right-0 flex items-center gap-2 p-3" onPointerDown={(e) => e.stopPropagation()}>
                <span className="text-[11.5px] text-white/75 [text-shadow:0_1px_2px_rgba(0,0,0,.6)]">
                  {items.length ? "Drag to move · two fingers to size & turn" : "Add words (Aa) or a sticker (😊)"}
                </span>
                <span className="flex-1" />
                <button type="button" onClick={() => onDone(items)} className="rounded-full bg-white px-5 py-2 text-[14px] font-black text-[#16264A] shadow">Done</button>
              </div>
            )}
          </>
        )}

        {/* Aa — typing the words */}
        {mode === "text" && (
          <div className="absolute inset-0 z-20 flex flex-col bg-black/60" onPointerDown={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 p-3">
              <button
                type="button"
                onClick={() => setDraft((d) => ({ ...d, bg: !d.bg }))}
                aria-pressed={draft.bg}
                className={`grid h-10 w-10 place-items-center rounded-full text-[15px] font-black ${draft.bg ? "bg-white text-[#16264A]" : "bg-white/15 text-white"}`}
                title="Colour box behind the words"
              >
                A
              </button>
              <span className="flex-1" />
              <button type="button" onClick={saveText} className="rounded-full bg-white px-5 py-2 text-[14px] font-black text-[#16264A]">Done</button>
            </div>
            <div className="flex flex-1 items-center justify-center px-6">
              <textarea
                autoFocus
                value={draft.s}
                onChange={(e) => setDraft((d) => ({ ...d, s: e.target.value.slice(0, 80) }))}
                placeholder="Type something…"
                rows={3}
                className="w-full resize-none bg-transparent text-center outline-none placeholder:text-white/50"
                style={{
                  ...FONTS[draft.f].css,
                  fontSize: base * 6.4,
                  color: draft.bg ? inkOn(STORY_TEXT_COLORS[draft.c]) : STORY_TEXT_COLORS[draft.c],
                  background: draft.bg ? STORY_TEXT_COLORS[draft.c] : "transparent",
                  borderRadius: base * 2,
                  padding: base * 2,
                }}
              />
            </div>
            <div className="flex justify-center gap-1.5 pb-2">
              {FONTS.map((f, k) => (
                <button key={f.name} type="button" onClick={() => setDraft((d) => ({ ...d, f: k }))} className={`rounded-full px-3 py-1 text-[12px] font-bold ${draft.f === k ? "bg-white text-[#16264A]" : "bg-white/15 text-white"}`} style={f.css}>
                  {f.name}
                </button>
              ))}
            </div>
            <div className="flex justify-center gap-2 pb-5">
              {STORY_TEXT_COLORS.map((c, k) => (
                <button key={c} type="button" onClick={() => setDraft((d) => ({ ...d, c: k }))} aria-label={`Colour ${k + 1}`} className={`h-7 w-7 rounded-full border-2 ${draft.c === k ? "scale-110 border-white" : "border-white/60"}`} style={{ background: c }} />
              ))}
            </div>
          </div>
        )}

        {/* 😊 — the sticker tray */}
        {mode === "stickers" && (
          <div className="absolute inset-0 z-20 flex flex-col justify-end bg-black/40" onPointerDown={(e) => (e.stopPropagation(), setMode(null))}>
            <div className="max-h-[66%] overflow-y-auto rounded-t-3xl bg-white p-3" onPointerDown={(e) => e.stopPropagation()}>
              <div className="mb-2 flex gap-1.5">
                {([["emoji", "😀 Emoji"], ["info", "📍 Place · 🕒 Time · @"]] as const).map(([k, label]) => (
                  <button key={k} type="button" onClick={() => setTab(k)} className={`rounded-full px-3 py-1.5 text-[12.5px] font-extrabold ${tab === k ? "bg-[#7f53ff] text-white" : "bg-[#F1F4F9] text-[#5B6B8C]"}`}>
                    {label}
                  </button>
                ))}
                <span className="flex-1" />
                <button type="button" onClick={() => setMode(null)} className="rounded-full bg-[#F1F4F9] px-3 text-[13px] font-bold text-[#5B6B8C]">✕</button>
              </div>
              {tab === "emoji" ? (
                <div className="grid grid-cols-8 gap-1.5">
                  {STICKER_EMOJI.map((e) => (
                    <button key={e} type="button" onClick={() => add({ k: "emoji", s: e })} className="grid h-11 place-items-center rounded-xl bg-[#F6F8FC] text-[26px] hover:bg-[#EEF2FA]">
                      {e}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="space-y-3 text-[#16264A]">
                  <div>
                    <p className="mb-1 text-[13px] font-extrabold">📍 Place</p>
                    <button type="button" disabled={placeBusy === "Finding you…"} onClick={fillGps} className="w-full rounded-2xl bg-gradient-to-r from-[#EEF4FF] to-[#F3E8FF] px-3.5 py-2.5 text-left text-[13.5px] font-extrabold text-[#4F46E5]">
                      🎯 {placeBusy || "Use my current location"}
                    </button>
                    <input value={placeQ} onChange={(e) => setPlaceQ(e.target.value.slice(0, 60))} placeholder="🔍 Search a place…" className="mt-2 h-10 w-full rounded-2xl bg-[#F4F6FD] px-3 text-[13.5px] outline-none" />
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {placeQ.trim() && (
                        <button type="button" onClick={() => add({ k: "place", s: placeQ.trim() })} className="rounded-full bg-[#FFF1F2] px-3 py-1 text-[12px] font-bold">➕ {placeQ.trim()}</button>
                      )}
                      {searchPlaces(placeQ).slice(0, 8).map((p) => (
                        <button key={p.name + p.sub} type="button" onClick={() => add({ k: "place", s: p.name })} className="rounded-full bg-[#F1F4F9] px-3 py-1 text-[12px] font-bold">
                          {p.icon} {p.name}
                        </button>
                      ))}
                    </div>
                  </div>
                  <button type="button" onClick={() => add({ k: "time", s: new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) })} className="rounded-full bg-[#F1F4F9] px-4 py-2 text-[13px] font-extrabold">
                    🕒 Add the time
                  </button>
                  <div>
                    <p className="mb-1 text-[13px] font-extrabold">@ Mention a friend</p>
                    <div className="flex gap-2">
                      <input value={mention} onChange={(e) => setMention(e.target.value.replace(/[^A-Za-z0-9_.\-]/g, "").slice(0, 30))} placeholder="username" className="h-10 flex-1 rounded-2xl bg-[#F4F6FD] px-3 text-[13.5px] outline-none" />
                      <button type="button" disabled={mention.length < 2} onClick={() => (add({ k: "mention", s: mention }), setMention(""))} className="rounded-2xl bg-[#4F46E5] px-4 text-[13px] font-extrabold text-white disabled:opacity-40">Add</button>
                    </div>
                    <p className="mt-1 text-[11.5px] text-[#6B7A99]">Your friend gets an alert when you share the story.</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
