"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { httpsCallable } from "firebase/functions";
import { functions } from "../../lib/firebase";

// 🎡 Daily Free Spin (miglife: "like the video", in clear glass): one free spin a day — a new one opens at 12 midnight (Bangladesh time).
// The wheel pops up when the Lobby opens, while a spin is waiting ("Later"
// closes it for this visit). The server (dailySpin) picks the slice and an
// amount inside its range and pays it — the wheel only shows where it landed.

type Slice = { min: number; max: number; jackpot?: boolean };
type SpinReply = { enabled?: boolean; spunToday?: boolean; slices?: Slice[]; slice?: number; amount?: number; already?: boolean };

const dailySpin = httpsCallable<{ action: string }, SpinReply>(functions, "dailySpin");
// 🫧 clear glass (miglife picked design A): see-through tints, the sky shows through
const GLASS = ["rgba(120,170,255,.35)", "rgba(255,150,200,.33)", "rgba(150,120,255,.32)", "rgba(90,210,230,.33)", "rgba(120,220,160,.33)"];
const SEEN_KEY = "migwith.dailySpinSeen";

const k = (n: number) => (n >= 1000 ? `${Number((n / 1000).toFixed(n % 1000 ? 2 : 0))}k` : String(n));
const label = (s: Slice) => (s.min === s.max ? k(s.min) : `${k(s.min)}–${k(s.max)}`);
const fmt = (n: number) => Math.floor(n || 0).toLocaleString("en-US");

export function Wheel({ slices, rotation, spinning }: { slices: Slice[]; rotation: number; spinning: boolean }) {
  const n = slices.length;
  const seg = 360 / n;
  const R = 130;
  const c = 140;
  const pt = (deg: number, r: number) => {
    const a = ((deg - 90) * Math.PI) / 180;
    return [c + r * Math.cos(a), c + r * Math.sin(a)];
  };
  return (
    <div className="relative mx-auto h-[280px] w-[280px]">
      {/* ▼ the pointer */}
      <div
        className="absolute left-1/2 top-[2px] z-10 -translate-x-1/2 drop-shadow-[0_2px_3px_rgba(0,0,0,.25)]"
        style={{ width: 0, height: 0, borderLeft: "11px solid transparent", borderRight: "11px solid transparent", borderTop: "19px solid #1E63D6" }}
      />
      <svg
        width="280"
        height="280"
        viewBox="0 0 280 280"
        style={{ transform: `rotate(${rotation}deg)`, transition: spinning ? "transform 4.6s cubic-bezier(.15,.7,.1,1)" : "none" }}
      >
        <defs>
          <radialGradient id="dsGloss" cx="50%" cy="32%" r="70%">
            <stop offset="0" stopColor="#fff" stopOpacity=".55" />
            <stop offset=".55" stopColor="#fff" stopOpacity=".08" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="dsJackpot" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#FFE38A" />
            <stop offset=".5" stopColor="#F5B400" />
            <stop offset="1" stopColor="#FF8A00" />
          </linearGradient>
        </defs>
        {/* clear glass rim */}
        <circle cx={c} cy={c} r={R + 7} fill="rgba(255,255,255,.35)" stroke="rgba(255,255,255,.95)" strokeWidth="2.5" />
        {slices.map((s, i) => {
          // slice i is centred at i × seg (0 = top)
          const [x0, y0] = pt(i * seg - seg / 2, R);
          const [x1, y1] = pt(i * seg + seg / 2, R);
          const [tx, ty] = pt(i * seg, R * 0.6);
          return (
            <g key={i}>
              <path
                d={`M${c},${c} L${x0},${y0} A${R},${R} 0 0 1 ${x1},${y1} Z`}
                fill={s.jackpot ? "url(#dsJackpot)" : GLASS[i % GLASS.length]}
                stroke="rgba(255,255,255,.9)"
                strokeWidth="1.6"
              />
              {s.jackpot ? (
                <text x={tx} y={ty} transform={`rotate(${i * seg - 90} ${tx} ${ty})`} textAnchor="middle" fontWeight="900" fill="#5A2E00">
                  <tspan x={tx} dy="-3" fontSize="12">
                    💎 JACKPOT
                  </tspan>
                  <tspan x={tx} dy="13" fontSize="10.5">
                    {label(s)}
                  </tspan>
                </text>
              ) : (
                <text
                  x={tx}
                  y={ty}
                  transform={`rotate(${i * seg - 90} ${tx} ${ty})`}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontWeight="900"
                  fontSize="12.5"
                  fill="#0B2A5B"
                >
                  {label(s)}
                </text>
              )}
            </g>
          );
        })}
        {/* the glass shine on top */}
        <circle cx={c} cy={c} r={R} fill="url(#dsGloss)" />
        <path d={`M${c - R * 0.8},${c - R * 0.35} A${R},${R} 0 0 1 ${c + R * 0.8},${c - R * 0.35}`} fill="none" stroke="#fff" strokeOpacity=".55" strokeWidth="5" strokeLinecap="round" />
      </svg>
      {/* ✨ the hub */}
      <div
        className="absolute left-1/2 top-1/2 flex h-[50px] w-[50px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-[#fff] text-[20px] shadow-[0_4px_12px_rgba(0,0,0,.12)]"
        style={{ background: "rgba(255,255,255,.55)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)" }}
      >
        ✨
      </div>
    </div>
  );
}

