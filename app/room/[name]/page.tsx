"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  limitToLast,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  type Timestamp,
} from "firebase/firestore";
import { db } from "../../../lib/firebase";
import { useCurrentUser } from "../../../lib/useCurrentUser";
import {
  PRESENCE_HEARTBEAT_MS,
  ROOM_PRESENCE_STALE_MS,
  badgeForLevel,
  leaveDocId,
  newVisitId,
  presenceLine,
} from "../../../lib/rooms";
import { PageShell } from "../../_components/PageShell";
import {
  GiftPanel,
  loadGiftCatalog,
  type Gift,
  type GiftResult,
} from "../../_components/GiftPanel";
import { LUXURY_ROOM, LuxuryBetBox, useLuxuryBot } from "../../_components/LuxuryBot";
import { ROYALE_ROOM, RoyaleTable, royaleHandleCommand, useRoyale } from "../../_components/RoyaleGame";
import {
  TEEN_PATTI_ROOM,
  TeenPattiTable,
  teenPattiHandleCommand,
  useTeenPatti,
} from "../../_components/TeenPatti";
import { CRICKET_ROOM, CricketBox, cricketHandleCommand, useCricket } from "../../_components/CricketGame";
import { TN_ROOM, TwentyNineTable, twentyNineHandleCommand, useTwentyNine } from "../../_components/TwentyNine";
import { LOWCARD_ROOM, LowCardBox, lowCardHandleCommand, useLowCard } from "../../_components/LowCard";
import { LUDO_ROOM, LudoTable, ludoHandleCommand, useLudo } from "../../_components/Ludo";
import { handleRoomCommand } from "../../../lib/roomCommands";

type ChatMessage = {
  id: string;
  text: string;
  type: string;
  sender: string;
  senderUid: string;
  imageUrl: string;
  audioUrl: string;
  giftName: string;
  createdAtMs: number;
  local?: boolean;
};

type RoomUser = { uid: string; username: string; level: number; lastSeenMs: number };

type Profile = { username: string; level: number; badge: string };

// A leave that is about to run for a room. Re-entering the same room right away
// (React re-mount, quick navigation back) cancels it instead of posting
// "has left" followed by "has entered".
const pendingLeaves = new Map<string, ReturnType<typeof setTimeout>>();

function toMillis(value: unknown): number {
  const ts = value as Timestamp | null | undefined;
  return ts && typeof ts.toMillis === "function" ? ts.toMillis() : 0;
}

