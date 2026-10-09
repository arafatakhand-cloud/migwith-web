"use client";

import { useEffect, useRef, useState } from "react";
import { doc, getDoc, onSnapshot } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../../lib/firebase";
import { serverNow } from "../../lib/serverTime";
import { brandMiglife } from "../../lib/brand";
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

export const ENTRY_FX_CATEGORIES = ["🌟 Classic", "🌸 Nature", "💖 Love", "🎉 Party", "🏮 Festival", "🔥 Elements", "💰 Rich", "👑 Royal", "🚀 Legend", "🐉 Mythic"];

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
      // not cached: looked up again next time (and "could not be checked" is shown)
      lookupCache.delete(key);
      return null;
    }
    lookupCache.set(key, v);
  }
  if (v.expiresAt <= serverNow()) return null;
  return entryFxById(v.active);
}

/** Why my own effect didn't play (from the last lookup), in plain words. */
function ownMissingReason(name: string): string {
  const v = lookupCache.get(name.trim().toLowerCase());
  if (!v) return "✨ Your entry effect could not be checked (no connection?). Please try again.";
  if (!v.active || v.active === "none") return "✨ No entry effect is ON for you. Open Entry Effects (/entry) and tap ON on one you own.";
  if (!entryFxById(v.active)) return `✨ Your entry effect "${v.active}" is not known here yet. Please update the app / reload the page.`;
  if (v.expiresAt <= serverNow()) return "✨ Your entry effect has expired. Buy it again in Entry Effects (/entry).";
  return "✨ Your entry effect could not play.";
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
  onOwnMissing,
}: {
  messages: { id: string; text: string; type: string }[];
  roomKey: string;
  /** My own name: my own effect plays for me when I open the room (see below). */
  myName?: string;
  /** Told why my own effect could not play (no effect on / expired …), shown in the chat. */
  onOwnMissing?: (why: string) => void;
}) {
  const [names, setNames] = useNewLineEvents(messages, roomKey, entryNameOf, 4);
  const [queue, setQueue] = useState<{ fx: EntryFx; name: string }[]>([]);
  const mounted = useRef(true);
  const onOwnMissingRef = useRef(onOwnMissing);
  onOwnMissingRef.current = onOwnMissing;
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
        else onOwnMissingRef.current?.(ownMissingReason(me));
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

export function EntryEffectShop({ uid, myName }: { uid: string; myName: string }) {
  const [inv, setInv] = useEntryFxInventory(uid);
  const [tab, setTab] = useState(ENTRY_FX_CATEGORIES[0]);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<EntryFx | null>(null);
  const [preview, setPreview] = useState<{ fx: EntryFx; key: number } | null>(null);
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const now = serverNow();

  const use = async (id: string) => {
    setBusy(id);
    try {
      await httpsCallable(functions, "setEntryEffect")({ id });
      setInv((s) => ({ ...s, active: id }));
      setMessage(id === "none" ? "Entry effect turned off." : `✓ ${entryFxById(id)?.name} is on.`);
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
      setMessage(`${fx.emoji} ${fx.name} is yours for 30 days!`);
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

  const pill = "rounded-full px-3 py-1.5 text-xs font-extrabold";
  return (
    <div className="classic-light rounded-[22px] bg-[#140F24] p-4 text-white shadow-xl">
      <h2 className="text-[19px] font-extrabold text-[#FFD54F]">✨ Entry Effects</h2>
      <p className="text-[11px] text-[#B9B2CC]">30 days each · 1,00,000 – 5,00,000 coins · everyone in the room sees it</p>

      <div className="no-scrollbar -mx-1 mt-3 flex gap-1.5 overflow-x-auto px-1">
        {ENTRY_FX_CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setTab(c)}
            className="shrink-0 rounded-full px-[11px] py-1.5 text-xs font-bold"
            style={c === tab ? { background: "#FFD54F", color: "#2A1F00" } : { background: "rgba(255,255,255,.13)", color: "#fff" }}
          >
            {c}
          </button>
        ))}
      </div>
      {message && <p className="mt-2 text-xs font-bold text-[#FFD27A]">{message}</p>}

      <div className="mt-2.5 space-y-2.5">
        {ENTRY_FX.filter((f) => f.category === tab).map((fx) => {
          const exp = inv.owned[fx.id] || 0;
          const owned = exp > now;
          const active = owned && inv.active === fx.id;
          const daysLeft = owned ? Math.floor((exp - now) / 86_400_000) + 1 : 0;
          return (
            <div
              key={fx.id}
              className="rounded-2xl p-3"
              style={{
                background: `linear-gradient(90deg, ${fx.banner[0]}, ${fx.banner[1]})`,
                border: `${active ? 2.5 : 1}px solid ${fx.accent}`,
                boxShadow: active ? `0 0 16px ${rgba(fx.accent, 0.6)}` : "0 2px 6px rgba(0,0,0,.3)",
              }}
            >
              <div className="flex items-center">
                <span className="text-[30px] leading-none">{fx.emoji}</span>
                <div className="ml-2.5 min-w-0 flex-1">
                  <p className="text-base font-extrabold text-white">{fx.name}</p>
                  <p className="text-xs font-bold" style={{ color: fx.accent }}>
                    {active ? `✓ ON · ${daysLeft} days left` : owned ? `Owned · ${daysLeft} days left` : `🪙 ${fx.price.toLocaleString("en-US")} / 30 days`}
                  </p>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" onClick={() => showPreview(fx)} className={pill} style={{ background: "rgba(255,255,255,.2)" }}>
                  👁 Preview
                </button>
                {busy === fx.id ? (
                  <span className={pill} style={{ background: "rgba(255,255,255,.2)" }}>
                    …
                  </span>
                ) : active ? (
                  <button type="button" onClick={() => use("none")} className={pill} style={{ background: "rgba(0,0,0,.33)", color: "#FF8A80" }}>
                    Turn off
                  </button>
                ) : owned ? (
                  <button type="button" onClick={() => use(fx.id)} className={pill} style={{ background: fx.accent, color: "#1A1200" }}>
                    Use
                  </button>
                ) : (
                  <button type="button" onClick={() => setConfirm(fx)} className={pill} style={{ background: fx.accent, color: "#1A1200" }}>
                    Buy
                  </button>
                )}
                {owned && (
                  <button type="button" onClick={() => setConfirm(fx)} className={pill} style={{ background: "rgba(255,255,255,.2)" }}>
                    +30 days
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {confirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-6" onClick={() => setConfirm(null)}>
          <div className="w-full max-w-xs rounded-2xl bg-white p-4 text-[#1b1b1f]" onClick={(e) => e.stopPropagation()}>
            <p className="text-base font-bold">
              {confirm.emoji} {confirm.name}
            </p>
            <p className="mt-2 text-sm">
              {(inv.owned[confirm.id] || 0) > now
                ? `Add 30 more days for ${confirm.price.toLocaleString("en-US")} coins?`
                : `Buy this entry effect for 30 days for ${confirm.price.toLocaleString("en-US")} coins? It switches on right away.`}
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

      {/* full-screen preview of the effect, with your own name */}
      {preview && (
        <div className="fixed inset-0 z-[100] bg-[#EEF3FA]" onClick={() => setPreview(null)}>
          <EntryFxShow key={preview.key} fx={preview.fx} name={myName || "you"} seed={preview.key % 100000} />
        </div>
      )}
    </div>
  );
}
