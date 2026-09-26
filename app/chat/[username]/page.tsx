"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  addDoc,
  collection,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
  type Timestamp,
} from "firebase/firestore";
import { db } from "../../../lib/firebase";
import { useCurrentUser } from "../../../lib/useCurrentUser";
import { lastSeenLabel, privateChatId } from "../../../lib/privateChat";
import { PageShell } from "../../_components/PageShell";

type PrivateMessage = {
  id: string;
  from: string;
  text: string;
  read: boolean;
  createdAtMs: number;
};

function toMillis(value: unknown): number {
  const ts = value as Timestamp | null | undefined;
  return ts && typeof ts.toMillis === "function" ? ts.toMillis() : 0;
}

function timeLabel(ms: number): string {
  if (!ms) return "";
  const d = new Date(ms);
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay
    ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function PrivateChatPage() {
  const params = useParams<{ username: string }>();
  const friend = decodeURIComponent(params.username).trim();
  const router = useRouter();
  const { user, username, loading } = useCurrentUser();

  const [messages, setMessages] = useState<PrivateMessage[]>([]);
  const [friendLastActive, setFriendLastActive] = useState(0);
  const [, setNow] = useState(0);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);

  const listRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  const chatId = useMemo(
    () => (username && friend ? privateChatId(username, friend) : ""),
    [username, friend]
  );

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  // The conversation (same query as the app: one equality filter, sorted here).
  useEffect(() => {
    if (!chatId) return;
    return onSnapshot(
      query(collection(db, "private_messages"), where("chatId", "==", chatId), limit(300)),
      (snap) => {
        setMessages(
          snap.docs
            .map((d) => ({
              id: d.id,
              from: String(d.get("fromUsername") || ""),
              text: String(d.get("text") || ""),
              read: d.get("read") === true,
              createdAtMs: toMillis(d.get("createdAt", { serverTimestamps: "estimate" })),
            }))
            .sort((a, b) => a.createdAtMs - b.createdAtMs)
        );

        // Mark what the friend sent me as read.
        snap.docs.forEach((d) => {
          if (d.get("toUsername") === username && d.get("read") === false) {
            updateDoc(d.ref, { read: true }).catch(() => {});
          }
        });
      },
      (err) => console.error("private chat listener failed", err)
    );
  }, [chatId, username]);

  // Friend's "Online / Last seen" (users.lastActiveAt).
  useEffect(() => {
    if (!user || !friend) return;
    return onSnapshot(
      query(collection(db, "users"), where("username", "==", friend), limit(1)),
      (snap) => setFriendLastActive(toMillis(snap.docs[0]?.get("lastActiveAt")))
    );
  }, [user, friend]);

  // Refresh the "Last seen 5m ago" label every 30 s.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const el = listRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const send = async () => {
    const clean = text.trim();
    if (!clean || !user || !username || sending) return;
    if (friend.toLowerCase() === username.toLowerCase()) {
      setError("You cannot message yourself.");
      return;
    }

    setSending(true);
    setError("");
    try {
      await addDoc(collection(db, "private_messages"), {
        chatId,
        fromUsername: username,
        fromUid: user.uid,
        toUsername: friend,
        text: clean.slice(0, 2000),
        read: false,
        createdAt: serverTimestamp(),
      });
      setText("");
      stickToBottom.current = true;
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Could not send message.");
    } finally {
      setSending(false);
    }
  };

  if (loading || !user) {
    return (
      <PageShell>
        <p className="py-20 text-center text-sm text-white/40">Loading…</p>
      </PageShell>
    );
  }

  const status = lastSeenLabel(friendLastActive);

  return (
    <PageShell>
      <div className="mx-auto flex h-[calc(100dvh-73px)] max-w-3xl flex-col px-2 py-3 sm:px-6">
        {/* Header */}
        <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
          <Link href="/messages" className="text-sm text-white/60 hover:text-white">
            ←
          </Link>
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-cyan-400 font-black">
            {friend.slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <Link href={`/profile/${encodeURIComponent(friend)}`} className="block truncate font-black hover:text-cyan-300">
              {friend}
            </Link>
            {status && (
              <p className={`text-xs ${status === "Online" ? "text-emerald-300" : "text-white/40"}`}>
                {status === "Online" ? "🟢 Online" : status}
              </p>
            )}
          </div>
        </div>

        {/* Messages */}
        <div className="mt-3 flex min-h-0 flex-1 flex-col rounded-2xl border border-white/10 bg-black/20">
          <div
            ref={listRef}
            onScroll={(e) => {
              const el = e.currentTarget;
              stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
            }}
            className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-3"
          >
            {messages.length === 0 && (
              <p className="py-10 text-center text-sm text-white/30">Say hi to {friend} 👋</p>
            )}
            {messages.map((m) => {
              const mine = m.from.toLowerCase() === username.toLowerCase();
              return (
                <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                      mine ? "rounded-br-md bg-blue-500/30" : "rounded-bl-md bg-white/[0.07]"
                    }`}
                  >
                    <p className="whitespace-pre-wrap break-words">{m.text}</p>
                    <p className="mt-0.5 text-right text-[10px] text-white/35">
                      {timeLabel(m.createdAtMs)}
                      {mine && <span className="ml-1">{m.read ? "✓✓" : "✓"}</span>}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          {error && (
            <p className="border-t border-white/10 px-3 py-2 text-xs text-red-300">{error}</p>
          )}

          {/* Composer */}
          <div className="flex gap-2 border-t border-white/10 p-2">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              maxLength={2000}
              placeholder={`Message ${friend}`}
              className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none placeholder:text-white/25 focus:border-cyan-300/50"
            />
            <button
              type="button"
              onClick={send}
              disabled={sending || !text.trim() || !username}
              className="rounded-xl bg-gradient-to-r from-blue-500 to-cyan-400 px-5 text-sm font-bold disabled:opacity-40"
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
