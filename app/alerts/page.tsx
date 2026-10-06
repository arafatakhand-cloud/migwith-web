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
  };
}

type Style = { icon: string; title: string; top: string; bottom: string; group: string };

function styleFor(type: string): Style {
  switch (type) {
    case "gift":
      return { icon: "🎁", title: "Gift received", top: "#FF6FA8", bottom: "#D6336C", group: "gifts" };
    case "gift_contest_win":
      return { icon: "🎁", title: "Gift contest win", top: "#FF6FA8", bottom: "#D6336C", group: "gifts" };
    case "coin_transfer":
    case "transfer":
      return { icon: "💰", title: "Coins received", top: "#FFC94A", bottom: "#E08A00", group: "coins" };
    case "welcome_bonus":
      return { icon: "🎉", title: "Welcome bonus", top: "#FFC94A", bottom: "#E08A00", group: "coins" };
    case "trail_settlement":
    case "mentor_earning":
      return { icon: "💼", title: "Trail earnings", top: "#3DDC97", bottom: "#16955E", group: "coins" };
    case "luxury_bet_refund":
    case "lowcard_entry_refund":
      return { icon: "↩️", title: "Refund", top: "#3FD0D4", bottom: "#12848C", group: "coins" };
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
  const s = styleFor(a.type);
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
        Tag amount: {a.amount} Coins{merchant ? ` · Merchant trail: ${a.rate}%` : ""}
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
  // the unordered 100 are used and sorted here, like the app.
  useEffect(() => {
    if (!username) return;
    let fallback: (() => void) | null = null;
    const off = onSnapshot(
      query(collection(db, "alerts"), where("toUsername", "==", username), orderBy("createdAt", "desc"), limit(100)),
      (snap) => setAlerts(snap.docs.map(toAlert)),
      (err) => {
        console.error("Newest-first alerts need an index:", err);
        if (fallback) return;
        fallback = onSnapshot(
          query(collection(db, "alerts"), where("toUsername", "==", username), limit(100)),
          (snap) => setAlerts(snap.docs.map(toAlert).sort((a, b) => b.createdAtMs - a.createdAtMs)),
          () => setAlerts([])
        );
      }
    );
    return () => {
      off();
      fallback?.();
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

  const list = alerts || [];
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
              } else if (a.type === "mentor_request" && a.requestId) {
                card = (
                  <FancyCard top="#2B5FD9" bottom="#1B2A5C">
                    <p className="text-sm font-bold">💼 Mentor Tag Request</p>
                    <p className="mt-1 text-[13px]">@{a.fromUsername} tagged request you.</p>
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
