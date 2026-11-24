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
  k: "text" | "emoji" | "place" | "time" | "mention" | "date" | "birthday" | "thoughts" | "question" | "poll" | "link";
  s: string;
  /** 📊 poll answers */
  a?: string;
  b?: string;
  /** 🔗 a link's label */
  t?: string;
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
const OVERLAY_KINDS: string[] = ["text", "emoji", "place", "time", "mention", "date", "birthday", "thoughts", "question", "poll", "link"];

/** ✨ the colour effects (Story editor → Effects); index 0 = none. Same on the app. */
export const STORY_FX: { name: string; css: string }[] = [
  { name: "Normal", css: "none" },
  { name: "Warm", css: "sepia(.25) saturate(1.35) hue-rotate(-8deg)" },
  { name: "Cool", css: "saturate(1.1) hue-rotate(12deg) brightness(1.05)" },
  { name: "B & W", css: "grayscale(1) contrast(1.1)" },
  { name: "Vivid", css: "saturate(1.7) contrast(1.08)" },
  { name: "Fade", css: "contrast(.85) brightness(1.1) saturate(.8)" },
];
export const fxCss = (fx?: number) => STORY_FX[fx || 0]?.css || "none";

/** what the viewer can do with a story's poll / question / link */
export type OverlayActions = {
  pollVotes?: number[];
  myVote?: number | null;
  onVote?: (choice: number) => void;
  onAnswer?: () => void;
};

