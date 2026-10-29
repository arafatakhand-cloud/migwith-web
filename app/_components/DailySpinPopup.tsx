"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { httpsCallable } from "firebase/functions";
import { functions } from "../../lib/firebase";

// 🎡 Daily Free Spin (miglife: "like the video"): one free spin a Bangladesh day.
// The wheel pops up when the Lobby opens, until today's spin is used ("Later"
// closes it for this visit). The server (dailySpin) picks the slice and an
// amount inside its range and pays it — the wheel only shows where it landed.

type Slice = { min: number; max: number; jackpot?: boolean };
type SpinReply = { enabled?: boolean; spunToday?: boolean; slices?: Slice[]; slice?: number; amount?: number; already?: boolean };

const dailySpin = httpsCallable<{ action: string }, SpinReply>(functions, "dailySpin");
const COLORS = ["#F2A31B", "#EE5A87", "#8E4BEA", "#16C1CF", "#2ED36B", "#1FA8E0", "#F2A31B", "#EE5A87", "#8E4BEA", "#16C1CF", "#2ED36B", "#1FA8E0"];
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
        className="absolute left-1/2 top-[2px] z-10 -translate-x-1/2"
        style={{ width: 0, height: 0, borderLeft: "11px solid transparent", borderRight: "11px solid transparent", borderTop: "18px solid #2B2B2B" }}
      />
      <svg
        width="280"
        height="280"
        viewBox="0 0 280 280"
        style={{ transform: `rotate(${rotation}deg)`, transition: spinning ? "transform 4.6s cubic-bezier(.15,.7,.1,1)" : "none" }}
      >
        <circle cx={c} cy={c} r={R + 9} fill="#F7D774" />
        <circle cx={c} cy={c} r={R + 9} fill="none" stroke="#E9B949" strokeWidth="2" />
        {slices.map((s, i) => {
          // slice i is centred at i × seg (0 = top)
          const [x0, y0] = pt(i * seg - seg / 2, R);
          const [x1, y1] = pt(i * seg + seg / 2, R);
          const [tx, ty] = pt(i * seg, R * 0.62);
          return (
            <g key={i}>
              <path d={`M${c},${c} L${x0},${y0} A${R},${R} 0 0 1 ${x1},${y1} Z`} fill={s.jackpot ? "#1B1B1B" : COLORS[i % COLORS.length]} stroke="#fff" strokeWidth="1.5" />
              <text
                x={tx}
                y={ty}
                transform={`rotate(${i * seg - 90} ${tx} ${ty})`}
                textAnchor="middle"
                dominantBaseline="middle"
                fontWeight="900"
                fontSize={s.jackpot ? 11.5 : 12.5}
                fill={s.jackpot ? "#FFD54A" : "#fff"}
              >
                {s.jackpot ? `💎 ${label(s)}` : label(s)}
              </text>
            </g>
          );
        })}
      </svg>
      {/* ✨ the hub */}
      <div className="absolute left-1/2 top-1/2 flex h-[46px] w-[46px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-[3px] border-[#F7D774] bg-[#2B2B2B] text-[20px] shadow-[0_2px_8px_rgba(0,0,0,.35)]">
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
    <div className="fixed inset-0 z-[93] flex items-center justify-center bg-black/45 p-4">
      <div className="w-full max-w-[360px] rounded-[22px] bg-[#fff] px-4 pb-4 pt-5 text-center text-[#1B1B1B] shadow-[0_18px_50px_rgba(0,0,0,.3)]">
        <div className="text-[30px] leading-none">🎲</div>
        <h2 className="mt-2 text-[19px] font-black">Daily Lucky Spin</h2>
        <p className="mx-auto mt-1 max-w-[290px] text-[12px] font-semibold leading-snug text-[#6B6B6B]">
          Spin once during today&apos;s Bangladesh day. Each slice pays a random amount in its range.
        </p>
        <div className="mt-3">
          <Wheel slices={slices} rotation={rotation} spinning={spinning} />
        </div>
        {won ? (
          <div className={`mx-auto mt-3 rounded-[14px] px-3 py-2.5 ${won.jackpot ? "bg-[#1B1B1B] text-[#FFD54A]" : "bg-[#FFF3E0] text-[#E65100]"}`}>
            <div className="text-[13px] font-extrabold">{won.jackpot ? "💎 JACKPOT!" : "🎉 You won"}</div>
            <div className="text-[24px] font-black">+{fmt(won.amount)} coins</div>
          </div>
        ) : (
          <p className="mt-2 text-[11px] font-semibold text-[#8A8A8A]">
            {spinning ? "The wheel is choosing today's reward…" : "A missed spin expires at midnight (Bangladesh time) and can't be reclaimed."}
          </p>
        )}
        {error && <p className="mt-2 text-[12px] font-bold text-[#D32F2F]">{error}</p>}
        <div className="mt-3 flex gap-2.5">
          {won ? (
            <button type="button" onClick={() => setOpen(false)} className="h-11 flex-1 rounded-full bg-[#F05A28] text-[15px] font-black text-white shadow-[0_6px_14px_rgba(240,90,40,.35)]">
              Collect
            </button>
          ) : (
            <>
              <button
                type="button"
                disabled={spinning}
                onClick={close}
                className="h-11 flex-1 rounded-full border border-[#E3E3E3] bg-[#fff] text-[14px] font-extrabold text-[#F05A28] disabled:opacity-40"
              >
                Later
              </button>
              <button
                type="button"
                disabled={spinning}
                onClick={spin}
                className="h-11 flex-1 rounded-full bg-[#F05A28] text-[14px] font-black text-white shadow-[0_6px_14px_rgba(240,90,40,.35)] disabled:bg-[#D9D9D9] disabled:text-[#8A8A8A] disabled:shadow-none"
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
