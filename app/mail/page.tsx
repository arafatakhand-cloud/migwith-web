"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useSession } from "../_components/AppSession";
import { useRequireLogin } from "../../lib/useRequireLogin";
import { PageShell } from "../_components/PageShell";
import { BackButton } from "../_components/BackButton";

// ✉️ Email, the app's mailbox (MainActivity.kt EmailsPage): Inbox / Sent,
// search, read a mail (marks it read), reply, delete, compose. Each mail is
// two "emails" docs — the sender's "sent" copy and the recipient's
// "received" copy — exactly as the app writes them.

const SUBJECT_MAX = 200;
const BODY_MAX = 5000;

type Mail = { id: string; other: string; subject: string; body: string; timeMs: number; unread: boolean; sent: boolean };

const AVATAR_COLORS: [string, string][] = [
  ["#5B8DEF", "#3453C4"],
  ["#F2994A", "#D9591F"],
  ["#34C77B", "#1E8C55"],
  ["#BB6BD9", "#7D3C98"],
  ["#EF6A7A", "#C0392B"],
  ["#2EC4B6", "#15877D"],
];

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h & 0x7fffffff;
}

function Avatar({ name, size }: { name: string; size: number }) {
  const clean = name.trim();
  const [a, b] = AVATAR_COLORS[hash(clean.toLowerCase()) % AVATAR_COLORS.length];
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full font-extrabold text-white shadow"
      style={{ width: size, height: size, fontSize: size * 0.42, background: `linear-gradient(135deg, ${a}, ${b})` }}
    >
      {(clean[0] || "?").toUpperCase()}
    </span>
  );
}

