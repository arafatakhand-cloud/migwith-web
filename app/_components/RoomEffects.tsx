"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cricketSoundOn } from "./CricketCelebration";
import { brandMiglife } from "../../lib/brand";
import { useCricketWinFxRooms, winFxKey } from "../../lib/cricketWinFx";

// 🎆 Room-wide effects, like the app's RoomFireworks.kt / RoomHearts.kt:
//  * someone WINS Cricket / LowCard / Ludo → fireworks + "🏆 name WINS!" banner;
//  * "/love @name" or "/heart @name" → hearts float up with a "💖 X ❤ Y" ribbon.
// Driven by the chat lines everyone already gets, so every phone and browser in
// the room sees it. Only NEW lines fire (never history); nothing takes touches.
// 🔇 SOUND OFF (Cricket box) mutes the sounds too.

type Line = { id: string; text: string; type: string };

/** Lines that arrived after this room was first shown, parsed by `parse`. */
export function useNewLineEvents<E>(messages: Line[], roomKey: string, parse: (m: Line) => E | null, max = 3) {
  const seen = useRef<{ room: string; ids: Set<string>; primed: boolean }>({ room: "", ids: new Set(), primed: false });
  const [queue, setQueue] = useState<E[]>([]);
  const latest = useRef(messages);
  latest.current = messages;

  // A quiet room: if nothing has loaded 4 s after opening, it counts as
  // primed, so its first new line plays (like the app).
  useEffect(() => {
    const t = setTimeout(() => {
      const st = seen.current;
      if (st.room !== roomKey || st.primed) return;
      latest.current.forEach((m) => m.id && st.ids.add(m.id));
      st.primed = true;
    }, 4_000);
    return () => clearTimeout(t);
  }, [roomKey]);

  useEffect(() => {
    if (seen.current.room !== roomKey) {
      seen.current = { room: roomKey, ids: new Set(), primed: false };
      setQueue([]);
    }
    const st = seen.current;
    if (!st.primed) {
      // First look at this room: everything already here is history.
      messages.forEach((m) => m.id && st.ids.add(m.id));
      if (messages.length > 0) st.primed = true;
      return;
    }
    const fresh: E[] = [];
    for (const m of messages) {
      if (!m.id || st.ids.has(m.id)) continue;
      st.ids.add(m.id);
      const e = parse(m);
      if (e) fresh.push(e);
    }
    if (st.ids.size > 3000) st.ids = new Set(messages.map((m) => m.id));
    if (fresh.length) setQueue((q) => [...q, ...fresh].slice(0, max));
    // parse is a plain module function
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, roomKey]);

  return [queue, setQueue] as const;
}

/** Plays queued events one at a time, each for `ms`. */
export function usePlayQueue<E>(queue: E[], setQueue: (f: (q: E[]) => E[]) => void, ms: number, onStart?: (e: E) => void) {
  const [current, setCurrent] = useState<{ e: E; key: number } | null>(null);
  useEffect(() => {
    if (current || queue.length === 0) return;
    const e = queue[0];
    setQueue((q) => q.slice(1));
    setCurrent({ e, key: Date.now() });
    onStart?.(e);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, queue]);
  useEffect(() => {
    if (!current) return;
    const t = setTimeout(() => setCurrent(null), ms + 200);
    return () => clearTimeout(t);
  }, [current, ms]);
  return current;
}

const sounds = new Map<string, HTMLAudioElement>();
/** The app's fx_fireworks / fx_love sounds (silent with 🔇 SOUND OFF). */
export function playFx(name: "fx_fireworks" | "fx_love") {
  if (!cricketSoundOn()) return;
  try {
    let a = sounds.get(name);
    if (!a) {
      a = new Audio(`/sounds/${name}.mp3`);
      sounds.set(name, a);
    }
    a.currentTime = 0;
    a.play().catch(() => {});
  } catch {
    // no audio here
  }
}

// ---------------------------------------------------------------- canvas helpers

