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
import { EmojiPicker } from "../../_components/EmojiPicker";
import { PageShell } from "../../_components/PageShell";
import { storageSafeSegment, uploadChatImage } from "../../../lib/imageUpload";
import { GiftPanel, loadGiftCatalog, type Gift, type GiftResult } from "../../_components/GiftPanel";

type PrivateMessage = {
  id: string;
  from: string;
  text: string;
  type: string;
  giftName: string;
  giftIcon: string;
  imageUrl: string;
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
  const [gifts, setGifts] = useState<Gift[]>([]);
  const [giftOpen, setGiftOpen] = useState(false);
  const [uploading, setUploading] = useState(false);

  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const stickToBottom = useRef(true);

  const chatId = useMemo(
    () => (username && friend ? privateChatId(username, friend) : ""),
    [username, friend]
  );

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  // The whole conversation (one equality filter, no composite index needed),
  // sorted here. A limit without orderBy would return arbitrary messages.
  useEffect(() => {
    if (!chatId) return;
    return onSnapshot(
      query(collection(db, "private_messages"), where("chatId", "==", chatId)),
      (snap) => {
        setMessages(
          snap.docs
            .map((d) => ({
              id: d.id,
              from: String(d.get("fromUsername") || ""),
              text: String(d.get("text") || ""),
              type: String(d.get("messageType") || ""),
              giftName: String(d.get("giftName") || ""),
              giftIcon: String(d.get("giftIcon") || ""),
              imageUrl: String(d.get("imageUrl") || ""),
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

  // Gift catalog (for the gift panel and gift pictures).
  useEffect(() => {
    if (!user) return;
    loadGiftCatalog()
      .then(setGifts)
      .catch((err) => console.error(err));
  }, [user]);

  const giftImages = useMemo(
    () => new Map(gifts.filter((g) => g.imageUrl).map((g) => [g.name.toLowerCase(), g.imageUrl])),
    [gifts]
  );

  // Coins were already moved by the sendGift function; this only shows the
  // gift in the chat, same document shape as the app (no price in it).
  const showGift = (r: GiftResult) => {
    if (!user) return;
    addDoc(collection(db, "private_messages"), {
      chatId,
      fromUsername: username,
      fromUid: user.uid,
      toUsername: friend,
      text: `${r.giftIcon} ${r.giftName}`,
      messageType: "gift",
      giftName: r.giftName,
      giftIcon: r.giftIcon,
      read: false,
      createdAt: serverTimestamp(),
    }).catch((err) => setError(err?.message || "Gift was sent, but chat display failed."));
    stickToBottom.current = true;
  };

  // 📷 Photo: same Storage folder and message shape as the app.
  const sendPhoto = async (file: File | undefined) => {
    if (!file || !user || !username || uploading) return;
    setUploading(true);
    setError("");
    try {
      const url = await uploadChatImage(`private_images/${storageSafeSegment(chatId)}`, file);
      await addDoc(collection(db, "private_messages"), {
        chatId,
        fromUsername: username,
        fromUid: user.uid,
        toUsername: friend,
        text: "📷 Photo",
        messageType: "image",
        imageUrl: url,
        read: false,
        createdAt: serverTimestamp(),
      });
      stickToBottom.current = true;
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Photo could not be sent.");
    } finally {
      setUploading(false);
    }
  };

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
      <PageShell light>
        <p className="py-20 text-center text-sm text-[#5B6B8C]">Loading…</p>
      </PageShell>
    );
  }

  const status = lastSeenLabel(friendLastActive);

  return (
    <PageShell light bottomNav={false}>
      <div className="mx-auto flex h-[calc(100dvh-53px)] max-w-3xl flex-col px-2 py-3 sm:px-6">
        {/* Header */}
        <div className="flex items-center gap-3 rounded-2xl bg-white px-3 py-2.5 shadow-sm">
          <Link href="/messages" aria-label="Back" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#BFD7F2] text-lg text-[#0B2A5B]">
            ←
          </Link>
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#DCEBFB] font-black text-[#174EA6]">
            {friend.slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <Link href={`/profile/${encodeURIComponent(friend)}`} className="block truncate font-black text-[#0B2A5B] hover:text-[#2F80ED]">
              {friend}
            </Link>
            {status && (
              <p className={`text-xs ${status === "Online" ? "text-emerald-600" : "text-[#6B7A99]"}`}>
                {status === "Online" ? "🟢 Online" : status}
              </p>
            )}
          </div>
        </div>

        {/* Messages */}
        <div className="mt-3 flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-[#CFE3F5] bg-[#E8F4FC]">
          <div
            ref={listRef} data-notranslate
            onScroll={(e) => {
              const el = e.currentTarget;
              stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
            }}
            className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-3"
          >
            {messages.length === 0 && (
              <p className="py-10 text-center text-sm text-[#6B7A99]">Say hi to {friend} 👋</p>
            )}
            {messages.map((m) => {
              const mine = m.from.toLowerCase() === username.toLowerCase();
              return (
                <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm text-[#0B2A5B] shadow-sm ${
                      mine ? "rounded-br-md bg-[#DCEBFB]" : "rounded-bl-md bg-white"
                    }`}
                  >
                    {m.type === "image" && m.imageUrl ? (
                      <a href={m.imageUrl} target="_blank" rel="noreferrer" className="block">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={m.imageUrl} alt="Photo" loading="lazy" className="max-h-72 max-w-full rounded-xl" />
                      </a>
                    ) : m.type === "gift" ? (
                      <div className="flex items-center gap-2 py-1">
                        {giftImages.get((m.giftName || m.text).toLowerCase()) ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={giftImages.get((m.giftName || m.text).toLowerCase())}
                            alt={m.giftName}
                            className="h-10 w-10 object-contain"
                          />
                        ) : (
                          <span className="text-3xl">{m.giftIcon || "🎁"}</span>
                        )}
                        <span className="text-lg font-black text-pink-600">{m.giftName || m.text}</span>
                      </div>
                    ) : (
                      <p className="whitespace-pre-wrap break-words">{m.text}</p>
                    )}
                    <p className="mt-0.5 text-right text-[10px] text-[#8A9BBC]">
                      {timeLabel(m.createdAtMs)}
                      {mine && <span className="ml-1">{m.read ? "✓✓" : "✓"}</span>}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          {error && (
            <p className="border-t border-[#CFE3F5] bg-white px-3 py-2 text-xs text-rose-600">{error}</p>
          )}

          {/* Composer */}
          <div className="flex gap-1.5 border-t border-[#CFE3F5] bg-white p-2 sm:gap-2">
            <button
              type="button"
              onClick={() => setGiftOpen(true)}
              disabled={!username || friend.toLowerCase() === username.toLowerCase()}
              title={`Send ${friend} a gift`}
              className="rounded-xl border border-pink-200 bg-pink-50 px-2.5 text-lg sm:px-3 disabled:opacity-40"
            >
              🎁
            </button>
            <label
              title="Send a photo"
              className={`flex cursor-pointer items-center rounded-xl border border-[#D5E3F5] bg-[#F4F9FF] px-2.5 text-lg sm:px-3 hover:bg-[#EAF4FE] ${
                uploading || !username || friend.toLowerCase() === username.toLowerCase()
                  ? "pointer-events-none opacity-40"
                  : ""
              }`}
            >
              {uploading ? "⏳" : "📷"}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  sendPhoto(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </label>
            <EmojiPicker inputRef={inputRef} value={text} onChange={(v) => setText(v.slice(0, 2000))} />
            <input
              ref={inputRef}
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
              className="min-w-0 flex-1 rounded-full border border-[#D5E3F5] bg-[#F4F9FF] px-4 py-3 text-sm text-[#0B2A5B] outline-none placeholder:text-[#8A9BBC] focus:border-[#2F80ED] sm:px-4"
            />
            <button
              type="button"
              onClick={send}
              disabled={sending || !text.trim() || !username}
              className="rounded-full bg-[#2F80ED] px-4 text-sm font-bold text-white disabled:opacity-40 sm:px-5"
            >
              <span className="sm:hidden">➤</span>
              <span className="hidden sm:inline">Send</span>
            </button>
          </div>
        </div>
      </div>

      {giftOpen && (
        <GiftPanel
          roomId={`private_${chatId}`}
          uid={user.uid}
          gifts={gifts}
          people={[friend]}
          initialTarget={friend}
          fixedTarget
          onClose={() => setGiftOpen(false)}
          onSent={showGift}
        />
      )}
    </PageShell>
  );
}