export function DailySpinPopup({ uid }: { uid: string }) {
  const [slices, setSlices] = useState<Slice[]>([]);
  const [open, setOpen] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [won, setWon] = useState<{ amount: number; jackpot: boolean } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!uid) return;
    // once a visit: "Later" closes it until the web is opened again
    const seen = `${SEEN_KEY}.${uid}`;
    try {
      if (sessionStorage.getItem(seen)) return;
    } catch {
      // storage blocked — still check
    }
    let alive = true;
    dailySpin({ action: "status" })
      .then(({ data }) => {
        if (!alive || !data?.enabled || data.spunToday || !data.slices?.length) return;
        setSlices(data.slices);
        setOpen(true);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [uid]);

  const close = () => {
    try {
      sessionStorage.setItem(`${SEEN_KEY}.${uid}`, "1");
    } catch {
      // storage blocked
    }
    setOpen(false);
  };

  const spin = async () => {
    if (spinning || won) return;
    setError("");
    setSpinning(true);
    try {
      const { data } = await dailySpin({ action: "spin" });
      const list = data?.slices?.length ? data.slices : slices;
      setSlices(list);
      const i = Math.max(0, Math.min(list.length - 1, Number(data?.slice) || 0));
      const seg = 360 / list.length;
      // land slice i under the pointer, a little off-centre so it looks natural
      const wobble = (Math.random() - 0.5) * seg * 0.6;
      setRotation((r) => r - (r % 360) + 360 * 7 + (360 - i * seg) + wobble);
      setTimeout(() => {
        setWon({ amount: Number(data?.amount) || 0, jackpot: !!list[i]?.jackpot });
        setSpinning(false);
      }, 4800);
    } catch (e: any) {
      setError(e?.message || "Could not spin. Please try again.");
      setSpinning(false);
    }
  };

  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[93] flex items-center justify-center bg-[#0B1F3A]/30 p-4">
      <div
        className="w-full max-w-[360px] rounded-[26px] border-[1.5px] border-white/90 px-4 pb-4 pt-5 text-center text-[#0B2A5B] shadow-[inset_0_1px_1px_#fff,0_14px_36px_rgba(40,80,140,.25)]"
        style={{
          background: "linear-gradient(160deg,rgba(255,255,255,.55),rgba(255,255,255,.22))",
          backdropFilter: "blur(16px) saturate(1.5)",
          WebkitBackdropFilter: "blur(16px) saturate(1.5)",
        }}
      >
        <div className="text-[30px] leading-none">🎲</div>
        <h2 className="mt-2 text-[19px] font-black">Daily Lucky Spin</h2>
        <p className="mx-auto mt-1 max-w-[290px] text-[12px] font-semibold leading-snug text-[#35507E]">
          One free spin every day — a new one opens at 12 midnight. Each slice pays a random amount in its range.
        </p>
        <div className="mt-3">
          <Wheel slices={slices} rotation={rotation} spinning={spinning} />
        </div>
        {won ? (
          <div
            className={`mx-auto mt-3 rounded-[14px] border border-white/90 px-3 py-2.5 ${won.jackpot ? "text-[#5A2E00]" : "text-[#1E63D6]"}`}
            style={{ background: won.jackpot ? "linear-gradient(135deg,#FFE38A,#F5B400)" : "rgba(255,255,255,.55)" }}
          >
            <div className="text-[13px] font-extrabold">{won.jackpot ? "💎 JACKPOT!" : "🎉 You won"}</div>
            <div className="text-[24px] font-black">+{fmt(won.amount)} coins</div>
          </div>
        ) : (
          <p className="mt-2 text-[11px] font-semibold text-[#35507E]/80">
            {spinning ? "The wheel is choosing your reward…" : "Your next free spin opens at 12 midnight."}
          </p>
        )}
        {error && <p className="mt-2 text-[12px] font-bold text-[#D32F2F]">{error}</p>}
        <div className="mt-3 flex gap-2.5">
          {won ? (
            <button type="button" onClick={() => setOpen(false)} className="h-11 flex-1 rounded-full text-[15px] font-black text-white shadow-[0_6px_16px_rgba(91,141,239,.45)]"
              style={{ background: "linear-gradient(90deg,#3B82F6,#8B5CF6)" }}>
              Collect
            </button>
          ) : (
            <>
              <button
                type="button"
                disabled={spinning}
                onClick={close}
                className="h-11 flex-1 rounded-full border-[1.5px] border-white/90 bg-white/45 text-[14px] font-extrabold text-[#1E63D6] disabled:opacity-40"
              >
                Later
              </button>
              <button
                type="button"
                disabled={spinning}
                onClick={spin}
                className="h-11 flex-1 rounded-full text-[14px] font-black text-white shadow-[0_6px_16px_rgba(91,141,239,.45)] disabled:opacity-50 disabled:shadow-none"
                style={{ background: "linear-gradient(90deg,#3B82F6,#8B5CF6)" }}
              >
                🎲 {spinning ? "Spinning…" : "Spin wheel"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
