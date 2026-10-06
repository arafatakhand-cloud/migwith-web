"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
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
import { PageTitle } from "../_components/LightCards";
import { latestGifts } from "../../lib/giftActivity";
import { isMainFounderName } from "../../lib/founder";
import { BackPill } from "../_components/BackButton";

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
const adminAdjustCoins = httpsCallable<{ targetUid: string; delta: number; reason: string; operationId: string }, unknown>(
  functions,
  "adminAdjustCoins"
);
const sendTagRequest = httpsCallable<{ toUsername: string; amount: number }, { ok?: boolean }>(functions, "sendTagRequest");
const getPinStatus = httpsCallable<Record<string, never>, { hasPin?: boolean; isDefault?: boolean }>(functions, "getPinStatus");
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
  // 🔐 PIN status (checked when the wallet opens, so Transfer reacts at once):
  // null = not known; true = no own PIN yet (or still the sign-up PIN 123456).
  const [pinNeedsSetup, setPinNeedsSetup] = useState<boolean | null>(null);
  const [showPinPrompt, setShowPinPrompt] = useState(false);
  const [receiver, setReceiver] = useState("");
  const [amount, setAmount] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [showAdjust, setShowAdjust] = useState(false);
  const isFounderName = isMainFounderName(username);
  // Mentor / merchant: tag the receiver too (5,000+ coins), like the app.
  const [tagAvailable, setTagAvailable] = useState<boolean | null>(null);
  const [tagChecked, setTagChecked] = useState(true);
  const amountIsTagPrice = (role === "mentor" || role === "merchant") && Number(amount) >= 5000;
  const wantsTag = amountIsTagPrice && tagChecked && tagAvailable === true;

  // "Send Credit" from a private chat opens the transfer with that person filled in.
  useEffect(() => {
    const to = new URLSearchParams(window.location.search).get("to");
    if (to) {
      setReceiver(to);
      setShowTransfer(true);
    }
  }, []);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  useEffect(() => {
    if (!user) return;
    getPinStatus({})
      .then(({ data }) => setPinNeedsSetup(data?.hasPin !== true || data?.isDefault === true))
      .catch(() => setPinNeedsSetup(false)); // can't tell → don't block; the PIN box still guards the transfer
  }, [user]);

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

  // My newest 30 sent gifts, read again whenever today's gift list changes.
  useEffect(() => {
    if (!username) return;
    latestGifts("fromUsername", username, 30)
      .then((docs) => setGifts(docs.map((d) => ({ id: d.id, data: d.data() }))))
      .catch((e) => console.error("gifts", e));
  }, [username, todayGifts.length]);

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

  const cap = role === "mentor" || isMainFounderName(username) ? null : role === "merchant" ? MERCHANT_CAP : NORMAL_CAP;

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

  useEffect(() => {
    const to = receiver.trim().replace(/^@/, "");
    if (!showTransfer || !(role === "mentor" || role === "merchant") || !to || !username) return setTagAvailable(null);
    const merchant = role === "merchant";
    let live = true;
    getDocs(
      query(
        collection(db, merchant ? "merchant_tagged" : "mentor_tagged"),
        where(merchant ? "merchantUsername" : "mentorUsername", "==", username),
        where("taggedUsername", "==", to),
        where("status", "==", "active"),
        limit(1)
      )
    )
      .then((snap) => live && setTagAvailable(snap.empty))
      .catch(() => live && setTagAvailable(null));
    return () => {
      live = false;
    };
  }, [showTransfer, role, receiver, username]);

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

      // The server writes the receiver's "sent you N Coins" alert.

      // A mentor / merchant sending 5,000+ can also ask to tag the person
      // (they get an alert to accept), like the app.
      // 🏷️ The server checks everything and writes the request + the
      // receiver's alert (+ push) — so it can't fail silently (sendTagRequest).
      let tagNote = "";
      if (wantsTag) {
        try {
          await sendTagRequest({ toUsername: toName, amount: coins });
          tagNote = ` · 🏷️ Tag request sent to @${toName}`;
        } catch (e: any) {
          tagNote = ` — but no tag request: ${e?.message || "try again"}`;
        }
      }

      setSuccess(`✅ Sent ${coins.toLocaleString()} coins to ${toName}.${tagNote}`);
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
      <PageShell light>
        <p className="py-20 text-center text-sm text-[#5B6B8C]">Loading…</p>
      </PageShell>
    );
  }

  const field =
    "w-full rounded-xl border border-[#D5E3F5] bg-white px-4 py-3 text-sm text-[#0B2A5B] outline-none placeholder:text-[#8A9BBC] focus:border-[#2F80ED]";

  return (
    <PageShell light>
      <section className="mx-auto max-w-2xl px-3 pb-8 sm:px-6">
        <div className="relative">
          <PageTitle title="My Account" subtitle="Coins · Transfers" icon="💳" />
          {/* ⋮ like the app: Refresh balance, and Add / Adjust Coins for migwith */}
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Account menu"
            className="absolute right-0 top-1/2 -translate-y-1/2 rounded-full px-3 text-[26px] font-bold text-[#0A1E63]"
          >
            ⋮
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-full z-40 w-52 overflow-hidden rounded-xl bg-white py-1 text-sm text-[#0B2A5B] shadow-xl">
                {isFounderName && (
                  <button type="button" onClick={() => (setMenuOpen(false), setShowAdjust(true))} className="block w-full px-4 py-2.5 text-left hover:bg-[#F4F9FF]">
                    Add / Adjust Coins
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    ensureCoinAccount({}).catch(() => {});
                  }}
                  className="block w-full px-4 py-2.5 text-left hover:bg-[#F4F9FF]"
                >
                  Refresh balance
                </button>
              </div>
            </>
          )}
        </div>
        {showAdjust && <AdjustDialog onClose={() => setShowAdjust(false)} onDone={(m) => (setShowAdjust(false), setSuccess(m))} />}

        {/* Balance */}
        <div className="rounded-3xl border-2 border-[#D4AF37] bg-gradient-to-br from-[#2F6FD6] to-[#174EA6] p-5 text-white shadow-lg">
          <p className="text-xs font-bold tracking-widest text-yellow-200">MIGLIFE BALANCE</p>
          <p className="mt-1 text-4xl font-black text-white">
            🪙 {balance === null ? "…" : balance.toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-white/75">@{username}</p>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2">
          <div className="rounded-2xl bg-white p-3 text-center shadow-sm">
            <p className="text-lg font-black text-rose-500">{short(spentToday)}</p>
            <p className="text-[11px] text-[#5B6B8C]">Spent Today</p>
          </div>
          <div className="rounded-2xl bg-white p-3 text-center shadow-sm">
            <p className="text-lg font-black text-emerald-600">{short(earnedToday)}</p>
            <p className="text-[11px] text-[#5B6B8C]">Earned Today</p>
          </div>
          <div className="rounded-2xl bg-white p-3 text-center shadow-sm">
            <p className="text-lg font-black text-[#2F80ED]">
              {cap === null ? "∞" : `${short(transferredToday)}/${short(cap)}`}
            </p>
            <p className="text-[11px] text-[#5B6B8C]">Transfer Limit</p>
          </div>
        </div>

        {showPinPrompt && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" onClick={() => setShowPinPrompt(false)}>
            <div className="w-full max-w-sm rounded-2xl bg-white p-5 text-[#0B2A5B]" onClick={(e) => e.stopPropagation()}>
              <p className="text-lg font-black">🔐 Security PIN needed</p>
              <p className="mt-2 text-sm">You haven&apos;t set your own Security PIN yet. Set it up first to transfer coins safely.</p>
              <div className="mt-4 flex justify-end gap-2">
                <button type="button" onClick={() => setShowPinPrompt(false)} className="rounded-lg px-3 py-2 text-sm font-bold text-[#5B6B8C]">
                  Later
                </button>
                <Link href="/security" className="rounded-lg bg-[#2F80ED] px-4 py-2 text-sm font-black text-white">
                  Set PIN
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* Transfer */}
        {success && <p className="mt-4 text-sm font-semibold text-emerald-600">{success}</p>}
        {!showTransfer ? (
          <button
            type="button"
            onClick={() => {
              if (pinNeedsSetup) return setShowPinPrompt(true);
              setShowTransfer(true);
              setSuccess("");
              setError("");
            }}
            className="mt-4 w-full rounded-2xl bg-[#0B2A5B] py-3.5 font-black text-white shadow"
          >
            💸 Transfer Coins
          </button>
        ) : (
          <div className="mt-4 space-y-3 rounded-3xl bg-white p-4 text-[#0B2A5B] shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="font-black">💸 Transfer Coins</h2>
              <button type="button" onClick={() => setShowTransfer(false)} className="text-[#5B6B8C] hover:text-[#0B2A5B]">
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
            {amountIsTagPrice && tagAvailable === true && (
              <label className="flex items-center gap-3 rounded-xl bg-[#16325C] px-3 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-bold text-[#55DFA9]">
                    ✓ Available — tag this user as your {role === "merchant" ? "merchant" : "mentor"}
                  </span>
                  <span className="block text-[11px] text-[#8FA0C9]">Send tag request — they get a notification to accept</span>
                </span>
                <input type="checkbox" checked={tagChecked} onChange={(e) => setTagChecked(e.target.checked)} className="h-5 w-5 accent-[#55DFA9]" />
              </label>
            )}
            {amountIsTagPrice && tagAvailable === false && (
              <p className="text-[11px] text-[#8FA0C9]">User already tagged. Please try again later.</p>
            )}
            {error && <p className="text-sm text-rose-600">{error}</p>}
            <button
              type="button"
              onClick={transfer}
              disabled={busy}
              className="w-full rounded-2xl bg-[#2F80ED] py-3 font-black text-white disabled:opacity-50"
            >
              {busy ? "Sending…" : `Send${Number(amount) > 0 ? ` ${Number(amount).toLocaleString()} coins` : ""}`}
            </button>
            <p className="text-center text-xs text-[#6B7A99]">
              Forgot your PIN or want to change it?{" "}
              <Link href="/security" className="font-semibold text-[#2F80ED] hover:underline">
                🔐 Security PIN
              </Link>
            </p>
          </div>
        )}

        {/* History */}
        <h2 className="mt-7 border-l-4 border-[#2F80ED] pl-2 text-sm font-bold tracking-widest text-[#35507E]">RECENT ACTIVITY</h2>
        {grouped.length === 0 ? (
          <p className="py-10 text-center text-sm text-[#6B7A99]">No coin activity yet.</p>
        ) : (
          grouped.map(([day, list]) => (
            <div key={day} className="mt-3">
              <p className="mb-1.5 text-[11px] font-bold tracking-widest text-[#35507E]">{day}</p>
              <ul className="divide-y divide-[#E3ECF7] rounded-2xl bg-white shadow-sm">
                {list.map((it) => (
                  <li key={it.key} className="flex items-center gap-3 px-3 py-2.5">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#EAF2FC]">{it.icon}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-[#0B2A5B]">{it.title}</p>
                      <p className="text-[11px] text-[#6B7A99]">
                        {new Date(it.timeMs).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                      </p>
                    </div>
                    <span className={`shrink-0 font-black ${it.amount >= 0 ? "text-emerald-600" : "text-rose-500"}`}>
                      {it.amount >= 0 ? "+" : ""}
                      {it.amount.toLocaleString()}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}

        <p className="mt-6 text-center">
          <BackPill href="/profile/me" label="Back to profile" />
        </p>
      </section>
    </PageShell>
  );
}

// Admin Coin Adjustment (the server allows only the founder), like the app.
function AdjustDialog({ onClose, onDone }: { onClose: () => void; onDone: (message: string) => void }) {
  const [target, setTarget] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const apply = async () => {
    const delta = Number(amount);
    if (!target.trim() || !Number.isInteger(delta) || delta === 0) return;
    setBusy(true);
    setError("");
    try {
      const { data } = await getUserByUsername({ username: target.trim() });
      if (!data?.uid) throw new Error("User not found");
      await adminAdjustCoins({
        targetUid: data.uid,
        delta,
        reason: reason.trim() || "Admin adjustment",
        operationId: crypto.randomUUID(),
      });
      onDone("🪙 Balance updated");
    } catch (e: any) {
      setError(`🪙 ${e?.message || "Permission denied"}`);
      setBusy(false);
    }
  };
  const field = "w-full rounded-xl border border-[#D5E3F5] bg-[#F4F9FF] px-4 py-3 text-base text-[#0B2A5B] outline-none focus:border-[#2F80ED]";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => !busy && onClose()}>
      <div className="w-full max-w-md space-y-3 rounded-3xl bg-white p-5 text-[#0B2A5B]" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-black">Admin Coin Adjustment</h2>
        <p className="text-xs text-gray-500">Admin/Staff only. Positive = add, negative = deduct.</p>
        <input value={target} onChange={(e) => setTarget(e.target.value)} placeholder="Target username" className={field} />
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^\d-]/g, ""))}
          placeholder="Amount (+/-)"
          inputMode="numeric"
          className={field}
        />
        <input value={reason} onChange={(e) => setReason(e.target.value.slice(0, 120))} placeholder="Reason" className={field} />
        {error && <p className="text-sm text-rose-600">{error}</p>}
        <div className="flex justify-end gap-2 text-sm font-bold">
          <button type="button" disabled={busy} onClick={onClose} className="px-3 py-2 text-[#2F80ED]">
            CANCEL
          </button>
          <button type="button" disabled={busy} onClick={apply} className="rounded-full bg-[#2F80ED] px-5 py-2 text-white">
            {busy ? "Saving..." : "APPLY"}
          </button>
        </div>
      </div>
    </div>
  );
}
