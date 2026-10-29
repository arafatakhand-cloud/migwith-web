"use client";

import { useEffect, useRef, useState } from "react";

// 🐎 Horse Race, TV style (miglife picked design B): one big turf with the
// grandstand behind, and the camera follows the leader — the stand, the rail
// and the turf slide by, the FINISH post comes in at the end. Every horse
// really gallops (legs with knees, head, tail, a jockey in its own colour, dust).

const COATS = ["#6B3A1F", "#3B2416", "#A8662E", "#2A1A10", "#8A5A3A"];
const HOOF = "#1E120A";
const TRACK = 1500; // the race's length in px of turf
const HORSE_W = 64; // the drawn horse's width (nose at the right)
const ROW_GAP = 31;
const TOP = 62;

const CSS = `
@keyframes hrsDust{0%{opacity:.7;transform:translate(0,0) scale(.6)}100%{opacity:0;transform:translate(-26px,-8px) scale(1.6)}}
.hrs-dust{position:absolute;width:9px;height:9px;border-radius:50%;background:#D9C39A;opacity:0}
.hrs-run .hrs-dust{animation:hrsDust .5s linear infinite}
`;
const STRIDE = "0.42s";

/** An SVG rotation back and forth around (x, y) — SMIL, so the pivot is exact on every browser. */
function Swing({ x, y, values, run }: { x: number; y: number; values: number[]; run: boolean }) {
  if (!run) return null;
  return (
    <animateTransform
      attributeName="transform"
      type="rotate"
      values={values.map((v) => `${v} ${x} ${y}`).join(";")}
      dur={STRIDE}
      repeatCount="indefinite"
    />
  );
}

function Leg({ hip, knee, x, y, coat, run }: { hip: number[]; knee: number[]; x: number; y: number; coat: string; run: boolean }) {
  return (
    <g>
      <Swing x={x} y={y} values={hip} run={run} />
      <rect x={x - 2.6} y={y} width="5.2" height="13" rx="2.5" fill={coat} />
      <g>
        <Swing x={x} y={y + 12} values={knee} run={run} />
        <rect x={x - 2} y={y + 11} width="4" height="12" rx="2" fill={coat} />
        <rect x={x - 2.6} y={y + 21} width="5.4" height="3.2" rx="1" fill={HOOF} />
      </g>
    </g>
  );
}

// one stride: front and hind legs swing opposite, the knees fold on the way back
const F1 = [35, -2, -40, -2, 35];
const F2 = [-40, -2, 35, -2, -40];
const B1 = [-30, 4, 38, 4, -30];
const B2 = [38, 4, -30, 4, 38];
const KF = [0, 55, 25, 10, 0];
const KB = [0, -25, -50, -8, 0];

/** One galloping horse with its jockey, in horse [i]'s colours (0–4). */
function Horse({ i, color, scale, run }: { i: number; color: string; scale: number; run: boolean }) {
  const coat = COATS[i % COATS.length];
  return (
    <svg width={74 * scale} height={56 * scale} viewBox="-6 -14 80 62" style={{ overflow: "visible" }}>
      <Leg hip={B2} knee={KB} x={14} y={20} coat={coat} run={run} />
      <Leg hip={F2} knee={KF} x={50} y={20} coat={coat} run={run} />
      <g>
        {run && <animateTransform attributeName="transform" type="translate" values="0 0;0 -3;0 0" dur={STRIDE} repeatCount="indefinite" />}
        <path d="M7,9 C-2,8 -6,18 -4,28 C-1,22 2,17 8,14 Z" fill={HOOF}>
          {run && <animateTransform attributeName="transform" type="rotate" values="-8 6 10;12 6 10;-8 6 10" dur={STRIDE} repeatCount="indefinite" />}
        </path>
        <path d="M8,10 C10,2 22,0 34,1 C44,1 52,2 56,6 C60,10 58,22 50,24 C40,26 22,26 14,24 C6,22 5,16 8,10 Z" fill={coat} />
        <g>
          <Swing x={54} y={6} values={[4, -6, 4]} run={run} />
          <path d="M50,6 C52,-2 56,-8 62,-10 C66,-11 72,-6 74,-2 C75,1 72,3 69,2 C66,1 64,2 62,5 C60,9 57,12 54,12 Z" fill={coat} />
          <path d="M55,-6 C58,-12 61,-13 63,-10 C60,-9 58,-7 57,-4 Z" fill={HOOF} />
          <circle cx="67" cy="-5" r="1.1" fill="#111" />
          <path d="M60,-8 L58,-14 L62,-10 Z" fill={coat} />
        </g>
        {/* the saddle cloth with the horse's number */}
        <rect x="24" y="5" width="16" height="10" rx="2" fill="#fff" />
        <text x="32" y="13" fontSize="8" fontWeight="900" textAnchor="middle" fill="#111">
          {i + 1}
        </text>
        {/* the jockey, in the horse's colour */}
        <path d="M30,4 C30,-3 36,-8 42,-7 L44,-2 C40,-1 37,2 36,6 Z" fill={color} />
        <circle cx="44" cy="-9" r="4.2" fill={color} />
        <path d="M40,-10 A4.2,4.2 0 0 1 48,-10 L49,-9 L40,-9 Z" fill="#fff" opacity=".55" />
        <path d="M42,-4 L52,0" stroke="#F1C9A5" strokeWidth="2.4" strokeLinecap="round" />
        <path d="M34,5 L38,12 L35,15" stroke="#fff" strokeWidth="3" fill="none" strokeLinecap="round" />
      </g>
      <Leg hip={B1} knee={KB} x={17} y={20} coat={coat} run={run} />
      <Leg hip={F1} knee={KF} x={47} y={20} coat={coat} run={run} />
    </svg>
  );
}