/** parse what the server saved (anything odd is dropped) */
export function readOverlays(raw: unknown): StoryOverlay[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((o) => o && typeof o === "object" && typeof (o as StoryOverlay).s === "string")
    .map((o) => {
      const v = o as StoryOverlay;
      return {
        k: (OVERLAY_KINDS.includes(v.k) ? v.k : "emoji") as StoryOverlay["k"],
        s: v.s,
        ...(typeof v.a === "string" ? { a: v.a } : {}),
        ...(typeof v.b === "string" ? { b: v.b } : {}),
        ...(typeof v.t === "string" ? { t: v.t } : {}),
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
function OverlayView({ o, base, act }: { o: StoryOverlay; base: number; act?: OverlayActions }) {
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
  const card: React.CSSProperties = {
    display: "inline-block",
    background: "#fff",
    color: "#0B1B3F",
    borderRadius: base * 3,
    padding: `${base * 2.6}px ${base * 3}px`,
    fontFamily: "system-ui, sans-serif",
    boxShadow: "0 4px 14px rgba(0,0,0,.22)",
    width: base * 62,
    textAlign: "left",
  };
  if (o.k === "poll") {
    const v = act?.pollVotes || [0, 0];
    const total = (v[0] || 0) + (v[1] || 0);
    const voted = act?.myVote !== undefined && act?.myVote !== null;
    const opt = (label: string, i: number, tint: string) => {
      const pct = total ? Math.round(((v[i] || 0) * 100) / total) : 0;
      return (
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => (e.stopPropagation(), act?.onVote?.(i))}
          style={{ position: "relative", flex: 1, overflow: "hidden", borderRadius: base * 2, padding: `${base * 2}px ${base}px`, background: tint, fontWeight: 800, fontSize: base * 3.6, color: "#0B1B3F", border: act?.myVote === i ? `${base * 0.5}px solid #1D4ED8` : "none" }}
        >
          {voted && <span style={{ position: "absolute", inset: 0, width: `${pct}%`, background: "rgba(29,78,216,.18)" }} />}
          <span style={{ position: "relative" }}>{label}{voted ? ` · ${pct}%` : ""}</span>
        </button>
      );
    };
    return (
      <div style={card}>
        <div style={{ fontWeight: 900, fontSize: base * 4.4, marginBottom: base * 2 }}>{o.s}</div>
        <div style={{ display: "flex", gap: base * 1.5 }}>
          {opt(o.a || "Yes", 0, "#DBEAFE")}
          {opt(o.b || "No", 1, "#FCE7F3")}
        </div>
      </div>
    );
  }
  if (o.k === "question") {
    return (
      <div style={{ ...card, textAlign: "center", background: "linear-gradient(135deg,#7C3AED,#2563EB)", color: "#fff" }}>
        <div style={{ fontWeight: 900, fontSize: base * 4.6, marginBottom: base * 2 }}>❓ {o.s}</div>
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => (e.stopPropagation(), act?.onAnswer?.())}
          style={{ width: "100%", borderRadius: base * 2, padding: `${base * 2}px`, background: "rgba(255,255,255,.95)", color: "#64748B", fontSize: base * 3.6, fontWeight: 700 }}
        >
          Tap to answer…
        </button>
      </div>
    );
  }
  if (o.k === "thoughts") {
    return (
      <span style={{ display: "inline-block", background: "#fff", color: "#0B1B3F", borderRadius: base * 6, padding: `${base * 2}px ${base * 3.4}px`, fontWeight: 800, fontSize: base * 4.4, fontFamily: "system-ui, sans-serif", boxShadow: "0 4px 12px rgba(0,0,0,.2)", maxWidth: base * 70 }}>
        💭 {o.s}
      </span>
    );
  }
  if (o.k === "birthday") {
    return (
      <span style={{ display: "inline-block", background: "linear-gradient(135deg,#F472B6,#F59E0B)", color: "#fff", borderRadius: base * 3, padding: `${base * 2}px ${base * 3.4}px`, fontWeight: 900, fontSize: base * 5, fontFamily: "system-ui, sans-serif", boxShadow: "0 4px 12px rgba(0,0,0,.2)" }}>
        🎂 {o.s}
      </span>
    );
  }
  if (o.k === "link") {
    let host = o.s;
    try {
      host = new URL(o.s).hostname.replace(/^www\./, "");
    } catch {
      /* keep */
    }
    return (
      <a
        href={o.s}
        target="_blank"
        rel="noopener noreferrer nofollow"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        style={{ display: "inline-flex", alignItems: "center", gap: base * 1.4, background: "#fff", color: "#1D4ED8", borderRadius: base * 2.4, padding: `${base * 1.6}px ${base * 2.8}px`, fontWeight: 900, fontSize: base * 4.2, fontFamily: "system-ui, sans-serif", boxShadow: "0 3px 0 rgba(0,0,0,.18)", textDecoration: "none", whiteSpace: "nowrap" }}
      >
        🔗 {o.t || host}
      </a>
    );
  }
  const icon = o.k === "place" ? "📍" : o.k === "time" ? "🕒" : o.k === "date" ? "📅" : "@";
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

/** the words and stickers over a story (taps go through to the story, except a poll, a question or a link) */
export function StoryOverlayLayer({ overlays, act }: { overlays: StoryOverlay[] | undefined; act?: OverlayActions }) {
  const box = useRef<HTMLDivElement>(null);
  const base = useFrameBase(box);
  if (!overlays || overlays.length === 0) return null;
  return (
    <div ref={box} className="pointer-events-none absolute inset-0 z-[5] select-none overflow-hidden">
      {overlays.map((o, i) => (
        <div key={i} style={{ ...place(o), pointerEvents: o.k === "poll" || o.k === "question" || o.k === "link" ? "auto" : "none" }}>
          <OverlayView o={o} base={base} act={act} />
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
  fx,
  onFx,
  musicTitle,
  onMusic,
  doneLabel = "Done",
}: {
  background: ReactNode;
  initial: StoryOverlay[];
  onDone: (items: StoryOverlay[]) => void;
  onCancel: () => void;
  /** ✨ the colour effect (index in STORY_FX) and how to change it */
  fx?: number;
  onFx?: (fx: number) => void;
  /** 🎵 the song picked, and how to pick one */
  musicTitle?: string;
  onMusic?: () => void;
  doneLabel?: string;
}) {
  const [items, setItems] = useState<StoryOverlay[]>(initial);
  const [sel, setSel] = useState<number | null>(null);
  const [mode, setMode] = useState<null | "text" | "stickers" | "place" | "mention" | "link" | "poll" | "question" | "thoughts" | "birthday" | "effects">(null);
  const [form, setForm] = useState({ s: "", a: "", b: "", t: "" });
  const [stickerQ, setStickerQ] = useState("");
  const openForm = (m: NonNullable<typeof mode>, s0 = "") => (setForm({ s: s0, a: "", b: "", t: "" }), setMode(m));
  const [editing, setEditing] = useState<number | null>(null); // which text is being typed (null = a new one)
  const [draft, setDraft] = useState({ s: "", c: 0, bg: false, f: 0 });
  const [placeQ, setPlaceQ] = useState("");
  const [placeBusy, setPlaceBusy] = useState("");
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
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center" style={{ filter: fxCss(fx) }}>{background}</div>

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
            <div className="absolute left-0 top-0 p-3" onPointerDown={(e) => e.stopPropagation()}>
              <button type="button" onClick={onCancel} className="grid h-10 w-10 place-items-center rounded-full bg-black/45 text-[16px] font-bold text-white">✕</button>
            </div>
            {musicTitle && (
              <div className="pointer-events-none absolute left-16 top-4 max-w-[52%] truncate rounded-full bg-black/40 px-3 py-1.5 text-[12.5px] font-bold text-white">🎵 {musicTitle}</div>
            )}
            {/* 🎨 Story v2 (2026-11-24): the tools on the right — Music · Stickers · Text · Effects · Mention · Link */}
            {!dragging && (
              <div className="absolute right-3 top-16 flex flex-col items-end gap-3" onPointerDown={(e) => e.stopPropagation()}>
                {(
                  [
                    ["Music", "🎵", () => onMusic?.(), !onMusic],
                    ["Stickers", "🏷", () => (setStickerQ(""), setMode("stickers")), full],
                    ["Text", "Aa", () => openText(null), full],
                    ["Effects", "✨", () => setMode("effects"), !onFx],
                    ["Mention", "@", () => openForm("mention"), full],
                    ["Link", "🔗", () => openForm("link", "https://"), full],
                  ] as [string, string, () => void, boolean][]
                ).map(([label, icon, run, off]) =>
                  off ? null : (
                    <button key={label} type="button" onClick={run} className="flex items-center gap-2 text-[12px] font-bold text-white [text-shadow:0_1px_3px_rgba(0,0,0,.6)]">
                      {label}
                      <span className="grid h-11 w-11 place-items-center rounded-full bg-white/20 text-[19px] font-black backdrop-blur-sm">{icon}</span>
                    </button>
                  )
                )}
              </div>
            )}
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
                  {items.length ? "Drag to move · two fingers to size & turn" : "Add words, stickers, a link…"}
                </span>
                <span className="flex-1" />
                <button type="button" onClick={() => onDone(items)} className="rounded-full bg-white px-5 py-2 text-[14px] font-black text-[#1D4ED8] shadow">{doneLabel}</button>
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

        {/* 🏷 Story v2: the sticker sheet — search, the special stickers, then big emoji */}
        {mode === "stickers" && (
          <div className="absolute inset-0 z-20 flex flex-col justify-end bg-black/40" onPointerDown={(e) => (e.stopPropagation(), setMode(null))}>
            <div className="max-h-[70%] overflow-y-auto rounded-t-[26px] bg-white px-3.5 pb-5 pt-2.5 text-[#0B1B3F]" onPointerDown={(e) => e.stopPropagation()}>
              <div className="mx-auto mb-3 h-[5px] w-11 rounded-full bg-[#CBD5E1]" />
              <input value={stickerQ} onChange={(e) => setStickerQ(e.target.value.slice(0, 30))} placeholder="🔍 Search stickers" className="mb-3 h-11 w-full rounded-2xl bg-[#EEF2FA] px-4 text-[14px] outline-none" />
              <div className="mb-3.5 flex flex-wrap gap-2">
                {(
                  [
                    ["📍 Location", () => setMode("place")],
                    [`🕒 ${new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`, () => add({ k: "time", s: new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) })],
                    ["📅 Today", () => add({ k: "date", s: new Date().toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }) })],
                    ["📊 Poll", () => openForm("poll")],
                    ["❓ Question", () => openForm("question", "Ask me anything")],
                    ["@ Mention", () => openForm("mention")],
                    ...(onMusic ? ([["🎵 Music", () => (setMode(null), onMusic())]] as [string, () => void][]) : []),
                    ["🔗 Link", () => openForm("link", "https://")],
                    ["💭 Thoughts", () => openForm("thoughts")],
                    ["🎂 Birthday", () => openForm("birthday", "Happy Birthday!")],
                  ] as [string, () => void][]
                )
                  .filter(([label]) => !stickerQ.trim() || label.toLowerCase().includes(stickerQ.trim().toLowerCase()))
                  .map(([label, run]) => (
                    <button key={label} type="button" disabled={full} onClick={run} className="rounded-xl bg-[#EEF2FA] px-3 py-2 text-[13.5px] font-extrabold disabled:opacity-40">
                      {label}
                    </button>
                  ))}
              </div>
              <div className="grid grid-cols-5 gap-2.5">
                {STICKER_EMOJI.map((e) => (
                  <button key={e} type="button" disabled={full} onClick={() => add({ k: "emoji", s: e })} className="grid h-14 place-items-center rounded-2xl text-[38px] hover:bg-[#EEF2FA] disabled:opacity-40">
                    {e}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 📍 a place */}
        {mode === "place" && (
          <div className="absolute inset-0 z-20 flex flex-col justify-end bg-black/40" onPointerDown={(e) => (e.stopPropagation(), setMode(null))}>
            <div className="rounded-t-[26px] bg-white p-4 text-[#16264A]" onPointerDown={(e) => e.stopPropagation()}>
              <p className="mb-2 text-[15px] font-extrabold">📍 Location</p>
              <button type="button" disabled={placeBusy === "Finding you…"} onClick={fillGps} className="w-full rounded-2xl bg-[#EEF4FF] px-3.5 py-2.5 text-left text-[13.5px] font-extrabold text-[#1D4ED8]">
                🎯 {placeBusy || "Use my current location"}
              </button>
              <input value={placeQ} onChange={(e) => setPlaceQ(e.target.value.slice(0, 60))} placeholder="🔍 Search a place…" className="mt-2 h-11 w-full rounded-2xl bg-[#F4F6FD] px-3 text-[13.5px] outline-none" />
              <div className="mt-2 flex flex-wrap gap-1.5">
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
          </div>
        )}

        {/* @ mention · 🔗 link · 📊 poll · ❓ question · 💭 thoughts · 🎂 birthday — a small form */}
        {mode && ["mention", "link", "poll", "question", "thoughts", "birthday"].includes(mode) && (
          <div className="absolute inset-0 z-20 flex flex-col justify-end bg-black/40" onPointerDown={(e) => (e.stopPropagation(), setMode(null))}>
            <div className="space-y-2.5 rounded-t-[26px] bg-white p-4 text-[#16264A]" onPointerDown={(e) => e.stopPropagation()}>
              <p className="text-[15px] font-extrabold">
                {{ mention: "@ Mention a friend", link: "🔗 Add a link", poll: "📊 Poll", question: "❓ Question", thoughts: "💭 Thoughts", birthday: "🎂 Birthday" }[mode as string]}
              </p>
              <input
                autoFocus
                value={form.s}
                onChange={(e) => setForm({ ...form, s: mode === "mention" ? e.target.value.replace(/[^A-Za-z0-9_.\-@]/g, "").slice(0, 30) : e.target.value.slice(0, mode === "link" ? 300 : mode === "question" ? 80 : 60) })}
                placeholder={{ mention: "username", link: "https://…", poll: "Ask a question", question: "Ask me anything", thoughts: "What's on your mind?", birthday: "Happy Birthday!" }[mode as string]}
                className="h-11 w-full rounded-2xl bg-[#F4F6FD] px-3.5 text-[14px] outline-none"
              />
              {mode === "poll" && (
                <div className="flex gap-2">
                  <input value={form.a} onChange={(e) => setForm({ ...form, a: e.target.value.slice(0, 24) })} placeholder="Answer 1" className="h-11 min-w-0 flex-1 rounded-2xl bg-[#DBEAFE] px-3 text-[14px] outline-none" />
                  <input value={form.b} onChange={(e) => setForm({ ...form, b: e.target.value.slice(0, 24) })} placeholder="Answer 2" className="h-11 min-w-0 flex-1 rounded-2xl bg-[#FCE7F3] px-3 text-[14px] outline-none" />
                </div>
              )}
              {mode === "link" && (
                <input value={form.t} onChange={(e) => setForm({ ...form, t: e.target.value.slice(0, 30) })} placeholder="Label (optional)" className="h-11 w-full rounded-2xl bg-[#F4F6FD] px-3.5 text-[14px] outline-none" />
              )}
              {mode === "mention" && <p className="text-[11.5px] text-[#6B7A99]">Your friend gets an alert when you share the story.</p>}
              {mode === "question" && <p className="text-[11.5px] text-[#6B7A99]">Answers come to you as private messages.</p>}
              {mode === "poll" && items.some((o) => o.k === "poll") && <p className="text-[11.5px] text-[#B91C1C]">A story can have one poll.</p>}
              <button
                type="button"
                disabled={
                  !form.s.trim() ||
                  (mode === "poll" && (!form.a.trim() || !form.b.trim() || items.some((o) => o.k === "poll"))) ||
                  (mode === "link" && !/^https?:\/\/[^\s<>"']+\.[^\s<>"']+$/i.test(form.s.trim())) ||
                  (mode === "mention" && form.s.replace(/^@/, "").length < 2)
                }
                onClick={() => {
                  const v = form.s.trim();
                  if (mode === "mention") add({ k: "mention", s: v.replace(/^@/, "") });
                  else if (mode === "link") add({ k: "link", s: v, t: form.t.trim() || undefined });
                  else if (mode === "poll") add({ k: "poll", s: v, a: form.a.trim(), b: form.b.trim() });
                  else add({ k: mode as StoryOverlay["k"], s: v });
                }}
                className="h-12 w-full rounded-2xl bg-[#1D4ED8] text-[15px] font-extrabold text-white disabled:opacity-40"
              >
                Add
              </button>
            </div>
          </div>
        )}

        {/* ✨ effects */}
        {mode === "effects" && onFx && (
          <div className="absolute inset-0 z-20 flex flex-col justify-end" onPointerDown={(e) => (e.stopPropagation(), setMode(null))}>
            <div className="flex gap-2.5 overflow-x-auto bg-black/55 p-3.5 pb-5 [scrollbar-width:none]" onPointerDown={(e) => e.stopPropagation()}>
              {STORY_FX.map((f, k) => (
                <button key={f.name} type="button" onClick={() => onFx(k)} className="flex shrink-0 flex-col items-center gap-1.5 text-[12px] font-bold text-white">
                  <span className={`h-16 w-16 overflow-hidden rounded-2xl border-[3px] ${fx === k ? "border-white" : "border-transparent"}`} style={{ background: "linear-gradient(135deg,#F59E0B,#EC4899,#3B82F6)", filter: f.css }} />
                  {f.name}
                </button>
              ))}
              <button type="button" onClick={() => setMode(null)} className="ml-auto shrink-0 self-center rounded-full bg-white px-4 py-2 text-[13px] font-black text-[#1D4ED8]">Done</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
