"use client";

// 🪟 Room popups, like the app's (RoomPage.kt): a plain title + text + OK
// dialog (Lucky Voucher result, Gift Shower report, ban / kick), the compact
// gold-framed balance card, the Luxury Bot round result card and the "Send
// this photo?" confirmation.

import { useEffect, useState } from "react";

const GOLD_FRAME = "linear-gradient(135deg, #F2C94C, #FFE29A, #F2C94C)";

/** Esc or Enter closes the popup (and that Enter does not also send a chat line). */
function useCloseKeys(onClose: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" && e.key !== "Enter") return;
      e.preventDefault();
      e.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);
}

export function SimpleDialog({ title, text, onClose, okLabel = "OK" }: { title: string; text: string; onClose: () => void; okLabel?: string }) {
  useCloseKeys(onClose);
  // a tap or click anywhere (the card too) closes it
  return (
    <div className="fixed inset-0 z-[85] flex cursor-pointer items-center justify-center bg-black/45 px-6" onClick={onClose}>
      <div className="w-full max-w-sm rounded-[24px] bg-white p-5 text-[#14213D] shadow-2xl">
        <p className="text-lg font-extrabold">{title}</p>
        <p className="mt-2 whitespace-pre-line text-sm leading-6 text-[#3D4A60]">{text}</p>
        <div className="mt-4 flex justify-end">
          <button type="button" onClick={onClose} className="rounded-full bg-[#2F6ABD] px-6 py-2 text-sm font-bold text-white">
            {okLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/** ⚠️ "Chat Room — Unable to join chat room …" (miglife picked design C, on a
 * light card like the other popups): a glowing ring icon, the room's name in
 * bold, and for a kick a bar with the minutes left. */
const WARN_TONES = {
  kick: { ring: "#FFB020", glow: "rgba(255,176,32,.5)", icon: "⚠️", btn: "linear-gradient(90deg,#FFC23D,#FF8A00)", btnInk: "#1B1300" },
  ban: { ring: "#E53935", glow: "rgba(229,57,53,.45)", icon: "🚫", btn: "linear-gradient(90deg,#FF5A5F,#D32F2F)", btnInk: "#fff" },
  bump: { ring: "#3B82F6", glow: "rgba(59,130,246,.45)", icon: "👋", btn: "linear-gradient(90deg,#3B82F6,#8B5CF6)", btnInk: "#fff" },
} as const;

export function WarningDialog({
  tone,
  roomName,
  minutesLeft = 0,
  totalMinutes = 30,
  onClose,
}: {
  tone: keyof typeof WARN_TONES;
  roomName: string;
  /** kick: minutes until they may come back */
  minutesLeft?: number;
  totalMinutes?: number;
  onClose: () => void;
}) {
  useCloseKeys(onClose);
  const t = WARN_TONES[tone];
  const room = <b className="text-[#0F1C33]">{roomName}</b>;
  return (
    <div className="fixed inset-0 z-[85] flex items-center justify-center bg-[#0B1F3A]/40 px-6 backdrop-blur-[3px]">
      <div
        className="w-full max-w-[300px] rounded-[24px] border-[1.5px] border-white/90 px-5 pb-5 pt-6 text-center shadow-[0_20px_50px_rgba(10,30,60,.35)]"
        style={{ background: "linear-gradient(160deg,rgba(255,255,255,.96),rgba(255,255,255,.84))" }}
      >
        <div
          className="mx-auto flex h-[70px] w-[70px] items-center justify-center rounded-full border-[3px] bg-white text-[32px]"
          style={{ borderColor: t.ring, boxShadow: `0 0 22px ${t.glow}, inset 0 0 14px ${t.glow}` }}
        >
          {t.icon}
        </div>
        <p className="mt-3.5 text-[17px] font-black text-[#0F1C33]">Chat Room</p>
        <p className="mt-1.5 text-[13px] leading-[19px] text-[#6B778C]">
          {tone === "ban" ? (
            <>Unable to join chat room. You were recently banned from {room}.</>
          ) : tone === "bump" ? (
            <>You were bumped from {room}. You can come back in right away.</>
          ) : (
            <>Unable to join chat room. You were recently kicked from {room}.</>
          )}
        </p>
        {tone === "kick" && (
          <>
            <div className="mt-3.5 h-1.5 overflow-hidden rounded-full bg-[#EEF1F6]">
              <div
                className="h-full rounded-full"
                style={{ width: `${Math.max(4, Math.min(100, (minutesLeft / totalMinutes) * 100))}%`, background: "linear-gradient(90deg,#FFC23D,#FF8A00)" }}
              />
            </div>
            <p className="mt-1.5 text-[12px] font-extrabold text-[#B7791F]">
              ⏱ {minutesLeft} min left
            </p>
          </>
        )}
        {tone === "ban" && (
          <p className="mt-3 inline-flex rounded-full bg-[#FFE3E3] px-3 py-1 text-[12px] font-extrabold text-[#B3261E]">
            🛡 Ask the room admin to unban you
          </p>
        )}
        <button
          type="button"
          onClick={onClose}
          className="mt-4 h-11 w-full rounded-[12px] text-[14px] font-extrabold shadow-[0_8px_18px_rgba(10,30,60,.18)]"
          style={{ background: t.btn, color: t.btnInk }}
        >
          Ok
        </button>
      </div>
    </div>
  );
}

/** Tap-anywhere-to-close card with a gold frame (balance, round result). */
function GoldCard({ children, onClose, bg }: { children: React.ReactNode; onClose: () => void; bg: string }) {
  useCloseKeys(onClose);
  return (
    <div className="fixed inset-0 z-[85] flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="rounded-[22px] p-[1.2px]" style={{ background: GOLD_FRAME }}>
        <div className="flex w-[230px] cursor-pointer flex-col items-center gap-1 rounded-[21px] px-5 py-4 text-center text-white" style={{ background: bg }}>
          {children}
        </div>
      </div>
    </div>
  );
}

// 💰 Neon Ring balance card (miglife picked design 4): the ring fills toward the
// next coin goal; Level · XP · Next goal underneath. Tap the number: full ↔ short.
const COIN_GOALS = [10_000, 50_000, 100_000, 500_000, 1e6, 5e6, 10e6, 25e6, 50e6, 100e6, 250e6, 500e6, 1e9, 5e9, 10e9];
const shortCoins = (n: number) => new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(n);
export type BalanceInfo = { balance: number; level: number; xp: number } | "loading" | "error";

export function BalanceCard({ info, onClose }: { info: BalanceInfo; onClose: () => void }) {
  useCloseKeys(onClose);
  const [full, setFull] = useState(false);
  const [shown, setShown] = useState(0);
  const [fill, setFill] = useState(0);
  const ok = typeof info === "object";
  const bal = ok ? info.balance : 0;
  const goal = COIN_GOALS.find((g) => g > bal) ?? COIN_GOALS[COIN_GOALS.length - 1];
  const progress = ok ? Math.min(1, bal / goal) : 0;
  useEffect(() => {
    if (!ok) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setShown(bal);
      setFill(progress);
      return;
    }
    const t0 = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / 900);
      const e = 1 - Math.pow(1 - p, 3);
      setShown(bal * e);
      setFill(progress * e);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [ok, bal, progress]);
  const R = 52;
  const C = 2 * Math.PI * R;
  return (
    <div className="fixed inset-0 z-[85] flex items-center justify-center bg-black/45" onClick={onClose}>
      <div
        className="w-[224px] cursor-pointer rounded-[22px] border border-[#263257] px-3.5 pb-3 pt-3.5 text-center text-[#EAF2FF] shadow-[0_16px_44px_rgba(0,0,0,.5)]"
        style={{ background: "linear-gradient(180deg, #0E1630, #0A0F22)" }}
      >
        <div className="relative mx-auto h-[128px] w-[128px]">
          <svg viewBox="0 0 128 128" className="h-full w-full -rotate-90" aria-hidden>
            <defs>
              <linearGradient id="balRing" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#4FE3FF" />
                <stop offset="1" stopColor="#9B7BFF" />
              </linearGradient>
            </defs>
            <circle cx="64" cy="64" r={R} fill="none" stroke="#1C2850" strokeWidth="9" />
            <circle cx="64" cy="64" r={R} fill="none" stroke="url(#balRing)" strokeWidth="9" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - fill)} />
          </svg>
          <div
            className="absolute inset-0 flex flex-col items-center justify-center"
            onClick={(e) => {
              if (!ok) return;
              e.stopPropagation();
              setFull((v) => !v);
            }}
          >
            <span className="text-[8.5px] font-extrabold tracking-[2px] text-[#8FA6DA]">BALANCE</span>
            {info === "loading" ? (
              <span className="mt-1 text-xs font-bold text-[#8FA6DA]">Checking…</span>
            ) : info === "error" ? (
              <span className="mt-1 px-2 text-[11px] font-bold leading-tight text-[#FF8A8A]">Could not load your balance.</span>
            ) : (
              <>
                <span className={`font-black leading-none tabular-nums text-white ${full ? "text-[15px]" : "text-[24px]"}`}>
                  {full ? Math.round(shown).toLocaleString("en-US") : shortCoins(shown)}
                </span>
                <span className="mt-1 text-[10px] tabular-nums text-[#7EE0FF]">{full ? shortCoins(bal) : bal.toLocaleString("en-US")}</span>
              </>
            )}
          </div>
        </div>
        {ok && (
          <div className="mt-2 grid grid-cols-3 gap-1.5">
            {(
              [
                [String(info.level), "Level"],
                [shortCoins(info.xp), "XP"],
                [shortCoins(goal), "Next goal"],
              ] as const
            ).map(([v, l]) => (
              <div key={l} className="rounded-[10px] border border-[#263257] bg-[#141E3D] px-1 py-1.5">
                <b className="block text-[13px] leading-tight tabular-nums">{v}</b>
                <span className="text-[9px] font-bold text-[#8FA6DA]">{l}</span>
              </div>
            ))}
          </div>
        )}
        <span className="mt-2.5 block rounded-[12px] py-2 text-xs font-black text-[#06131F]" style={{ background: "linear-gradient(90deg, #4FE3FF, #9B7BFF)" }}>
          OK
        </span>
      </div>
    </div>
  );
}