export function HorseRaceScene({
  positions,
  running,
  names,
  colors,
  tags,
  picked,
  onPick,
}: {
  /** 0–100 for each horse */
  positions: number[];
  /** galloping (the race is on) */
  running: boolean;
  names: string[];
  colors: string[];
  /** a small note on each horse's name tag (my bet, 4.5x, 🥇, ✅ +win …) */
  tags: string[];
  /** the horse picked for a bet (1–5), or 0 */
  picked: number;
  /** tap a horse to pick it (only while betting) */
  onPick?: (h: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(360);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth || 360));
    ro.observe(el);
    setW(el.clientWidth || 360);
    return () => ro.disconnect();
  }, []);

  const finishX = TRACK + HORSE_W; // a horse at 100 touches it with its nose
  const xs = positions.map((p) => (Math.max(0, Math.min(100, p)) / 100) * TRACK);
  const lead = Math.max(0, ...xs);
  // the camera keeps the leader a little right of the middle, and stops at the finish
  const cam = Math.max(0, Math.min(finishX + 70 - w, lead - w * 0.5));
  const height = TOP + ROW_GAP * (names.length - 1) + 58;

  return (
    <div ref={ref} className="relative overflow-hidden rounded-xl" style={{ height, background: "linear-gradient(#8FD3FF 0 30px,#CFEFFF 30px 31px)" }}>
      <style>{CSS}</style>
      {/* grandstand + crowd (slower: far away) */}
      <div
        className="absolute left-0 top-0"
        style={{
          width: TRACK + w + 400,
          height: 50,
          transform: `translateX(${-cam * 0.35}px)`,
          background:
            "radial-gradient(circle at 6px 10px,#E57373 3px,transparent 4px) 0 22px/14px 12px,radial-gradient(circle at 6px 4px,#64B5F6 3px,transparent 4px) 7px 22px/14px 12px,repeating-linear-gradient(90deg,#B0BEC5 0 60px,#90A4AE 60px 64px)",
        }}
      />
      {/* turf */}
      <div className="absolute inset-x-0 bottom-0" style={{ top: 50, background: "linear-gradient(#5DBB63,#3E9B47)" }} />
      <div
        className="absolute bottom-0 left-0"
        style={{
          top: 62,
          width: finishX + w + 200,
          transform: `translateX(${-cam}px)`,
          background: "repeating-linear-gradient(90deg,rgba(255,255,255,.07) 0 60px,transparent 60px 120px)",
        }}
      />
      {/* the white rail */}
      <div
        className="absolute left-0"
        style={{
          top: 50,
          height: 12,
          width: finishX + w + 200,
          transform: `translateX(${-cam}px)`,
          background:
            "linear-gradient(#fff 0 3px,transparent 3px 8px,#fff 8px 10px,transparent 10px),repeating-linear-gradient(90deg,#fff 0 3px,transparent 3px 40px)",
        }}
      />
      {/* start line and FINISH */}
      <div className="absolute bottom-0 w-[3px] bg-white/80" style={{ top: 58, left: HORSE_W + 14 - cam }} />
      <div
        className="absolute bottom-0 w-[7px]"
        style={{ top: 50, left: finishX + 12 - cam, background: "repeating-linear-gradient(0deg,#fff 0 7px,#111 7px 14px)" }}
      />
      <div
        className="absolute flex h-[30px] w-[30px] items-center justify-center rounded-full border-[3px] border-[#E53935] bg-[#fff] text-[7px] font-black text-[#111]"
        style={{ top: 18, left: finishX + 12 - cam - 12 }}
      >
        FINISH
      </div>
      {names.map((n, i) => {
        const h = i + 1;
        const on = picked === h;
        return (
          <button
            key={n}
            type="button"
            disabled={!onPick}
            onClick={() => onPick?.(h)}
            className={`absolute text-left ${running ? "hrs-run" : ""}`}
            style={{ top: TOP + i * ROW_GAP, left: xs[i] - cam + 12, zIndex: i + 1 }}
          >
            {on && <span className="absolute left-[4px] top-[36px] h-[12px] w-[60px] rounded-full bg-[#FFD54A]/70 blur-[3px]" />}
            <Horse i={i} color={colors[i]} scale={0.82 + i * 0.03} run={running} />
            <span className="hrs-dust" style={{ left: 2, bottom: 6 }} />
            <span className="hrs-dust" style={{ left: 9, bottom: 3, animationDelay: ".25s" }} />
            <span
              className="absolute left-[14px] top-[-13px] whitespace-nowrap rounded-[6px] px-[5px] text-[9.5px] font-black leading-[14px]"
              style={{ background: colors[i], color: i === 2 ? "#333" : "#fff", boxShadow: on ? "0 0 0 1.5px #FFD54A" : undefined }}
            >
              {n}
              {tags[i] ? ` · ${tags[i]}` : ""}
            </span>
          </button>
        );
      })}
    </div>
  );
}
