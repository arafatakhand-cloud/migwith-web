"use client";

// 🪟 Room popups, like the app's (RoomPage.kt): a plain title + text + OK
// dialog (Lucky Voucher result, Gift Shower report, ban / kick), the compact
// gold-framed balance card, the Luxury Bot round result card and the "Send
// this photo?" confirmation.

const GOLD_FRAME = "linear-gradient(135deg, #F2C94C, #FFE29A, #F2C94C)";

export function SimpleDialog({ title, text, onClose, okLabel = "OK" }: { title: string; text: string; onClose: () => void; okLabel?: string }) {
  return (
    <div className="fixed inset-0 z-[85] flex items-center justify-center bg-black/45 px-6" onClick={onClose}>
      <div className="w-full max-w-sm rounded-[24px] bg-white p-5 text-[#14213D] shadow-2xl" onClick={(e) => e.stopPropagation()}>
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

/** Tap-anywhere-to-close card with a gold frame (balance, round result). */
function GoldCard({ children, onClose, bg }: { children: React.ReactNode; onClose: () => void; bg: string }) {
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

export function BalanceCard({ text, sub, onClose }: { text: string; sub: string; onClose: () => void }) {
  const isAmount = /^\d/.test(text);
  return (
    <GoldCard onClose={onClose} bg="linear-gradient(180deg, #1E56A8, #0A2657)">
      <span className="flex h-[42px] w-[42px] items-center justify-center rounded-full border border-[#F2C94C]/70 bg-white/[0.12] text-[22px]">💰</span>
      <p className="text-[10px] font-bold tracking-[1.6px] text-[#9FB8E6]">YOUR BALANCE</p>
      <p className={isAmount ? "text-[26px] font-extrabold text-[#FFE29A]" : "text-[13px] font-extrabold"}>{text}</p>
      {sub && <p className="text-xs font-medium text-white/75">{sub}</p>}
      <span className="mt-1.5 rounded-full bg-[#F2C94C] px-[26px] py-1.5 text-xs font-extrabold text-[#1A1200]">OK</span>
    </GoldCard>
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
