"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Timestamp,
} from "firebase/firestore";
import { getDownloadURL, ref as storageRef, uploadBytes } from "firebase/storage";
import { db, storage } from "../../../lib/firebase";
import { useCurrentUser } from "../../../lib/useCurrentUser";
import { lastSeenLabel, privateChatId } from "../../../lib/privateChat";
import { chatLockedFor, lockedChatText } from "../../../lib/privacy";
import { PageShell } from "../../_components/PageShell";
import { EmojiPicker } from "../../_components/EmojiPicker";
import { withEmotes } from "../../_components/Emote";
import { storageSafeSegment, uploadChatImage } from "../../../lib/imageUpload";
import { GiftPanel, loadGiftCatalog, type Gift } from "../../_components/GiftPanel";
import { BackButton } from "../../_components/BackButton";
import { ReactionShakeEmoji } from "../../_components/ReactionShakeEmoji";
import { chatPx, useChatTextSize } from "../../../lib/chatTextSize";
import { useIsClassic } from "../../../lib/uiStyle";
import { GiftImg } from "../../_components/GiftImg";
import { openReport } from "../../_components/ReportDialog";
import { VoiceRecorder } from "../../_components/VoiceRecorder";
import { PhotoGlyph, SEND_BG, SendGlyph } from "../../_components/ChatBar";
import { saveBlockedNames, watchBlockedNames } from "../../../lib/blocks";

// 1:1 chat, like the app's PrivateChatPage: bubbles (mine blue, theirs
// white), tap a message to reply, long-press for reactions, ⋮ menu with
// Send File / Send Gift / Clear Chat / View Profile / Send Credit / Block /
// Report / Close Chat, and 🎤 voice messages.

type PrivateMessage = {
  id: string;
  from: string;
  text: string;
  type: string;
  giftName: string;
  giftIcon: string;
  imageUrl: string;
  fileUrl: string;
  fileName: string;
  fileSize: number;
  audioUrl: string;
  durationSec: number;
  read: boolean;
  reactions: Record<string, string[]>;
  createdAtMs: number;
};

const REACTIONS = ["😂", "❤️", "👍", "😮", "😢"];
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const BLOCKED_EXT = new Set(["apk", "apks", "xapk", "exe", "msi", "bat", "cmd", "scr", "vbs", "jar", "sh", "dex"]);

function toMillis(value: unknown): number {
  const ts = value as Timestamp | null | undefined;
  return ts && typeof ts.toMillis === "function" ? ts.toMillis() : 0;
}

const timeLabel = (ms: number) => (ms ? new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "");

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

const clearKey = (chatId: string) => `migwith.chatCleared.${chatId}`;