const dayKey = (ms: number) => new Date(ms).toDateString();
function shortTime(ms: number) {
  if (ms <= 0) return "…";
  const diff = Date.now() - ms;
  if (diff < 60_000) return "now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
  if (dayKey(ms) === dayKey(Date.now())) return new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (diff < 7 * 86_400_000) return new Date(ms).toLocaleDateString(undefined, { weekday: "short" });
  return new Date(ms).toLocaleDateString(undefined, { day: "2-digit", month: "short" });
}
function fullTime(ms: number) {
  if (ms <= 0) return "Sending…";
  const d = new Date(ms);
  return `${d.toLocaleDateString(undefined, { weekday: "short", day: "2-digit", month: "short", year: "numeric" })} • ${d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
}

function toMail(d: { id: string; get: (k: string, o?: any) => any }, sent: boolean): Mail {
  return {
    id: d.id,
    other: String((sent ? d.get("toUsername") : d.get("fromUsername")) || "").trim(),
    subject: String(d.get("subject") || "").trim() || "(No subject)",
    body: String(d.get("message") ?? d.get("body") ?? ""),
    timeMs: d.get("createdAt", { serverTimestamps: "estimate" })?.toMillis?.() ?? 0,
    unread: !sent && d.get("read") === false,
    sent,
  };
}

function TopBar({ title, onBack, children }: { title: string; onBack: () => void; children?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1 bg-gradient-to-r from-[#0B1F3A] to-[#174EA6] px-2.5 py-2 text-white sm:mt-3 sm:rounded-2xl">
      <BackButton variant="dark" onClick={onBack} className="mr-1.5" />
      <h1 className="flex-1 text-[19px] font-bold">{title}</h1>
      {children}
    </div>
  );
}

function MailPage() {
  const ready = useRequireLogin();
  const router = useRouter();
  const params = useSearchParams();
  const { user, username } = useSession();
  const [tab, setTab] = useState<"inbox" | "sent">("inbox");
  const [search, setSearch] = useState("");
  const [inbox, setInbox] = useState<Mail[] | null>(null);
  const [sentBox, setSentBox] = useState<Mail[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [compose, setCompose] = useState<{ to: string; subject: string } | null>(
    params.get("to") ? { to: params.get("to") || "", subject: "" } : null
  );

  useEffect(() => {
    if (!ready || !username) return;
    const listen = (sent: boolean) =>
      onSnapshot(
        query(
          collection(db, "emails"),
          where("mailboxUsername", "==", username),
          where("mailboxType", "==", sent ? "sent" : "received"),
          orderBy("createdAt", "desc"),
          limit(100)
        ),
        (snap) => {
          setLoadError("");
          const list = snap.docs.map((d) => toMail(d, sent));
          if (sent) setSentBox(list);
          else setInbox(list);
        },
        (err) => {
          setLoadError(err.message || "Could not load mail.");
          if (sent) setSentBox([]);
          else setInbox([]);
        }
      );
    const a = listen(false);
    const b = listen(true);
    return () => {
      a();
      b();
    };
  }, [ready, username]);

  const open = openId ? [...(inbox || []), ...(sentBox || [])].find((m) => m.id === openId) : null;

  // Opening an unread mail marks just that one as read.
  useEffect(() => {
    if (open?.unread) updateDoc(doc(db, "emails", open.id), { read: true }).catch(() => {});
  }, [open?.id, open?.unread]);

  const unreadCount = (inbox || []).filter((m) => m.unread).length;

  if (!ready) return <PageShell light>{null}</PageShell>;

  if (compose && user) {
    return (
      <Compose
        username={username}
        uid={user.uid}
        initial={compose}
        onBack={() => setCompose(null)}
        onSent={() => {
          setCompose(null);
          setOpenId(null);
          setTab("sent");
        }}
      />
    );
  }

  if (open) {
    return (
      <ReadMail
        mail={open}
        onBack={() => setOpenId(null)}
        onReply={() =>
          setCompose({
            to: open.other,
            subject: /^re:/i.test(open.subject) ? open.subject : `Re: ${open.subject}`.slice(0, SUBJECT_MAX),
          })
        }
        onDeleted={() => setOpenId(null)}
      />
    );
  }

  const mails = tab === "sent" ? sentBox : inbox;
  const q = search.trim().toLowerCase();
  const shown = (mails || []).filter(
    (m) => !q || m.other.toLowerCase().includes(q) || m.subject.toLowerCase().includes(q) || m.body.toLowerCase().includes(q)
  );

  return (
    <PageShell light>
      <section className="relative mx-auto max-w-2xl pb-28">
        <div className="relative overflow-hidden rounded-b-[26px] bg-gradient-to-br from-[#0B1F3A] via-[#174EA6] to-[#3F8EEA] px-2.5 pb-3.5 pt-2 text-white sm:mt-3 sm:rounded-[26px]">
          <span className="pointer-events-none absolute -right-16 -top-20 h-44 w-44 rounded-full bg-white/[0.07]" />
          <div className="relative flex items-center gap-1">
            <BackButton variant="dark" onClick={() => router.back()} className="mr-1.5" />
            <div className="min-w-0 flex-1">
              <h1 className="text-[22px] font-extrabold">✉️ Email</h1>
              <p className="text-xs text-white/75">@{username}</p>
            </div>
            {unreadCount > 0 && (
              <span className="rounded-full bg-[#F2B53A] px-2.5 py-1 text-xs font-extrabold text-[#0B1F3A]">{unreadCount} new</span>
            )}
          </div>
          <label className="relative mt-3 flex items-center gap-2 rounded-[14px] border border-white/25 bg-white/[0.16] px-3 py-2.5">
            <span className="text-sm">🔍</span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search mail"
              className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/60"
            />
            {search && (
              <button type="button" onClick={() => setSearch("")} className="text-sm">
                ✕
              </button>
            )}
          </label>
          <div className="relative mt-3 flex rounded-full bg-white/[0.14] p-1">
            {(["inbox", "sent"] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setTab(k)}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-full py-2 text-sm font-bold ${
                  tab === k ? "bg-white text-[#0B1F3A]" : "text-white"
                }`}
              >
                {k === "inbox" ? "📥 Inbox" : "📤 Sent"}
                {k === "inbox" && unreadCount > 0 && (
                  <span
                    className={`rounded-full px-[7px] text-[11px] font-extrabold ${
                      tab === k ? "bg-[#174EA6] text-white" : "bg-white text-[#0B1F3A]"
                    }`}
                  >
                    {unreadCount}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2 px-3 pt-3">
          {loadError && (
            <p className="rounded-[14px] border border-[#B3261E]/35 bg-[#B3261E]/10 p-3 text-xs text-[#B3261E]">⚠️ {loadError}</p>
          )}
          {mails === null ? (
            <p className="py-12 text-center text-sm text-[#6B7A99]">Loading…</p>
          ) : shown.length === 0 ? (
            <div className="flex flex-col items-center px-6 pt-14 text-center">
              <span className="flex h-24 w-24 items-center justify-center rounded-full bg-[#174EA6]/10 text-[42px]">
                {q ? "🔎" : tab === "sent" ? "📤" : "📭"}
              </span>
              <p className="mt-3.5 text-[17px] font-bold text-[#0B1F3A]">
                {q ? "No mail matches your search" : tab === "sent" ? "No sent mail yet" : "Your inbox is empty"}
              </p>
              <p className="mt-1 text-[13px] text-gray-500">
                {q ? "Try another name or word." : tab === "sent" ? "Tap Compose to write your first mail." : "Mail from your friends will appear here."}
              </p>
            </div>
          ) : (
            shown.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setOpenId(m.id)}
                className={`flex w-full items-center gap-3 rounded-[18px] bg-white p-3 text-left ${
                  m.unread ? "border-[1.5px] border-[#174EA6]/45 shadow-md" : "border border-[#E3E8F2] shadow-sm"
                }`}
              >
                <Avatar name={m.other} size={46} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className={`flex-1 truncate text-[15px] text-[#0B1F3A] ${m.unread ? "font-extrabold" : "font-semibold"}`}>
                      {m.sent ? `To @${m.other}` : `@${m.other}`}
                    </span>
                    <span className={`text-[11px] ${m.unread ? "font-bold text-[#174EA6]" : "text-gray-500"}`}>{shortTime(m.timeMs)}</span>
                  </span>
                  <span className={`block truncate text-sm text-[#0B1F3A] ${m.unread ? "font-bold" : "font-medium"}`}>{m.subject}</span>
                  {m.body.trim() && <span className="line-clamp-2 text-[12.5px] leading-[17px] text-gray-500">{m.body.replace(/\n/g, " ")}</span>}
                </span>
                {m.unread && <span className="h-[9px] w-[9px] shrink-0 rounded-full bg-[#174EA6]" />}
              </button>
            ))
          )}
        </div>

        <button
          type="button"
          onClick={() => setCompose({ to: "", subject: "" })}
          className="fixed bottom-6 right-5 z-20 flex items-center gap-2 rounded-full bg-gradient-to-r from-[#3F8EEA] via-[#174EA6] to-[#0B1F3A] px-5 py-3.5 text-[15px] font-extrabold text-white shadow-xl lg:right-[max(1.25rem,calc(50%-20rem))]"
        >
          ✏️ Compose
        </button>
      </section>
    </PageShell>
  );
}

