"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
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
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../../lib/firebase";
import { useCurrentUser } from "../../lib/useCurrentUser";
import { roomHref } from "../../lib/rooms";
import { chatHref } from "../../lib/privateChat";
import { PageShell } from "../_components/PageShell";
import { PushToggle } from "../_components/PushToggle";
import { BackButton } from "../_components/BackButton";

// The app's Alerts page (MainActivity.kt AlertsPage): the NEWEST 100 alerts,
// grouped by day, filter chips on top, a coloured card per type, and the
// request cards (tag requests, Style Studio) answered right here.

type Alert = {
  id: string;
  type: string;
  text: string;
  read: boolean;
  roomName: string;
  requestId: string;
  fromUsername: string;
  resolution: string;
  amount: number;
  rate: number;
  colorName: string;
  price: number;
  durationDays: number;
  createdAtMs: number;
  /** 🎁 gift alerts: the gift's own icon + name; a Gift Shower one is not shown */
  giftIcon: string;
  giftName: string;
  /** 💬 the message the sender wrote with the gift ("" when none) */
  giftMessage: string;
  shower: boolean;
  /** ⏳ renewal alerts: whose term, when it ends, and one key per term */
  role: string;
  untilMs: number;
  renewKey: string;
  renewed: boolean;
  mentorUsername: string;
  merchantUsername: string;
};

function toAlert(d: { id: string; get: (f: string) => any }): Alert {
  return {
    id: d.id,
    type: String(d.get("type") || ""),
    text: String(d.get("message") || d.get("text") || "You have a new alert."),
    read: d.get("read") === true,
    roomName: String(d.get("roomName") || ""),
    requestId: String(d.get("requestId") || ""),
    fromUsername: String(d.get("fromUsername") || ""),
    resolution: String(d.get("resolution") || ""),
    amount: Number(d.get("amount") || 5000),
    rate: Number(d.get("rate") || 2.5),
    colorName: String(d.get("colorName") || ""),
    price: Number(d.get("price") || 0),
    durationDays: Number(d.get("durationDays") || 0),
    createdAtMs: d.get("createdAt")?.toMillis?.() ?? 0,
    giftIcon: String(d.get("giftIcon") || "").trim(),
    giftName: String(d.get("giftName") || "").trim(),
    giftMessage: String(d.get("giftMessage") || "").trim(),
    shower: d.get("shower") === true,
    role: String(d.get("role") || ""),
    untilMs: Number(d.get("untilMs") || 0),
    renewKey: String(d.get("renewKey") || ""),
    renewed: d.get("renewed") === true,
    mentorUsername: String(d.get("mentorUsername") || ""),
    merchantUsername: String(d.get("merchantUsername") || ""),
  };
}

type Style = { icon: string; title: string; top: string; bottom: string; group: string };

function styleFor(type: string): Style {
  switch (type) {
    case "gift":
      return { icon: "🎁", title: "Gift received", top: "#FF6FA8", bottom: "#D6336C", group: "gifts" };
    case "gift_contest_win":
      return { icon: "🎁", title: "Gift contest win", top: "#FF6FA8", bottom: "#D6336C", group: "gifts" };
    case "luxury_festival_reward":
      return { icon: "💎", title: "Luxury Festival reward", top: "#B07CFF", bottom: "#5B2BA8", group: "coins" };
    case "luxury_festival_payout":
      return { icon: "💎", title: "Luxury Festival payouts", top: "#B07CFF", bottom: "#5B2BA8", group: "coins" };
    case "game_reward":
      return { icon: "🏆", title: "Daily reward", top: "#FFD36E", bottom: "#C98A00", group: "coins" };
    case "mentor_coin_grant":
      return { icon: "💰", title: "Mentor coins", top: "#3DDC97", bottom: "#16955E", group: "coins" };
    case "game_reward_summary":
      return { icon: "🏆", title: "Daily rewards paid", top: "#B07CFF", bottom: "#5B2BA8", group: "coins" };
    case "coin_transfer":
    case "transfer":
      return { icon: "💰", title: "Coins received", top: "#FFC94A", bottom: "#E08A00", group: "coins" };
    case "welcome_bonus":
      return { icon: "🎉", title: "Welcome bonus", top: "#FFC94A", bottom: "#E08A00", group: "coins" };
    case "trail_settlement":
    case "mentor_earning":
      return { icon: "💼", title: "Team bonus", top: "#3DDC97", bottom: "#16955E", group: "coins" };
    case "luxury_bet_refund":
    case "lowcard_entry_refund":
    case "refund":
      return { icon: "↩️", title: "Refund", top: "#3FD0D4", bottom: "#12848C", group: "coins" };
    case "mentor_recharge":
      return { icon: "💼", title: "Coins from Mentor", top: "#FFC94A", bottom: "#E08A00", group: "coins" };
    case "coin_adjustment":
      return { icon: "💰", title: "Coins removed", top: "#FF8A80", bottom: "#C62828", group: "coins" };
    case "role_change":
      return { icon: "🎖️", title: "New role", top: "#7C8CFF", bottom: "#3949AB", group: "all" };
    case "entry_effect":
      return { icon: "✨", title: "Entry Effect", top: "#FF9E6B", bottom: "#E0457B", group: "all" };
    case "special_color":
      return { icon: "🌈", title: "VIP color", top: "#B57BFF", bottom: "#7443D1", group: "requests" };
    case "friend_request":
      return { icon: "🤝", title: "Friend request", top: "#6FA8FF", bottom: "#2F63D6", group: "social" };
    case "friend_request_accepted":
      return { icon: "💙", title: "New friend", top: "#6FA8FF", bottom: "#2F63D6", group: "social" };
    case "mention":
      return { icon: "💬", title: "Mention", top: "#B57BFF", bottom: "#7443D1", group: "social" };
    case "game_invite":
    case "tp_invite":
      return { icon: "🎴", title: "Game invite", top: "#9B5DE5", bottom: "#5B2A86", group: "games" };
    case "color_purchase_request":
      return { icon: "🎨", title: "Style Studio request", top: "#2EC5D6", bottom: "#0E7C9A", group: "requests" };
    case "color_purchase_result":
      return { icon: "🎨", title: "Style Studio", top: "#2EC5D6", bottom: "#0E7C9A", group: "requests" };
    case "mentor_renewal":
      return { icon: "⏳", title: "Mentorship renewal", top: "#FFB74D", bottom: "#E65100", group: "requests" };
    case "merchant_renewal":
      return { icon: "⏳", title: "Merchant renewal", top: "#FFB74D", bottom: "#E65100", group: "requests" };
    case "merchant_tag_request":
    case "mentor_tag_request":
    case "mentor_request":
    case "merchant_tag_request_approved":
    case "mentor_tag_request_approved":
      return { icon: "🏷️", title: "Request", top: "#7C8CFF", bottom: "#4254C9", group: "requests" };
    default:
      return { icon: "🔔", title: "Notification", top: "#8A9BC4", bottom: "#55658F", group: "all" };
  }
}