/** Small seeded random (the same numbers every frame for the same seed). */
export function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}

/** "#RRGGBB" (+ alpha 0..1) → rgba() */
export function rgba(hex: string, a = 1): string {
  const n = parseInt(hex.slice(1, 7), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${Math.max(0, Math.min(1, a))})`;
}

export const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** A full-screen canvas that calls draw(ctx, w, h, t) every frame for `seconds`. */
export function FxCanvas({
  seconds,
  draw,
  className = "",
}: {
  seconds: number;
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number, t: number) => void;
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawRef = useRef(draw);
  drawRef.current = draw;
  useEffect(() => {
    const cv = ref.current;
    const ctx = cv?.getContext("2d");
    if (!cv || !ctx) return;
    let raf = 0;
    const start = performance.now();
    const frame = (now: number) => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = cv.clientWidth;
      const h = cv.clientHeight;
      if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
        cv.width = Math.round(w * dpr);
        cv.height = Math.round(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const t = (now - start) / 1000;
      drawRef.current(ctx, w, h, t);
      if (t < seconds) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [seconds]);
  return <canvas ref={ref} className={`absolute inset-0 h-full w-full ${className}`} />;
}

/** Whole-screen layer that fades out over its last 0.6 s and takes no touches. */
function FxLayer({ seconds, children }: { seconds: number; children: ReactNode }) {
  return (
    <div className="fx-fade pointer-events-none fixed inset-0 z-[95]" style={{ animationDuration: `${seconds}s` }}>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------- 🎆 fireworks

type Win = { game: string; emoji: string; names: string };

function parseWin(m: Line): Win | null {
  const t = m.text.trim();
  let w: Win | null = null;
  if (/^Cricket Bot:/i.test(t) && t.includes("Game over!") && t.includes("CONGRATULATIONS")) {
    const body = t.slice(t.indexOf("Game over!") + "Game over!".length).trim();
    const names = body.startsWith("It's a tie")
      ? (body.includes("— ") ? body.slice(body.indexOf("— ") + 2) : body).split(" share")[0].trim()
      : body.split(" ")[0].trim();
    w = { game: "Cricket", emoji: "🏏", names };
  } else if (/^LowCard Bot:/i.test(t) && /game over!/i.test(t) && t.includes(" WINS ")) {
    const i = t.toLowerCase().indexOf("game over!");
    w = { game: "LowCard", emoji: "🃏", names: t.slice(i + "game over!".length).trim().split(" WINS")[0].trim() };
  } else if (/^Ludo Bot:/i.test(t) && t.includes("🏆") && t.includes("🎉") && !/better luck/i.test(t)) {
    w = { game: "Ludo", emoji: "🎲", names: t.slice(t.indexOf("🏆") + 2).split(" win")[0].trim() };
  }
  return w && w.names && w.names.length <= 60 ? w : null;
}

const FW_PALETTES = [
  ["#FFD54F", "#FFF59D", "#FF8F00"],
  ["#FF4081", "#FF80AB", "#FFFFFF"],
  ["#40C4FF", "#80D8FF", "#E1F5FE"],
  ["#69F0AE", "#B9F6CA", "#FFFF8D"],
  ["#B388FF", "#EA80FC", "#FFFFFF"],
  ["#FF5252", "#FFAB40", "#FFFF00"],
];

type Rocket = {
  startX: number; burstX: number; burstY: number; launchAt: number; riseTime: number;
  colors: string[]; count: number; speed: number; seed: number;
};

function makeRockets(seed: number): Rocket[] {
  const r = rng(seed);
  // 12 rockets in quick succession + a 5-rocket FINALE all at once
  return Array.from({ length: 17 }, (_, k) => {
    const finale = k >= 12;
    return {
      startX: 0.1 + r() * 0.8,
      burstX: finale ? 0.12 + (k - 12) * 0.19 : 0.1 + r() * 0.8,
      burstY: finale ? 0.14 + r() * 0.18 : 0.1 + r() * 0.38,
      launchAt: finale ? 2.75 + r() * 0.15 : k * 0.21 + r() * 0.1,
      riseTime: 0.5 + r() * 0.2,
      colors: FW_PALETTES[(k + Math.floor(r() * FW_PALETTES.length)) % FW_PALETTES.length],
      count: (finale ? 110 : 80) + Math.floor(r() * 30),
      speed: (finale ? 0.36 : 0.27) + r() * 0.13,
      seed: Math.floor(r() * 2 ** 31),
    };
  });
}

function drawFireworks(ctx: CanvasRenderingContext2D, w: number, h: number, el: number, rockets: Rocket[]) {
  const gravity = h * 0.22;
  // night-sky dim so the colours pop on the light chat
  ctx.fillStyle = rgba("#070A24", 0.68 * clamp01(el / 0.3));
  ctx.fillRect(0, 0, w, h);
  let flash = 0;
  for (const rk of rockets) {
    const bt = el - rk.launchAt - rk.riseTime;
    if (bt >= 0 && bt <= 0.1) flash += 1 - bt / 0.1;
  }
  if (flash > 0) {
    ctx.fillStyle = rgba("#FFFFFF", 0.16 * Math.min(1, flash));
    ctx.fillRect(0, 0, w, h);
  }
  ctx.lineCap = "round";
  for (const rk of rockets) {
    const t = el - rk.launchAt;
    if (t < 0) continue;
    const sx = rk.startX * w, sy = h * 0.98, bx = rk.burstX * w, by = rk.burstY * h;
    if (t < rk.riseTime) {
      // rising rocket with a short glowing tail
      const p = t / rk.riseTime, e = 1 - (1 - p) * (1 - p);
      const x = sx + (bx - sx) * e, y = sy + (by - sy) * e;
      const pt = Math.max(0, (t - 0.06) / rk.riseTime), e2 = 1 - (1 - pt) * (1 - pt);
      ctx.strokeStyle = rgba(rk.colors[1], 0.7);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(sx + (bx - sx) * e2, sy + (by - sy) * e2);
      ctx.lineTo(x, y);
      ctx.stroke();
      dot(ctx, x, y, 2.6, "#FFFFFF");
      continue;
    }
    const bt = t - rk.riseTime;
    if (bt > 2.1) continue;
    if (bt < 0.22) {
      dot(ctx, bx, by, 24 + bt * 220, rgba("#FFFFFF", (1 - bt / 0.22) * 0.9));
      dot(ctx, bx, by, 40 + bt * 320, rgba(rk.colors[0], (1 - bt / 0.22) * 0.5));
    }
    const rnd = rng(rk.seed);
    const a = clamp01(1 - bt / 2.1);
    const drag = (1 - Math.exp(-2.2 * bt)) / 2.2;
    const bt2 = Math.max(0, bt - 0.07);
    const d2 = (1 - Math.exp(-2.2 * bt2)) / 2.2;
    for (let i = 0; i < rk.count; i++) {
      const ang = (i / rk.count) * 6.2832 + rnd() * 0.25;
      // every 3rd spark forms a slower white inner ring
      const inner = i % 3 === 0;
      const sp = rk.speed * w * (inner ? 0.45 : 0.75 + rnd() * 0.45);
      const px = bx + Math.cos(ang) * sp * drag;
      const py = by + Math.sin(ang) * sp * drag + 0.5 * gravity * bt * bt;
      const tx = bx + Math.cos(ang) * sp * d2;
      const ty = by + Math.sin(ang) * sp * d2 + 0.5 * gravity * bt2 * bt2;
      const c = inner ? "#FFFFFF" : rk.colors[i % rk.colors.length];
      const tw = bt > 0.9 && (i + Math.floor(bt * 20)) % 3 === 0 ? 0.35 : 1;
      ctx.strokeStyle = rgba(c, a * 0.6 * tw);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(px, py);
      ctx.stroke();
      dot(ctx, px, py, 6, rgba(c, a * 0.25 * tw));
      dot(ctx, px, py, 3, rgba(c, a * tw));
      // glitter left behind as the sparks fall
      if (bt > 0.5 && i % 2 === 0 && (Math.floor(bt * 30) + i) % 4 === 0) {
        dot(ctx, bx + Math.cos(ang) * sp * drag * 0.8, by + Math.sin(ang) * sp * drag * 0.8 + 0.5 * gravity * bt * bt * 0.7, 1.8, rgba("#FFF8E1", a));
      }
    }
  }
}

export function dot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, Math.max(0.1, r), 0, Math.PI * 2);
  ctx.fill();
}

function FireworksShow({ win, seed }: { win: Win; seed: number }) {
  const rockets = useRef(makeRockets(seed * 7919 + hashStr(win.names))).current;
  const many = win.names.includes(",") || win.names.includes("&");
  return (
    <FxLayer seconds={5.3}>
      <FxCanvas seconds={5.3} draw={(ctx, w, h, t) => drawFireworks(ctx, w, h, t, rockets)} />
      <div className="absolute inset-0 flex items-center justify-center px-6">
        <div
          className="fx-pop flex flex-col items-center rounded-[22px] px-[26px] py-3.5 text-center"
          style={{
            animationDelay: "450ms",
            background: "linear-gradient(rgba(49,27,146,.9), rgba(26,14,64,.9)) padding-box, linear-gradient(90deg, #FFF59D, #FFB300, #FFF59D) border-box",
            border: "2px solid transparent",
            boxShadow: "0 0 32px rgba(255,179,0,.55)",
          }}
        >
          <span className="text-[44px] leading-none">🏆</span>
          <span className="fx-gold-text line-clamp-2 text-[26px] font-black leading-tight">{brandMiglife(win.names)}</span>
          <span className="fx-gold-text text-[34px] font-black leading-tight">{many ? "WIN!" : "WINS!"}</span>
          <span className="text-[13px] font-bold text-[#E1D5FF]">
            {win.emoji} {win.game}
          </span>
        </div>
      </div>
    </FxLayer>
  );
}

/** Put this once over the room. */
export function RoomFireworksHost({ messages, roomKey }: { messages: Line[]; roomKey: string }) {
  // 🏏 Cricket fireworks only in rooms miglife switched ON (like the app).
  const winFx = useCricketWinFxRooms();
  const winFxRef = useRef(winFx);
  winFxRef.current = winFx;
  const [queue, setQueue] = useNewLineEvents(messages, roomKey, (m) => {
    const w = parseWin(m);
    return w && w.game === "Cricket" && !winFxRef.current?.has(winFxKey(roomKey)) ? null : w;
  });
  const current = usePlayQueue(queue, setQueue, 5300, () => playFx("fx_fireworks"));
  if (!current) return null;
  return <FireworksShow key={current.key} win={current.e} seed={current.key % 100000} />;
}

// ---------------------------------------------------------------- ❤️ hearts

type Love = { from: string; to: string };

function parseLove(m: Line): Love | null {
  if (m.type !== "social") return null;
  const t = m.text.trim().replace(/^\*\*/, "").replace(/\*\*$/, "").trim();
  const marker = t.includes(" sends love to ") ? " sends love to " : t.includes(" sends a heart to ") ? " sends a heart to " : null;
  if (!marker) return null;
  const from = t.slice(0, t.indexOf(marker)).trim();
  const to = t.slice(t.indexOf(marker) + marker.length).split("!")[0].trim();
  if (!from || from.length > 30 || to.length > 30) return null;
  return { from, to: to || "everyone" };
}

const HEART_COLORS = ["#FF1744", "#FF4081", "#F50057", "#FF80AB", "#E040FB", "#FF5252", "#FFFFFF"];

export function heartPath(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  ctx.beginPath();
  ctx.moveTo(x, y + s * 0.35);
  ctx.bezierCurveTo(x - s * 0.55, y - s * 0.05, x - s * 0.35, y - s * 0.55, x, y - s * 0.22);
  ctx.bezierCurveTo(x + s * 0.35, y - s * 0.55, x + s * 0.55, y - s * 0.05, x, y + s * 0.35);
  ctx.closePath();
}

type FloatHeart = { x: number; delay: number; size: number; speed: number; sway: number; swayFreq: number; color: string; spin: number };

function HeartsShow({ ev, seed }: { ev: Love; seed: number }) {
  const hearts = useRef<FloatHeart[]>(
    (() => {
      const r = rng(seed * 104729 + hashStr(ev.from));
      return Array.from({ length: 46 }, () => ({
        x: r(),
        delay: r() * 1.6,
        size: 16 + r() * 30,
        speed: 0.32 + r() * 0.3,
        sway: 10 + r() * 26,
        swayFreq: 1.5 + r() * 2,
        color: HEART_COLORS[Math.floor(r() * HEART_COLORS.length)],
        spin: -20 + r() * 40,
      }));
    })()
  ).current;
  const draw = (ctx: CanvasRenderingContext2D, w: number, h: number, el: number) => {
    // soft pink glow rising from the bottom
    const g = ctx.createLinearGradient(0, h * 0.45, 0, h);
    g.addColorStop(0, "rgba(255,64,129,0)");
    g.addColorStop(0.5, "rgba(255,64,129,.2)");
    g.addColorStop(1, "rgba(255,23,68,.33)");
    ctx.globalAlpha = clamp01(el / 0.4);
    ctx.fillStyle = g;
    ctx.fillRect(0, h * 0.45, w, h * 0.55);
    ctx.globalAlpha = 1;
    for (const hp of hearts) {
      const t = el - hp.delay;
      if (t <= 0) continue;
      const y = h + 30 - t * hp.speed * h;
      if (y < -60) continue;
      const life = clamp01(1 - (h - y) / (h * 1.05));
      const pop = clamp01(t / 0.25);
      const x = hp.x * w + Math.sin(t * hp.swayFreq * Math.PI) * hp.sway;
      const s = hp.size * (0.6 + 0.4 * pop);
      const alpha = (0.25 + 0.75 * life) * pop;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(((hp.spin * Math.sin(t * 2)) * Math.PI) / 180);
      heartPath(ctx, 0, 0, s);
      ctx.fillStyle = rgba(hp.color, alpha);
      ctx.fill();
      // glossy highlight
      dot(ctx, -s * 0.2, -s * 0.22, s * 0.09, rgba("#FFFFFF", alpha * 0.45));
      ctx.restore();
    }
  };
  return (
    <FxLayer seconds={4}>
      <FxCanvas seconds={4} draw={draw} />
      <div className="absolute inset-0 flex items-center justify-center px-4">
        <div
          className="fx-pop fx-bob flex max-w-full items-center rounded-full border-2 border-[#FFE4EC] px-5 py-2.5"
          style={{
            background: "linear-gradient(90deg, rgba(255,64,129,.95), rgba(245,0,87,.95), rgba(197,17,98,.95))",
            boxShadow: "0 0 28px rgba(255,64,129,.6)",
          }}
        >
          <span className="text-xl">💖&nbsp;</span>
          <span className="truncate text-[17px] font-black text-white">{brandMiglife(ev.from)}</span>
          <span className="px-2 text-lg font-black text-[#FFE4EC]">❤</span>
          <span className="truncate text-[17px] font-black text-white">{brandMiglife(ev.to)}</span>
        </div>
      </div>
    </FxLayer>
  );
}

/** Put this once over the room. */
export function RoomHeartsHost({ messages, roomKey }: { messages: Line[]; roomKey: string }) {
  const [queue, setQueue] = useNewLineEvents(messages, roomKey, parseLove);
  const current = usePlayQueue(queue, setQueue, 4000, () => playFx("fx_love"));
  if (!current) return null;
  return <HeartsShow key={current.key} ev={current.e} seed={current.key % 100000} />;
}
