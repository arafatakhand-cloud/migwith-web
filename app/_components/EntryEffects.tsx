"use client";

import { useEffect, useRef, useState } from "react";
import { doc, getDoc, onSnapshot } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../../lib/firebase";
import { serverNow } from "../../lib/serverTime";
import { brandMiglife } from "../../lib/brand";
import { useIsClassic } from "../../lib/uiStyle";
import { isMainFounderName } from "../../lib/founder";
import { ShopItemEditDialog, shopName, shopPrice, useShopOverrides } from "./ShopEdit";
import { FxCanvas, clamp01, dot, hashStr, heartPath, rgba, rng, useNewLineEvents, usePlayQueue } from "./RoomEffects";

// ✨ ENTRY EFFECTS (the app's EntryEffects.kt) — 30-day subscriptions bought
// with coins (buyEntryEffect). When the owner enters a room, EVERYONE there
// sees the effect: the "has entered" line arrives, and the effect named in
// entry_fx_public/{usernameLower} plays. Only the Cloud Functions write
// entry_fx/{uid} (my own list) and entry_fx_public.

export type EntryFx = {
  id: string; name: string; emoji: string; category: string; price: number;
  banner: [string, string]; ink: string; accent: string; subtitle: string;
};

export const ENTRY_FX_CATEGORIES = ["🌟 Classic", "🌸 Nature", "💖 Love", "🎉 Party", "🏮 Festival", "🔥 Elements", "💰 Rich", "👑 Royal", "🚀 Legend", "🐉 Mythic", "💎 Exclusive"];

export const ENTRY_FX: EntryFx[] = [
  { id: "sparkle", name: "Golden Sparkle", emoji: "✨", category: "🌟 Classic", price: 100000, banner: ["#3E2723", "#6D4C41"], ink: "#FFF8E1", accent: "#FFD54F", subtitle: "sparkles into the room" },
  { id: "bubbles", name: "Bubble Pop", emoji: "🫧", category: "🌟 Classic", price: 110000, banner: ["#01579B", "#0288D1"], ink: "#FFFFFF", accent: "#80D8FF", subtitle: "bubbles in" },
  { id: "roses", name: "Rose Rain", emoji: "🌹", category: "💖 Love", price: 140000, banner: ["#880E4F", "#C2185B"], ink: "#FFFFFF", accent: "#FF80AB", subtitle: "arrives in a rain of roses" },
  { id: "hearts", name: "Heart Burst", emoji: "💖", category: "💖 Love", price: 150000, banner: ["#F50057", "#FF4081"], ink: "#FFFFFF", accent: "#FFE4EC", subtitle: "brings all the love" },
  { id: "fire", name: "Fire Blaze", emoji: "🔥", category: "🔥 Elements", price: 180000, banner: ["#BF360C", "#FF6D00"], ink: "#FFF3E0", accent: "#FFAB40", subtitle: "blazes in!" },
  { id: "thunder", name: "Thunder Strike", emoji: "⚡", category: "🔥 Elements", price: 220000, banner: ["#0D1B4A", "#283593"], ink: "#E3F2FD", accent: "#82B1FF", subtitle: "strikes like thunder!" },
  { id: "royal", name: "Royal Arrival", emoji: "👑", category: "👑 Royal", price: 320000, banner: ["#1A1405", "#4E3B0A"], ink: "#FFE082", accent: "#FFD54F", subtitle: "— make way for royalty!" },
  { id: "carpet", name: "Red Carpet", emoji: "🎬", category: "👑 Royal", price: 350000, banner: ["#4A0000", "#B71C1C"], ink: "#FFF8E1", accent: "#FFD54F", subtitle: "walks the red carpet" },
  { id: "meteor", name: "Meteor Shower", emoji: "☄️", category: "🚀 Legend", price: 380000, banner: ["#0B0524", "#311B92"], ink: "#FFFFFF", accent: "#FFAB40", subtitle: "falls from the sky!" },
  { id: "galaxy", name: "Galaxy Portal", emoji: "🌌", category: "🚀 Legend", price: 420000, banner: ["#12005E", "#6A1B9A"], ink: "#FFFFFF", accent: "#7DF9FF", subtitle: "steps out of a portal!" },
  { id: "sakura", name: "Cherry Blossom", emoji: "🌸", category: "🌸 Nature", price: 120000, banner: ["#AD1457", "#F48FB1"], ink: "#FFFFFF", accent: "#FFE4EC", subtitle: "drifts in with the blossoms" },
  { id: "snow", name: "Snowfall", emoji: "❄️", category: "🌸 Nature", price: 120000, banner: ["#0D47A1", "#64B5F6"], ink: "#FFFFFF", accent: "#E1F5FE", subtitle: "brings the winter magic" },
  { id: "confetti", name: "Confetti Blast", emoji: "🎊", category: "🎉 Party", price: 160000, banner: ["#6A1B9A", "#FF6F00"], ink: "#FFFFFF", accent: "#FFEB3B", subtitle: "— let's party!" },
  { id: "disco", name: "Disco Night", emoji: "🪩", category: "🎉 Party", price: 200000, banner: ["#1A0033", "#4A148C"], ink: "#FFFFFF", accent: "#FF4FD8", subtitle: "hits the dance floor!" },
  { id: "money", name: "Money Rain", emoji: "💸", category: "💰 Rich", price: 250000, banner: ["#1B5E20", "#43A047"], ink: "#FFF9C4", accent: "#FFD54F", subtitle: "makes it rain!" },
  { id: "diamonds", name: "Diamond Shower", emoji: "💎", category: "💰 Rich", price: 300000, banner: ["#01579B", "#4FC3F7"], ink: "#FFFFFF", accent: "#E1F5FE", subtitle: "shines like a diamond" },
  { id: "aurora", name: "Aurora Sky", emoji: "🌌", category: "🐉 Mythic", price: 450000, banner: ["#002420", "#00695C"], ink: "#E0F2F1", accent: "#64FFDA", subtitle: "arrives under the northern lights" },
  { id: "phoenix", name: "Phoenix Rise", emoji: "🐦‍🔥", category: "🐉 Mythic", price: 500000, banner: ["#3E0A00", "#DD2C00"], ink: "#FFF3E0", accent: "#FFC400", subtitle: "rises like a phoenix!" },
  { id: "butterfly", name: "Butterfly Garden", emoji: "🦋", category: "🌸 Nature", price: 130000, banner: ["#004D40", "#26A69A"], ink: "#FFFFFF", accent: "#B2FF59", subtitle: "flutters in with butterflies" },
  { id: "rainbow", name: "Rainbow Bridge", emoji: "🌈", category: "🌸 Nature", price: 170000, banner: ["#0277BD", "#7E57C2"], ink: "#FFFFFF", accent: "#FFF176", subtitle: "crosses the rainbow bridge" },
  { id: "neon", name: "Neon Sign", emoji: "💡", category: "🎉 Party", price: 240000, banner: ["#0A0014", "#1A0033"], ink: "#FFE6FA", accent: "#FF2BD6", subtitle: "is LIVE in neon!" },
  { id: "lanterns", name: "Sky Lanterns", emoji: "🏮", category: "🏮 Festival", price: 280000, banner: ["#3E1A00", "#B34700"], ink: "#FFF3E0", accent: "#FFB74D", subtitle: "lights up the night sky" },
  // 💎 EXCLUSIVE — big, full-screen shows like Phoenix Rise
  { id: "fireworks", name: "Fireworks Show", emoji: "🎆", category: "💎 Exclusive", price: 520000, banner: ["#05061F", "#1A237E"], ink: "#FFFFFF", accent: "#FFD54F", subtitle: "lights up the sky with fireworks!" },
  { id: "lotus", name: "Golden Lotus", emoji: "🪷", category: "💎 Exclusive", price: 550000, banner: ["#4A0033", "#C2185B"], ink: "#FFF0F6", accent: "#FFD54F", subtitle: "blooms like a golden lotus" },
  { id: "angel", name: "Angel Wings", emoji: "👼", category: "💎 Exclusive", price: 600000, banner: ["#0D47A1", "#42A5F5"], ink: "#FFFFFF", accent: "#FFF59D", subtitle: "descends on angel wings" },
  { id: "frost", name: "Frost Wings", emoji: "❄️", category: "💎 Exclusive", price: 600000, banner: ["#001E3C", "#0277BD"], ink: "#E1F5FE", accent: "#80D8FF", subtitle: "soars in on wings of ice!" },
  { id: "blackhole", name: "Black Hole", emoji: "🕳️", category: "💎 Exclusive", price: 700000, banner: ["#0A0014", "#311B92"], ink: "#FFE0B2", accent: "#FF9100", subtitle: "bends space and time!" },
  { id: "dragon", name: "Dragon King", emoji: "🐉", category: "💎 Exclusive", price: 800000, banner: ["#3E0000", "#B71C1C"], ink: "#FFF8E1", accent: "#FFC400", subtitle: "rides in on a fire dragon!" },
];

export const entryFxById = (id: string | null | undefined) => ENTRY_FX.find((f) => f.id === id) || null;

// ---------------------------------------------------------------- who has which effect

const lookupCache = new Map<string, { at: number; active: string; expiresAt: number }>();

async function entryFxFor(name: string, fresh = false): Promise<EntryFx | null> {
  const key = name.trim().toLowerCase();
  if (!key) return null;
  const now = Date.now();
  let v = lookupCache.get(key);
  if (!v || fresh || now - v.at >= 120_000) {
    try {
      const snap = await getDoc(doc(db, "entry_fx_public", key));
      v = { at: now, active: String(snap.get("active") || "none"), expiresAt: Number(snap.get("expiresAt") || 0) };
    } catch {
      v = { at: now, active: "none", expiresAt: 0 };
    }
    lookupCache.set(key, v);
  }
  if (v.expiresAt <= serverNow()) return null;
  return entryFxById(v.active);
}