const FILTERS: [string, string][] = [
  ["all", "All"],
  ["gifts", "🎁 Gifts"],
  ["coins", "💰 Coins"],
  ["social", "💬 Social"],
  ["requests", "🏷️ Requests"],
  ["games", "🎮 Games"],
];

const dayKey = (ms: number) => new Date(ms).toDateString();
function dayLabel(ms: number): string {
  if (ms <= 0) return "Earlier";
  const now = Date.now();
  if (dayKey(ms) === dayKey(now)) return "Today";
  if (dayKey(ms) === dayKey(now - 86_400_000)) return "Yesterday";
  return new Date(ms).toLocaleDateString(undefined, { weekday: "long", day: "2-digit", month: "short" });
}

function shortTime(ms: number): string {
  if (ms <= 0) return "…";
  const diff = Date.now() - ms;
  if (diff < 60_000) return "now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
  if (dayKey(ms) === dayKey(Date.now())) return new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (diff < 7 * 86_400_000) return new Date(ms).toLocaleDateString(undefined, { weekday: "short" });
  return new Date(ms).toLocaleDateString(undefined, { day: "2-digit", month: "short" });
}

function fullTime(ms: number): string {
  if (!ms) return "";
  const d = new Date(ms);
  return `${d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} • ${d.toLocaleDateString(undefined, { day: "2-digit", month: "short" })}`;
}

// "/invite" alerts carry the room only inside the text: … join "Room Name"!
function inviteRoom(a: Alert): string {
  if (a.roomName) return a.roomName;
  const m = a.text.match(/invited you to join "(.+)"!?$/);
  return m ? m[1] : "";
}

function IconBubble({ s, size = 46 }: { s: Style; size?: number }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.45,
        background: `linear-gradient(135deg, ${s.top}, ${s.bottom})`,
        boxShadow: `0 3px 8px ${s.bottom}55`,
      }}
    >
      {s.icon}
    </span>
  );
}

function FancyCard({ top, bottom, children }: { top: string; bottom: string; children: ReactNode }) {
  return (
    <div
      className="relative my-1 overflow-hidden rounded-[20px] border border-white/20 p-1 text-white"
      style={{ background: `linear-gradient(135deg, ${top}, ${bottom})`, boxShadow: `0 6px 14px ${bottom}55` }}
    >
      <span className="pointer-events-none absolute -right-10 -top-10 h-[110px] w-[110px] rounded-full bg-white/[0.08]" />
      <span className="pointer-events-none absolute -bottom-8 right-0 h-[60px] w-[60px] rounded-full bg-white/[0.06]" />
      <div className="relative p-3">{children}</div>
    </div>
  );
}

