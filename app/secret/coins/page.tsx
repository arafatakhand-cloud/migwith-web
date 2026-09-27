"use client";

import { useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "../../../lib/firebase";
import { useFounderPerms } from "../../../lib/founder";
import { FounderShell, card, input } from "../_Shell";

// 💰 Coin Control (founder tool), like the app: look up a MIG ID's coins and
// last transactions, and remove coins (the server does it, "Minus" to confirm).

const coinAdmin = httpsCallable<Record<string, unknown>, Record<string, any>>(functions, "founderCoinAdmin");
const PLUS = ["win", "payout", "refund", "receive", "received", "transfer_in", "admin_add", "balance_repair", "commission"];

type Tx = { type: string; source: string; amount: number; reason: string; balanceAfter: number; at: number | null };

export default function CoinControlPage() {
  const f = useFounderPerms();
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [found, setFound] = useState<{ name: string; balance: number; level: number; recent: Tx[] } | null>(null);
  const [amountText, setAmountText] = useState("");
  const [reason, setReason] = useState("");
  const [confirm, setConfirm] = useState("");

  const lookup = async (name: string) => {
    if (!name.trim() || busy) return;
    setBusy(true);
    setStatus("");
    try {
      const { data: r } = await coinAdmin({ action: "lookup", username: name.trim() });
      setFound({
        name: String(r.username || ""),
        balance: Number(r.balance || 0),
        level: Number(r.level || 1),
        recent: (Array.isArray(r.recent) ? r.recent : []).map((m: any) => ({
          type: String(m.type || ""),
          source: String(m.source || ""),
          amount: Number(m.amount || 0),
          reason: String(m.reason || ""),
          balanceAfter: Number(m.balanceAfter || 0),
          at: typeof m.at === "number" ? m.at : null,
        })),
      });
    } catch (e: any) {
      setFound(null);
      setStatus("❌ " + (e?.message || "Not found"));
    } finally {
      setBusy(false);
    }
  };

  const amount = Number(amountText) || 0;
  const canSubmit = !!found && amount > 0 && amount <= found.balance && confirm === "Minus" && !busy;

  const submit = async () => {
    if (!found || !canSubmit) return;
    setBusy(true);
    setStatus("");
    try {
      const { data: r } = await coinAdmin({
        action: "minus",
        username: found.name,
        amount,
        reason,
        confirm,
        operationId: "m_" + crypto.randomUUID().replace(/-/g, ""),
      });
      setStatus(`✅ Removed ${amount.toLocaleString()} coins from ${found.name}. New balance: ${Number(r.after || 0).toLocaleString()}`);
      setAmountText("");
      setReason("");
      setConfirm("");
      setBusy(false);
      lookup(found.name);
    } catch (e: any) {
      setStatus("❌ " + (e?.message || "Failed"));
      setBusy(false);
    }
  };

  return (
    <FounderShell title="💰 Coin Control" allowed={f.can("coin_control")} loaded={f.loaded}>
      <div className="flex gap-2">
        <input value={search} onChange={(e) => setSearch(e.target.value.trim())} placeholder="MIG ID" className={input} />
        <button type="button" disabled={busy || !search} onClick={() => lookup(search)} className="px-3 font-bold text-[#2F80ED] disabled:opacity-40">
          Check
        </button>
      </div>
      {busy && <div className="h-1 animate-pulse rounded bg-[#2F80ED]/60" />}
      {status && <p className="text-[13px] text-gray-500">{status}</p>}

      {found && (
        <>
          <div className={card}>
            <p className="text-[15px] font-bold">
              👤 {found.name} · Level {found.level}
            </p>
            <p className="text-xs text-gray-500">Coins</p>
            <p className="text-[28px] font-extrabold text-[#1565C0]">{found.balance.toLocaleString()}</p>
            <button type="button" disabled={busy} onClick={() => lookup(found.name)} className="mt-1 text-sm font-bold text-[#2F80ED]">
              ↻ Refresh
            </button>
          </div>

          {found.recent.length > 0 && (
            <>
              <p className="font-bold">Last {found.recent.length} transactions</p>
              {found.recent.map((t, i) => {
                const plus = PLUS.includes(t.type) && t.amount > 0;
                return (
                  <div key={i} className="flex items-center gap-2 rounded-[10px] bg-[#F1F5FB] px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px]">{t.reason || `${t.type} ${t.source}`}</p>
                      <p className="text-[11px] text-gray-500">
                        {t.at ? new Date(t.at).toLocaleString(undefined, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : ""} · after:{" "}
                        {t.balanceAfter.toLocaleString()}
                      </p>
                    </div>
                    <span className={`text-[13px] font-bold ${plus ? "text-[#2E7D32]" : "text-[#D32F2F]"}`}>
                      {plus ? "+" : "−"}
                      {Math.abs(t.amount).toLocaleString()}
                    </span>
                  </div>
                );
              })}
            </>
          )}

          <div className="space-y-2 rounded-2xl bg-[#FFF1F1] p-4">
            <p className="text-[15px] font-bold text-[#B71C1C]">➖ Remove coins from {found.name}</p>
            <input
              value={amountText}
              onChange={(e) => setAmountText(e.target.value.replace(/\D/g, "").slice(0, 15))}
              inputMode="numeric"
              placeholder={`Amount (max ${found.balance.toLocaleString()})`}
              className={input}
            />
            {amount > 0 && (
              <p className={`text-xs ${amount > found.balance ? "text-[#D32F2F]" : "text-gray-500"}`}>
                New balance will be {Math.max(0, found.balance - amount).toLocaleString()}
              </p>
            )}
            <input value={reason} onChange={(e) => setReason(e.target.value.slice(0, 200))} placeholder="Reason (user sees it in Activity)" className={input} />
            <input value={confirm} onChange={(e) => setConfirm(e.target.value.trim())} placeholder="Type Minus to confirm" className={input} />
            <button type="button" disabled={!canSubmit} onClick={submit} className="w-full rounded-full bg-[#D32F2F] py-2.5 font-bold text-white disabled:opacity-40">
              Submit
            </button>
          </div>
        </>
      )}
    </FounderShell>
  );
}