/** "Bangladesh: name [12] 👑 has entered." → "name" */
function entryNameOf(m: { text: string; type: string }): string | null {
  const t = m.text.trim();
  if (m.type !== "room_entry" && !/ has entered\.$/i.test(t)) return null;
  const i = t.indexOf(":");
  if (i < 0) return null;
  const name = t.slice(i + 1).trim().split(" [")[0].split(" has entered")[0].trim();
  return name && name.length <= 30 && !name.includes(" ") ? name : null;
}

// ✨ My own effect plays ONLY on a real entry: the room page calls
// requestOwnEntryFx when it posts my "has entered" line (never on a tab
// switch, a reload of a room I never left, or coming back to the tab), and the
// room's EntryEffectHost plays it.
const ownRequests = new Map<string, number>(); // room → when I really entered
// room → when my own effect last played (so my own line isn't played twice)
const ownPlayed = new Map<string, number>();
const OWN_GAP_MS = 10 * 60_000;
const OWN_EVENT = "migwith-own-entry-fx";
export function requestOwnEntryFx(roomKey: string) {
  ownRequests.set(roomKey, Date.now());
  if (typeof window !== "undefined") window.dispatchEvent(new Event(OWN_EVENT));
}

/** Put this once over the room: plays the effect of whoever just came in. */
export function EntryEffectHost({
  messages,
  roomKey,
  myName = "",
}: {
  messages: { id: string; text: string; type: string }[];
  roomKey: string;
  /** My own name: my own effect plays for me when I open the room (see below). */
  myName?: string;
}) {
  const [names, setNames] = useNewLineEvents(messages, roomKey, entryNameOf, 4);
  const [queue, setQueue] = useState<{ fx: EntryFx; name: string }[]>([]);
  const mounted = useRef(true);
  useEffect(
    () => () => {
      mounted.current = false;
    },
    []
  );
  // ✨ MY OWN entry effect, on my screen: played only when I REALLY entered
  // (my "has entered" line was just written). Looked up fresh, so an effect I
  // just bought or switched shows right away.
  useEffect(() => {
    const me = myName.trim();
    if (!me) return;
    let gone = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const check = () => {
      const at = ownRequests.get(roomKey);
      if (at === undefined || timer) return;
      if (Date.now() - at > 60_000) {
        ownRequests.delete(roomKey); // stale request
        return;
      }
      // marked now, so my "has entered" line arriving meanwhile isn't played as well
      ownPlayed.set(roomKey, Date.now());
      // The request is removed only once the effect is queued: if this effect is
      // restarted meanwhile (my name loading in …), the next run still finds it.
      timer = setTimeout(async () => {
        const fx = await entryFxFor(me, true);
        timer = null; // ready for my next real entry in this room
        if (gone) return;
        ownRequests.delete(roomKey);
        if (fx) setQueue((q) => [{ fx, name: me }, ...q].slice(0, 4));
      }, 700); // let the room draw first
    };
    check();
    window.addEventListener(OWN_EVENT, check);
    return () => {
      gone = true;
      if (timer) clearTimeout(timer);
      window.removeEventListener(OWN_EVENT, check);
    };
  }, [roomKey, myName]);
  // The first few seconds after opening a room the chat fills in (cache, then
  // the server) — those older lines are not new entries, so they're absorbed.
  const openedAt = useRef({ room: "", at: 0 });
  if (openedAt.current.room !== roomKey) openedAt.current = { room: roomKey, at: 0 };
  if (openedAt.current.at === 0 && messages.length > 0) openedAt.current.at = Date.now();
  // Look up each new name, then queue the ones with a running effect.
  useEffect(() => {
    if (!names.length) return;
    // my own entry is played by the effect above (not twice)
    const me = myName.trim().toLowerCase();
    const batch = names.filter((n) => !(me && n.toLowerCase() === me && Date.now() - (ownPlayed.get(roomKey) ?? 0) < OWN_GAP_MS));
    setNames(() => []);
    if (Date.now() - openedAt.current.at < 4_000) return;
    if (!batch.length) return;
    Promise.all(batch.map(async (n) => ({ fx: await entryFxFor(n), name: n }))).then((found) => {
      if (!mounted.current) return;
      const add = found.filter((f): f is { fx: EntryFx; name: string } => !!f.fx);
      if (add.length) setQueue((q) => [...q, ...add].slice(0, 4));
    });
  }, [names, setNames, myName, roomKey]);
  const current = usePlayQueue(queue, setQueue, 3400);
  if (!current) return null;
  return (
    <div className="pointer-events-none fixed inset-0 z-[94]">
      <EntryFxShow key={current.key} fx={current.e.fx} name={current.e.name} seed={current.key % 100000} />
    </div>
  );
}

// ---------------------------------------------------------------- the show

const DURATION = 3.4;