function ReadMail({ mail, onBack, onReply, onDeleted }: { mail: Mail; onBack: () => void; onReply: () => void; onDeleted: () => void }) {
  const [deleting, setDeleting] = useState(false);
  const del = () => {
    if (!window.confirm("Delete this mail?\n\nIt will be removed from your mailbox. The other person keeps their copy.")) return;
    setDeleting(true);
    deleteDoc(doc(db, "emails", mail.id))
      .then(onDeleted)
      .catch((e) => {
        setDeleting(false);
        window.alert(e?.message || "Could not delete mail.");
      });
  };
  return (
    <PageShell light>
      <section className="mx-auto max-w-2xl pb-10">
        <TopBar title={mail.sent ? "📤 Sent mail" : "📥 Inbox"} onBack={onBack}>
          <button
            type="button"
            disabled={deleting}
            onClick={del}
            className="flex h-[38px] w-[38px] items-center justify-center rounded-full border border-white/40 bg-white/[0.16]"
          >
            🗑
          </button>
        </TopBar>
        <div className="p-4">
          <h2 className="break-words text-[22px] font-extrabold leading-7 text-[#0B1F3A]">{mail.subject}</h2>
          <div className="mt-3.5 flex items-center gap-3 rounded-[18px] border border-[#E3E8F2] bg-white p-3">
            <Avatar name={mail.other} size={48} />
            <div className="min-w-0">
              <p className="truncate text-[15px] font-bold text-[#0B1F3A]">{mail.sent ? `To @${mail.other}` : `From @${mail.other}`}</p>
              <p className="text-xs text-gray-500">{fullTime(mail.timeMs)}</p>
            </div>
          </div>
          <p className="mt-3 whitespace-pre-wrap break-words rounded-[18px] border border-[#E3E8F2] bg-white p-4 text-[15px] leading-[23px] text-[#0B1F3A]">
            {mail.body || " "}
          </p>
          <div className="mt-[18px] flex gap-2.5">
            {mail.other && (
              <button type="button" onClick={onReply} className="flex-1 rounded-[14px] bg-gradient-to-r from-[#3F8EEA] to-[#174EA6] py-3 text-[15px] font-bold text-white">
                {mail.sent ? "✉️ Write again" : "↩️ Reply"}
              </button>
            )}
            <button
              type="button"
              disabled={deleting}
              onClick={del}
              className="flex-1 rounded-[14px] border border-[#B3261E]/50 bg-[#B3261E]/[0.08] py-3 text-[15px] font-bold text-[#B3261E]"
            >
              {deleting ? "Deleting…" : "🗑 Delete"}
            </button>
          </div>
        </div>
      </section>
    </PageShell>
  );
}