export default function PrivateChatPage() {
  const params = useParams<{ username: string }>();
  const friend = decodeURIComponent(params.username).trim();
  const router = useRouter();
  const { user, username, loading } = useCurrentUser();
  // Emotes the same size as in room chat (Settings → Chat text size), like the app.
  const emoteFontPx = chatPx(useChatTextSize());

  const classic = useIsClassic();
  const [messages, setMessages] = useState<PrivateMessage[]>([]);
  // 😊 emotes open under the input bar (like the app's emoji box)
  const [emoteSlot, setEmoteSlot] = useState<HTMLDivElement | null>(null);
  const [friendLastActive, setFriendLastActive] = useState(0);
  const [, setNow] = useState(0);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [gifts, setGifts] = useState<Gift[]>([]);
  const [giftOpen, setGiftOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [reply, setReply] = useState<{ label: string; snippet: string } | null>(null);
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [voiceActive, setVoiceActive] = useState(false);
  const [clearedAt, setClearedAt] = useState(0);
  const [viewImage, setViewImage] = useState<string | null>(null);
  // 🚫 I blocked this person (users/{me}.blockedUsers): their messages are hidden and I can't write to them.
  const [blockedList, setBlockedList] = useState<string[]>([]);

  // 🔒 They locked their profile and I am not their friend → I can't write to them.
  const [lockedOut, setLockedOut] = useState(false);

  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const photoRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const stickToBottom = useRef(true);
  const marked = useRef(new Set<string>());
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressed = useRef(false);

  const chatId = useMemo(() => (username && friend ? privateChatId(username, friend) : ""), [username, friend]);
  const self = !!username && friend.toLowerCase() === username.toLowerCase();

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  // "Clear Chat" only hides older messages on this device, like the app.
  useEffect(() => {
    if (!chatId) return;
    try {
      setClearedAt(Number(localStorage.getItem(clearKey(chatId)) || 0));
    } catch {
      setClearedAt(0);
    }
  }, [chatId]);

  // The NEWEST 300 messages (needs chatId + createdAt index; until it exists
  // the unordered 300 are used, like the app).
  useEffect(() => {
    if (!chatId) return;
    const map = (docs: { id: string; get: (k: string, o?: any) => any }[]) =>
      docs
        .map((d) => ({
          id: d.id,
          from: String(d.get("fromUsername") || ""),
          text: String(d.get("text") || ""),
          type: String(d.get("messageType") || ""),
          giftName: String(d.get("giftName") || ""),
          giftIcon: String(d.get("giftIcon") || ""),
          imageUrl: String(d.get("imageUrl") || ""),
          fileUrl: String(d.get("fileUrl") || ""),
          fileName: String(d.get("fileName") || ""),
          fileSize: Number(d.get("fileSize") ?? -1),
          audioUrl: String(d.get("audioUrl") || ""),
          durationSec: Number(d.get("durationSec") || 0),
          read: d.get("read") === true,
          reactions: Object.fromEntries(
            Object.entries((d.get("reactions") || {}) as Record<string, unknown>)
              .map(([k, v]) => [k, Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []] as const)
              .filter(([, v]) => v.length > 0)
          ),
          createdAtMs: toMillis(d.get("createdAt", { serverTimestamps: "estimate" })),
        }))
        .sort((a, b) => a.createdAtMs - b.createdAtMs);
    let fallback: (() => void) | null = null;
    const off = onSnapshot(
      query(collection(db, "private_messages"), where("chatId", "==", chatId), orderBy("createdAt", "desc"), limit(300)),
      (snap) => setMessages(map(snap.docs)),
      (err) => {
        console.error("Newest-first chat needs an index:", err);
        if (fallback) return;
        fallback = onSnapshot(
          query(collection(db, "private_messages"), where("chatId", "==", chatId), limit(300)),
          (snap) => setMessages(map(snap.docs)),
          (e) => console.error("private chat listener failed", e)
        );
      }
    );
    return () => {
      off();
      fallback?.();
    };
  }, [chatId]);

  // Mark what the friend sent me as read.
  useEffect(() => {
    messages.forEach((m) => {
      if (m.from.toLowerCase() === friend.toLowerCase() && !m.read && !marked.current.has(m.id)) {
        marked.current.add(m.id);
        updateDoc(doc(db, "private_messages", m.id), { read: true }).catch(() => {});
      }
    });
  }, [messages, friend]);

  useEffect(() => {
    if (!user) return;
    return watchBlockedNames(user.uid, setBlockedList);
  }, [user]);
  const blocked = blockedList.some((b) => b.trim().toLowerCase() === friend.toLowerCase());
  const setBlock = async (on: boolean) => {
    if (!user) return;
    const next = on
      ? Array.from(new Set([...blockedList, friend]))
      : blockedList.filter((b) => b.trim().toLowerCase() !== friend.toLowerCase());
    try {
      await saveBlockedNames(user.uid, next);
    } catch (e: any) {
      setError(e?.message || "Could not save.");
    }
  };

  // 🔒 Profile lock check (again whenever they write to me: then I may answer).
  const theirMsgCount = messages.filter((m) => m.from.toLowerCase() === friend.toLowerCase() && m.type !== "gift").length;
  useEffect(() => {
    if (!username || !friend) return;
    let live = true;
    chatLockedFor(username, friend).then((v) => live && setLockedOut(v));
    return () => {
      live = false;
    };
  }, [username, friend, theirMsgCount]);

  // Friend's "Online / Last seen" (users.lastActiveAt).
  useEffect(() => {
    if (!user || !friend) return;
    return onSnapshot(query(collection(db, "users"), where("username", "==", friend), limit(1)), (snap) =>
      setFriendLastActive(toMillis(snap.docs[0]?.get("lastActiveAt", { serverTimestamps: "estimate" })))
    );
  }, [user, friend]);

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

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const visible = messages.filter(
    (m) => (m.createdAtMs || Number.MAX_SAFE_INTEGER) > clearedAt && !(blocked && m.from.toLowerCase() === friend.toLowerCase())
  );

  // Keeps the newest message in view: after every new message, and again
  // when a photo inside the list finishes loading and makes it taller.
  const scrollToBottom = () => {
    const el = listRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  };
  const lastId = visible[visible.length - 1]?.id || "";
  useLayoutEffect(scrollToBottom, [visible.length, lastId]);

  // The message box grows with the text, up to 4 lines.
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    // Empty: one line, whatever the hint text does in a narrow box.
    if (!text) {
      el.style.height = "";
      return;
    }
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 88)}px`;
  }, [text]);

  const base = () => ({ chatId, fromUsername: username, fromUid: user?.uid || "", toUsername: friend, read: false, createdAt: serverTimestamp() });

  const send = async () => {
    const clean = text.trim();
    if (!clean || !user || !username) return;
    if (self) return setError("You cannot message yourself.");
    if (blocked) return setError(`You blocked ${friend}. Unblock to send a message.`);
    if (lockedOut) return setError(lockedChatText(friend));
    // "/gift GiftName [-m message]" — the gift panel does the sending.
    if (/^\/gift\b/i.test(clean)) {
      setText("");
      setReply(null);
      setGiftOpen(true);
      return;
    }
    const finalText = reply ? `↩ ${reply.snippet}\n${clean}` : clean;
    setText("");
    setReply(null);
    setError("");
    stickToBottom.current = true;
    addDoc(collection(db, "private_messages"), { ...base(), text: finalText.slice(0, 2000) }).catch((err) =>
      setError(err?.message || "Could not send message.")
    );
  };

  // 📷 Photo: same Storage folder and message shape as the app.
  const sendPhoto = async (file: File | undefined) => {
    if (!file || !user || !username || uploading || self) return;
    if (lockedOut) return setError(lockedChatText(friend));
    setUploading(true);
    setError("");
    try {
      const url = await uploadChatImage(`private_images/${storageSafeSegment(chatId)}`, file);
      await addDoc(collection(db, "private_messages"), { ...base(), text: "📷 Photo", messageType: "image", imageUrl: url });
      stickToBottom.current = true;
    } catch (err: any) {
      setError(err?.message || "Photo could not be sent.");
    } finally {
      setUploading(false);
    }
  };

  // 📎 File (not programs), up to 10 MB — private_files/, like the app.
  const sendFile = async (file: File | undefined) => {
    if (!file || !user || !username || uploading || self) return;
    if (lockedOut) return setError(lockedChatText(friend));
    if (file.type.startsWith("image/")) return sendPhoto(file);
    const ext = (file.name.split(".").pop() || "").toLowerCase();
    if (file.name.includes(".") && BLOCKED_EXT.has(ext)) return setError(`That type of file (.${ext}) can't be sent.`);
    if (file.size > MAX_FILE_BYTES)
      return setError(`That file is ${formatBytes(file.size)}. The limit is ${formatBytes(MAX_FILE_BYTES)} — please send a smaller one.`);
    setUploading(true);
    setError("");
    try {
      const stem = file.name.includes(".") ? file.name.slice(0, file.name.lastIndexOf(".")) : file.name;
      const safeExt = ext.replace(/[^a-z0-9]/g, "").slice(0, 8);
      const objectName = `${crypto.randomUUID()}_${storageSafeSegment(stem)}${safeExt ? `.${safeExt}` : ""}`;
      const r = storageRef(storage, `private_files/${storageSafeSegment(chatId)}/${objectName}`);
      await uploadBytes(r, file, { contentType: file.type || "application/octet-stream" });
      const url = await getDownloadURL(r);
      await addDoc(collection(db, "private_messages"), {
        ...base(),
        text: `📎 ${file.name}`,
        messageType: "file",
        fileUrl: url,
        fileName: file.name,
        fileSize: file.size,
      });
      stickToBottom.current = true;
    } catch (err: any) {
      setError(`File failed: ${err?.message || "please try again."}`);
    } finally {
      setUploading(false);
    }
  };

  // 🎤 Voice: stored next to Send File's files (private_files/), message
  // shape { messageType: "voice", audioUrl, durationSec }, like the app.
  const sendVoice = async (audio: Blob, seconds: number) => {
    if (!user || !username || self) return;
    if (blocked) throw new Error(`You blocked ${friend}. Unblock to send a message.`);
    if (lockedOut) throw new Error(lockedChatText(friend));
    const type = audio.type || "audio/webm";
    const ext = type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm";
    const r = storageRef(storage, `private_files/${storageSafeSegment(chatId)}/voice_${crypto.randomUUID()}.${ext}`);
    await uploadBytes(r, audio, { contentType: type });
    const url = await getDownloadURL(r);
    stickToBottom.current = true;
    await addDoc(collection(db, "private_messages"), {
      ...base(),
      text: "🎤 Voice message",
      messageType: "voice",
      audioUrl: url,
      durationSec: seconds,
    });
  };

  // One reaction per person per message: the same emoji again clears it,
  // another one moves it.
  const react = (m: PrivateMessage, emoji: string) => {
    const uid = user?.uid;
    if (!uid) return;
    const ref = doc(db, "private_messages", m.id);
    const previous = Object.entries(m.reactions).find(([, uids]) => uids.includes(uid))?.[0];
    if (previous === emoji) {
      updateDoc(ref, { [`reactions.${emoji}`]: arrayRemove(uid) }).catch(() => {});
      return;
    }
    const updates: Record<string, unknown> = { [`reactions.${emoji}`]: arrayUnion(uid) };
    if (previous) updates[`reactions.${previous}`] = arrayRemove(uid);
    updateDoc(ref, updates).catch(() => setDoc(ref, { reactions: { [emoji]: [uid] } }, { merge: true }).catch(() => {}));
  };

  const startReply = (label: string, body: string) => {
    if (!body.trim()) return;
    setReply({ label, snippet: body.length > 60 ? body.slice(0, 60) + "…" : body });
    inputRef.current?.focus();
  };

  const clearChat = () => {
    if (!window.confirm(`Clear chat?\n\nThis clears the chat on this device only. ${friend} will still have it.`)) return;
    const latest = messages.reduce((a, m) => Math.max(a, m.createdAtMs), 0);
    setClearedAt(latest);
    try {
      localStorage.setItem(clearKey(chatId), String(latest));
    } catch {
      // storage blocked
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
  const online = status === "Online";
  const menu: [string, string, () => void][] = [
    ["📎", "Send File", () => (lockedOut ? setError(lockedChatText(friend)) : fileRef.current?.click())],
    ["🎁", "Send Gift", () => (lockedOut ? setError(lockedChatText(friend)) : setGiftOpen(true))],
    ["🧹", "Clear Chat", clearChat],
    ["👤", "View Profile", () => router.push(`/profile/${encodeURIComponent(friend)}`)],
    ["💰", "Send Credit", () => router.push(`/wallet?to=${encodeURIComponent(friend)}`)],
    blocked ? ["✓", `Unblock ${friend}`, () => setBlock(false)] : ["🚫", `Block ${friend}`, () => setBlock(true)],
    ["🚩", `Report ${friend}`, () => openReport({ kind: "user", targetUsername: friend })],
    ["🚪", "Close Chat", () => router.push("/messages")],
  ];

  return (
    <PageShell light bottomNav={false}>
      <div className="mx-auto flex h-screen-minus-bar max-w-3xl flex-col bg-gradient-to-b from-[#D6ECFB] to-[#BFE0F7] sm:my-3 sm:overflow-hidden sm:rounded-3xl">
        {/* Header */}
        <div className="flex items-center gap-2.5 rounded-b-3xl bg-gradient-to-r from-[#0B2A5B] to-[#15589B] px-3.5 py-2 shadow-lg">
          <BackButton variant="dark" href="/messages" />
          <span className="relative h-11 w-11 shrink-0">
            <span className="flex h-full w-full items-center justify-center rounded-full border-2 border-[#FFE08A] bg-gradient-to-br from-[#E9C55A] to-[#D4AF37] text-lg font-extrabold text-white">
              {(friend[0] || "?").toUpperCase()}
            </span>
            {online && <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-[#0B2A5B] bg-[#4CD97B]" />}
          </span>
          <div className="min-w-0 flex-1">
            <Link href={`/profile/${encodeURIComponent(friend)}`} className="block truncate text-[19px] font-bold text-white" data-notranslate>
              {friend || "Chat"}
            </Link>
            <p className={`truncate text-[11px] ${online ? "text-[#4CD97B]" : "text-[#B9C4DD]"}`}>{status}</p>
          </div>
        </div>

        {/* Messages */}
        <div
          ref={listRef}
          data-notranslate
          onLoadCapture={scrollToBottom}
          onScroll={(e) => {
            const el = e.currentTarget;
            stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
          }}
          className="min-h-0 flex-1 space-y-2 overflow-y-auto overflow-x-hidden overscroll-x-none px-3.5 py-3"
        >
          {visible.length === 0 && <p className="pt-10 text-center text-[15px] text-[#35507E]">Say hi to {friend} 👋</p>}
          {visible.map((m) => {
            const mine = m.from.toLowerCase() === username.toLowerCase();
            const label = mine ? "You" : friend;
            // 📟 Classic: every line on the LEFT as "name: message", your own name
            // too, no bubbles (blue for you, orange for them).
            const mineRight = mine && !classic;
            const pmName = mine ? username : friend;
            const pmNameColor = mine ? "#2F6ABD" : "#F07A00";
            let quote: string | null = null;
            let body = m.text;
            if (body.startsWith("↩ ") && body.includes("\n")) {
              quote = body.slice(2, body.indexOf("\n"));
              body = body.slice(body.indexOf("\n") + 1);
            }
            const ink = mineRight ? "text-white" : "text-[#12233F]";
            const sub = mineRight ? "text-white/75" : "text-[#6D7A90]";
            return (
              <div key={m.id} className={`flex flex-col ${mineRight ? "items-end" : "items-start"}`}>
                {pickerFor === m.id && (
                  <div className="mb-1.5 flex items-center gap-2 rounded-full bg-[#1E2A47] px-2.5 py-1.5">
                    {REACTIONS.map((e) => (
                      <button
                        key={e}
                        type="button"
                        onClick={() => {
                          react(m, e);
                          setPickerFor(null);
                        }}
                        className={`text-xl ${m.reactions[e]?.includes(user.uid) ? "rounded-full bg-[#3984D9]/40 p-0.5" : ""}`}
                      >
                        {e}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => {
                        startReply(label, body);
                        setPickerFor(null);
                      }}
                      className="text-[13px] font-bold text-[#FFC04A]"
                    >
                      Reply
                    </button>
                    {!mine && (
                      <button
                        type="button"
                        onClick={() => {
                          setPickerFor(null);
                          openReport({
                            kind: "private_message",
                            targetUsername: friend,
                            messageId: m.id,
                            preview: m.type === "image" ? "📷 Photo" : m.type === "file" ? "📎 File" : body.slice(0, 200),
                          });
                        }}
                        className="text-[13px] font-bold text-[#FF8A80]"
                      >
                        🚩 Report
                      </button>
                    )}
                  </div>
                )}
                <div
                  onPointerDown={() => {
                    longPressed.current = false;
                    pressTimer.current = setTimeout(() => {
                      longPressed.current = true;
                      setPickerFor((p) => (p === m.id ? null : m.id));
                    }, 450);
                  }}
                  onPointerUp={() => pressTimer.current && clearTimeout(pressTimer.current)}
                  onPointerLeave={() => pressTimer.current && clearTimeout(pressTimer.current)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setPickerFor((p) => (p === m.id ? null : m.id));
                  }}
                  onClick={() => {
                    if (longPressed.current) return;
                    if (m.type !== "image" && m.type !== "file") startReply(label, body);
                  }}
                  className={`cursor-pointer select-none ${
                    classic
                      ? "w-full px-1 py-[3px]"
                      : mine
                        ? "max-w-[260px] rounded-[18px] rounded-br-[4px] bg-gradient-to-br from-[#3B8BE6] to-[#1F63C4] px-3.5 py-2.5 shadow-sm"
                        : "max-w-[260px] rounded-[18px] rounded-bl-[4px] bg-gradient-to-br from-white to-[#F1F7FD] px-3.5 py-2.5 shadow-sm"
                  }`}
                >
                  {/* Classic: "name:" over pictures, files and gifts (text lines get it at the start). */}
                  {classic && (m.type === "image" || m.type === "file" || m.type === "gift") && (
                    <p data-notranslate className="text-sm font-bold" style={{ color: pmNameColor }}>
                      {pmName}:
                    </p>
                  )}
                  {quote && (
                    <p className={`mb-1.5 line-clamp-2 rounded-lg px-2 py-1 text-xs ${mineRight ? "bg-black/[0.18] text-white/85" : "bg-[#1F63C4]/10 text-[#12233F]/85"}`}>
                      {quote}
                    </p>
                  )}
                  {m.type === "image" && m.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={m.imageUrl}
                      alt="Photo"
                      loading="lazy"
                      onClick={(e) => {
                        e.stopPropagation();
                        setViewImage(m.imageUrl);
                      }}
                      className="max-h-64 max-w-full rounded-xl"
                    />
                  ) : m.type === "voice" && m.audioUrl ? (
                    <div className="flex items-center gap-2 py-0.5" onClick={(e) => e.stopPropagation()}>
                      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-base ${mineRight ? "bg-white/20" : "bg-[#1F63C4]/10"}`}>
                        🎤
                      </span>
                      <audio controls preload="metadata" src={m.audioUrl} className="h-9 w-[200px] max-w-full" />
                      {m.durationSec > 0 && <span className={`text-[11px] font-bold ${sub}`}>{m.durationSec}s</span>}
                    </div>
                  ) : m.type === "file" ? (
                    <a
                      href={m.fileUrl || undefined}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="flex items-center gap-2.5 py-0.5"
                    >
                      <span className={`flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full text-lg ${mineRight ? "bg-white/20" : "bg-[#1F63C4]/10"}`}>
                        📎
                      </span>
                      <span className="min-w-0 max-w-[170px]">
                        <span className={`line-clamp-2 text-sm font-semibold ${ink}`}>{m.fileName || m.text.replace(/^📎 /, "")}</span>
                        <span className={`block text-[11px] ${sub}`}>{m.fileSize >= 0 ? `${formatBytes(m.fileSize)} • Tap to open` : "Tap to open"}</span>
                      </span>
                    </a>
                  ) : m.type === "gift" ? (
                    <span className="flex items-center gap-1.5">
                      {giftImages.get((m.giftName || m.text).toLowerCase()) ? (
                        <GiftImg
                          src={giftImages.get((m.giftName || m.text).toLowerCase()) || ""}
                          fallback={m.giftIcon || "🎁"}
                          className="h-5 w-5 rounded-full object-cover"
                        />
                      ) : (
                        <span className="text-xl">{m.giftIcon || "🎁"}</span>
                      )}
                      <span className={`text-xl font-bold ${ink}`}>{m.giftName || m.text}</span>
                    </span>
                  ) : (
                    <p className={`whitespace-pre-wrap break-words text-[15px] ${ink}`}>
                      {classic && (
                        <b data-notranslate style={{ color: pmNameColor }}>
                          {pmName}:{" "}
                        </b>
                      )}
                      {withEmotes(body, emoteFontPx)}
                    </p>
                  )}
                  {m.createdAtMs > 0 && <p className={`mt-0.5 text-[9px] ${sub}`}>{timeLabel(m.createdAtMs)}</p>}
                </div>
                {Object.keys(m.reactions).length > 0 && (
                  <div className="mt-1 flex gap-1">
                    {Object.entries(m.reactions).map(([e, uids]) => (
                      <button
                        key={e}
                        type="button"
                        onClick={() => react(m, e)}
                        className={`rounded-xl px-2 py-0.5 text-xs text-white ${uids.includes(user.uid) ? "bg-[#3984D9]/40" : "bg-[#1E2A47]"}`}
                      >
                        <ReactionShakeEmoji emoji={e} count={uids.length} /> {uids.length}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {error && <p className="px-3.5 py-1 text-xs text-[#B3261E]">{error}</p>}

        {lockedOut && !blocked && (
          <div className="bg-[#FFF8E1] px-3.5 py-2 text-[13px] font-semibold text-[#7A5A00]">{lockedChatText(friend)}</div>
        )}

        {blocked && (
          <div className="flex items-center gap-2 bg-[#FFF4F3] px-3.5 py-2 text-[13px] text-[#8A1C14]">
            <span className="flex-1">🚫 You blocked {friend}. Their messages are hidden.</span>
            <button type="button" onClick={() => setBlock(false)} className="rounded-full bg-white px-3 py-1 text-xs font-bold text-[#174EA6] shadow-sm">
              Unblock
            </button>
          </div>
        )}

        {reply && (
          <div className="flex items-center bg-white px-3.5 py-2">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-[#0B5CA8]">Replying to {reply.label}</p>
              <p className="truncate text-xs text-[#52627A]">{reply.snippet}</p>
            </div>
            <button type="button" onClick={() => setReply(null)} className="pl-2 text-base text-[#52627A]" aria-label="Cancel reply">
              ✕
            </button>
          </div>
        )}

        {/* Input bar: ⋮ menu, a rounded message box (photo, text, emoji) and
            🎤 voice, which turns into ➤ send as soon as something is typed. */}
        <div className="keep-round relative mx-2 mb-2 flex items-end gap-1.5 rounded-[28px] bg-white px-2 py-2 shadow-[0_4px_16px_rgba(11,42,91,.14)]">
          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className="flex h-11 w-9 items-center justify-center rounded-full text-[22px] font-bold text-[#35507E] hover:bg-[#EEF4FB]"
              aria-label="Menu"
            >
              ⋮
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} />
                <div className="absolute bottom-12 left-0 z-40 w-48 overflow-hidden rounded-2xl bg-white py-1 shadow-xl">
                  {menu.map(([icon, label, act], i) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        act();
                      }}
                      className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm font-medium text-[#12233F] hover:bg-[#F4F9FF] ${
                        i > 0 ? "border-t border-[#E8EEF5]" : ""
                      }`}
                    >
                      <span className="text-lg">{icon}</span>
                      {label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          <input ref={photoRef} type="file" accept="image/*" hidden onChange={(e) => (sendPhoto(e.target.files?.[0]), (e.target.value = ""))} />
          <input ref={fileRef} type="file" hidden onChange={(e) => (sendFile(e.target.files?.[0]), (e.target.value = ""))} />
          {!voiceActive && (
            <div className="min-w-0 flex-1 rounded-[24px] bg-gradient-to-r from-[#5B8DEF] via-[#8B6CF0] to-[#3FB6F2] p-[1.5px] shadow-[0_2px_10px_rgba(91,141,239,.18)]">
              <div className="flex min-h-[41px] items-end gap-1 rounded-[22.5px] bg-[#F7FAFF] py-[3px] pl-1 pr-1.5">
                <button
                  type="button"
                  onClick={() => photoRef.current?.click()}
                  disabled={uploading || self}
                  className="flex h-[35px] w-[35px] shrink-0 items-center justify-center rounded-full text-white disabled:opacity-40"
                  style={{ background: "linear-gradient(135deg, #EC4677, #C13A93, #9B3DAB)" }}
                  aria-label="Send a photo"
                >
                  {uploading ? "⏳" : <PhotoGlyph />}
                </button>
                {/* Wraps onto up to 4 lines; Enter still sends (no AutoFill bar, see ChatBar). */}
                <textarea
                  ref={inputRef}
                  rows={1}
                  value={text}
                  onChange={(e) => setText(e.target.value.replace(/[\r\n]+/g, " ").slice(0, 2000))}
                  autoComplete="off"
                  autoCorrect="on"
                  name="migwith-chat-message"
                  enterKeyHint="send"
                  data-1p-ignore
                  data-lpignore="true"
                  data-form-type="other"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      send();
                    }
                  }}
                  placeholder="Message…"
                  className="my-[6.5px] h-[22px] min-w-0 flex-1 resize-none overflow-y-auto bg-transparent px-1.5 py-0 text-[15px] leading-[22px] text-[#12233F] outline-none placeholder:text-[13px] placeholder:text-[#8A9BB5]"
                />
                <span className="flex h-[35px] shrink-0 items-center">
                  <EmojiPicker inputRef={inputRef} value={text} onChange={setText} inline dockTo={emoteSlot} />
                </span>
              </div>
            </div>
          )}
          {text.trim() ? (
            <button
              type="button"
              onClick={send}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white active:scale-95"
              style={SEND_BG}
              aria-label="Send"
            >
              <SendGlyph />
            </button>
          ) : (
            <VoiceRecorder size="lg" disabled={self || blocked || uploading} onSend={sendVoice} onError={setError} onActive={setVoiceActive} />
          )}
        </div>
        <div className="pb-safe" />
        <div ref={setEmoteSlot} />
      </div>

      {viewImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-3" onClick={() => setViewImage(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={viewImage} alt="Photo" className="max-h-full max-w-full object-contain" />
        </div>
      )}

      {giftOpen && (
        <GiftPanel
          roomId={`private_${chatId}`}
          uid={user.uid}
          gifts={gifts}
          people={[friend]}
          initialTarget={friend}
          fixedTarget
          onClose={() => setGiftOpen(false)}
          // The server writes the gift line into the chat (sendGift), like the app.
          onSent={() => {
            stickToBottom.current = true;
          }}
        />
      )}
    </PageShell>
  );
}
