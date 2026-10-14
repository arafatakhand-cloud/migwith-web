"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
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
import { transferCapFor, useTransferLimits } from "../../lib/transferLimits";
import { useCurrentUser } from "../../lib/useCurrentUser";
import { PageShell } from "../_components/PageShell";
import { latestGifts } from "../../lib/giftActivity";
import { isMainFounderName, useFounderPerms } from "../../lib/founder";
import { useIsClassic } from "../../lib/uiStyle";

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


type Item = { key: string; timeMs: number; title: string; amount: number; icon: string; gift?: boolean };

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

// 🎁 A Gift Shower is ONE line with its total: the server writes all of a
// shower's gifts in one transaction, so they share the exact same time (and
// gift). Single gifts each have their own time.
function giftItems(gifts: { id: string; data: DocumentData }[]): Item[] {
  const showers = new Map<string, { id: string; time: number; gift: string; total: number; names: string[] }>();
  for (const g of gifts) {
    const time = ms(g.data.createdAt);
    if (time <= 0) continue;
    const gift = String(g.data.giftName || "Gift");
    const k = `${time}|${gift.toLowerCase()}`;
    const cur = showers.get(k) || { id: g.id, time, gift, total: 0, names: [] as string[] };
    cur.total += Math.abs(num(g.data.cost));
    cur.names.push(String(g.data.toUsername || "user"));
    showers.set(k, cur);
  }
  return Array.from(showers.values()).map((v) => ({
    key: `gift_${v.id}`,
    timeMs: v.time,
    title: v.names.length > 1 ? `Gift Shower ${v.gift} to ${v.names.length} people` : `Sent ${v.gift} to ${v.names[0]}`,
    amount: -v.total,
    icon: "🎁",
    gift: true,
  }));
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
const SPENT_STORED_POSITIVE = ["bet", "transfer_out", "park", "vip_subscription", "admin_deduct"];

function txItem(id: string, t: DocumentData): Item | null {
  const time = ms(t.createdAt);
  if (!time) return null;
  const raw = num(t.amount);
  const type = lower(t.type);
  const source = lower(t.source);
  const round = num(t.roundNumber ?? t.round);
  const reason = String(t.reason || "");
  const charRaw = String(t.character || "");
  const character = (charRaw.includes(" ") ? charRaw.slice(charRaw.indexOf(" ") + 1) : charRaw).trim();
  const r = round > 0 ? ` #${round}` : "";

  let title: string;
  if (type === "bet" && source === "lowcard") title = `LowCard${r} — bid ${short(Math.abs(raw))} coins`;
  else if (type === "bet")
    title = `Luxury Bot${r} — bid ${character ? character + " " : ""}${short(Math.abs(raw))} coins`;
  else if (type === "payout" && source === "lowcard") title = "LowCard winning payout";
  else if (type === "payout" || type === "bot_payout" || type === "winning_payout") title = "Daily Luxury Bot winning payout";
  else if (type.includes("spin") || type.includes("daily_reward") || type === "reward")
    title = reason || `Daily spin reward: ${short(Math.abs(raw))} coins`;
  else if (type.includes("commission") || type.includes("trail")) title = reason || "Team bonus";
  else if (type === "transfer_out") title = `Transfer to ${t.toUsername || "another user"}`;
  else if (type === "transfer_in") title = `Coins received from ${t.fromUsername || "another user"}`;
  else if (type === "admin_adjustment") title = raw >= 0 ? "Coins added by admin" : "Coins deducted by admin";
  else if (type.includes("deposit") || type.includes("add_coins") || type === "credit") title = reason || "Coins added";
  else if (type.includes("withdraw") || type.includes("deduct") || type === "debit") title = reason || "Coins deducted";
  else title = reason || (type ? type.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()) : "Coin activity");

  const amount =
    // money going OUT that the server stores as a positive number: shown as minus
    // (🅿️ /park, 👑 VIP, coins taken by an admin, bets, transfers out)
    SPENT_STORED_POSITIVE.includes(type) && raw > 0 ? -raw : type === "transfer_in" && raw < 0 ? -raw : raw;
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
  const founderPerms = useFounderPerms();
  // ⚙ Admin coin adjustment: miGlife, or a founder with the Coin Control permission
  const isFounderName = isMainFounderName(username) || founderPerms.can("coin_control");
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

  // My newest sent gifts, read again whenever today's gift list changes. More
  // than 30: one Gift Shower alone is up to 40 docs, shown as ONE line.
  useEffect(() => {
    if (!username) return;
    latestGifts("fromUsername", username, 150)
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

  // 🎚 daily cap from miGlife secret → Transfer Limits (null = unlimited), the same rule as the server
  const limits = useTransferLimits(!!user);
  const cap = transferCapFor(limits, isMainFounderName(username) || ["superadmin", "ceo", "owner", "founder"].includes(role), role);

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

    // 🎁 Gifts ALWAYS show: lots of bets used to push them out of the 30
    // newest lines. Every gift since the oldest loaded coin line (and all of
    // today's) is listed among them by time.
    const oldestTx = txs.length >= 30 ? Math.min(...txs.map((t) => ms(t.data.createdAt)).filter((t) => t > 0)) : 0;
    const today0 = startOfToday();
    const fromGifts = giftItems(gifts).filter((g) => g.timeMs >= oldestTx || g.timeMs >= today0);

    return [...fromTx, ...fromRounds, ...fromGifts].sort((a, b) => b.timeMs - a.timeMs);
  }, [txs, gifts]);

  // 🔻 Spent Today → what the coins went on today: gifts and bets (refunds back).
  const [showSpent, setShowSpent] = useState(false);
  const spentItems = useMemo(() => {
    const bets = todayTx
      .map((t, i) => ({ t, i }))
      .filter(({ t }) => lower(t.type) === "bet" || lower(t.type).includes("refund"))
      .map(({ t, i }) => txItem(`today_${i}`, t))
      .filter((x): x is Item => !!x);
    const giftsToday = giftItems(todayGifts.map((data, i) => ({ id: `today_${i}`, data })));
    return [...giftsToday, ...bets].sort((a, b) => b.timeMs - a.timeMs);
  }, [todayTx, todayGifts]);
  const spentOnGifts = todayGifts.reduce((s, g) => s + Math.max(0, num(g.cost)), 0);

  const grouped = useMemo(() => {
    const out: [string, Item[]][] = [];
    for (const it of items) {
      const day = dayLabel(it.timeMs);
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
  const remaining = cap === null ? null : Math.max(0, cap - transferredToday);

  return (
    <PageShell light noTopBar>
      {/* The app's sub-page bar: ← Wallet */}
      <header className="sticky top-0 z-30 flex h-14 items-center bg-[#0B1A3A] px-2 text-white shadow">
        <button
          type="button"
          aria-label="Back"
          onClick={() => (window.history.length > 1 ? router.back() : router.push("/profile/me"))}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M11 5l-7 7 7 7" />
          </svg>
        </button>
        <h1 className="flex-1 pr-10 text-center text-lg font-bold">Wallet</h1>
      </header>

      <div className="min-h-[calc(100dvh-56px)]" style={{ background: "linear-gradient(180deg, #CDEBFB, #A9DAF5 55%, #86C8EE)" }}>
        <section className="mx-auto max-w-2xl px-3 pb-6 sm:px-6">
          <div className="pb-2 pt-2.5">
            <BalanceHeroCard
              balance={balance}
              menu={
                <div className="relative">
                  {/* ⋮ like the app: Refresh balance, and Add / Adjust Coins for the founder */}
                  <button
                    type="button"
                    onClick={() => setMenuOpen((v) => !v)}
                    aria-label="Account menu"
                    className="rounded-full px-3 text-[26px] font-bold leading-none text-[#0A1E63]"
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
              }
            >
              <div className="grid grid-cols-3 gap-1.5">
                <button type="button" onClick={() => setShowSpent(true)} className="text-left active:scale-[.98]" aria-label="What I spent today">
                  <StatMiniCard tint="#E5202E" top="#FFF1F3" bottom="#FFDCE2" icon="down" label="Spent Today" value={short(spentToday)} />
                </button>
                <StatMiniCard tint="#14A044" top="#F0FBF4" bottom="#D5F5E1" icon="up" label="Earned Today" value={short(earnedToday)} />
                <StatMiniCard
                  tint="#4A1FD6"
                  top="#F5F2FF"
                  bottom="#E5DDFD"
                  icon="swap"
                  label="Transfer Limit"
                  value={cap === null ? "No limit" : short(cap)}
                  sub={remaining === null ? undefined : `(Remaining : ${short(remaining)})`}
                />
              </div>
            </BalanceHeroCard>
          </div>
          {showAdjust && <AdjustDialog onClose={() => setShowAdjust(false)} onDone={(m) => (setShowAdjust(false), setSuccess(m))} />}

          <button
            type="button"
            onClick={() => {
              if (pinNeedsSetup) return setShowPinPrompt(true);
              setShowTransfer(true);
              setSuccess("");
              setError("");
            }}
            className="h-[46px] w-full rounded-[15px] bg-[#70B6FF] text-sm font-bold text-white shadow-sm active:scale-[.99]"
          >
            ➤&nbsp;&nbsp;Transfer Coins
          </button>
          {success && <p className="mt-2 text-sm font-semibold text-emerald-700">{success}</p>}

          <div className="mt-2 flex items-center gap-[7px]">
            <h2 className="text-[17px] font-bold text-[#0E1B3D]">Activity</h2>
            <span className="rounded-full bg-[#65DDF1] px-2 py-[3px] text-[10px] font-bold leading-none text-[#16315F]">{items.length}</span>
          </div>
          <div className="h-[7px]" />

          {grouped.length === 0 ? (
            <p className="p-2.5 text-[13px] text-[#35507E]">No activity yet.</p>
          ) : (
            grouped.map(([day, list]) => (
              <div key={day}>
                <p className="pb-0.5 pl-[3px] pt-1 text-[10px] font-bold tracking-[1.1px] text-[#35507E]">{day}</p>
                {list.map((it) => (
                  <ActivityCard key={it.key} item={it} />
                ))}
              </div>
            ))
          )}
        </section>
      </div>

      {showSpent && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/35 p-4" onClick={() => setShowSpent(false)}>
          <div onClick={(e) => e.stopPropagation()} className="flex max-h-[80vh] w-full max-w-[420px] flex-col overflow-hidden rounded-3xl bg-[#EEF5FD] shadow-2xl">
            <div className="flex items-center gap-2 bg-white px-4 py-3">
              <span className="flex-1">
                <span className="block text-[15px] font-extrabold text-[#0E1B3D]">Spent Today</span>
                <span className="block text-[11px] text-[#5B6B8C]">
                  {short(spentToday)} coins · 🎁 gifts {short(spentOnGifts)} · 🎮 bets {short(Math.max(0, spentToday - spentOnGifts))}
                </span>
              </span>
              <button type="button" onClick={() => setShowSpent(false)} aria-label="Close" className="flex h-8 w-8 items-center justify-center rounded-full bg-[#F1F4F9] text-[#5B6B8C]">
                ✕
              </button>
            </div>
            <div className="overflow-y-auto p-2.5">
              {spentItems.length === 0 ? (
                <p className="p-3 text-center text-[13px] text-[#35507E]">Nothing spent today.</p>
              ) : (
                spentItems.map((it) => <ActivityCard key={it.key} item={it} />)
              )}
            </div>
          </div>
        </div>
      )}

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

      {/* Transfer Coins dialog, like the app */}
      {showTransfer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" onClick={() => !busy && setShowTransfer(false)}>
          <div className="w-full max-w-md space-y-3 rounded-3xl bg-white p-5 text-[#0B2A5B] shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-black">Transfer Coins</h2>
              <button type="button" onClick={() => !busy && setShowTransfer(false)} className="px-1 text-[#5B6B8C] hover:text-[#0B2A5B]">
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
                    ✓ Available — tag this user to you ({role === "merchant" ? "Merchant" : "Mentor"} tag)
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
        </div>
      )}
    </PageShell>
  );
}

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

/** "06 OCT 2026", like the app's activity date headers. */
function dayLabel(timeMs: number): string {
  const d = new Date(timeMs);
  return `${String(d.getDate()).padStart(2, "0")} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** "18:46" */
function timeLabel(timeMs: number): string {
  const d = new Date(timeMs);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// ---------- the app's AccountBalanceHeader ----------

// Rough world map; '#' = dot. Drawn on the right side of the hero card.
const WORLD_MASK = [
  "         ####  ######        ##                  ",
  "   ###########  ####        #   ##  ########     ",
  " ##############  ##      ########################",
  "   #############        ##########################",
  "    ###########         ######################## ",
  "     #########          # ####################   ",
  "      #######          ######################    ",
  "       ####           ##########  ###########    ",
  "        ###           ###########  ######  #     ",
  "          ##          ##########    ###    #     ",
  "           ####        ########      ##   ##     ",
  "           ######        #####        #  ##      ",
  "            ######       #####            ###    ",
  "             #####       ####            ######  ",
  "             ####         ###            ####### ",
  "             ###          ##               ###   ",
  "             ##                                  ",
  "             #                                   ",
];
const WORLD_COLS = Math.max(...WORLD_MASK.map((l) => l.length));
const WORLD_DOTS: { x: number; y: number; o: number }[] = WORLD_MASK.flatMap((line, y) =>
  Array.from(line).flatMap((ch, x) =>
    // fade in from the left so it doesn't crowd the balance text
    ch === "#" ? [{ x, y, o: Math.min(1, Math.max(0.35, (x / WORLD_COLS) * 2.2)) }] : []
  )
);

function BalanceHeroCard({ balance, menu, children }: { balance: number | null; menu: ReactNode; children: ReactNode }) {
  const amount = balance === null ? "…" : short(balance);
  // 📟 Classic: square white box, grey frame, no map / wave art.
  const classic = useIsClassic();
  return (
    <div
      className={`relative w-full overflow-hidden ${classic ? "rounded border border-[#C9D2DE]" : "rounded-[22px] border-[1.5px] border-white/90"}`}
      style={
        classic
          ? { background: "linear-gradient(180deg, #FFFFFF, #F1F3F6)", boxShadow: "0 1px 2px rgba(90,160,240,.35)" }
          : { background: "linear-gradient(135deg, #EFF6FF, #D6E8FC 50%, #C4DDFA)", boxShadow: "0 4px 14px rgba(90,160,240,.45)" }
      }
    >
      {/* background art: dotted world map + waves (Modern only) */}
      {!classic && (
      <>
      <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
        <defs>
          <linearGradient id="hero-band" gradientUnits="userSpaceOnUse" x1="30" y1="66" x2="100" y2="39.6">
            <stop offset="0" stopColor="#9CCBFA" stopOpacity="0.7" />
            <stop offset="1" stopColor="#2E7FEC" />
          </linearGradient>
        </defs>
        <path d="M0,52.8 C28,44.9 52,67.3 100,52.8 L100,100 L0,100 Z" fill="#9FCBF8" fillOpacity="0.45" />
        <path d="M30,66 C62,64 86,55.4 100,38.3 L100,100 L30,100 Z" fill="url(#hero-band)" />
        <path d="M30,66 C62,64 86,55.4 100,38.3" fill="none" stroke="#fff" strokeOpacity="0.7" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      </svg>
      <svg
        className="pointer-events-none absolute"
        style={{ left: "42%", width: "55%", top: "10%", height: "45%" }}
        viewBox={`0 0 ${WORLD_COLS} ${WORLD_MASK.length}`}
        preserveAspectRatio="xMidYMin meet"
        aria-hidden
      >
        {WORLD_DOTS.map((d) => (
          <circle key={`${d.x}_${d.y}`} cx={d.x + 0.5} cy={d.y + 0.5} r={0.32} fill="#3F8EEA" fillOpacity={0.42 * d.o} />
        ))}
      </svg>
      </>
      )}

      <div className="relative px-2.5 pb-2.5 pt-3">
        <div className="pl-2">
          <div className="flex items-center">
            <CoinLogo size={30} />
            <span className="ml-2 flex-1 text-[28px] font-black leading-tight tracking-[-0.5px]">
              <span className="text-[#0A1E63]">miG</span>
              <span className="text-[#1565E8]">life</span>
            </span>
            {menu}
          </div>
          <p className="mt-2.5 text-[15px] font-semibold text-[#0A1E63]">miGlife Balance</p>
          <p className={`whitespace-nowrap font-extrabold leading-tight tracking-[-0.5px] text-[#0A1E63] ${amount.length > 7 ? "text-[30px]" : "text-[36px]"}`}>
            {amount}
          </p>
          <p className="text-sm font-medium text-[#6B7A90]">Coins</p>
        </div>
        <div className="h-2.5" />
        {children}
      </div>
    </div>
  );
}

// Gold coin with an "M" in the middle.
function CoinLogo({ size }: { size: number }) {
  return (
    <span className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
      <svg className="absolute inset-0" width={size} height={size} viewBox="0 0 100 100" aria-hidden>
        <defs>
          <linearGradient id="coin-rim" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#FFE08A" />
            <stop offset="0.5" stopColor="#D99A12" />
            <stop offset="1" stopColor="#B57606" />
          </linearGradient>
          <radialGradient id="coin-face" cx="35" cy="32.5" r="60" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#FFE9A6" />
            <stop offset="0.5" stopColor="#F5C02E" />
            <stop offset="1" stopColor="#E0A11A" />
          </radialGradient>
        </defs>
        <circle cx="50" cy="50" r="50" fill="url(#coin-rim)" />
        <circle cx="50" cy="50" r="40" fill="url(#coin-face)" />
        <circle cx="50" cy="50" r="33" fill="none" stroke="#C98A0C" strokeWidth="3.5" />
        {/* shine: arc from 200° to 270° */}
        <path d="M8.65,34.95 A44,44 0 0 1 50,6" fill="none" stroke="#fff" strokeOpacity="0.55" strokeWidth="5" strokeLinecap="round" />
      </svg>
      <span className="relative text-[13px] font-black leading-none text-[#9A5F00]" style={{ fontSize: size * 0.43 }}>
        M
      </span>
    </span>
  );
}

function MiniIcon({ kind, color }: { kind: "down" | "up" | "swap"; color: string }) {
  return (
    <svg width="15" height="15" viewBox="0 0 100 100" aria-hidden>
      {kind === "down" && <path d="M36,8 L64,8 L64,50 L90,50 L50,94 L10,50 L36,50 Z" fill={color} />}
      {kind === "up" && <path d="M36,92 L64,92 L64,50 L90,50 L50,6 L10,50 L36,50 Z" fill={color} />}
      {kind === "swap" && (
        <g fill="none" stroke={color} strokeWidth="13" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12,32 L84,32 M62,12 L86,32 L62,52" />
          <path d="M88,70 L16,70 M38,50 L14,70 L38,90" />
        </g>
      )}
    </svg>
  );
}

function StatMiniCard({
  tint,
  top,
  bottom,
  icon,
  label,
  value,
  sub,
}: {
  tint: string;
  top: string;
  bottom: string;
  icon: "down" | "up" | "swap";
  label: string;
  value: string;
  sub?: string;
}) {
  // 📟 Classic: square white tile with a coloured frame, no wave.
  const classic = useIsClassic();
  return (
    <div
      className={`relative overflow-hidden ${classic ? "rounded" : "rounded-xl border-[1.5px] border-white/95"}`}
      style={
        classic
          ? { background: "#FFFFFF", border: `1px solid color-mix(in srgb, ${tint} 45%, transparent)` }
          : { background: `color-mix(in srgb, ${top} 92%, transparent)`, boxShadow: `0 1px 4px color-mix(in srgb, ${tint} 30%, transparent)` }
      }
    >
      {/* lower wave in the card's tint (Modern only) */}
      {!classic && (
      <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
        <defs>
          <linearGradient id={`mini-${icon}`} x1="0" y1="0.5" x2="0" y2="1">
            <stop offset="0" stopColor={bottom} stopOpacity="0.6" />
            <stop offset="1" stopColor={bottom} />
          </linearGradient>
        </defs>
        <path d="M0,62 C35,78 65,48 100,60 L100,100 L0,100 Z" fill={`url(#mini-${icon})`} />
      </svg>
      )}
      <div className="relative flex flex-col items-center px-1 py-1.5 text-center">
        <span
          className="flex h-[26px] w-[26px] items-center justify-center rounded-full"
          style={{ background: `color-mix(in srgb, ${tint} 16%, transparent)` }}
        >
          <MiniIcon kind={icon} color={tint} />
        </span>
        <span className="mt-[3px] w-full truncate text-[10px] font-semibold leading-3 text-[#0E1B3D]">{label}</span>
        <span className={`whitespace-nowrap font-extrabold leading-[19px] ${value.length > 7 ? "text-[13px]" : "text-base"}`} style={{ color: tint }}>
          {value}
        </span>
        {sub && <span className="text-[9px] leading-[11px] text-[#5B6478]">{sub}</span>}
        <span className="text-[9px] leading-[11px] text-[#6B7A90]">Coins</span>
      </div>
    </div>
  );
}

function ActivityCard({ item }: { item: Item }) {
  const positive = item.amount >= 0;
  const iconBorder = item.gift ? "#D27BC6" : positive ? "#6CC79B" : "#E2BC4A";
  // "Sent Rose to bob" → the name after to / in / from is shown in blue.
  const m = /\b(to|in|from)\s+(.+)$/i.exec(item.title);
  const before = m ? item.title.slice(0, m.index).trimEnd() : item.title;
  const highlighted = m ? m[0].slice(m[0].indexOf(" ") + 1).trim() : "";
  return (
    <div className="my-[3px] flex min-h-[58px] items-center rounded-[14px] border border-[#D3E4F8] bg-[#F6FAFF] px-2.5 py-[7px]">
      <span
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[11px] border"
        style={{ borderColor: iconBorder, background: `color-mix(in srgb, ${iconBorder} 12%, transparent)` }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icon-192.png" alt="" width={32} height={32} className="h-8 w-8 rounded-lg" />
      </span>
      <div className="ml-2.5 min-w-0 flex-1">
        <p className="line-clamp-2 text-[13px] font-bold leading-[17px] text-[#0E1B3D]">
          {highlighted ? (
            <>
              {before} <span className="text-[#1565E8]">{highlighted}</span>
            </>
          ) : (
            item.title
          )}
        </p>
        <p className="text-[10px] text-[#6B7A90]">{timeLabel(item.timeMs)}</p>
      </div>
      <span className={`ml-[5px] shrink-0 text-sm font-extrabold ${positive ? "text-[#14A044]" : "text-[#E5202E]"}`}>
        {positive ? `+${short(item.amount)}` : `−${short(Math.abs(item.amount))}`}
      </span>
    </div>
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
        <p className="text-xs text-gray-500">miGlife / Coin Control permission only. Positive = add, negative = deduct.</p>
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