function timeLabel(ms: number): string {
  if (!ms) return "";
  return new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function RoomPage() {
  const params = useParams<{ name: string }>();
  const roomName = decodeURIComponent(params.name);
  const router = useRouter();
  const { user, loading } = useCurrentUser();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [localNotes, setLocalNotes] = useState<ChatMessage[]>([]);
  const [presence, setPresence] = useState<RoomUser[]>([]);
  const [muted, setMuted] = useState(false);
  const [silenced, setSilenced] = useState(false);
  const [blocked, setBlocked] = useState("");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [showUsers, setShowUsers] = useState(false);
  const [gifts, setGifts] = useState<Gift[]>([]);
  const [giftTarget, setGiftTarget] = useState<string | null>(null);

  const listRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  const note = (t: string) =>
    setLocalNotes((n) => [
      ...n,
      {
        id: `local_${Date.now()}_${n.length}`,
        text: t,
        type: "local",
        sender: "",
        senderUid: "",
        imageUrl: "",
        audioUrl: "",
        giftName: "",
        createdAtMs: Date.now(),
        local: true,
      },
    ]);

  // 👻 Luxury Bot round + bets (only in the Luxury Bot room).
  const luxury = useLuxuryBot(roomName === LUXURY_ROOM, user?.uid, note);
  // 👑 MIG Royale round + bets (only in the MIG Royale room).
  const royale = useRoyale(roomName === ROYALE_ROOM, user?.uid, note);
  // 🎴 Teen Patti table (only in the Teen Patti room).
  const teenPatti = useTeenPatti(roomName === TEEN_PATTI_ROOM, user?.uid, note);
  // 🏏 Cricket (only in the Cricket room).
  const cricket = useCricket(roomName === CRICKET_ROOM, user?.uid, note);
  // 🃏 29 table (only in the 29 room).
  const twentyNine = useTwentyNine(roomName === TN_ROOM, user?.uid, note);
  // 🃏 LowCard (only in the LowCard room).
  const lowCard = useLowCard(roomName === LOWCARD_ROOM, user?.uid, note);
  // 🎲 Ludo (only in the Ludo room).
  const ludo = useLudo(roomName === LUDO_ROOM, user?.uid, note);

  // Signed-out visitors go to the login page.
  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  // My profile (username + level for the presence line).
  useEffect(() => {
    if (!user) return;
    getDoc(doc(db, "users", user.uid))
      .then((snap) => {
        const level = Number(snap.get("level") || 1);
        setProfile({
          username: String(snap.get("username") || user.email?.split("@")[0] || ""),
          level,
          badge: String(snap.get("levelBadgeIcon") || badgeForLevel(level)),
        });
      })
      .catch((err) => {
        console.error(err);
        setBlocked("Could not load your profile. Please try again.");
      });
  }, [user]);

  // Gift catalog (for the gift panel and gift pictures in the chat).
  useEffect(() => {
    if (!user) return;
    loadGiftCatalog()
      .then(setGifts)
      .catch((err) => console.error(err));
  }, [user]);

  // Entry level lock (rooms/{room}.lockLevel).
  useEffect(() => {
    if (!profile) return;
    getDoc(doc(db, "rooms", roomName))
      .then((snap) => {
        const lockLevel = Number(snap.get("lockLevel") || 0);
        if (lockLevel > 0 && profile.level < lockLevel) {
          setBlocked(`This room needs level ${lockLevel}. You are level ${profile.level}.`);
        }
      })
      .catch(() => {});
  }, [profile, roomName]);

  // Live chat — the latest 150 messages, same collection the app uses.
  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, "room_messages", roomName, "messages"),
      orderBy("createdAt", "asc"),
      limitToLast(150)
    );
    return onSnapshot(
      q,
      (snap) => {
        setMessages(
          snap.docs.map((d) => ({
            id: d.id,
            text: String(d.get("text") || ""),
            type: String(d.get("type") || "chat"),
            sender: String(d.get("sender") || ""),
            senderUid: String(d.get("senderUid") || ""),
            imageUrl: String(d.get("imageUrl") || ""),
            audioUrl: String(d.get("audioUrl") || ""),
            giftName: String(d.get("giftName") || ""),
            // Pending (just-sent) messages have no server time yet.
            createdAtMs: toMillis(d.get("createdAt", { serverTimestamps: "estimate" })),
          }))
        );
      },
      (err) => console.error("room chat listener failed", err)
    );
  }, [user, roomName]);

  // Who is in the room.
  useEffect(() => {
    if (!user) return;
    return onSnapshot(
      collection(db, "room_presence", roomName, "users"),
      (snap) => {
        setPresence(
          snap.docs
            .filter((d) => d.get("presenceStatus") !== "INVISIBLE")
            .map((d) => ({
              uid: d.id,
              username: String(d.get("username") || ""),
              level: Number(d.get("level") || 1),
              lastSeenMs: toMillis(d.get("lastSeen", { serverTimestamps: "estimate" })),
            }))
        );
      },
      (err) => console.error("presence listener failed", err)
    );
  }, [user, roomName]);

  // Mute / ban / kick / silence (room_moderation), as in the app.
  useEffect(() => {
    if (!user || !profile) return;
    const userRef = doc(db, "room_moderation", roomName, "users", profile.username.toLowerCase());
    const offUser = onSnapshot(userRef, (snap) => {
      setMuted(snap.get("muted") === true);
      if (snap.get("banned") === true) {
        setBlocked("You are banned from this room.");
      } else if (snap.get("kicked") === true) {
        setBlocked("You were kicked from this room.");
        // The kicked person clears their own flag so they can come back later.
        updateDoc(userRef, { kicked: false, updatedAt: serverTimestamp() }).catch(() => {});
      }
    });
    const offRoom = onSnapshot(doc(db, "room_moderation", roomName), (snap) => {
      setSilenced(snap.get("silenced") === true);
    });
    return () => {
      offUser();
      offRoom();
    };
  }, [user, profile, roomName]);

  // Enter the room: presence doc + "has entered", heartbeat, and "has left" on exit.
  useEffect(() => {
    if (!user || !profile || blocked) return;
    const uid = user.uid;
    const presenceRef = doc(db, "room_presence", roomName, "users", uid);
    const leaveKey = `${uid}|${roomName}`;
    let visitId: string | null = null;
    let left = false;
    let heartbeat: ReturnType<typeof setInterval> | null = null;

    const pending = pendingLeaves.get(leaveKey);
    const resumed = pending !== undefined;
    if (pending) {
      clearTimeout(pending);
      pendingLeaves.delete(leaveKey);
    }

    const leave = () => {
      if (left) return;
      left = true;
      deleteDoc(presenceRef).catch(() => {});
      setDoc(doc(db, "room_messages", roomName, "messages", leaveDocId(uid, visitId)), {
        text: presenceLine(roomName, profile.username, profile.level, false),
        sender: profile.username,
        senderUid: uid,
        type: "room_leave",
        createdAt: serverTimestamp(),
      }).catch(() => {});
    };

    (async () => {
      let alreadyHere = resumed;
      try {
        const existing = await getDoc(presenceRef);
        if (existing.exists()) {
          const lastSeen = toMillis(existing.get("lastSeen"));
          const parkedUntil = Number(existing.get("parkedUntil") || 0);
          const fresh =
            lastSeen >= Date.now() - ROOM_PRESENCE_STALE_MS || parkedUntil > Date.now();
          if (fresh) {
            alreadyHere = true;
            visitId = String(existing.get("visitId") || "") || null;
          }
        }
      } catch (err) {
        console.error(err);
      }
      if (left) return;
      visitId = visitId || newVisitId();

      await setDoc(
        presenceRef,
        {
          uid,
          username: profile.username,
          activity: "",
          level: profile.level,
          levelBadgeIcon: profile.badge,
          shopBadges: [],
          presenceStatus: "ONLINE",
          lastSeen: serverTimestamp(),
          visitId,
        },
        { merge: true }
      ).catch((err) => console.error("presence write failed", err));

      if (!alreadyHere && !left) {
        addDoc(collection(db, "room_messages", roomName, "messages"), {
          text: presenceLine(roomName, profile.username, profile.level, true),
          sender: profile.username,
          senderUid: uid,
          type: "room_entry",
          createdAt: serverTimestamp(),
        }).catch((err) => console.error("entry message failed", err));
      }

      heartbeat = setInterval(() => {
        setDoc(presenceRef, { lastSeen: serverTimestamp() }, { merge: true }).catch(() => {});
        updateDoc(doc(db, "users", uid), { lastActiveAt: serverTimestamp() }).catch(() => {});
      }, PRESENCE_HEARTBEAT_MS);
    })();

    const onPageHide = () => leave();
    window.addEventListener("pagehide", onPageHide);

    return () => {
      window.removeEventListener("pagehide", onPageHide);
      if (heartbeat) clearInterval(heartbeat);
      if (left) return;
      pendingLeaves.set(
        leaveKey,
        setTimeout(() => {
          pendingLeaves.delete(leaveKey);
          leave();
        }, 1500)
      );
    };
  }, [user, profile, roomName, blocked]);

  // Merge server messages with this device's own notices, oldest first.
  const shown = useMemo(
    () => [...messages, ...localNotes].sort((a, b) => a.createdAtMs - b.createdAtMs),
    [messages, localNotes]
  );

  // People in the room: fresh presence, and no "has left" newer than their last heartbeat.
  const roomUsers = useMemo(() => {
    const leftAt = new Map<string, number>();
    messages.forEach((m) => {
      if (m.type === "room_leave" && m.senderUid) {
        leftAt.set(m.senderUid, Math.max(leftAt.get(m.senderUid) || 0, m.createdAtMs));
      }
    });
    const cutoff = Date.now() - ROOM_PRESENCE_STALE_MS;
    return presence
      .filter((p) => p.username && p.lastSeenMs >= cutoff)
      .filter((p) => p.uid === user?.uid || (leftAt.get(p.uid) || 0) <= p.lastSeenMs)
      .sort((a, b) => a.username.localeCompare(b.username));
  }, [presence, messages, user]);

  // Keep the view pinned to the newest message unless the reader scrolled up.
  useEffect(() => {
    const el = listRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [shown]);

  const send = async () => {
    const clean = text.trim();
    if (!clean || !user || !profile || sending) return;

    if (luxury && clean.toLowerCase() === "!start") {
      setText("");
      if (luxury.running) note("👻 Luxury Bot: A round is already running.");
      else luxury.start();
      return;
    }

    if (ludo && ludoHandleCommand(ludo, clean, note)) {
      setText("");
      return;
    }

    if (lowCard && lowCardHandleCommand(lowCard, clean, note, 200)) {
      setText("");
      return;
    }

    if (twentyNine && twentyNineHandleCommand(twentyNine, clean, note, 500)) {
      setText("");
      return;
    }

    if (cricket && cricketHandleCommand(cricket, clean, note, 200)) {
      setText("");
      return;
    }

    if (teenPatti && teenPattiHandleCommand(teenPatti, clean, note, 200)) {
      setText("");
      return;
    }

    if (royale && royaleHandleCommand(royale, clean, note)) {
      setText("");
      return;
    }

    if (
      clean.startsWith("/") &&
      handleRoomCommand(clean, {
        username: profile.username,
        uid: user.uid,
        roomName,
        note,
        post: (t, type) => {
          stickToBottom.current = true;
          addDoc(collection(db, "room_messages", roomName, "messages"), {
            text: t,
            sender: profile.username,
            senderUid: user.uid,
            type,
            giftName: "",
            createdAt: serverTimestamp(),
            clientCreatedAt: Date.now(),
          }).catch(() => note("Message could not be sent. Please try again."));
        },
      })
    ) {
      setText("");
      return;
    }

    if (clean.startsWith("/") || clean.startsWith("!")) {
      note("Unknown command. Type /help to see the commands.");
      setText("");
      return;
    }
    if (muted || silenced) {
      note(muted ? "🔇 You are muted in this room." : "🔇 This room is currently silenced.");
      return;
    }

    setSending(true);
    try {
      await addDoc(collection(db, "room_messages", roomName, "messages"), {
        text: `${profile.username}: ${clean}`,
        sender: profile.username,
        senderUid: user.uid,
        type: "chat",
        giftName: "",
        createdAt: serverTimestamp(),
        clientCreatedAt: Date.now(),
      });
      setText("");
      stickToBottom.current = true;
    } catch (err) {
      console.error(err);
      note("Message could not be sent. Please try again.");
    } finally {
      setSending(false);
    }
  };

  // After the server took the coins, announce the gift in the room exactly the
  // way the app does ("<<name [level] gives a Rose 🌹 to friend[12]!>>").
  const announceGift = (r: GiftResult) => {
    if (!user || !profile) return;
    const recipientLevel = roomUsers.find(
      (u) => u.username.toLowerCase() === r.recipient.toLowerCase()
    )?.level;
    const tag = recipientLevel !== undefined ? `[${recipientLevel}]` : "";
    const suffix = r.message ? ` — "${r.message}"` : "";
    addDoc(collection(db, "room_messages", roomName, "messages"), {
      text: `<<${profile.username} [${profile.level}] gives a ${r.giftName} ${r.giftIcon} to ${r.recipient}${tag}!>>${suffix}`,
      sender: profile.username,
      senderUid: user.uid,
      type: "gift",
      giftName: r.giftName,
      createdAt: serverTimestamp(),
      clientCreatedAt: Date.now(),
    }).catch((err) => {
      console.error(err);
      note(`🎁 ${r.giftName} was sent, but the room message failed.`);
    });
    stickToBottom.current = true;
  };

  const giftImages = useMemo(
    () => new Map(gifts.map((g) => [g.name.toLowerCase(), g.imageUrl])),
    [gifts]
  );

  if (loading || !user) {
    return (
      <PageShell>
        <p className="py-20 text-center text-sm text-white/40">Loading…</p>
      </PageShell>
    );
  }

  if (blocked) {
    return (
      <PageShell>
        <div className="mx-auto max-w-md px-4 py-20 text-center">
          <div className="text-4xl">🚫</div>
          <p className="mt-4 font-semibold">{blocked}</p>
          <Link
            href="/rooms"
            className="mt-6 inline-block rounded-2xl border border-white/15 bg-white/5 px-6 py-3 text-sm font-semibold hover:bg-white/10"
          >
            ← Back to rooms
          </Link>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <div className="relative mx-auto flex h-[calc(100dvh-73px)] max-w-5xl flex-col px-2 py-3 sm:px-6">
        {/* Room header */}
        <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
          <Link href="/rooms" className="text-sm text-white/60 hover:text-white">
            ←
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-black">{roomName}</h1>
            <p className="text-xs text-white/40">{roomUsers.length} in this room</p>
          </div>
          <button
            type="button"
            onClick={() => setShowUsers((v) => !v)}
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/70 hover:bg-white/10 lg:hidden"
          >
            👥 {roomUsers.length}
          </button>
        </div>

        <div className="mt-3 flex min-h-0 flex-1 gap-3">
          {/* Messages */}
          <div className="flex min-w-0 flex-1 flex-col rounded-2xl border border-white/10 bg-black/20">
            <div
              ref={listRef}
              onScroll={(e) => {
                const el = e.currentTarget;
                stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
              }}
              className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-3 py-3"
            >
              {shown.length === 0 && (
                <p className="py-10 text-center text-sm text-white/30">No messages yet — say hi 👋</p>
              )}
              {shown.map((m) => (
                <MessageRow
                  key={m.id}
                  m={m}
                  mine={m.senderUid === user.uid}
                  giftImage={giftImages.get(m.giftName.toLowerCase()) || ""}
                />
              ))}
            </div>

            {luxury && <LuxuryBetBox state={luxury} note={note} />}
            {royale && <RoyaleTable state={royale} />}
            {teenPatti && <TeenPattiTable state={teenPatti} uid={user.uid} />}
            {cricket && <CricketBox state={cricket} uid={user.uid} />}
            {twentyNine && <TwentyNineTable state={twentyNine} />}
            {lowCard && <LowCardBox state={lowCard} uid={user.uid} />}
            {ludo && <LudoTable state={ludo} />}

            {/* Composer */}
            <div className="flex gap-2 border-t border-white/10 p-2">
              <button
                type="button"
                onClick={() => setGiftTarget("")}
                title="Send a gift"
                className="rounded-xl border border-pink-400/30 bg-pink-500/10 px-3 text-lg hover:bg-pink-500/20"
              >
                🎁
              </button>
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                maxLength={1000}
                placeholder={muted ? "You are muted" : silenced ? "Room is silenced" : "Type a message"}
                className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none placeholder:text-white/25 focus:border-cyan-300/50"
              />
              <button
                type="button"
                onClick={send}
                disabled={sending || !text.trim() || !profile}
                className="rounded-xl bg-gradient-to-r from-blue-500 to-cyan-400 px-5 text-sm font-bold disabled:opacity-40"
              >
                Send
              </button>
            </div>
          </div>

          {/* People in the room */}
          <aside
            className={`${showUsers ? "block" : "hidden"} absolute inset-x-2 top-[76px] z-20 max-h-[60vh] overflow-y-auto rounded-2xl border border-white/10 bg-[#0b1430] p-3 lg:static lg:block lg:max-h-none lg:w-60 lg:bg-white/[0.04]`}
          >
            <h2 className="mb-2 text-xs font-bold uppercase tracking-widest text-white/40">
              In this room
            </h2>
            <ul className="space-y-1">
              {roomUsers.map((u) => (
                <li key={u.uid} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm">
                  <span>{badgeForLevel(u.level)}</span>
                  <span className="truncate font-semibold">{u.username}</span>
                  <span className="ml-auto text-xs text-white/35">{u.level}</span>
                  {u.uid !== user.uid && (
                    <button
                      type="button"
                      onClick={() => {
                        setGiftTarget(u.username);
                        setShowUsers(false);
                      }}
                      title={`Send ${u.username} a gift`}
                      className="text-sm opacity-60 hover:opacity-100"
                    >
                      🎁
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </aside>
        </div>
      </div>

      {giftTarget !== null && (
        <GiftPanel
          roomId={roomName}
          uid={user.uid}
          gifts={gifts}
          people={roomUsers.filter((u) => u.uid !== user.uid).map((u) => u.username)}
          initialTarget={giftTarget}
          onClose={() => setGiftTarget(null)}
          onSent={announceGift}
        />
      )}
    </PageShell>
  );
}

function MessageRow({ m, mine, giftImage }: { m: ChatMessage; mine: boolean; giftImage: string }) {
  const time = timeLabel(m.createdAtMs);

  if (m.type === "room_entry" || m.type === "room_leave") {
    return (
      <p className={`text-center text-xs ${m.type === "room_entry" ? "text-emerald-300/60" : "text-white/30"}`}>
        {m.text}
      </p>
    );
  }

  if (m.local) {
    return <p className="text-center text-xs text-amber-300/80">{m.text}</p>;
  }

  if (m.type === "moderation" || m.type === "broadcast") {
    return (
      <p className="rounded-lg bg-cyan-400/10 px-3 py-1.5 text-center text-xs font-semibold text-cyan-200">
        {m.text}
      </p>
    );
  }

  if (m.type === "social") {
    return (
      <p className="text-center text-sm font-semibold text-fuchsia-300">
        {m.text.replace(/\*\*/g, "")}
        {time && <span className="ml-2 text-[10px] font-normal text-white/25">{time}</span>}
      </p>
    );
  }

  if (m.type === "me") {
    return (
      <p className="px-3 text-sm italic text-violet-300">
        * {m.sender && m.text.startsWith(`${m.sender}: `) ? `${m.sender} ${m.text.slice(m.sender.length + 2)}` : m.text}
        {time && <span className="ml-2 text-[10px] not-italic text-white/25">{time}</span>}
      </p>
    );
  }

  if (m.type === "gift") {
    const clean = m.text.replace(/^<</, "").replace(/>>/, "");
    return (
      <div className="flex items-center justify-center gap-2 rounded-xl border border-pink-400/30 bg-pink-500/10 px-3 py-2 text-center text-sm font-semibold text-pink-200">
        {giftImage && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={giftImage} alt={m.giftName} className="h-8 w-8 object-contain" />
        )}
        <span className="whitespace-pre-wrap break-words">{clean}</span>
        {time && <span className="text-[10px] font-normal text-white/25">{time}</span>}
      </div>
    );
  }

  // "username: message" → bold name, then the message.
  const split = m.sender && m.text.startsWith(`${m.sender}: `);
  const body = split ? m.text.slice(m.sender.length + 2) : m.text;

  return (
    <div className={`rounded-xl px-3 py-1.5 text-sm ${mine ? "bg-blue-500/15" : "bg-white/[0.04]"}`}>
      {split && (
        <span className={`mr-1 font-bold ${mine ? "text-cyan-300" : "text-blue-300"}`}>{m.sender}:</span>
      )}
      {m.type === "image" && m.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={m.imageUrl} alt="Photo" className="mt-1 max-h-64 rounded-lg" />
      ) : m.type === "voice" && m.audioUrl ? (
        <audio controls src={m.audioUrl} className="mt-1 h-9 max-w-full" />
      ) : (
        <span className="whitespace-pre-wrap break-words text-white/85">{body}</span>
      )}
      {time && <span className="ml-2 text-[10px] text-white/25">{time}</span>}
    </div>
  );
}