export function RoundResultCard({ round, won, bet, onClose }: { round: number; won: number; bet: number; onClose: () => void }) {
  const didWin = won > 0;
  return (
    <GoldCard onClose={onClose} bg={didWin ? "linear-gradient(180deg, #1E7A4A, #0A3D26)" : "linear-gradient(180deg, #3B4A6B, #1B2540)"}>
      <span className="text-[30px]">{didWin ? "🎉" : "🎲"}</span>
      <p className="text-[11px] font-bold tracking-[1.4px] text-[#CFE3FF]">{didWin ? "YOU WON" : "NO WIN THIS ROUND"}</p>
      {didWin && (
        <>
          <p className="text-[26px] font-extrabold text-[#FFE29A]">+{won.toLocaleString("en-US")}</p>
          <p className="text-xs text-white/75">coins</p>
        </>
      )}
      <p className="text-[11px] text-white/70">
        Round #{round} · your bet {bet.toLocaleString("en-US")}
      </p>
    </GoldCard>
  );
}

export function PhotoConfirm({ file, onSend, onCancel }: { file: File; onSend: () => void; onCancel: () => void }) {
  const url = URL.createObjectURL(file);
  return (
    <div className="fixed inset-0 z-[85] flex items-center justify-center bg-black/45 px-6" onClick={onCancel}>
      <div className="w-full max-w-sm rounded-[20px] bg-white p-5 text-[#14213D] shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <p className="text-lg font-extrabold">🖼️ Send this photo?</p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt="" onLoad={() => URL.revokeObjectURL(url)} className="mx-auto mt-3 max-h-64 rounded-xl object-contain" />
        <p className="mt-2 text-center text-xs text-[#7A8599]">Everyone in this room will see it.</p>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-full px-4 py-2 text-sm font-bold text-[#5B6478]">
            Cancel
          </button>
          <button type="button" onClick={onSend} className="rounded-full bg-[#2F6ABD] px-6 py-2 text-sm font-bold text-white">
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
