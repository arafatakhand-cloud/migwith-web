"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  where,
  type DocumentData,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../../lib/firebase";
import { useCurrentUser } from "../../lib/useCurrentUser";
import { PageShell } from "../_components/PageShell";

// My Account / wallet, same data as the app's account page: users/{uid}.balance,
// users/{uid}/coin_transactions and gift_activity. Coins only ever move through
// the Cloud Functions (verifySecurityPin → transferCoins); the web never writes
// a balance.

const ensureCoinAccount = httpsCallable(functions, "ensureCoinAccount");
const getUserByUsername = httpsCallable<{ username: string }, { uid: string; username: string }>(
  functions,
  "getUserByUsername"
);
const verifySecurityPin = httpsCallable<{ pin: string }, { valid: boolean; locked?: boolean }>(
  functions,
  "verifySecurityPin"
);
const transferCoins = httpsCallable<{ toUid: string; amount: number; operationId: string }, { success: boolean }>(
  functions,
  "transferCoins"
);

const MERCHANT_CAP = 1_500_000;
const NORMAL_CAP = 400_000;

type Item = { key: string; timeMs: number; title: string; amount: number; icon: string };

const num = (v: unknown) => (typeof v === "number" ? Math.trunc(v) : Number(String(v ?? "").trim()) || 0);
const ms = (v: any) => (v && typeof v.toMillis === "function" ? v.toMillis() : 0);
const lower = (v: unknown) => String(v ?? "").trim().toLowerCase();