function AlertRow({ a, isNew, href }: { a: Alert; isNew: boolean; href?: string }) {
  const base = styleFor(a.type);
  // a gift alert shows the gift's own icon and name (like the app)
  const s =
    a.type === "gift" && a.giftIcon && Array.from(a.giftIcon).length <= 8
      ? { ...base, icon: a.giftIcon, title: a.giftName ? `Gift · ${a.giftName}` : base.title }
      : base;
  const body = (
    <div
      className="relative my-[3px] overflow-hidden rounded-[18px] border bg-white"
      style={{ borderColor: isNew ? `${s.bottom}8C` : "#E1E6F0", boxShadow: isNew ? "0 4px 12px rgba(0,0,0,.12)" : "0 1px 3px rgba(0,0,0,.08)" }}
    >
      <span
        className="absolute left-0 top-1/2 h-16 w-1 -translate-y-1/2 rounded-r"
        style={{ background: `linear-gradient(${s.top}, ${s.bottom})` }}
      />
      <div className="flex items-center gap-3 py-3 pl-4 pr-3.5">
        <IconBubble s={s} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="flex-1 truncate text-xs font-extrabold" style={{ color: s.bottom }}>
              {s.title}
            </span>
            <span className="text-[11px] text-gray-500">{shortTime(a.createdAtMs)}</span>
            {isNew && <span className="h-2 w-2 rounded-full" style={{ background: s.bottom }} />}
          </div>
          <p className={`mt-0.5 whitespace-pre-wrap break-words text-sm leading-[19px] text-[#0B1F3A] ${isNew ? "font-semibold" : ""}`}>
            {a.text}
          </p>
        </div>
      </div>
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

// 🎁 A gift you got: a pink card with the gift big, the sender's message in a
// chat bubble, the room it was sent in, and 💝 Say thanks (opens a private
// chat with the sender).
function GiftAlertCard({ a, isNew }: { a: Alert; isNew: boolean }) {
  const icon = a.giftIcon && Array.from(a.giftIcon).length <= 8 ? a.giftIcon : "🎁";
  return (
    <div
      className="relative my-1 overflow-hidden rounded-[22px] p-3.5 text-white"
      style={{
        background: "linear-gradient(135deg, #FF6FA8, #B0245A)",
        boxShadow: isNew ? "0 8px 18px #D6336C66" : "0 4px 10px #D6336C40",
      }}
    >
      <span className="pointer-events-none absolute -right-10 -top-10 h-[130px] w-[130px] rounded-full bg-white/[0.13]" />
      <div className="relative flex items-center gap-3">
        <span className="flex h-[58px] w-[58px] shrink-0 items-center justify-center rounded-[18px] bg-white text-[34px] shadow-[0_4px_10px_rgba(0,0,0,.2)]">
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-extrabold">{a.fromUsername}</p>
          <p className="text-[13px] text-white/90">
            sent you <b>{a.giftName || "a gift"}</b>
          </p>
        </div>
        <span className="flex items-center gap-1.5 self-start text-[11px] text-white/85">
          {shortTime(a.createdAtMs)}
          {isNew && <span className="h-2 w-2 rounded-full bg-white" />}
        </span>
      </div>
      {a.giftMessage && (
        <p className="relative mt-3 whitespace-pre-wrap break-words rounded-[4px_16px_16px_16px] bg-white px-3 py-2.5 text-sm italic leading-5 text-[#0B1F3A]">
          <span className="mr-1.5 not-italic">💬</span>
          {a.giftMessage}
        </p>
      )}
      <div className="relative mt-3 flex items-center gap-2">
        {a.roomName && (
          <Link href={roomHref(a.roomName)} className="min-w-0 truncate rounded-full bg-white/[0.18] px-2.5 py-1 text-xs font-bold">
            🏠 {a.roomName} room
          </Link>
        )}
        <Link
          href={chatHref(a.fromUsername)}
          className="ml-auto shrink-0 rounded-full bg-white px-3.5 py-2 text-[13px] font-extrabold text-[#B0245A]"
        >
          💝 Say thanks
        </Link>
      </div>
    </div>
  );
}

// ⏳ Mentorship / Merchant renewal: a countdown card — a ring with the days
// left (of the last 5), the end date, a 5-step bar, and one tap to act:
// a mentor opens the Mentor Dashboard (or messages miglife for their own
// Mentorship), a merchant messages their mentor. Green once renewed.
function RenewalCard({ a, isNew, me }: { a: Alert; isNew: boolean; me: string }) {
  const merchantTerm = a.type === "merchant_renewal";
  const fromText = Number(a.text.match(/ends in (\d+) day/)?.[1] || 0);
  const until = a.untilMs;
  const days = until ? Math.ceil((until - Date.now()) / 86_400_000) : a.text.startsWith("⛔") ? 0 : fromText;
  const renewed = a.renewed || a.text.startsWith("✅");
  const ended = !renewed && days <= 0;
  const amMentor = a.role ? a.role === "mentor" : me.toLowerCase() === a.mentorUsername.toLowerCase();
  const grad = renewed ? "from-[#34C77B] to-[#12845A]" : ended ? "from-[#FF6B6B] to-[#C62828]" : days <= 2 ? "from-[#FF8A5B] to-[#E0457B]" : "from-[#FFB74D] to-[#E65100]";
  const title = merchantTerm ? "Merchant renewal" : "Mentorship renewal";
  const date = until ? new Date(until).toLocaleDateString("en-GB", { timeZone: "Asia/Dhaka", day: "numeric", month: "short", year: "numeric" }) : "";
  const shownDays = Math.max(0, Math.min(5, days));
  const action = renewed
    ? null
    : amMentor
      ? merchantTerm
        ? { href: "/mentor", label: "💼 Renew in Mentor Dashboard" }
        : { href: chatHref("miglife"), label: "💬 Ask miglife to renew" }
      : a.mentorUsername
        ? { href: chatHref(a.mentorUsername), label: `💬 Message ${a.mentorUsername}` }
        : null;
  return (
    <div className={`relative my-1.5 overflow-hidden rounded-[22px] bg-gradient-to-br ${grad} p-4 text-white ${isNew ? "shadow-[0_10px_22px_rgba(230,81,0,.35)]" : "shadow-md"}`}>
      <span className="pointer-events-none absolute -right-10 -top-12 h-36 w-36 rounded-full bg-white/10" />
      <div className="relative flex items-center gap-3.5">
        {/* ring: days left of the last 5 */}
        <span
          className="flex h-[66px] w-[66px] shrink-0 items-center justify-center rounded-full"
          style={{ background: renewed ? "rgba(255,255,255,.95)" : `conic-gradient(#fff 0 ${shownDays * 20}%, rgba(255,255,255,.25) 0)` }}
        >
          <span className="flex h-[54px] w-[54px] flex-col items-center justify-center rounded-full bg-black/15 leading-none">
            {renewed ? (
              <span className="text-[26px]">✅</span>
            ) : (
              <>
                <span className="text-[22px] font-black">{ended ? "!" : days}</span>
                <span className="mt-0.5 text-[9px] font-bold uppercase tracking-wide">{ended ? "ended" : days === 1 ? "day" : "days"}</span>
              </>
            )}
          </span>
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-extrabold uppercase tracking-[1px] text-white/85">⏳ {title}</span>
            <span className="ml-auto text-[11px] text-white/80">{shortTime(a.createdAtMs)}</span>
            {isNew && <span className="h-2 w-2 rounded-full bg-white" />}
          </div>
          <p className="mt-0.5 text-[15px] font-extrabold leading-5">
            {renewed ? "Renewed — all good! 🎉" : ended ? "Term has ended" : days === 1 ? "Ends tomorrow" : `Ends in ${days} days`}
          </p>
          {date && <p className="text-[12px] text-white/85">{renewed ? "Runs until" : "Last day"}: {date}</p>}
        </div>
      </div>
      {!renewed && (
        <div className="relative mt-3 flex gap-1">
          {[5, 4, 3, 2, 1].map((n) => (
            <span key={n} className={`h-1.5 flex-1 rounded-full ${days >= n ? "bg-white" : "bg-white/25"}`} />
          ))}
        </div>
      )}
      <p className="relative mt-3 whitespace-pre-wrap break-words rounded-2xl bg-white/15 px-3 py-2 text-[13px] leading-[18px]">{a.text}</p>
      {merchantTerm && !amMentor && !renewed && a.mentorUsername && <RenewRequestButton me={me} mentor={a.mentorUsername} />}
      {action && (
        <Link
          href={action.href}
          className={`relative mt-2.5 block rounded-full py-2 text-center text-[13px] font-extrabold shadow ${
            merchantTerm && !amMentor ? "border border-white/60 bg-white/10 text-white" : "bg-white text-[#C2410C]"
          }`}
        >
          {action.label}
        </Link>
      )}
    </div>
  );
}

// 🔄 Merchant → "Renew": sends a renewal request to the mentor (a
// mentor_requests entry they approve in Mentor Dashboard › Requests, plus an
// alert so they see it). Shows "sent" while one is still waiting.
function RenewRequestButton({ me, mentor }: { me: string; mentor: string }) {
  const [state, setState] = useState<"checking" | "ready" | "sending" | "sent">("checking");
  const [error, setError] = useState("");
  useEffect(() => {
    getDocs(query(collection(db, "mentor_requests"), where("fromUsername", "==", me), where("toMentor", "==", mentor), where("status", "==", "pending"), limit(1)))
      .then((s) => setState(s.empty ? "ready" : "sent"))
      .catch(() => setState("ready"));
  }, [me, mentor]);
  const send = async () => {
    setState("sending");
    setError("");
    try {
      const ref = await addDoc(collection(db, "mentor_requests"), { fromUsername: me, toMentor: mentor, note: "Renewal", status: "pending", createdAt: serverTimestamp() });
      await addDoc(collection(db, "alerts"), {
        toUsername: mentor,
        fromUsername: me,
        requestId: ref.id,
        type: "mentor_request",
        message: `🔄 @${me} asks you to renew their Merchant term.`,
        read: false,
        createdAt: serverTimestamp(),
      }).catch(() => {});
      setState("sent");
    } catch (e: any) {
      setError(e?.message || "Could not send the request.");
      setState("ready");
    }
  };
  return (
    <>
      <button
        type="button"
        disabled={state !== "ready"}
        onClick={send}
        className={`relative mt-3 flex w-full items-center justify-center gap-1.5 rounded-full py-2.5 text-[14px] font-black shadow-lg transition ${
          state === "sent" ? "bg-white/25 text-white" : "bg-white text-[#C2410C] active:scale-[.98]"
        }`}
      >
        {state === "checking" ? "…" : state === "sending" ? "Sending…" : state === "sent" ? `✅ Renewal request sent to ${mentor}` : `🔄 Renew — send request to ${mentor}`}
      </button>
      {error && <p className="relative mt-1.5 text-xs font-bold text-white">{error}</p>}
    </>
  );
}

const approveColorPurchase = httpsCallable<{ requestId: string }, { status?: string }>(functions, "approveColorPurchase");
const rejectColorPurchase = httpsCallable<{ requestId: string }, { status?: string }>(functions, "rejectColorPurchase");
const approveTagRequest = httpsCallable<{ kind: string; requestId: string }, { ok?: boolean; result?: string }>(functions, "approveTagRequest");

// 🎨 Style Studio purchase request (migwith accepts or rejects it here).
function ColorRequestCard({ a }: { a: Alert }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [local, setLocal] = useState<string | null>(null);
  const [live, setLive] = useState<string | null>(null);
  useEffect(
    () => onSnapshot(doc(db, "color_purchase_requests", a.requestId), (s) => setLive(s.get("status") || null), () => {}),
    [a.requestId]
  );
  const result = a.resolution || (live === "approved" || live === "rejected" ? live : null) || local;
  const act = (approve: boolean) => {
    setBusy(true);
    setError("");
    (approve ? approveColorPurchase : rejectColorPurchase)({ requestId: a.requestId })
      .then(({ data }) => setLocal(data?.status || (approve ? "approved" : "rejected")))
      .catch((e: any) => setError(e?.message || "Could not update the request."))
      .finally(() => setBusy(false));
  };
  return (
    <FancyCard top="#2EC5D6" bottom="#0B4F6C">
      <div className="flex items-center gap-2.5">
        <IconBubble s={styleFor("color_purchase_request")} size={40} />
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-extrabold">Style Studio Request</p>
          <p className="text-[11px] text-[#BFEAF2]">{fullTime(a.createdAtMs)}</p>
        </div>
      </div>
      <p className="mt-2 text-sm font-semibold">
        @{a.fromUsername} wants {a.colorName || "a color"}
      </p>
      {a.price > 0 && (
        <p className="text-xs font-bold text-[#FFD66B]">
          💰 {a.price.toLocaleString()} coins{a.durationDays > 0 ? ` · ⏳ ${a.durationDays} days` : ""}
        </p>
      )}
      <div className="mt-2.5">
        {result === "approved" ? (
          <span className="inline-block rounded-full bg-[#2EC27E] px-3.5 py-1.5 text-[13px] font-extrabold">✅ Accepted</span>
        ) : result === "rejected" ? (
          <span className="inline-block rounded-full bg-[#E5484D] px-3.5 py-1.5 text-[13px] font-extrabold">❌ Rejected</span>
        ) : (
          <div className="flex gap-2">
            <button type="button" disabled={busy} onClick={() => act(true)} className="flex-1 rounded-full bg-[#2EC27E] py-2 text-sm font-bold disabled:opacity-60">
              {busy ? "…" : "ACCEPT"}
            </button>
            <button type="button" disabled={busy} onClick={() => act(false)} className="flex-1 rounded-full bg-[#E5484D] py-2 text-sm font-bold disabled:opacity-60">
              {busy ? "…" : "REJECT"}
            </button>
          </div>
        )}
      </div>
      {error && <p className="mt-1.5 text-xs text-[#FFC2C2]">{error}</p>}
    </FancyCard>
  );
}

// 🏪 Merchant / 💼 Mentor tag request: same Firestore writes as the app.
function TagRequestCard({ a, username, uid }: { a: Alert; username: string; uid: string }) {
  const merchant = a.type === "merchant_tag_request";
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(a.resolution);
  const [error, setError] = useState("");

  // 🔒 The server checks the request and creates the tag (approveTagRequest) —
  // tags can no longer be written from a phone or the web.
  const approve = async () => {
    setBusy(true);
    setError("");
    try {
      const { data } = await approveTagRequest({ kind: merchant ? "merchant" : "mentor", requestId: a.requestId });
      const result = String(data?.result || "");
      if (result === "approved" || result === "blocked" || result === "cancelled") {
        const res = result === "approved" ? "approved" : "cancelled";
        await updateDoc(doc(db, "alerts", a.id), { read: true, resolved: true, resolution: res }).catch(() => {});
        setDone(res);
        if (result === "blocked") setError("You are already tagged by another mentor or merchant.");
      }
    } catch (e: any) {
      setError(e?.message || "Could not approve. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    setBusy(true);
    setError("");
    try {
      await updateDoc(doc(db, merchant ? "merchant_tag_requests" : "mentor_tag_requests", a.requestId), {
        status: "cancelled",
        cancelledAt: serverTimestamp(),
      });
      await updateDoc(doc(db, "alerts", a.id), { read: true, resolved: true, resolution: "cancelled" }).catch(() => {});
      setDone("cancelled");
    } catch (e: any) {
      setError(e?.message || "Could not cancel. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <FancyCard top="#2B5FD9" bottom="#1B2A5C">
      <p className="text-sm font-bold">{merchant ? "🏪 Merchant Tag Request" : "💼 Tag Request"}</p>
      <p className="mt-1 text-[13px]">@{a.fromUsername} wants to tag you.</p>
      <p className="text-xs font-bold text-[#FFC04A]">
        Tag amount: {a.amount} coins{merchant ? ` · Merchant bonus: ${a.rate}%` : ""}
      </p>
      <div className="mt-2">
        {done === "approved" ? (
          <p className="text-[13px] font-bold text-[#32A852]">✅ Approved</p>
        ) : done === "cancelled" ? (
          <p className="text-[13px] font-bold text-[#FF8A80]">❌ Cancelled</p>
        ) : (
          <div className="flex gap-2">
            <button type="button" disabled={busy} onClick={approve} className="flex-1 rounded-full bg-[#32A852] py-2 text-sm font-bold disabled:opacity-60">
              {busy ? "…" : "APPROVE"}
            </button>
            <button type="button" disabled={busy} onClick={cancel} className="flex-1 rounded-full border border-white/40 bg-white/10 py-2 text-sm font-bold text-[#FF8A80] disabled:opacity-60">
              CANCEL
            </button>
          </div>
        )}
      </div>
      {error && <p className="mt-1.5 text-xs text-[#FFC2C2]">{error}</p>}
    </FancyCard>
  );
}

// 🤝 Friend request — accept or reject it right here (like the app). Reads the
// live request(s) from this person, so one already answered on the Friends
// page shows its result instead of buttons. Duplicates are all closed.
function FriendRequestCard({ a, username }: { a: Alert; username: string }) {
  const requester = a.fromUsername.trim();
  const [docs, setDocs] = useState<{ id: string; status: string }[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(
    () =>
      onSnapshot(
        query(collection(db, "friend_requests"), where("fromUsername", "==", requester), where("toUsername", "==", username)),
        (snap) => setDocs(snap.docs.map((d) => ({ id: d.id, status: String(d.get("status") || "") }))),
        () => setDocs([])
      ),
    [requester, username]
  );
  const statuses = (docs || []).map((d) => d.status);
  const pending = (docs || []).filter((d) => d.status === "pending");
  const result =
    docs === null
      ? "loading"
      : statuses.includes("accepted")
        ? "accepted"
        : pending.length
          ? "pending"
          : statuses.includes("cancelled") && !statuses.includes("rejected")
            ? "cancelled"
            : "rejected";
  const answer = async (accept: boolean) => {
    if (!pending.length) return;
    setBusy(true);
    setError("");
    try {
      // only ONE friendship document is left: the first is accepted, the rest closed
      await Promise.all(
        pending.map((d, i) =>
          updateDoc(doc(db, "friend_requests", d.id), {
            status: accept && i === 0 ? "accepted" : "rejected",
            updatedAt: serverTimestamp(),
          })
        )
      );
      updateDoc(doc(db, "alerts", a.id), { read: true }).catch(() => {});
      if (accept) {
        addDoc(collection(db, "alerts"), {
          toUsername: requester,
          fromUsername: username,
          message: `${username} accepted your friend request.`,
          type: "friend_request_accepted",
          read: false,
          createdAt: serverTimestamp(),
        }).catch(() => {});
      }
    } catch (e: any) {
      setError(e?.message || "Could not answer the request.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <FancyCard top="#6FA8FF" bottom="#2F63D6">
      <div className="flex items-center gap-2.5">
        <IconBubble s={styleFor("friend_request")} size={40} />
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-extrabold">Friend request</p>
          <p className="text-[11px] text-[#D6E6FF]">{fullTime(a.createdAtMs)}</p>
        </div>
      </div>
      <p className="mt-2 text-sm font-semibold">@{requester} sent you a friend request.</p>
      <div className="mt-2.5">
        {result === "loading" ? (
          <p className="text-[13px]">…</p>
        ) : result === "accepted" ? (
          <span className="inline-block rounded-full bg-[#2EC27E] px-3.5 py-1.5 text-[13px] font-extrabold">✅ Friends now</span>
        ) : result === "pending" ? (
          <div className="flex gap-2">
            <button type="button" disabled={busy} onClick={() => answer(true)} className="flex-1 rounded-full bg-[#2EC27E] py-2 text-sm font-bold disabled:opacity-60">
              {busy ? "…" : "ACCEPT"}
            </button>
            <button type="button" disabled={busy} onClick={() => answer(false)} className="flex-1 rounded-full bg-[#E5484D] py-2 text-sm font-bold disabled:opacity-60">
              {busy ? "…" : "REJECT"}
            </button>
          </div>
        ) : result === "cancelled" ? (
          <span className="inline-block rounded-full bg-white/20 px-3.5 py-1.5 text-[13px] font-extrabold">↩ Cancelled</span>
        ) : (
          <span className="inline-block rounded-full bg-[#E5484D] px-3.5 py-1.5 text-[13px] font-extrabold">❌ Rejected</span>
        )}
      </div>
      {error && <p className="mt-1.5 text-xs text-[#FFC2C2]">{error}</p>}
    </FancyCard>
  );
}

export default function AlertsPage() {
  const router = useRouter();
  const { user, username, loading } = useCurrentUser();
  const [alerts, setAlerts] = useState<Alert[] | null>(null);
  const [filter, setFilter] = useState("all");
  // Which alerts were unread when the page opened: they keep their "new" look
  // for this visit even after being marked read.
  const [initialUnread, setInitialUnread] = useState<Set<string> | null>(null);
  const marked = useRef(new Set<string>());

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  // The NEWEST 100. Needs an index (toUsername + createdAt); until it exists
  // the unordered 100 are used and sorted here, like the app. Those 100 are
  // NOT the newest once someone has more than 100 alerts, so the unread ones
  // (no index needed) are added on top — a new gift always shows. Kept for
  // this visit even after they are marked read.
  const [loadError, setLoadError] = useState("");
  useEffect(() => {
    if (!username) return;
    setLoadError("");
    let fallback: (() => void) | null = null;
    let unread: (() => void) | null = null;
    const off = onSnapshot(
      query(collection(db, "alerts"), where("toUsername", "==", username), orderBy("createdAt", "desc"), limit(100)),
      (snap) => setAlerts(snap.docs.map(toAlert)),
      (err) => {
        console.error("Newest-first alerts need an index:", err);
        if (fallback) return;
        const some = new Map<string, Alert>();
        const fresh = new Map<string, Alert>();
        const show = () => setAlerts([...new Map([...some, ...fresh]).values()].sort((a, b) => b.createdAtMs - a.createdAtMs));
        fallback = onSnapshot(
          query(collection(db, "alerts"), where("toUsername", "==", username), limit(100)),
          (snap) => {
            some.clear();
            snap.docs.forEach((d) => some.set(d.id, toAlert(d)));
            show();
          },
          (e) => {
            setLoadError(e?.message || String(e));
            setAlerts([]);
          }
        );
        unread = onSnapshot(
          query(collection(db, "alerts"), where("toUsername", "==", username), where("read", "==", false), limit(200)),
          (snap) => {
            snap.docs.forEach((d) => fresh.set(d.id, toAlert(d)));
            show();
          },
          () => {}
        );
      }
    );
    return () => {
      off();
      fallback?.();
      unread?.();
    };
  }, [username]);

  // Mark every unread alert read (clears the 🔔 badge), new ones included;
  // they keep the "new" look for this visit.
  useEffect(() => {
    if (!username) return;
    return onSnapshot(
      query(collection(db, "alerts"), where("toUsername", "==", username), where("read", "==", false), limit(2000)),
      (snap) => {
        const docs = snap.docs.filter((d) => !marked.current.has(d.id));
        setInitialUnread((prev) => new Set([...(prev || []), ...docs.map((d) => d.id)]));
        if (docs.length === 0) return;
        (async () => {
          for (let i = 0; i < docs.length; i += 450) {
            const batch = writeBatch(db);
            docs.slice(i, i + 450).forEach((d) => {
              marked.current.add(d.id);
              batch.update(d.ref, { read: true });
            });
            await batch.commit();
          }
        })().catch((err) => console.error("could not mark alerts read", err));
      },
      (err) => console.error("unread alerts listener failed", err)
    );
  }, [username]);

  if (loading || !user) {
    return (
      <PageShell light>
        <p className="py-20 text-center text-sm text-[#5B6B8C]">Loading…</p>
      </PageShell>
    );
  }

  // 🎁 Gift Shower alerts are not shown (one shower filled everyone's Alerts)
  // ⏳ one card per renewal term: only the newest alert of each renewKey stays
  const seenRenew = new Set<string>();
  const list = (alerts || []).filter((a) => {
    if (a.type === "gift" && a.shower) return false;
    if (a.renewKey) {
      if (seenRenew.has(a.renewKey)) return false;
      seenRenew.add(a.renewKey);
    }
    return true;
  });
  const shown = filter === "all" ? list : list.filter((a) => styleFor(a.type).group === filter);
  const newCount = initialUnread?.size ?? list.filter((a) => !a.read).length;

  return (
    <PageShell light>
      <section className="mx-auto max-w-2xl pb-8">
        {/* Gradient header, like the app */}
        <div className="relative overflow-hidden rounded-b-[26px] bg-gradient-to-br from-[#2B5FD9] via-[#0B1F3A] to-[#5B2A86] px-2 pb-3.5 pt-1 text-white sm:mt-3 sm:rounded-[26px]">
          <span className="pointer-events-none absolute -right-14 -top-16 h-[150px] w-[150px] rounded-full bg-white/[0.07]" />
          <div className="relative flex items-center gap-1">
            <BackButton variant="dark" onClick={() => router.back()} className="mr-1.5" />
            <div className="min-w-0 flex-1">
              <h1 className="text-[22px] font-extrabold">🔔 Alerts</h1>
              <p className="text-xs text-white/80">
                {newCount > 0 ? `${newCount} new` : list.length > 0 ? "You're all caught up ✨" : "Nothing here yet"}
              </p>
            </div>
            {newCount > 0 && (
              <span className="mr-2 rounded-full bg-[#FFC94A] px-2.5 py-1 text-xs font-extrabold text-[#14213D]">
                {newCount > 99 ? "99+" : newCount}
              </span>
            )}
          </div>
          <div className="no-scrollbar relative mt-2.5 flex gap-2 overflow-x-auto px-1.5">
            {FILTERS.map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setFilter(k)}
                className={`shrink-0 rounded-full border px-3.5 py-[7px] text-xs ${
                  k === filter
                    ? "border-transparent bg-white font-extrabold text-[#14213D]"
                    : "border-white/25 bg-white/[0.14] font-semibold text-white"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="px-3.5 pt-2">
          <PushToggle />
          {loadError && (
            <p className="mb-2 rounded-xl bg-[#FDECEA] px-3 py-2 text-xs font-semibold text-[#B3261E]">⚠️ Alerts could not load: {loadError}</p>
          )}
          {alerts === null ? (
            <p className="py-10 text-center text-sm text-[#6B7A99]">Loading…</p>
          ) : shown.length === 0 ? (
            <div className="flex flex-col items-center pt-14 text-center">
              <span className="flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-[#2B5FD9]/20 to-[#9B5DE5]/20 text-[42px]">
                🔕
              </span>
              <p className="mt-3.5 text-base font-bold text-[#0B1F3A]">
                {filter === "all" ? "No alerts yet" : "No alerts in this category"}
              </p>
              <p className="mt-1 text-xs text-gray-500">Gifts, coins, invites and requests will show up here.</p>
            </div>
          ) : (
            shown.map((a, i) => {
              const day = dayLabel(a.createdAtMs);
              const header = i === 0 || dayLabel(shown[i - 1].createdAtMs) !== day;
              const isNew = initialUnread?.has(a.id) === true;
              const room = a.type === "game_invite" ? inviteRoom(a) : "";
              let card: ReactNode;
              if (a.type === "game_invite" && room) {
                card = (
                  <FancyCard top="#9B5DE5" bottom="#2A0F45">
                    <div className="flex items-center gap-2.5">
                      <IconBubble s={styleFor("game_invite")} size={40} />
                      <div className="min-w-0 flex-1">
                        <p className="text-[15px] font-extrabold text-[#FFD66B]">Game invite</p>
                        <p className="text-[11px] text-[#D9C6F0]">{fullTime(a.createdAtMs)}</p>
                      </div>
                    </div>
                    <p className="mt-2 text-sm leading-[19px]">{a.text}</p>
                    <Link href={roomHref(room)} className="mt-2.5 inline-block rounded-full bg-[#2EC27E] px-5 py-2 text-sm font-bold">
                      ▶ Open table
                    </Link>
                  </FancyCard>
                );
              } else if (a.type === "color_purchase_request" && a.requestId) {
                card = <ColorRequestCard a={a} />;
              } else if ((a.type === "merchant_tag_request" || a.type === "mentor_tag_request") && a.requestId) {
                card = <TagRequestCard a={a} username={username} uid={user.uid} />;
              } else if (a.type === "mentor_renewal" || a.type === "merchant_renewal") {
                card = <RenewalCard a={a} isNew={isNew} me={username} />;
              } else if (a.type === "gift" && a.fromUsername.trim()) {
                card = <GiftAlertCard a={a} isNew={isNew} />;
              } else if (a.type === "friend_request" && a.fromUsername.trim()) {
                card = <FriendRequestCard a={a} username={username} />;
              } else if (a.type === "mentor_request" && a.requestId) {
                card = (
                  <FancyCard top="#2B5FD9" bottom="#1B2A5C">
                    <p className="text-sm font-bold">💼 Mentor Tag Request</p>
                    <p className="mt-1 text-[13px]">@{a.fromUsername} sent you a tag request.</p>
                    <Link href="/mentor" className="text-xs text-[#8FA0C9] underline">
                      Review and accept or cancel it from your Mentor Dashboard → Requests tab.
                    </Link>
                  </FancyCard>
                );
              } else {
                const mentionRoom = a.type === "mention" ? inviteRoom(a) : "";
                const href =
                  a.type === "friend_request" || a.type === "friend_request_accepted"
                    ? "/friends"
                    : mentionRoom
                      ? roomHref(mentionRoom)
                      : undefined;
                card = <AlertRow a={a} isNew={isNew} href={href} />;
              }
              return (
                <div key={a.id}>
                  {header && (
                    <div className="flex items-center gap-2.5 pb-0.5 pl-1 pt-2.5">
                      <span className="text-[11px] font-extrabold uppercase tracking-[1.2px] text-[#55658F]">{day}</span>
                      <span className="h-px flex-1 bg-[#D5DCEB]" />
                    </div>
                  )}
                  {card}
                </div>
              );
            })
          )}
        </div>
      </section>
    </PageShell>
  );
}