/** The effect + the "✦ GRAND ENTRY ✦" banner with the name (fills its parent). */
export function EntryFxShow({ fx, name, seed }: { fx: EntryFx; name: string; seed: number }) {
  const lateIn = fx.id === "carpet" ? 0.7 : fx.id === "galaxy" ? 0.5 : 0.15;
  const ringAt = 0.55 + (fx.id === "carpet" ? 0.55 : fx.id === "galaxy" ? 0.35 : 0);
  return (
    <div className="fx-fade absolute inset-0 overflow-hidden" style={{ animationDuration: `${DURATION}s` }}>
      <FxCanvas
        seconds={DURATION}
        draw={(ctx, w, h, t) => {
          drawEntryFx(ctx, w, h, fx, t, seed);
          // sparkle ring that bursts out when the banner lands
          const bt = t - ringAt;
          if (bt >= 0 && bt <= 0.9) {
            const a = 1 - bt / 0.9;
            for (let k = 0; k < 20; k++) {
              const ang = (k / 20) * Math.PI * 2;
              const rr = 90 + bt * 260;
              starPath(ctx, w / 2 + Math.cos(ang) * rr * 1.25, h / 2 + Math.sin(ang) * rr * 0.55, 5 + (k % 3) * 2);
              ctx.fillStyle = rgba(k % 2 === 0 ? fx.accent : "#FFFFFF", a);
              ctx.fill();
            }
          }
        }}
      />
      <div className="absolute inset-0 flex items-center justify-center px-5">
        <div
          className={`efx-slide flex flex-col items-center ${fx.id === "thunder" ? "efx-thunder" : ""}`}
          style={{ animationDelay: `${lateIn}s, 2.85s` }}
        >
          <span
            className="rounded-full px-3 py-0.5 text-[10px] font-black tracking-[2px]"
            style={{ background: `linear-gradient(90deg, ${fx.accent}, #fff, ${fx.accent})`, color: fx.banner[0] }}
          >
            ✦ GRAND ENTRY ✦
          </span>
          <div
            className="efx-card relative mt-1 flex flex-col items-center overflow-hidden rounded-[22px] px-6 py-3 text-center"
            style={{
              background: `linear-gradient(90deg, ${rgba(fx.banner[0], 0.95)}, ${rgba(fx.banner[1], 0.95)}) padding-box, linear-gradient(135deg, ${fx.accent}, #fff, ${fx.banner[1]}, ${fx.accent}) border-box`,
              border: "2.5px solid transparent",
              boxShadow: `0 0 36px ${rgba(fx.accent, 0.6)}`,
            }}
          >
            <span className="efx-beat text-[36px] leading-tight">{fx.emoji}</span>
            <span className="flex" aria-label={name}>
              {Array.from(brandMiglife(name)).map((ch, i) => (
                <span
                  key={i}
                  aria-hidden
                  className="efx-wave text-[27px] font-black leading-tight"
                  style={{
                    animationDelay: `${-i * 0.09}s`,
                    backgroundImage: `linear-gradient(#fff, ${fx.accent})`,
                    WebkitBackgroundClip: "text",
                    backgroundClip: "text",
                    color: "transparent",
                    filter: `drop-shadow(0 0 6px ${rgba(fx.accent, 0.8)})`,
                  }}
                >
                  {ch}
                </span>
              ))}
            </span>
            <span className="text-[13px] font-bold" style={{ color: fx.ink }}>
              {fx.subtitle}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function starPath(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4 - Math.PI / 2;
    const rr = k % 2 === 0 ? r : r * 0.32;
    const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
    if (k === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function fill(ctx: CanvasRenderingContext2D, color: string, w: number, h: number) {
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, w, h);
}

function oval(ctx: CanvasRenderingContext2D, x: number, y: number, ow: number, oh: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(x + ow / 2, y + oh / 2, Math.max(0.1, ow / 2), Math.max(0.1, oh / 2), 0, 0, Math.PI * 2);
  ctx.fill();
}

function line(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, color: string | CanvasGradient, width: number) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function rotated(ctx: CanvasRenderingContext2D, deg: number, x: number, y: number, body: () => void) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate((deg * Math.PI) / 180);
  ctx.translate(-x, -y);
  body();
  ctx.restore();
}

const CLEAR = "rgba(0,0,0,0)";

function spread(g: CanvasGradient, stops: readonly string[]) {
  stops.forEach((c, i) => g.addColorStop(stops.length === 1 ? 0 : i / (stops.length - 1), c));
  return g;
}

/** Compose's verticalGradient(colors, startY, endY). */
function vgrad(ctx: CanvasRenderingContext2D, y0: number, y1: number, stops: readonly string[]) {
  return spread(ctx.createLinearGradient(0, y0, 0, y1 === y0 ? y0 + 0.01 : y1), stops);
}

/** Compose's radialGradient(colors, center, radius). */
function rgrad(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, stops: readonly string[]) {
  return spread(ctx.createRadialGradient(x, y, 0, x, y, Math.max(0.1, radius)), stops);
}

/** drawRect(brush, alpha) over the whole canvas. */
function fillStyled(ctx: CanvasRenderingContext2D, style: string | CanvasGradient, alpha: number, w: number, h: number) {
  ctx.save();
  ctx.globalAlpha = clamp01(alpha);
  ctx.fillStyle = style;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

/** A filled circle with a color or a gradient. */
function disc(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, style: string | CanvasGradient) {
  ctx.fillStyle = style;
  ctx.beginPath();
  ctx.arc(x, y, Math.max(0.1, radius), 0, Math.PI * 2);
  ctx.fill();
}

/** A circle outline (Compose's Stroke style). */
function ring(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, color: string, width: number) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.arc(x, y, Math.max(0.1, radius), 0, Math.PI * 2);
  ctx.stroke();
}

/** The app's drawEntryFx, one case per effect (density = 1 CSS px). */
function drawEntryFx(ctx: CanvasRenderingContext2D, w: number, h: number, fx: EntryFx, t: number, seed: number) {
  const cx = w / 2, cy = h / 2;
  const r = rng(seed * 31 + hashStr(fx.id));
  const dimA = clamp01(t / 0.3);
  const sin = Math.sin, cos = Math.cos, PI = Math.PI;
  switch (fx.id) {
    case "sparkle": {
      fill(ctx, rgba("#1A1200", 0.35 * dimA), w, h);
      for (let i = 0; i < 60; i++) {
        const x = r() * w, y0 = r() * h * 0.6, sp = 0.06 + r() * 0.12, ph = r() * 6, s = 4 + r() * 9;
        const y = y0 + t * sp * h;
        const tw = 0.5 + 0.5 * sin(t * 9 + ph);
        starPath(ctx, x, y, s * (0.6 + 0.4 * tw));
        ctx.fillStyle = rgba(i % 3 === 0 ? "#FFFFFF" : "#FFD54F", tw);
        ctx.fill();
      }
      break;
    }
    case "bubbles": {
      fill(ctx, rgba("#01223A", 0.3 * dimA), w, h);
      const cols = ["#80D8FF", "#FF80AB", "#B9F6CA", "#FFF59D", "#EA80FC"];
      for (let i = 0; i < 38; i++) {
        const x0 = r() * w, d = r() * 1.2, sp = 0.25 + r() * 0.3, s = 10 + r() * 26, col = cols[i % cols.length];
        const tt = t - d;
        if (tt <= 0) continue;
        const x = x0 + sin(tt * 3 + i) * 14, y = h + s - tt * sp * h;
        if (y < h * 0.12) continue;
        dot(ctx, x, y, s, rgba(col, 0.18));
        ctx.strokeStyle = rgba(col, 0.9);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, s, 0, PI * 2);
        ctx.stroke();
        dot(ctx, x - s * 0.35, y - s * 0.35, s * 0.22, rgba("#FFFFFF", 0.8));
      }
      break;
    }
    case "roses": {
      fill(ctx, rgba("#3A0018", 0.3 * dimA), w, h);
      for (let i = 0; i < 55; i++) {
        const x0 = r() * w, d = r() * 1.4, sp = 0.22 + r() * 0.2, s = 8 + r() * 10, rot0 = r() * 360;
        const tt = t - d;
        if (tt <= 0) continue;
        const x = x0 + sin(tt * 2.2 + i) * 30, y = -20 + tt * sp * h;
        rotated(ctx, rot0 + tt * 160, x, y, () => {
          oval(ctx, x - s, y - s * 0.55, s * 2, s * 1.1, i % 4 === 0 ? "#FF80AB" : "#D50000");
          oval(ctx, x - s * 0.6, y - s * 0.4, s * 0.8, s * 0.35, rgba("#FFFFFF", 0.25));
        });
      }
      break;
    }
    case "hearts": {
      fill(ctx, rgba("#4A0020", 0.3 * dimA), w, h);
      const cols = ["#FF1744", "#FF4081", "#FF80AB", "#FFFFFF", "#E040FB"];
      for (let wave = 0; wave < 2; wave++) {
        const tt = Math.max(0, t - wave * 0.9);
        for (let i = 0; i < 36; i++) {
          const a = (i / 36) * PI * 2 + r() * 0.2;
          const sp = (0.25 + r() * 0.25) * w;
          const d = (1 - Math.exp(-2.4 * tt)) / 2.4;
          const s = 12 + r() * 16;
          const al = t < wave * 0.9 ? 0 : clamp01(1 - tt / 2.2);
          if (al <= 0) continue;
          heartPath(ctx, cx + cos(a) * sp * d, cy + sin(a) * sp * d + 0.5 * h * 0.15 * tt * tt, s);
          ctx.fillStyle = rgba(cols[i % cols.length], al);
          ctx.fill();
        }
      }
      break;
    }
    case "fire": {
      const g = ctx.createLinearGradient(0, h * 0.4, 0, h);
      g.addColorStop(0, "rgba(191,54,12,0)");
      g.addColorStop(0.5, "rgba(191,54,12,.4)");
      g.addColorStop(1, "rgba(255,109,0,.67)");
      ctx.globalAlpha = dimA;
      ctx.fillStyle = g;
      ctx.fillRect(0, h * 0.4, w, h * 0.6);
      ctx.globalAlpha = 1;
      for (let i = 0; i < 90; i++) {
        const x0 = r() * w, ph = r(), life = 0.7 + r() * 0.6, s = 8 + r() * 18, rise = 0.35 + r() * 0.3;
        const tt = ((t + ph * life) % life) / life;
        const x = x0 + sin(t * 6 + i) * 10, y = h - tt * h * rise;
        const col = tt < 0.3 ? "#FFF59D" : tt < 0.6 ? "#FFAB00" : "#FF3D00";
        const sz = s * (1 - tt * 0.7);
        oval(ctx, x - sz * 0.5, y - sz, sz, sz * 1.6, rgba(col, (1 - tt) * 0.85));
      }
      break;
    }
    case "thunder": {
      fill(ctx, rgba("#050A1E", 0.55 * dimA), w, h);
      [0.15, 0.55, 1.3].forEach((st, k) => {
        const tt = t - st;
        if (tt < 0 || tt > 0.35) return;
        fill(ctx, rgba("#FFFFFF", (0.35 - tt) * 1.6), w, h);
        const rr = rng(seed * 7 + k);
        let x = w * (0.2 + rr() * 0.6), y = 0;
        ctx.beginPath();
        ctx.moveTo(x, y);
        while (y < h * 0.75) {
          x += (rr() - 0.5) * w * 0.18;
          y += h * (0.05 + rr() * 0.06);
          ctx.lineTo(x, y);
        }
        const a = 1 - tt / 0.35;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.strokeStyle = rgba("#82B1FF", a);
        ctx.lineWidth = 9;
        ctx.stroke();
        ctx.strokeStyle = rgba("#FFFFFF", a);
        ctx.lineWidth = 3;
        ctx.stroke();
      });
      for (let i = 0; i < 40; i++) {
        const a = r() * PI * 2, rad = 60 + r() * 140, ph = r() * 6;
        dot(ctx, cx + cos(a + t * 2) * rad, cy + sin(a + t * 2) * rad * 0.6, 2.5, rgba("#82B1FF", 0.5 + 0.5 * sin(t * 14 + ph)));
      }
      break;
    }
    case "royal": {
      fill(ctx, rgba("#120D00", 0.55 * dimA), w, h);
      // rotating golden rays
      rotated(ctx, t * 25, cx, cy, () => {
        ctx.fillStyle = rgba("#FFD54F", 0.14 * dimA);
        for (let i = 0; i < 16; i++) {
          const a = (i / 16) * PI * 2;
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.lineTo(cx + cos(a - 0.08) * w * 1.6, cy + sin(a - 0.08) * w * 1.6);
          ctx.lineTo(cx + cos(a + 0.08) * w * 1.6, cy + sin(a + 0.08) * w * 1.6);
          ctx.closePath();
          ctx.fill();
        }
      });
      for (let i = 0; i < 70; i++) {
        const x = r() * w, y0 = -r() * h * 0.5, sp = 0.2 + r() * 0.25, s = 1.5 + r() * 2.5;
        dot(ctx, x, y0 + t * sp * h, s, rgba(i % 3 === 0 ? "#FFFFFF" : "#FFD54F", 0.5 + 0.5 * sin(t * 10 + i)));
      }
      break;
    }
    case "carpet": {
      fill(ctx, rgba("#1A0000", 0.5 * dimA), w, h);
      const roll = clamp01(t / 0.7);
      const cw = w * 0.42, top = h - h * 0.62 * roll;
      const g = ctx.createLinearGradient(0, top, 0, h);
      g.addColorStop(0, "#B71C1C");
      g.addColorStop(1, "#7F0000");
      ctx.fillStyle = g;
      ctx.fillRect(cx - cw / 2, top, cw, h - top);
      ctx.fillStyle = "#FFD54F";
      ctx.fillRect(cx - cw / 2, top, 4, h - top);
      ctx.fillRect(cx + cw / 2 - 4, top, 4, h - top);
      dot(ctx, cx, top, 14, "#8B0000"); // the roll
      // camera flashes on both sides
      for (let i = 0; i < 14; i++) {
        const side = i % 2 === 0 ? 0.12 : 0.88;
        const px = w * side + (r() - 0.5) * w * 0.12, py = h * (0.25 + r() * 0.6), ph = r() * 3;
        const f = (t * 2.2 + ph) % 1;
        if (f < 0.12 && t > 0.6) {
          dot(ctx, px, py, 20, rgba("#FFFFFF", 1 - f / 0.12));
          dot(ctx, px, py, 5, "#FFFFFF");
        }
      }
      break;
    }
    case "meteor": {
      fill(ctx, rgba("#050212", 0.6 * dimA), w, h);
      for (let i = 0; i < 30; i++) {
        const a = 0.3 + 0.4 * r(), s = 0.8 + r() * 1.5;
        dot(ctx, r() * w, r() * h, s, rgba("#FFFFFF", a));
      }
      const m = Math.hypot(w * 0.9, h * 0.7);
      const dx = (w * 0.9) / m, dy = (-h * 0.7) / m;
      for (let i = 0; i < 16; i++) {
        const d = r() * 2, sx = w * (0.2 + r() * 1.0), sy = -h * 0.1 + r() * h * 0.3, len = 80 + r() * 120;
        const tt = t - d;
        if (tt <= 0 || tt > 0.9) continue;
        const p = tt / 0.9;
        const hx = sx - p * w * 0.9, hy = sy + p * h * 0.7;
        const g = ctx.createLinearGradient(hx, hy, hx + dx * len, hy + dy * len);
        g.addColorStop(0, "#FFAB40");
        g.addColorStop(1, "rgba(255,171,64,0)");
        line(ctx, hx, hy, hx + dx * len, hy + dy * len, g, 5);
        dot(ctx, hx, hy, 5, "#FFF3E0");
        dot(ctx, hx, hy, 12, rgba("#FFAB40", 0.4));
      }
      break;
    }
    case "galaxy": {
      fill(ctx, rgba("#07001F", 0.6 * dimA), w, h);
      const ring = clamp01(t / 0.6);
      const rad = Math.max(1, w * 0.36 * ring);
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
      g.addColorStop(0, "rgba(125,249,255,.8)");
      g.addColorStop(0.5, "rgba(124,77,255,.53)");
      g.addColorStop(1, "rgba(124,77,255,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, rad, 0, PI * 2);
      ctx.fill();
      ctx.strokeStyle = rgba("#7DF9FF", 0.9 * ring);
      ctx.lineWidth = 4;
      ctx.stroke();
      const cols = ["#7DF9FF", "#B388FF", "#FFFFFF", "#EA80FC"];
      for (let i = 0; i < 220; i++) {
        const arm = i % 3, k = r();
        const a = (arm * 2 * PI) / 3 + k * 5 + t * 1.6;
        const rr = k * w * 0.48 * ring;
        dot(ctx, cx + cos(a) * rr, cy + sin(a) * rr * 0.75, 1.8 + (1 - k) * 3.6, rgba(cols[i % 4], 0.25 + (1 - k) * 0.75));
      }
      break;
    }
    case "sakura": {
      fill(ctx, rgba("#3A0A1E", 0.25 * dimA), w, h);
      for (let i = 0; i < 70; i++) {
        const x0 = r() * w * 1.3 - w * 0.3, d = r() * 1.5, sp = 0.18 + r() * 0.16, s = 6 + r() * 7, rot0 = r() * 360, pink = i % 3 !== 0;
        const tt = t - d;
        if (tt <= 0) continue;
        const x = x0 + tt * w * 0.22 + sin(tt * 2.5 + i) * 20, y = -20 + tt * sp * h;
        rotated(ctx, rot0 + tt * 120, x, y, () => {
          const c = pink ? "#FFB7D5" : "#FFFFFF";
          oval(ctx, x - s, y - s * 0.45, s, s * 0.9, c);
          oval(ctx, x, y - s * 0.45, s, s * 0.9, c);
          dot(ctx, x, y, s * 0.18, "#FF80AB");
        });
      }
      break;
    }
    case "snow": {
      fill(ctx, rgba("#0A1A3A", 0.4 * dimA), w, h);
      for (let i = 0; i < 90; i++) {
        const x0 = r() * w, y0 = -r() * h * 0.6, sp = 0.12 + r() * 0.14, s = 2 + r() * 5, ph = r() * 6;
        const x = x0 + sin(t * 1.8 + ph) * 18, y = y0 + t * sp * h * 1.6;
        if (s > 5) {
          for (let k = 0; k < 3; k++) {
            const a = (k * PI) / 3 + t;
            line(ctx, x - cos(a) * s, y - sin(a) * s, x + cos(a) * s, y + sin(a) * s, "#FFFFFF", 1.4);
          }
        } else dot(ctx, x, y, s, rgba("#FFFFFF", 0.9));
      }
      break;
    }
    case "confetti": {
      fill(ctx, rgba("#1A0A2E", 0.3 * dimA), w, h);
      const cols = ["#FF1744", "#FFEB3B", "#00E676", "#2979FF", "#FF4FD8", "#FF9100"];
      for (let side = 0; side < 2; side++) {
        const ox = side === 0 ? 0 : w;
        for (let i = 0; i < 70; i++) {
          const ang = (side === 0 ? -60 : -120) + (r() - 0.5) * 50;
          const sp = (0.7 + r() * 0.6) * h, d = r() * 0.25, rot = r() * 360, spin = 200 + r() * 500;
          const tt = t - d;
          if (tt <= 0) continue;
          const a = (ang * PI) / 180;
          const drag = (1 - Math.exp(-1.8 * tt)) / 1.8;
          const x = ox + cos(a) * sp * drag, y = h + sin(a) * sp * drag + 0.5 * h * 0.5 * tt * tt;
          const sz = 5 + (i % 3) * 2;
          rotated(ctx, rot + tt * spin, x, y, () => {
            ctx.fillStyle = cols[i % cols.length];
            ctx.fillRect(x - sz, y - sz * 0.45, sz * 2, sz * 0.9 * Math.abs(cos(tt * 6 + i)));
          });
        }
      }
      break;
    }
    case "disco": {
      fill(ctx, rgba("#06000F", 0.65 * dimA), w, h);
      const bx = cx, by = h * 0.12;
      const cols = ["#FF4FD8", "#00E5FF", "#FFEB3B", "#76FF03", "#FF1744", "#7C4DFF"];
      for (let k = 0; k < 6; k++) {
        const a = ((sin(t * 1.4 + k * 1.1) * 50 + 90) * PI) / 180;
        ctx.fillStyle = rgba(cols[(k + Math.floor(t * 3)) % cols.length], 0.28);
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.lineTo(bx + cos(a - 0.09) * h, by + sin(a - 0.09) * h);
        ctx.lineTo(bx + cos(a + 0.09) * h, by + sin(a + 0.09) * h);
        ctx.closePath();
        ctx.fill();
      }
      const g = ctx.createRadialGradient(bx, by, 0, bx, by, 26);
      g.addColorStop(0, "#FFFFFF");
      g.addColorStop(0.5, "#B0BEC5");
      g.addColorStop(1, "#546E7A");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(bx, by, 26, 0, PI * 2);
      ctx.fill();
      for (let i = 0; i < 30; i++) {
        const x = r() * w, y = h * 0.25 + r() * h * 0.75, ph = r() * 6;
        if (sin(t * 12 + ph) > 0.6) dot(ctx, x, y, 3, rgba(cols[i % cols.length], 0.9));
      }
      break;
    }
    case "money": {
      fill(ctx, rgba("#052E12", 0.3 * dimA), w, h);
      for (let i = 0; i < 46; i++) {
        const x0 = r() * w, d = r() * 1.3, sp = 0.25 + r() * 0.2, rot0 = r() * 360, coin = i % 3 === 0;
        const tt = t - d;
        if (tt <= 0) continue;
        const x = x0 + sin(tt * 2 + i) * 26, y = -30 + tt * sp * h;
        if (coin) {
          const sx = Math.max(0.08, Math.abs(cos(tt * 7 + i)));
          oval(ctx, x - 10 * sx, y - 10, 20 * sx, 20, "#FFC107");
          oval(ctx, x - 6 * sx, y - 6, 12 * sx, 12, "#FFE082");
        } else
          rotated(ctx, rot0 + tt * 90, x, y, () => {
            const bw = 34, bh = 16 * Math.max(0.15, Math.abs(cos(tt * 3 + i)));
            ctx.fillStyle = "#66BB6A";
            ctx.fillRect(x - bw / 2, y - bh / 2, bw, bh);
            ctx.strokeStyle = "#1B5E20";
            ctx.lineWidth = 1.2;
            ctx.strokeRect(x - bw / 2 + 2, y - bh / 2 + 2, bw - 4, Math.max(0, bh - 4));
            dot(ctx, x, y, bh * 0.3, "#2E7D32");
          });
      }
      break;
    }
    case "diamonds": {
      fill(ctx, rgba("#021A2E", 0.45 * dimA), w, h);
      for (let i = 0; i < 40; i++) {
        const x = r() * w, d = r() * 1.4, sp = 0.2 + r() * 0.2, s = 8 + r() * 12, rot0 = (r() - 0.5) * 40;
        const tt = t - d;
        if (tt <= 0) continue;
        const y = -30 + tt * sp * h;
        rotated(ctx, rot0 + sin(tt * 3) * 15, x, y, () => {
          const g = ctx.createLinearGradient(x - s, y - s, x + s, y + s);
          g.addColorStop(0, "#FFFFFF");
          g.addColorStop(0.5, "#80D8FF");
          g.addColorStop(1, "#0091EA");
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.moveTo(x - s, y - s * 0.3);
          ctx.lineTo(x - s * 0.5, y - s * 0.8);
          ctx.lineTo(x + s * 0.5, y - s * 0.8);
          ctx.lineTo(x + s, y - s * 0.3);
          ctx.lineTo(x, y + s);
          ctx.closePath();
          ctx.fill();
          line(ctx, x - s, y - s * 0.3, x + s, y - s * 0.3, rgba("#FFFFFF", 0.7), 1);
          const tw = sin(tt * 10 + i);
          if (tw > 0.7) {
            starPath(ctx, x + s * 0.4, y - s * 0.6, s * 0.5);
            ctx.fillStyle = rgba("#FFFFFF", tw);
            ctx.fill();
          }
        });
      }
      break;
    }
    case "aurora": {
      fill(ctx, rgba("#00110E", 0.65 * dimA), w, h);
      for (let i = 0; i < 40; i++) {
        const a = 0.3 + 0.5 * r(), s = 0.7 + r() * 1.3;
        dot(ctx, r() * w, r() * h * 0.7, s, rgba("#FFFFFF", a));
      }
      ["#64FFDA", "#69F0AE", "#B388FF", "#18FFFF"].forEach((c, k) => {
        const baseY = h * (0.2 + k * 0.08);
        ctx.beginPath();
        ctx.moveTo(0, baseY);
        for (let x = 0; x <= w; x += w / 40) ctx.lineTo(x, baseY + sin((x / w) * 6 + t * (1.2 + k * 0.3) + k) * h * 0.05);
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.strokeStyle = rgba(c, 0.35 * dimA);
        ctx.lineWidth = 26;
        ctx.stroke();
        ctx.strokeStyle = rgba(c, 0.6 * dimA);
        ctx.lineWidth = 6;
        ctx.stroke();
      });
      break;
    }
    case "butterfly": {
      fill(ctx, rgba("#00201A", 0.3 * dimA), w, h);
      const cols = ["#00E5FF", "#FF4081", "#FFD740", "#B388FF", "#69F0AE", "#FF6E40"];
      for (let i = 0; i < 24; i++) {
        const x0 = r() * w, d = r() * 1.0, sp = 0.22 + r() * 0.18, s = 11 + r() * 10, ph = r() * 6, col = cols[i % cols.length];
        const tt = t - d;
        if (tt <= 0) continue;
        const x = x0 + sin(tt * 2.2 + ph) * 60, y = h + 30 - tt * sp * h;
        const flap = Math.max(0.15, Math.abs(sin(tt * 16 + ph)));
        rotated(ctx, sin(tt * 2.2 + ph) * 25, x, y, () => {
          for (const sg of [-1, 1]) {
            oval(ctx, x + (sg < 0 ? -s * flap : 0), y - s * 0.9, s * flap, s * 0.9, col);
            oval(ctx, x + (sg < 0 ? -s * 0.7 * flap : 0), y - s * 0.05, s * 0.7 * flap, s * 0.6, rgba(col, 0.8));
            dot(ctx, x + sg * s * 0.45 * flap, y - s * 0.5, s * 0.12, rgba("#FFFFFF", 0.7));
          }
          line(ctx, x, y - s * 0.7, x, y + s * 0.4, "#212121", 2.5);
        });
      }
      break;
    }
    case "rainbow": {
      fill(ctx, rgba("#0A1E3A", 0.3 * dimA), w, h);
      const grow = clamp01(t / 1.0);
      const R0 = w * 0.48, base = cy + h * 0.08;
      ["#FF1744", "#FF9100", "#FFEA00", "#00E676", "#2979FF", "#7C4DFF"].forEach((c, k) => {
        const rr = R0 - k * 12;
        ctx.strokeStyle = rgba(c, 0.85);
        ctx.lineWidth = 12;
        ctx.lineCap = "butt";
        ctx.beginPath();
        ctx.arc(cx, base, rr, PI, PI + PI * grow);
        ctx.stroke();
      });
      // fluffy clouds at the two feet of the rainbow
      for (const fx0 of [cx - R0 + 20, cx + R0 - 20]) {
        for (const [dx, dy, rad] of [[-22, 0, 20], [0, -12, 26], [24, 0, 20], [0, 8, 22]]) dot(ctx, fx0 + dx, base + dy, rad, rgba("#FFFFFF", 0.95 * grow));
      }
      for (let i = 0; i < 30; i++) {
        const px = r() * w, py = r() * h * 0.7, ph = r() * 6;
        const tw = sin(t * 8 + ph);
        if (tw > 0.3) {
          starPath(ctx, px, py, 5 * tw);
          ctx.fillStyle = rgba("#FFFFFF", tw);
          ctx.fill();
        }
      }
      break;
    }
    case "neon": {
      fill(ctx, rgba("#05000C", 0.75 * dimA), w, h);
      // flicker on, like a neon sign switching on
      const on = t < 0.6 ? (sin(t * 70) > 0 ? 1 : 0.15) : 1;
      const bw = w * 0.86, bh = h * 0.34, left = cx - bw / 2, top = cy - bh / 2;
      const trace = clamp01(t / 0.9);
      const perimeter = (rw: number, rh: number) => 2 * (rw + rh);
      // two frames drawn with a dash that grows, like the app's traced path
      [["#FF2BD6", 0, 28], ["#00E5FF", 10, 20]].forEach(([c, inset, rad]) => {
        const ins = inset as number;
        const rw = bw - ins * 2, rh = bh - ins * 2;
        const len = perimeter(rw, rh);
        ctx.setLineDash([len * trace, len]);
        ctx.lineDashOffset = ins ? -len * (1 - trace) : 0;
        ctx.beginPath();
        ctx.roundRect(left + ins, top + ins, rw, rh, rad as number);
        for (const [lw, a, col] of [[18, 0.25, c], [4, 0.9, c], [1.4, 0.8, "#FFFFFF"]] as [number, number, string][]) {
          ctx.strokeStyle = rgba(col, a * on);
          ctx.lineWidth = lw;
          ctx.stroke();
        }
      });
      ctx.setLineDash([]);
      for (let i = 0; i < 18; i++) {
        const px = r() * w;
        const py = i % 2 === 0 ? r() * top * 0.9 : top + bh + r() * (h - top - bh);
        starPath(ctx, px, py, 7);
        ctx.fillStyle = rgba(i % 2 === 0 ? "#FF2BD6" : "#00E5FF", (0.5 + 0.5 * sin(t * 9 + i)) * on);
        ctx.fill();
      }
      break;
    }
    case "lanterns": {
      const bg = ctx.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, "#0B0620");
      bg.addColorStop(0.5, "#2A1030");
      bg.addColorStop(1, "#4A1E10");
      ctx.globalAlpha = 0.7 * dimA;
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1;
      for (let i = 0; i < 26; i++) {
        const x0 = r() * w, d = r() * 1.2, sp = 0.16 + r() * 0.12, s = 14 + r() * 14, ph = r() * 6;
        const tt = t - d;
        if (tt <= 0) continue;
        const x = x0 + sin(tt * 1.3 + ph) * 16, y = h + s - tt * sp * h;
        const flick = 0.8 + 0.2 * sin(t * 14 + ph);
        dot(ctx, x, y, s * 1.6, rgba("#FFB74D", 0.22 * flick));
        const g = ctx.createLinearGradient(0, y - s * 0.7, 0, y + s * 0.7);
        g.addColorStop(0, "#FFE0B2");
        g.addColorStop(0.5, "#FF9800");
        g.addColorStop(1, "#E65100");
        ctx.globalAlpha = flick;
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.roundRect(x - s * 0.45, y - s * 0.7, s * 0.9, s * 1.4, s * 0.4);
        ctx.fill();
        ctx.globalAlpha = 1;
        dot(ctx, x, y + s * 0.45, s * 0.16, rgba("#FFF8E1", flick));
      }
      for (let i = 0; i < 40; i++) {
        const a = 0.3 + 0.4 * r(), s = 0.6 + r() * 1.2;
        dot(ctx, r() * w, r() * h * 0.6, s, rgba("#FFFFFF", a));
      }
      break;
    }
    case "phoenix": {
      fill(ctx, rgba("#1A0500", 0.55 * dimA), w, h);
      const rise = clamp01(t / 1.1);
      const bx = cx, by = h - (h - cy + 40) * (1 - (1 - rise) * (1 - rise));
      const flap = sin(t * 7) * 0.35;
      // two wings of fire
      for (let side = 0; side < 2; side++) {
        const sgn = side === 0 ? -1 : 1;
        for (let j = 0; j < 60; j++) {
          const u = j / 60;
          const wx = bx + sgn * u * w * 0.42;
          const wy = by - sin(u * PI) * h * 0.08 - u * h * 0.12 * (1 + flap);
          const col = u < 0.35 ? "#FFF59D" : u < 0.7 ? "#FFAB00" : "#FF3D00";
          const sz = 6 + (1 - u) * 6;
          dot(ctx, wx, wy, sz * 1.8, rgba(col, 0.25));
          dot(ctx, wx, wy, sz * 0.6, rgba(col, 0.95));
          if (j % 6 === 0) line(ctx, wx, wy, wx + sgn * 6, wy + 26, rgba(col, 0.8), 3);
        }
      }
      dot(ctx, bx, by, 10, "#FFF8E1");
      dot(ctx, bx, by, 26, rgba("#FFC400", 0.4));
      // falling embers / tail
      for (let i = 0; i < 60; i++) {
        const ph = r(), life = 0.8 + r() * 0.6, xo = (r() - 0.5) * 60;
        const tt = ((t + ph * life) % life) / life;
        dot(ctx, bx + xo * tt, by + tt * h * 0.35, 2 + (1 - tt) * 3, rgba(i % 2 === 0 ? "#FF6D00" : "#FFD54F", (1 - tt) * 0.9));
      }
      break;
    }
    // ===================== 💎 EXCLUSIVE (big full-screen shows) =====================
    case "fireworks": {
      fillStyled(ctx, vgrad(ctx, 0, h, ["#020214", "#0B1240"]), 0.78 * dimA, w, h);
      for (let i = 0; i < 40; i++) {
        const a = 0.25 + 0.5 * r(), s = 0.6 + r();
        dot(ctx, r() * w, r() * h * 0.7, s, rgba("#FFFFFF", a));
      }
      const cols = ["#FF4D6D", "#FFD54F", "#4DD8FF", "#B388FF", "#69F0AE", "#FF9E40"];
      for (let k = 0; k < 8; k++) {
        const launch = 0.05 + k * 0.3;
        const bx = w * (0.15 + r() * 0.7), by = h * (0.14 + r() * 0.32);
        const col = cols[k % cols.length], col2 = cols[(k + 2) % cols.length];
        const tt = t - launch;
        if (tt >= 0 && tt <= 0.42) {
          // the rocket goes up
          const p = tt / 0.42;
          const y = h - (h - by) * (1 - (1 - p) * (1 - p));
          line(ctx, bx, y, bx, y + 46, rgba(col, 0.55), 3);
          dot(ctx, bx, y, 3.2, "#FFFFFF");
        } else if (tt > 0.42 && tt <= 1.7) {
          // …and bursts
          const e = (tt - 0.42) / 1.28;
          const rad = 24 + 120 * (1 - (1 - e) * (1 - e));
          const a = clamp01(1 - e);
          const drop = e * e * 46;
          if (e < 0.18) dot(ctx, bx, by, 50 * (1 + e * 4), rgba("#FFFFFF", (0.18 - e) * 4));
          for (let j = 0; j < 30; j++) {
            const ang = (j / 30) * 2 * PI;
            const tipX = bx + cos(ang) * rad, tipY = by + sin(ang) * rad + drop;
            line(ctx, bx + cos(ang) * rad * 0.62, by + sin(ang) * rad * 0.62 + drop * 0.7, tipX, tipY, rgba(j % 2 === 0 ? col : col2, a * 0.55), 2.2);
            dot(ctx, tipX, tipY, 2.8, rgba(j % 3 === 0 ? "#FFFFFF" : col, a));
          }
          for (let j = 0; j < 12; j++) {
            // inner ring of glitter
            const ang = (j / 12) * 2 * PI + 0.26;
            const tw = 0.5 + 0.5 * sin(t * 20 + j);
            starPath(ctx, bx + cos(ang) * rad * 0.45, by + sin(ang) * rad * 0.45 + drop, 5);
            ctx.fillStyle = rgba(col2, a * tw);
            ctx.fill();
          }
        }
      }
      break;
    }
    case "lotus": {
      fillStyled(ctx, rgrad(ctx, cx, cy, w, ["#4A0036", "#12000E"]), 0.72 * dimA, w, h);
      const open = clamp01(t / 1.2), ease = 1 - (1 - open) * (1 - open);
      const c = { x: cx, y: cy + 70 };
      for (let k = 0; k < 18; k++) {
        // golden rays turning slowly
        const ang = (k / 18) * 2 * PI + t * 0.35;
        line(ctx, c.x, c.y, c.x + cos(ang) * w, c.y + sin(ang) * w, rgba("#FFD54F", 0.16 * ease), 12);
      }
      disc(ctx, c.x, c.y, 170 * ease, rgrad(ctx, c.x, c.y, 170, [rgba("#FFE082", 0.7), CLEAR]));
      const petal = (L: number, pw: number) => {
        ctx.beginPath();
        ctx.moveTo(c.x, c.y);
        ctx.bezierCurveTo(c.x - pw, c.y - L * 0.32, c.x - pw * 0.55, c.y - L * 0.86, c.x, c.y - L);
        ctx.bezierCurveTo(c.x + pw * 0.55, c.y - L * 0.86, c.x + pw, c.y - L * 0.32, c.x, c.y);
        ctx.closePath();
      };
      ([[9, 170, "#E91E63"], [7, 132, "#FF6FB5"], [5, 96, "#FFC1E0"]] as const).forEach(([n, L0, col], li) => {
        const L = L0 * (0.25 + 0.75 * ease);
        const spread = (78 - li * 14) * ease;
        for (let k = 0; k < n; k++) {
          const ang = -spread + (2 * spread * k) / (n - 1);
          rotated(ctx, ang, c.x, c.y, () => {
            petal(L, L * 0.3);
            ctx.fillStyle = vgrad(ctx, c.y - L, c.y, ["#FFF8E1", col]);
            ctx.fill();
            ctx.strokeStyle = rgba("#FFD54F", 0.85);
            ctx.lineWidth = 2.2;
            ctx.stroke();
          });
        }
      });
      dot(ctx, c.x, c.y, 18 * ease, "#FFE082");
      dot(ctx, c.x, c.y, 8 * ease, rgba("#FFFFFF", 0.8));
      for (let i = 0; i < 34; i++) {
        // golden pollen floating up
        const x0 = c.x + (r() - 0.5) * w * 0.8, ph = r(), life = 1.4 + r();
        const tt = ((t + ph * life) % life) / life;
        starPath(ctx, x0 + sin(tt * 6 + ph * 9) * 12, c.y - tt * h * 0.55, 3 + 4 * (1 - tt));
        ctx.fillStyle = rgba("#FFE082", (1 - tt) * ease);
        ctx.fill();
      }
      break;
    }
    case "angel": {
      fillStyled(ctx, vgrad(ctx, 0, h, ["#FFFDE7", "#90CAF9"]), 0.5 * dimA, w, h);
      for (let k = 0; k < 14; k++) {
        // light from heaven
        line(ctx, cx, -h * 0.1, cx + (k - 6.5) * w * 0.09, h, rgba("#FFFFFF", 0.22 * dimA), 18);
      }
      const open = clamp01(t / 0.9), ease = 1 - (1 - open) * (1 - open) * (1 - open);
      const drop = (1 - ease) * h * 0.18;
      const c = { x: cx, y: cy - 30 - drop };
      const flap = sin(t * 4) * 4;
      const feather = (L: number, pw: number, bx: number, by: number) => {
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.bezierCurveTo(bx - pw, by - L * 0.3, bx - pw * 0.5, by - L * 0.9, bx, by - L);
        ctx.bezierCurveTo(bx + pw * 0.5, by - L * 0.9, bx + pw, by - L * 0.3, bx, by);
        ctx.closePath();
      };
      for (const sgn of [-1, 1]) {
        const bx = c.x + sgn * 16, by = c.y;
        // long flight feathers, then a shorter row on top
        for (const [n, len, col] of [[12, 150, "#E3F2FD"], [9, 96, "#FFFFFF"]] as const) {
          for (let j = 0; j < n; j++) {
            const theta = (-78 + j * (118 / (n - 1))) * ease + flap; // degrees from horizontal
            const phi = sgn > 0 ? theta : 180 - theta;
            const L = (len - Math.abs(j - n * 0.35) * 4) * (0.3 + 0.7 * ease);
            rotated(ctx, phi + 90, bx, by, () => {
              feather(L, L * 0.17, bx, by);
              ctx.fillStyle = vgrad(ctx, by - L, by, ["#FFFFFF", col, "#BBDEFB"]);
              ctx.fill();
              ctx.strokeStyle = rgba("#90CAF9", 0.7);
              ctx.lineWidth = 1.4;
              ctx.stroke();
            });
          }
        }
      }
      // golden halo
      const hw = Math.max(0.1, 70 * ease), hh = Math.max(0.1, 20 * ease);
      for (const [col, lw] of [[rgba("#FFD54F", 0.35), 12], ["#FFF59D", 4]] as const) {
        ctx.strokeStyle = col;
        ctx.lineWidth = lw;
        ctx.beginPath();
        ctx.ellipse(cx, c.y - 120, hw, hh, 0, 0, PI * 2);
        ctx.stroke();
      }
      dot(ctx, c.x, c.y, 14 * ease, rgba("#FFFFFF", 0.9));
      for (let i = 0; i < 26; i++) {
        // feathers drifting down
        const x0 = r() * w, d = r() * 1.2, sp = 0.12 + r() * 0.1, s = 10 + r() * 8;
        const tt = t - d;
        if (tt <= 0) continue;
        const px = x0 + sin(tt * 2 + i) * 26, py = -20 + tt * sp * h;
        rotated(ctx, sin(tt * 3 + i) * 40, px, py, () => {
          feather(s * 2, s * 0.4, px, py);
          ctx.fillStyle = rgba("#FFFFFF", 0.9);
          ctx.fill();
        });
      }
      break;
    }
    case "frost": {
      fill(ctx, rgba("#00121F", 0.6 * dimA), w, h);
      const rise = clamp01(t / 1.1);
      const bx = cx, by = h - (h - cy + 40) * (1 - (1 - rise) * (1 - rise));
      const flap = sin(t * 6) * 0.35;
      for (let side = 0; side < 2; side++) {
        const sgn = side === 0 ? -1 : 1;
        for (let j = 0; j < 64; j++) {
          const u = j / 64;
          const wx = bx + sgn * u * w * 0.44;
          const wy = by - sin(u * PI) * h * 0.08 - u * h * 0.12 * (1 + flap);
          const col = u < 0.35 ? "#FFFFFF" : u < 0.7 ? "#80D8FF" : "#2979FF";
          const sz = 6 + (1 - u) * 6;
          dot(ctx, wx, wy, sz * 1.9, rgba(col, 0.22));
          dot(ctx, wx, wy, sz * 0.55, rgba(col, 0.95));
          if (j % 6 === 0) {
            // icicle feathers
            line(ctx, wx, wy, wx + sgn * 5, wy + 30, rgba("#E1F5FE", 0.9), 3);
            starPath(ctx, wx + sgn * 5, wy + 30, 4);
            ctx.fillStyle = "#FFFFFF";
            ctx.fill();
          }
        }
      }
      dot(ctx, bx, by, 30, rgba("#80D8FF", 0.35));
      starPath(ctx, bx, by, 16);
      ctx.fillStyle = "#FFFFFF";
      ctx.fill();
      for (let i = 0; i < 70; i++) {
        // snow crystals trailing down
        const ph = r(), life = 0.9 + r() * 0.7, xo = (r() - 0.5) * 90;
        const tt = ((t + ph * life) % life) / life;
        starPath(ctx, bx + xo * tt, by + tt * h * 0.4, 2.5 + (1 - tt) * 4);
        ctx.fillStyle = rgba(i % 2 === 0 ? "#FFFFFF" : "#80D8FF", 1 - tt);
        ctx.fill();
      }
      break;
    }
    case "blackhole": {
      fill(ctx, rgba("#02000A", 0.84 * dimA), w, h);
      for (let i = 0; i < 60; i++) {
        const a = 0.2 + 0.5 * r(), s = 0.5 + r() * 1.2;
        dot(ctx, r() * w, r() * h, s, rgba("#FFFFFF", a));
      }
      const g0 = clamp01(t / 0.8), grow = 1 - (1 - g0) * (1 - g0);
      const c = { x: cx, y: cy - 30 };
      disc(ctx, c.x, c.y, 260 * grow, rgrad(ctx, c.x, c.y, 260, [rgba("#7C4DFF", 0.5), CLEAR]));
      const disk = ["#FFE0B2", "#FFB74D", "#FF6E40", "#B388FF"];
      for (let i = 0; i < 190; i++) {
        const r0 = r(), a0 = r() * 2 * PI, col = disk[i % disk.length];
        const rr = (((r0 - t * 0.22) % 1) + 1) % 1; // drifting inward
        const rad = (42 + rr * 180) * grow;
        const ang = a0 + t * (2.2 + (1 - rr) * 5.5);
        dot(ctx, c.x + cos(ang) * rad, c.y + sin(ang) * rad * 0.36, 1.1 + (1 - rr) * 2.6, rgba(col, (0.2 + 0.8 * (1 - rr)) * grow));
      }
      disc(ctx, c.x, c.y, 72 * grow, rgrad(ctx, c.x, c.y, 72 * grow, [CLEAR, rgba("#FF9100", 0.6), CLEAR]));
      dot(ctx, c.x, c.y, 36 * grow, "#000000");
      ring(ctx, c.x, c.y, 38 * grow, rgba("#FFD180", 0.95), 3);
      const ft = t - 1.25;
      if (ft >= 0 && ft <= 0.7) {
        // the space-time ripple
        const a = 1 - ft / 0.7;
        ring(ctx, c.x, c.y, 40 + ft * 520, rgba("#FFFFFF", a * 0.9), 5 * a + 1);
        ring(ctx, c.x, c.y, 30 + ft * 420, rgba("#B388FF", a * 0.6), 10 * a + 1);
      }
      break;
    }
    case "dragon": {
      fillStyled(ctx, vgrad(ctx, 0, h, ["#140000", "#3D0A00"]), 0.72 * dimA, w, h);
      const head = clamp01(t / 1.5);
      const at = (u: number) => ({ x: -0.12 * w + u * 1.2 * w, y: cy - 40 + sin(u * 8.5 - t * 2.6) * h * 0.09 });
      for (let k = 47; k >= 1; k--) {
        // the body, tail first
        const u = head * 1.12 - k * 0.02;
        if (u < -0.05) continue;
        const p = at(u);
        const sz = Math.max(4, 19 - k * 0.3);
        dot(ctx, p.x, p.y, sz * 1.6, rgba("#FF6F00", 0.25));
        const g = ctx.createRadialGradient(p.x - sz * 0.3, p.y - sz * 0.35, 0, p.x - sz * 0.3, p.y - sz * 0.35, sz * 1.4);
        g.addColorStop(0, "#FFE082");
        g.addColorStop(0.5, "#FF6F00");
        g.addColorStop(1, "#8E0000");
        disc(ctx, p.x, p.y, sz, g);
        if (k % 3 === 0) {
          // golden back spikes
          ctx.beginPath();
          ctx.moveTo(p.x - sz * 0.45, p.y - sz * 0.75);
          ctx.lineTo(p.x, p.y - sz * 1.75);
          ctx.lineTo(p.x + sz * 0.45, p.y - sz * 0.75);
          ctx.closePath();
          ctx.fillStyle = "#FFC400";
          ctx.fill();
        }
      }
      const hu = head * 1.12;
      if (hu > -0.05) {
        const hp = at(hu), nx = at(hu + 0.01);
        const ddx = nx.x - hp.x, ddy = nx.y - hp.y;
        const len = Math.max(0.001, Math.sqrt(ddx * ddx + ddy * ddy));
        const dir = { x: ddx / len, y: ddy / len }, nrm = { x: -ddy / len, y: ddx / len };
        const hs = 26;
        dot(ctx, hp.x, hp.y, hs * 1.8, rgba("#FFC400", 0.3));
        disc(ctx, hp.x, hp.y, hs, rgrad(ctx, hp.x, hp.y, hs * 1.3, ["#FFF59D", "#FF8F00", "#B71C1C"]));
        // horns
        for (const sg of [-1, 1]) {
          const bx = hp.x - dir.x * hs * 0.4 + nrm.x * sg * hs * 0.6, by = hp.y - dir.y * hs * 0.4 + nrm.y * sg * hs * 0.6;
          line(ctx, bx, by, bx - dir.x * hs * 1.3 + nrm.x * sg * hs * 0.7, by - dir.y * hs * 1.3 + nrm.y * sg * hs * 0.7, "#FFE082", 5);
        }
        // eye
        const ex = hp.x + dir.x * hs * 0.25 - nrm.x * hs * 0.35, ey = hp.y + dir.y * hs * 0.25 - nrm.y * hs * 0.35;
        dot(ctx, ex, ey, 5, "#FFFFFF");
        dot(ctx, ex, ey, 2.4, "#1A0000");
        // fire breath
        if (head > 0.3) {
          const mx = hp.x + dir.x * hs, my = hp.y + dir.y * hs;
          for (let i = 0; i < 70; i++) {
            const ph = r(), sp = (r() - 0.5) * 0.7;
            const d = (t * 1.7 + ph) % 1;
            const dist = d * 190;
            const col = d < 0.3 ? "#FFF9C4" : d < 0.65 ? "#FFAB00" : "#DD2C00";
            dot(ctx, mx + dir.x * dist + nrm.x * sp * dist, my + dir.y * dist + nrm.y * sp * dist, 3 + d * 9, rgba(col, (1 - d) * 0.9));
          }
        }
      }
      for (let i = 0; i < 40; i++) {
        // embers in the air
        const x = r() * w, ph = r(), life = 1.2 + r();
        const tt = ((t + ph * life) % life) / life;
        dot(ctx, x, h - tt * h * 0.9, 1.5 + 2 * (1 - tt), rgba("#FF9100", (1 - tt) * 0.8));
      }
      break;
    }
  }
}

// ---------------------------------------------------------------- the shop

/** My subscriptions, live from entry_fx/{uid} (only the functions write it). */
export function useEntryFxInventory(uid: string | undefined) {
  const [inv, setInv] = useState<{ owned: Record<string, number>; active: string }>({ owned: {}, active: "none" });
  useEffect(() => {
    if (!uid) return;
    return onSnapshot(
      doc(db, "entry_fx", uid),
      (snap) => {
        const raw = snap.get("owned");
        const owned: Record<string, number> = {};
        if (raw && typeof raw === "object") for (const [k, v] of Object.entries(raw)) owned[k] = Number(v) || 0;
        setInv({ owned, active: String(snap.get("active") || "none") });
      },
      () => {}
    );
  }, [uid]);
  return [inv, setInv] as const;
}

const opId = () => "efx_" + crypto.randomUUID().replace(/-/g, "").slice(0, 20);

// ✨ ENTRY EFFECTS PAGE (the app's MaEntryEffectsPage) — laid out like 🎨 Style
// Studio: balance, "My Entry Effects" (owned ones, switch on/off, days left),
// category chips (All first), then a raised "keycap" card per effect with a
// mini banner, price, Preview & Buy. Cheapest first.
export function EntryEffectShop({ uid, myName }: { uid: string; myName: string }) {
  const classic = useIsClassic();
  const [inv, setInv] = useEntryFxInventory(uid);
  const [balance, setBalance] = useState<number | null>(null);
  const [tab, setTab] = useState("All");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<EntryFx | null>(null);
  const [preview, setPreview] = useState<{ fx: EntryFx; key: number } | null>(null);
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const now = serverNow();
  // ✏️ miglife renames / re-prices effects (app_settings/shop_overrides)
  const isFounder = isMainFounderName(myName);
  const ov = useShopOverrides();
  const [editing, setEditing] = useState<EntryFx | null>(null);
  const nameOf = (fx: EntryFx) => shopName(ov.entryFx, fx.id, fx.name);
  const priceOf = (fx: EntryFx) => shopPrice(ov.entryFx, fx.id, fx.price);

  useEffect(
    () =>
      onSnapshot(
        doc(db, "users", uid),
        (snap) => setBalance(Number(snap.get("balance") || 0)),
        () => {}
      ),
    [uid]
  );

  const use = async (id: string) => {
    setBusy(id);
    try {
      await httpsCallable(functions, "setEntryEffect")({ id });
      setInv((s) => ({ ...s, active: id }));
      const on = entryFxById(id);
      setMessage(id === "none" || !on ? "Entry effect turned off." : `✓ ${nameOf(on)} is on.`);
    } catch (e: any) {
      setMessage(e?.message || "Could not change.");
    } finally {
      setBusy(null);
    }
  };
  const buy = async (fx: EntryFx) => {
    setBusy(fx.id);
    try {
      await httpsCallable(functions, "buyEntryEffect")({ id: fx.id, operationId: opId() });
      setMessage(`${fx.emoji} ${nameOf(fx)} is yours for 30 days!`);
    } catch (e: any) {
      setMessage(e?.message || "Purchase failed.");
    } finally {
      setBusy(null);
    }
  };
  const showPreview = (fx: EntryFx) => {
    if (previewTimer.current) clearTimeout(previewTimer.current);
    setPreview({ fx, key: Date.now() });
    previewTimer.current = setTimeout(() => setPreview(null), 3500);
  };

  const owned = ENTRY_FX.filter((f) => (inv.owned[f.id] || 0) > now);
  const shown = ENTRY_FX.filter((f) => tab === "All" || f.category === tab).sort((a, b) => priceOf(a) - priceOf(b));
  const daysLeft = (id: string) => Math.max(0, Math.floor(((inv.owned[id] || 0) - now) / 86_400_000));
  const rad = classic ? "rounded-[4px]" : "rounded-[14px]";
  const btn = `${classic ? "rounded-[4px]" : "rounded-full"} px-3 py-1.5 text-xs font-extrabold`;

  return (
    <div>
      <div className="flex items-center justify-between px-1 text-sm">
        <span className="font-semibold text-[#35507E]">Everyone sees it when you enter</span>
        <span className={`px-[9px] py-1 text-[11px] font-bold ${classic ? "rounded-[4px] bg-[#2E9E6B] text-white" : "rounded-full bg-[#12324F] text-[#6FE0A0]"}`}>
          💲 {balance === null ? "…" : balance.toLocaleString("en-US")}
        </span>
      </div>
      {message && <p className={`mt-2 px-1 text-[11px] font-bold ${classic ? "text-[#F07A00]" : "text-[#0B2A5B]"}`}>{message}</p>}

      {/* 🏅 my effects */}
      {owned.length > 0 && (
        <div className={`mt-2.5 bg-[#FDF6E3] p-2.5 ${rad}`}>
          <p className="text-[13px] font-bold text-[#7A5B00]">🏅 My Entry Effects</p>
          <p className="text-[9px] text-[#8A8060]">Only one is on at a time. Turn one on to show it when you enter a room.</p>
          <ul className="mt-1.5 space-y-1.5">
            {owned.map((fx) => {
              const on = inv.active === fx.id;
              return (
                <li key={fx.id} className={`flex items-center border bg-white p-2 ${classic ? "rounded-[4px]" : "rounded-xl"}`} style={{ borderColor: rgba(fx.accent, 0.6) }}>
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] text-lg"
                    style={{ background: `linear-gradient(135deg, ${fx.banner[0]}, ${fx.banner[1]})` }}
                  >
                    {fx.emoji}
                  </span>
                  <span className="ml-2 min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-[13px] font-bold text-[#1A1A2E]">{nameOf(fx)}</span>
                      {on && <span className="rounded-md bg-[#2E9E6B] px-[5px] py-px text-[8px] font-black text-white">ON</span>}
                    </span>
                    <span className="block text-[9px] text-[#8A8060]">⏱ {daysLeft(fx.id)} days left</span>
                  </span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={on}
                    disabled={busy !== null}
                    onClick={() => use(on ? "none" : fx.id)}
                    className={`relative h-7 w-12 shrink-0 rounded-full transition disabled:opacity-50 ${on ? "bg-[#6750A4]" : "bg-[#C5D0E0]"}`}
                  >
                    <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? "left-6" : "left-1"}`} />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* categories */}
      <div className="no-scrollbar -mx-1 mt-2.5 flex gap-1.5 overflow-x-auto px-1 py-0.5">
        {["All", ...ENTRY_FX_CATEGORIES].map((c) => {
          const on = c === tab;
          return (
            <button
              key={c}
              type="button"
              onClick={() => setTab(c)}
              className={`shrink-0 px-[11px] py-1.5 text-xs font-bold ${classic ? "rounded-[4px]" : "rounded-full"}`}
              style={{
                background: on ? (classic ? "#2F6ABD" : "#7B4DE0") : classic ? "#E9EEF4" : "#FFFFFF",
                color: on ? "#FFFFFF" : classic ? "#16315F" : "#0B2A5B",
              }}
            >
              {c}
            </button>
          );
        })}
      </div>
      <p className="px-1.5 py-1 text-[11px] font-bold text-[#0B2A5B]">Available Effects • {shown.length} styles</p>

      {/* effect cards — a raised keycap, like Style Studio */}
      <div className="grid gap-2.5 md:grid-cols-2">
        {shown.map((fx) => {
          const exp = inv.owned[fx.id] || 0;
          const isOwned = exp > now;
          const on = isOwned && inv.active === fx.id;
          const price = priceOf(fx);
          const canAfford = balance !== null && balance >= price;
          return (
            <div key={fx.id} className={`pb-[3px] ${rad}`} style={{ background: rgba(fx.accent, 0.55) }}>
              <div className={`flex overflow-hidden bg-gradient-to-b from-white to-[#F6F6F8] shadow-[0_2px_4px_rgba(0,0,0,.18)] ${rad}`}>
                <span className="w-1 shrink-0" style={{ background: fx.accent }} />
                <div className="min-w-0 flex-1 p-[11px]">
                  <div className="flex items-center gap-2">
                    <p className="min-w-0 flex-1 truncate text-[15px] font-bold text-[#1A1A2E]">
                      {fx.emoji} {nameOf(fx)}
                    </p>
                    {isFounder && (
                      <button type="button" onClick={() => setEditing(fx)} aria-label="Edit" className="shrink-0 rounded-lg px-1.5 text-[15px]">
                        ✏️
                      </button>
                    )}
                    <span className={`shrink-0 border border-[#D4AF37] bg-[#FFF3D6] px-2 py-[3px] text-[11px] font-bold text-[#8A5A00] ${classic ? "rounded-[4px]" : "rounded-xl"}`}>
                      💲 {price.toLocaleString("en-US")}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-[5px]">
                    <Chip text="30 days" color={fx.accent} />
                    <Chip text={fx.category} color="#6B7788" />
                    {isOwned && <Chip text={`OWNED · ${daysLeft(fx.id)}d`} color="#2E9E6B" />}
                  </div>
                  {/* mini banner: what everyone sees when you enter */}
                  <button
                    type="button"
                    onClick={() => showPreview(fx)}
                    className="mt-[7px] block w-full rounded-xl py-2 text-center"
                    style={{
                      background: `linear-gradient(90deg, ${fx.banner[0]}, ${fx.banner[1]})`,
                      border: `1.5px solid ${fx.accent}`,
                    }}
                  >
                    <span className="block text-[8px] font-black tracking-[1.5px]" style={{ color: fx.accent }}>
                      ✦ GRAND ENTRY ✦
                    </span>
                    <span data-notranslate className="block text-[15px] font-black text-white">
                      {fx.emoji} {brandMiglife(myName || "you")}
                    </span>
                    <span className="block text-[10px] font-bold" style={{ color: fx.ink }}>
                      {fx.subtitle}
                    </span>
                    <span className="block text-[8px] text-white/60">▶ tap to preview</span>
                  </button>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <button type="button" onClick={() => showPreview(fx)} className={`${btn} bg-[#EEF2F8] text-[#16315F]`}>
                      ▶ Preview
                    </button>
                    {busy === fx.id ? (
                      <span className="text-xs text-[#8A97A8]">Working…</span>
                    ) : on ? (
                      <button type="button" onClick={() => use("none")} className={`${btn} bg-[#2E9E6B] text-white`}>
                        ✓ On
                      </button>
                    ) : isOwned ? (
                      <button type="button" onClick={() => use(fx.id)} className={`${btn} bg-[#2F6ABD] text-white`}>
                        Use
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => (canAfford ? setConfirm(fx) : setMessage(`You need ${price.toLocaleString("en-US")} coins for ${nameOf(fx)}.`))}
                        className={`${btn} text-white`}
                        style={{ background: canAfford ? (classic ? "#F07A00" : "#7B4DE0") : "#B0B8C4" }}
                      >
                        {canAfford ? "Buy" : "Need coins"}
                      </button>
                    )}
                    {isOwned && (
                      <button type="button" onClick={() => setConfirm(fx)} className={`${btn} bg-[#FFF3D6] text-[#8A5A00]`}>
                        +30 days
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {confirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-6" onClick={() => setConfirm(null)}>
          <div className="w-full max-w-xs rounded-2xl bg-white p-4 text-[#1b1b1f]" onClick={(e) => e.stopPropagation()}>
            <p className="text-base font-bold">
              {confirm.emoji} {nameOf(confirm)}
            </p>
            <p className="mt-2 text-sm">
              {(inv.owned[confirm.id] || 0) > now
                ? `Add 30 more days for ${priceOf(confirm).toLocaleString("en-US")} coins?`
                : `Buy this entry effect for 30 days for ${priceOf(confirm).toLocaleString("en-US")} coins? It switches on right away.`}
            </p>
            <div className="mt-3 flex justify-end gap-4 text-sm font-bold text-[#6750A4]">
              <button type="button" onClick={() => setConfirm(null)}>
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const c = confirm;
                  setConfirm(null);
                  buy(c);
                }}
              >
                Buy
              </button>
            </div>
          </div>
        </div>
      )}

      {editing && (
        <ShopItemEditDialog
          kind="fx"
          id={editing.id}
          title={`${editing.emoji} ${nameOf(editing)}`}
          currentName={nameOf(editing)}
          currentPrice={priceOf(editing)}
          defaultName={editing.name}
          defaultPrice={editing.price}
          onDone={setMessage}
          onDismiss={() => setEditing(null)}
        />
      )}

      {/* full-screen preview of the effect, with your own name */}
      {preview && (
        <div className="fixed inset-0 z-[100] bg-[#EEF3FA]" onClick={() => setPreview(null)}>
          <EntryFxShow key={preview.key} fx={preview.fx} name={myName || "you"} seed={preview.key % 100000} />
        </div>
      )}
    </div>
  );
}

function Chip({ text, color }: { text: string; color: string }) {
  return (
    <span className="rounded-[7px] px-1.5 py-0.5 text-[9px] font-bold" style={{ color, background: rgba(color, 0.12) }}>
      {text}
    </span>
  );
}
