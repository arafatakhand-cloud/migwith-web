"use client";

import { useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "../../../lib/firebase";
import { useFounderPerms } from "../../../lib/founder";
import { FounderShell, card, input } from "../_Shell";

// ↩ Secret → Game Refund (2026-11-25): a MIG ID → its recent game bets. Refund one →
// the bet's coins go back, with a "Game refund" line in its Wallet. Once per bet.
// Same as the app (GameRefundTool). Server: secretGameRefund.
const gameRefund = httpsCallable<Record<string, unknown>, Record<string, unknown>>(functions, "secretGameRefund");

type Bet = { id: string; game: string; amount: number; roomName: string; roundNumber: number; at: number; refunded: boolean; won: boolean; gameRefunded: boolean };

const when = (ms: number) =>
  ms ? new Date(ms).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true }) : "";

export default function GameRefundPage() {
  const f = useFounderPerms();
  const allowed = f.isMigwith || f.can("coin_control");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [user, setUser] = useState<{ username: string; balance: number } | null>(null);
  const [bets, setBets] = useState<Bet[]>([]);
  const [pick, setPick] = useState<Bet | null>(null);
  const [reason, setReason] = useState("");
  const who = q.trim().replace(/^@/, "");

  const load = async (name = who) => {
    if (!name) return;
    setBusy(true);
    setMsg("");
    try {
      const { data } = await gameRefund({ action: "list", username: name });
      setUser(data.user as { username: string; balance: number });
      setBets((data.bets as Bet[]) || []);
    } catch (e) {
      setUser(null);
      setBets([]);
      setMsg((e as { message?: string })?.message || "Could not load.");
    } finally {
      setBusy(false);
    }
  };
  const refund = async () => {
    if (!pick || !user) return;
    const b = pick;
    setPick(null);
    setBusy(true);
    setMsg("");
    try {
      const { data } = await gameRefund({ action: "refund", username: user.username, betId: b.id, reason: reason.trim() });
      setMsg(`✅ ${Number(data.amount).toLocaleString()} coins refunded to @${user.username}.`);
      setReason("");
      setBets((l) => l.map((x) => (x.id === b.id ? { ...x, refunded: true } : x)));
      setUser({ ...user, balance: Number(data.balanceAfter) });
    } catch (e) {
      setMsg((e as { message?: string })?.message || "Could not refund.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <FounderShell title="↩ Game Refund" allowed={allowed} loaded={f.loaded}>
      <div className={`${card} space-y-3`}>
        <p className="text-xs text-[#5B6B8C]">Type a MIG ID to see its last game bets. Refund gives that bet&apos;s coins back. Each bet can be refunded only once, within 30 days.</p>
        <div className="flex gap-2">
          <input className={input} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void load()} placeholder="MIG ID" autoCapitalize="none" autoCorrect="off" />
          <button type="button" disabled={busy || !who} onClick={() => void load()} className="shrink-0 rounded-xl bg-[#2F80ED] px-4 font-bold text-white disabled:opacity-50">
            {busy && !user ? "…" : "Show"}
          </button>
        </div>
        {msg && <p className="text-sm font-semibold text-[#0B2A5B]">{msg}</p>}
      </div>

      {user && (
        <div className={`${card} space-y-2`}>
          <p className="text-sm">
            <b>@{user.username}</b> · 💰 {user.balance.toLocaleString()} coins
          </p>
          {bets.length === 0 && <p className="py-4 text-center text-sm text-[#9AA1AB]">No game bets found.</p>}
          <div className="overflow-hidden rounded-[14px] border border-[#EEF0F3]">
            {bets.map((b, i) => (
              <div key={b.id} className={`flex items-center gap-3 px-3 py-2.5 ${i > 0 ? "border-t border-[#F1F3F5]" : ""}`}>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-semibold text-[#111]">
                    {b.game} · <span className="text-[#C62828]">−{b.amount.toLocaleString()}</span>
                  </p>
                  <p className="truncate text-[11.5px] text-[#6B7280]">
                    {[b.roomName, b.roundNumber ? `Round ${b.roundNumber}` : "", when(b.at)].filter(Boolean).join(" · ")}
                  </p>
                  {(b.won || b.gameRefunded) && !b.refunded && (
                    <p className="text-[11px] font-bold text-[#B45309]">{b.won ? "⚠ Won this round" : "⚠ Game already refunded it"}</p>
                  )}
                </div>
                {b.refunded ? (
                  <span className="shrink-0 rounded-full bg-[#E8F5E9] px-3 py-1 text-[12px] font-bold text-[#2E7D32]">✓ Refunded</span>
                ) : (
                  <button type="button" disabled={busy} onClick={() => setPick(b)} className="shrink-0 rounded-full bg-[#10B981] px-3.5 py-1.5 text-[12.5px] font-bold text-white disabled:opacity-50">
                    ↩ Refund
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {pick && user && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-3" onClick={() => setPick(null)}>
          <div className="w-full max-w-sm space-y-3 rounded-3xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
            <p className="text-lg font-bold">
              Refund {pick.amount.toLocaleString()} coins?
            </p>
            <p className="text-sm">
              {pick.game} bet of @{user.username}
              {pick.roundNumber ? ` · Round ${pick.roundNumber}` : ""}
            </p>
            {(pick.won || pick.gameRefunded) && (
              <p className="rounded-xl bg-[#FFF7ED] p-2 text-[12.5px] font-semibold text-[#B45309]">
                {pick.won ? "⚠ This ID won this round. Refund only if the game went wrong." : "⚠ The game already refunded this round. Refunding again gives double."}
              </p>
            )}
            <input className={input} value={reason} onChange={(e) => setReason(e.target.value.slice(0, 120))} placeholder="Reason (optional) — e.g. Game got stuck" />
            <div className="flex justify-end gap-4">
              <button type="button" onClick={() => setPick(null)} className="font-bold text-[#2F80ED]">Cancel</button>
              <button type="button" onClick={() => void refund()} className="font-bold text-[#10B981]">Refund</button>
            </div>
          </div>
        </div>
      )}
    </FounderShell>
  );
}