function short(value: number): string {
  const a = Math.abs(value);
  if (a >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (a >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value);
}

function startOfToday(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// Luxury Bot pays each winning character separately; shown as one line per round.
function luxuryPayoutRound(t: DocumentData): number {
  const type = lower(t.type);
  const source = lower(t.source);
  const isPayout = type === "payout" || type === "bot_payout" || type === "winning_payout";
  if (!isPayout || source === "lowcard" || source === "lucky_voucher") return 0;
  return num(t.roundNumber ?? t.round);
}

// Same titles and signs as the app's ledger.
function txItem(id: string, t: DocumentData): Item | null {
  const time = ms(t.createdAt);
  if (!time) return null;
  const raw = num(t.amount);
  const type = lower(t.type);
  const source = lower(t.source);
  const round = num(t.roundNumber ?? t.round);
  const reason = String(t.reason || "");
  const character = String(t.character || "").split(" ").slice(1).join(" ").trim();
  const r = round > 0 ? ` #${round}` : "";

  let title: string;
  if (type === "bet" && source === "lowcard") title = `LowCard${r} — bid ${raw.toLocaleString()} coins`;
  else if (type === "bet")
    title = `Luxury Bot${r} — bid ${character ? character + " " : ""}${Math.abs(raw).toLocaleString()} coins`;
  else if (type === "payout" && source === "lowcard") title = "LowCard winning payout";
  else if (type === "payout" || type === "bot_payout" || type === "winning_payout") title = "Daily Luxury Bot winning payout";
  else if (type.includes("spin") || type.includes("daily_reward") || type === "reward")
    title = reason || `Daily spin reward: ${Math.abs(raw).toLocaleString()} coins`;
  else if (type.includes("commission") || type.includes("trail")) title = reason || "Trail settlement";
  else if (type === "transfer_out") title = `Transfer to ${t.toUsername || "another user"}`;
  else if (type === "transfer_in") title = `Coins received from ${t.fromUsername || "another user"}`;
  else if (type === "admin_adjustment") title = raw >= 0 ? "Coins added by admin" : "Coins deducted by admin";
  else if (type.includes("deposit") || type.includes("add_coins") || type === "credit") title = reason || "Coins added";
  else if (type.includes("withdraw") || type.includes("deduct") || type === "debit") title = reason || "Coins deducted";
  else title = reason || (type ? type.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()) : "Coin activity");

  const amount =
    (type === "bet" || type === "transfer_out") && raw > 0 ? -raw : type === "transfer_in" && raw < 0 ? -raw : raw;
  const icon =
    type === "bet"
      ? "🎉"
      : type.includes("spin") || type.includes("reward")
        ? "🎁"
        : type.includes("commission") || type.includes("trail")
          ? "▣"
          : type.startsWith("transfer")
            ? "💸"
            : amount >= 0
              ? "↙"
              : "↗";
  return { key: id, timeMs: time, title, amount, icon };
}

export default function WalletPage() {
  const router = useRouter();
  const { user, username, loading } = useCurrentUser();

  const [balance, setBalance] = useState<number | null>(null);
  const [role, setRole] = useState("");
  const [txs, setTxs] = useState<{ id: string; data: DocumentData }[]>([]);
  const [gifts, setGifts] = useState<{ id: string; data: DocumentData }[]>([]);
  const [todayTx, setTodayTx] = useState<DocumentData[]>([]);
  const [todayGifts, setTodayGifts] = useState<DocumentData[]>([]);

  const [showTransfer, setShowTransfer] = useState(false);
  const [receiver, setReceiver] = useState("");
  const [amount, setAmount] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  useEffect(() => {
    if (!user || !username) return;
    const userRef = doc(db, "users", user.uid);
    const midnight = Timestamp.fromMillis(startOfToday());
    const offs = [
      onSnapshot(userRef, (s) => {
        setBalance(num(s.get("balance")));
        setRole(lower(s.get("role")));
      }),
      onSnapshot(
        query(collection(userRef, "coin_transactions"), orderBy("createdAt", "desc"), limit(30)),
        (s) => setTxs(s.docs.map((d) => ({ id: d.id, data: d.data() }))),
        (e) => console.error("transactions", e)
      ),
      onSnapshot(
        query(collection(db, "gift_activity"), where("fromUsername", "==", username), limit(30)),
        (s) => setGifts(s.docs.map((d) => ({ id: d.id, data: d.data() }))),
        (e) => console.error("gifts", e)
      ),
      onSnapshot(
        query(collection(userRef, "coin_transactions"), where("createdAt", ">=", midnight)),
        (s) => setTodayTx(s.docs.map((d) => d.data())),
        (e) => console.error("today tx", e)
      ),
      onSnapshot(
        query(collection(db, "gift_activity"), where("fromUsername", "==", username), where("createdAt", ">=", midnight)),
        (s) => setTodayGifts(s.docs.map((d) => d.data())),
        (e) => console.error("today gifts", e)
      ),
    ];
    ensureCoinAccount({}).catch(() => {});
    return () => offs.forEach((off) => off());
  }, [user, username]);

  // Today's numbers, counted the same way as the app.
  const { earnedToday, spentToday, transferredToday } = useMemo(() => {
    let earned = 0;
    let bets = 0;
    let refunded = 0;
    let out = 0;
    for (const t of todayTx) {
      const type = lower(t.type);
      const a = Math.abs(num(t.amount));
      const income =
        !type.includes("refund") &&
        ["payout", "win", "spin", "reward", "commission", "trail"].some((k) => type.includes(k));
      if (income) earned += a;
      if (type === "bet") bets += a;
      if (type.includes("refund")) refunded += a;
      if (type === "transfer_out") out += a;
    }
    const giftSpent = todayGifts.reduce((s, g) => s + Math.max(0, num(g.cost)), 0);
    return { earnedToday: earned, spentToday: Math.max(0, bets + giftSpent - refunded), transferredToday: out };
  }, [todayTx, todayGifts]);

  const cap = role === "mentor" || username === "migwith" ? null : role === "merchant" ? MERCHANT_CAP : NORMAL_CAP;

  const items = useMemo(() => {
    const fromTx = txs
      .filter((t) => luxuryPayoutRound(t.data) === 0)
      .map((t) => txItem(t.id, t.data))
      .filter((x): x is Item => !!x);

    const rounds = new Map<string, { round: number; time: number; total: number }>();
    for (const t of txs) {
      const round = luxuryPayoutRound(t.data);
      if (!round) continue;
      const k = `${t.data.roomName || t.data.roomId || ""}|${round}`;
      const cur = rounds.get(k) || { round, time: 0, total: 0 };
      cur.time = Math.max(cur.time, ms(t.data.createdAt));
      cur.total += num(t.data.amount);
      rounds.set(k, cur);
    }
    const fromRounds: Item[] = Array.from(rounds.entries())
      .filter(([, v]) => v.time > 0)
      .map(([k, v]) => ({
        key: `lux_${k}`,
        timeMs: v.time,
        title: `Luxury Bot #${v.round} — winning payout`,
        amount: v.total,
        icon: "🏆",
      }));

    const fromGifts: Item[] = gifts
      .map((g) => ({
        key: `gift_${g.id}`,
        timeMs: ms(g.data.createdAt),
        title: `Sent ${g.data.giftName || "Gift"} to ${g.data.toUsername || "user"}`,
        amount: -Math.abs(num(g.data.cost)),
        icon: "🎁",
      }))
      .filter((g) => g.timeMs > 0);

    return [...fromTx, ...fromRounds, ...fromGifts].sort((a, b) => b.timeMs - a.timeMs).slice(0, 30);
  }, [txs, gifts]);

  const grouped = useMemo(() => {
    const out: [string, Item[]][] = [];
    for (const it of items) {
      const day = new Date(it.timeMs)
        .toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" })
        .toUpperCase();
      const last = out[out.length - 1];
      if (last && last[0] === day) last[1].push(it);
      else out.push([day, [it]]);
    }
    return out;
  }, [items]);

  const transfer = async () => {
    setError("");
    setSuccess("");
    const to = receiver.trim().replace(/^@/, "");
    const coins = Number(amount);
    if (!to) return setError("Enter the receiver's MIG ID.");
    if (to.toLowerCase() === username.toLowerCase()) return setError("You can't transfer coins to yourself.");
    if (!Number.isInteger(coins) || coins <= 0) return setError("Enter a valid amount.");
    if (balance !== null && coins > balance) return setError("Not enough coins.");
    if (cap !== null && transferredToday + coins > cap)
      return setError(`Daily transfer limit reached — you can send up to ${cap.toLocaleString()} coins per day.`);
    if (!/^\d{4,6}$/.test(pin)) return setError("Enter your 4–6 digit Security PIN.");

    setBusy(true);
    try {
      const { data: target } = await getUserByUsername({ username: to });
      const toName = target.username || to;

      // Who may send to whom (same rule as the app): a mentor → anyone;
      // a merchant → anyone except a mentor; a normal user → normal users only.
      if (role === "merchant" || role === "user" || role === "") {
        const toRole = lower((await getDoc(doc(db, "users", target.uid))).get("role"));
        if (role === "merchant" && toRole === "mentor") throw new Error("Merchants can't transfer coins to a mentor.");
        if (role !== "merchant" && toRole && toRole !== "user")
          throw new Error("You can only transfer coins to a normal user.");
      }

      const { data: pinResult } = await verifySecurityPin({ pin });
      if (!pinResult?.valid) throw new Error("Incorrect Security PIN.");

      await transferCoins({ toUid: target.uid, amount: coins, operationId: crypto.randomUUID() });

      addDoc(collection(db, "alerts"), {
        toUsername: toName,
        fromUsername: username,
        message: `${username} sent you ${coins} Coins.`,
        type: "coin_transfer",
        amount: coins,
        read: false,
        createdAt: serverTimestamp(),
      }).catch(() => {});

      setSuccess(`✅ Sent ${coins.toLocaleString()} coins to ${toName}.`);
      setReceiver("");
      setAmount("");
      setPin("");
      setShowTransfer(false);
    } catch (err: any) {
      setError(err?.message || "Transfer failed.");
    } finally {
      setBusy(false);
    }
  };

  if (loading || !user) {
    return (
      <PageShell>
        <p className="py-20 text-center text-sm text-white/40">Loading…</p>
      </PageShell>
    );
  }

  const field =
    "w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none placeholder:text-white/25 focus:border-amber-300/50";

  return (
    <PageShell>
      <section className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <h1 className="text-3xl font-black tracking-tight">💰 My Account</h1>

        {/* Balance */}
        <div className="mt-5 rounded-3xl border border-amber-300/20 bg-gradient-to-br from-amber-400/20 via-amber-500/5 to-transparent p-5">
          <p className="text-xs font-bold tracking-widest text-amber-200/70">MIGWITH BALANCE</p>
          <p className="mt-1 text-4xl font-black text-amber-300">
            🪙 {balance === null ? "…" : balance.toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-white/40">@{username}</p>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2">
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-center">
            <p className="text-lg font-black text-rose-300">{short(spentToday)}</p>
            <p className="text-[11px] text-white/45">Spent Today</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-center">
            <p className="text-lg font-black text-emerald-300">{short(earnedToday)}</p>
            <p className="text-[11px] text-white/45">Earned Today</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-center">
            <p className="text-lg font-black text-cyan-300">
              {cap === null ? "∞" : `${short(transferredToday)}/${short(cap)}`}
            </p>
            <p className="text-[11px] text-white/45">Transfer Limit</p>
          </div>
        </div>

        {/* Transfer */}
        {success && <p className="mt-4 text-sm text-emerald-300">{success}</p>}
        {!showTransfer ? (
          <button
            type="button"
            onClick={() => {
              setShowTransfer(true);
              setSuccess("");
              setError("");
            }}
            className="mt-4 w-full rounded-2xl bg-gradient-to-r from-amber-400 to-amber-600 py-3.5 font-black text-neutral-900"
          >
            💸 Transfer Coins
          </button>
        ) : (
          <div className="mt-4 space-y-3 rounded-3xl border border-white/10 bg-white/[0.04] p-4">
            <div className="flex items-center justify-between">
              <h2 className="font-black">💸 Transfer Coins</h2>
              <button type="button" onClick={() => setShowTransfer(false)} className="text-white/50 hover:text-white">
                ✕
              </button>
            </div>
            <input value={receiver} onChange={(e) => setReceiver(e.target.value)} placeholder="Receiver MIG ID" className={field} />
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))}
              inputMode="numeric"
              placeholder="Amount"
              className={field}
            />
            <input
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
              type="password"
              inputMode="numeric"
              autoComplete="off"
              placeholder="Security PIN"
              className={field}
            />
            {error && <p className="text-sm text-red-300">{error}</p>}
            <button
              type="button"
              onClick={transfer}
              disabled={busy}
              className="w-full rounded-2xl bg-amber-500 py-3 font-black text-neutral-900 disabled:opacity-50"
            >
              {busy ? "Sending…" : `Send${Number(amount) > 0 ? ` ${Number(amount).toLocaleString()} coins` : ""}`}
            </button>
            <p className="text-center text-xs text-white/35">
              Forgot your PIN or want to change it?{" "}
              <Link href="/security" className="font-semibold text-cyan-300 hover:underline">
                🔐 Security PIN
              </Link>
            </p>
          </div>
        )}

        {/* History */}
        <h2 className="mt-7 text-sm font-bold tracking-widest text-white/60">RECENT ACTIVITY</h2>
        {grouped.length === 0 ? (
          <p className="py-10 text-center text-sm text-white/35">No coin activity yet.</p>
        ) : (
          grouped.map(([day, list]) => (
            <div key={day} className="mt-3">
              <p className="mb-1.5 text-[11px] font-bold tracking-widest text-white/35">{day}</p>
              <ul className="divide-y divide-white/5 rounded-2xl border border-white/10 bg-white/[0.03]">
                {list.map((it) => (
                  <li key={it.key} className="flex items-center gap-3 px-3 py-2.5">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/5">{it.icon}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-white/85">{it.title}</p>
                      <p className="text-[11px] text-white/35">
                        {new Date(it.timeMs).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                      </p>
                    </div>
                    <span className={`shrink-0 font-black ${it.amount >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                      {it.amount >= 0 ? "+" : ""}
                      {it.amount.toLocaleString()}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}

        <p className="mt-6 text-center text-xs text-white/30">
          <Link href="/profile/me" className="hover:text-white/60">
            ← Back to profile
          </Link>
        </p>
      </section>
    </PageShell>
  );
}