function Compose({
  username,
  uid,
  initial,
  onBack,
  onSent,
}: {
  username: string;
  uid: string;
  initial: { to: string; subject: string };
  onBack: () => void;
  onSent: () => void;
}) {
  const [to, setTo] = useState(initial.to);
  const [subject, setSubject] = useState(initial.subject);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const send = async () => {
    const toClean = to.trim().replace(/^@/, "").trim();
    const subjectClean = subject.trim();
    const bodyClean = body.trim();
    if (!toClean || !subjectClean || !bodyClean) return setError("Please complete To, Subject and Message.");
    setError("");
    setSending(true);
    try {
      // Exact username first, then the same name in any upper/lower case.
      const users = collection(db, "users");
      let found = (await getDocs(query(users, where("username", "==", toClean), limit(1)))).docs[0];
      if (!found) found = (await getDocs(query(users, where("usernameLower", "==", toClean.toLowerCase()), limit(1)))).docs[0];
      const recipient = found ? String(found.get("username") || "").trim() || toClean : "";
      if (!found || !recipient) {
        setSending(false);
        return setError("No user found with that username.");
      }
      const base = {
        fromUid: uid,
        fromUsername: username,
        toUsername: recipient,
        subject: subjectClean,
        message: bodyClean,
        createdAt: serverTimestamp(),
      };
      const batch = writeBatch(db);
      batch.set(doc(collection(db, "emails")), { mailboxType: "sent", mailboxUid: uid, mailboxUsername: username, ...base });
      batch.set(doc(collection(db, "emails")), {
        mailboxType: "received",
        mailboxUid: found.id,
        mailboxUsername: recipient,
        ...base,
        read: false,
      });
      await batch.commit();
      onSent();
    } catch (e: any) {
      setError(e?.message || "Failed to send mail.");
    } finally {
      setSending(false);
    }
  };

  const field = "w-full rounded-[14px] border border-[#DDE3EF] bg-white px-3 py-3 text-base text-[#0B1F3A] outline-none focus:border-[#174EA6]";
  return (
    <PageShell light>
      <section className="mx-auto max-w-2xl pb-10">
        <TopBar title="✏️ New mail" onBack={onBack}>
          <button
            type="button"
            disabled={sending}
            onClick={send}
            className={`rounded-full px-4 py-2 text-sm font-extrabold text-[#0B1F3A] ${sending ? "bg-white/30" : "bg-white"}`}
          >
            {sending ? "Sending…" : "Send ➤"}
          </button>
        </TopBar>
        <div className="space-y-3 p-4">
          <div className="flex items-center gap-2.5">
            <Avatar name={username} size={34} />
            <div>
              <p className="text-[11px] text-gray-500">From</p>
              <p className="text-sm font-bold text-[#0B1F3A]">@{username}</p>
            </div>
          </div>
          <label className="relative block">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[17px] font-extrabold text-[#174EA6]">@</span>
            <input value={to} onChange={(e) => setTo(e.target.value.replace(/\n/g, "").slice(0, 40))} placeholder="To (username)" className={`${field} pl-9`} />
          </label>
          <label className="relative block">
            <span className="absolute left-3 top-1/2 -translate-y-1/2">📝</span>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value.replace(/\n/g, " ").slice(0, SUBJECT_MAX))}
              placeholder="Subject"
              className={`${field} pl-10`}
            />
          </label>
          <p className="-mt-2 text-right text-[11px] text-gray-500">
            {subject.length}/{SUBJECT_MAX}
          </p>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value.slice(0, BODY_MAX))}
            placeholder="Message"
            className={`${field} min-h-[220px]`}
          />
          <p className="-mt-2 text-right text-[11px] text-gray-500">
            {body.length}/{BODY_MAX}
          </p>
          {error && <p className="text-sm text-[#B3261E]">{error}</p>}
        </div>
      </section>
    </PageShell>
  );
}

export default function MailRoute() {
  return (
    <Suspense fallback={null}>
      <MailPage />
    </Suspense>
  );
}
