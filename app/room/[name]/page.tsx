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
  getDocs,
  limitToLast,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  type Timestamp,
} from "firebase/firestore";
import { db, storage } from "../../../lib/firebase";
import { useCurrentUser } from "../../../lib/useCurrentUser";
import {
  PRESENCE_HEARTBEAT_MS,
  ROOM_PRESENCE_STALE_MS,
  badgeForLevel,
  leaveDocId,
  newVisitId,
  presenceLine,
  roomHref,
} from "../../../lib/rooms";
import { ChatBar } from "../../_components/ChatBar";
import { SwipeToReply } from "../../_components/SwipeToReply";
import { addOpenRoom, isRoomOpen, readOpenRooms, removeOpenRoom } from "../../../lib/openRooms";
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
import { rememberRecentRoom, useRoomPrefs } from "../../../lib/roomPrefs";
import { storageSafeSegment, uploadChatImage } from "../../../lib/imageUpload";
import { VoiceRecorder } from "../../_components/VoiceRecorder";
import { getDownloadURL, ref as storageRef, uploadBytes } from "firebase/storage";
import {
  EMPTY_ROOM,
  banUser,
  handleModCommand,
  kickUser,
  muteUser,
  normRole,
  roomInfoFrom,
  roomPerms,
  setModerator,
  type ModContext,
  type RoomInfo,
} from "../../../lib/roomModeration";

type ChatMessage = {
  id: string;
  text: string;
  type: string;
  sender: string;
  senderUid: string;
  imageUrl: string;
  audioUrl: string;
  giftName: string;
  moderationColor?: string;
  createdAtMs: number;
  local?: boolean;
};

type RoomUser = { uid: string; username: string; level: number; lastSeenMs: number };

// invisible: logged in as Invisible (users.isInvisible) — no presence doc,
// no heartbeat, no "has entered/left". quiet: that, or Presence Status
// "INVISIBLE", which still writes presence but hides the announcements.
type Profile = { username: string; level: number; badge: string; role: string; invisible: boolean; quiet: boolean };

// A leave that is about to run for a room. Re-entering the same room right away
// (React re-mount, quick navigation back) cancels it instead of posting
// "has left" followed by "has entered".
// Someone counts towards a room being FULL only while their presence is fresh
// (heartbeat every 20 s), same 3 minutes as the app.
const ROOM_FULL_FRESH_MS = 3 * 60 * 1000;

const pendingLeaves = new Map<string, ReturnType<typeof setTimeout>>();

function toMillis(value: unknown): number {
  const ts = value as Timestamp | null | undefined;
  return ts && typeof ts.toMillis === "function" ? ts.toMillis() : 0;
}

function timeLabel(ms: number): string {
  if (!ms) return "";
  return new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

// When this visit to the room began (server time), kept per room in this
// browser so switching tabs or reloading while still in the room keeps it.
// Only messages sent after it are shown, like the app: a new visit (after
// Leave) starts with an empty chat instead of the old messages.
type EntryMark = { visitId: string; at: number };
const entryKey = (uid: string, room: string) => `migwith.roomEntry.${uid}.${room}`;
function savedEntry(uid: string, room: string): EntryMark | null {
  try {
    const v = JSON.parse(localStorage.getItem(entryKey(uid, room)) || "null");
    return v && typeof v.at === "number" && typeof v.visitId === "string" ? v : null;
  } catch {
    return null;
  }
}
function saveEntry(uid: string, room: string, mark: EntryMark) {
  try {
    localStorage.setItem(entryKey(uid, room), JSON.stringify(mark));
  } catch {
    // storage blocked
  }
}

export default function RoomPage() {
  const params = useParams<{ name: string }>();
  const roomName = decodeURIComponent(params.name);
  const router = useRouter();
  const { user, loading } = useCurrentUser();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  // Start of this visit (see savedEntry); null until known.
  const [sinceMs, setSinceMs] = useState<number | null>(null);
  useEffect(() => setSinceMs(null), [roomName]);
  const [localNotes, setLocalNotes] = useState<ChatMessage[]>([]);
  const [presence, setPresence] = useState<RoomUser[]>([]);
  const [muted, setMuted] = useState(false);
  const [silenced, setSilenced] = useState(false);
  const [locked, setLocked] = useState(false);
  const [roomInfo, setRoomInfo] = useState<RoomInfo>(EMPTY_ROOM);
  const [roomLoaded, setRoomLoaded] = useState(false);
  const [modLoaded, setModLoaded] = useState(false);
  const [myModLoaded, setMyModLoaded] = useState(false);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [voiceActive, setVoiceActive] = useState(false);
  const [blocked, setBlocked] = useState("");
  const [text, setText] = useState("");
  // Swipe right on someone's message to reply (same "↩ name: snippet" quote the app writes).
  const [replyTo, setReplyTo] = useState<{ sender: string; snippet: string } | null>(null);
  const [sending, setSending] = useState(false);
  const [showUsers, setShowUsers] = useState(false);
  // ⋮ Room menu (like the app's) and its Room Info / Kick User sheets.
  const [menuOpen, setMenuOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [kickOpen, setKickOpen] = useState(false);
  const { favorites, toggleFavorite } = useRoomPrefs();
  const [gifts, setGifts] = useState<Gift[]>([]);
  const [giftTarget, setGiftTarget] = useState<string | null>(null);

  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Leaves this room now (the ✕ on the room tab).
  const leaveRef = useRef<(() => void) | null>(null);
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
          role: normRole(snap.get("role")),
          invisible: snap.get("isInvisible") === true,
          quiet: snap.get("isInvisible") === true || String(snap.get("presenceStatus") || "").toUpperCase() === "INVISIBLE",
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

  // The room document: owner, mods, entry level (official rooms may have none).
  useEffect(() => {
    if (!user) return;
    return onSnapshot(
      doc(db, "rooms", roomName),
      (snap) => {
        setRoomInfo(snap.exists() ? roomInfoFrom(snap.data()) : EMPTY_ROOM);
        setRoomLoaded(true);
      },
      () => setRoomLoaded(true)
    );
  }, [user, roomName]);

  // Latest room document for the entry effect (which must not re-run on every edit).
  const roomInfoRef = useRef(roomInfo);
  roomInfoRef.current = roomInfo;

  const perms = useMemo(
    () => roomPerms(roomInfo, user?.uid || "", profile?.username || "", profile?.role || ""),
    [roomInfo, user, profile]
  );
  const permsRef = useRef(perms);
  permsRef.current = perms;
  const lockedRef = useRef(locked);
  lockedRef.current = locked;

  // Kicked, banned, full or not allowed in: the tab closes.
  useEffect(() => {
    if (blocked && user) removeOpenRoom(user.uid, roomName);
  }, [blocked, user, roomName]);

  // Entry level and room lock — admins / mods of this room are not held back.
  useEffect(() => {
    if (!profile || !roomLoaded || !modLoaded || perms.bypassesEntry) return;
    if (roomInfo.lockLevel > 0 && profile.level < roomInfo.lockLevel) {
      setBlocked(`This room needs level ${roomInfo.lockLevel}. You are level ${profile.level}.`);
    } else if (locked) {
      setBlocked("🔒 This room is locked. Only admins and mods can enter right now.");
    }
  }, [profile, roomLoaded, modLoaded, perms.bypassesEntry, roomInfo.lockLevel, locked]);

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
            moderationColor: String(d.get("moderationColor") || ""),
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
    const offUser = onSnapshot(
      userRef,
      (snap) => {
        setMuted(snap.get("muted") === true);
        if (snap.get("banned") === true) {
          setBlocked("You are banned from this room.");
        } else if (snap.get("kicked") === true) {
          setBlocked("You were kicked from this room.");
          // The kicked person clears their own flag so they can come back later.
          updateDoc(userRef, { kicked: false, updatedAt: serverTimestamp() }).catch(() => {});
        }
        // Set together with "blocked", so a banned person never gets as far as entering.
        setMyModLoaded(true);
      },
      () => setMyModLoaded(true)
    );
    const offRoom = onSnapshot(
      doc(db, "room_moderation", roomName),
      (snap) => {
        setSilenced(snap.get("silenced") === true);
        setLocked(snap.get("locked") === true);
        setModLoaded(true);
      },
      () => setModLoaded(true)
    );
    return () => {
      offUser();
      offRoom();
    };
  }, [user, profile, roomName]);

  // Enter the room: presence doc + "has entered", heartbeat, and "has left" on exit.
  useEffect(() => {
    if (!user || !profile || blocked || !roomLoaded || !modLoaded || !myModLoaded) return;
    // Checked here too: the effect that sets "blocked" runs in the same commit,
    // too late to stop this one from posting "has entered".
    const info = roomInfoRef.current;
    if (
      !permsRef.current.bypassesEntry &&
      ((info.lockLevel > 0 && profile.level < info.lockLevel) || lockedRef.current)
    ) {
      return;
    }
    const uid = user.uid;
    const presenceRef = doc(db, "room_presence", roomName, "users", uid);
    const leaveKey = `${uid}|${roomName}`;
    let visitId: string | null = null;
    let left = false;
    let disposed = false; // this effect was cleaned up (a leave may be pending)
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
      if (profile.invisible) return;
      deleteDoc(presenceRef).catch(() => {});
      if (profile.quiet) return;
      setDoc(doc(db, "room_messages", roomName, "messages", leaveDocId(uid, visitId)), {
        text: presenceLine(roomName, profile.username, profile.level, false),
        sender: profile.username,
        senderUid: uid,
        type: "room_leave",
        createdAt: serverTimestamp(),
      }).catch(() => {});
    };

    (async () => {
      // Invisible: read the room without showing up in it (same as the app).
      if (profile.invisible) {
        // No presence doc to stamp, so the browser clock marks the visit.
        const saved = savedEntry(uid, roomName);
        const at = saved && isRoomOpen(uid, roomName) ? saved.at : Date.now() - 30_000;
        saveEntry(uid, roomName, { visitId: "invisible", at });
        setSinceMs(at);
        rememberRecentRoom(roomName);
        addOpenRoom(uid, roomName);
        return;
      }
      let alreadyHere = resumed;
      let existingMarkerMs = 0;
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
            existingMarkerMs = toMillis(existing.get("entryMarker"));
          }
        }
      } catch (err) {
        console.error(err);
      }
      if (left) return;

      // A level-based private room only holds its capacity. The owner, migwith
      // and anyone already inside are always let in (same rule as the app).
      if (
        !alreadyHere &&
        roomInfoRef.current.capacityEnforced &&
        roomInfoRef.current.ownerUid !== uid &&
        profile.username.trim().toLowerCase() !== "migwith"
      ) {
        try {
          const snap = await getDocs(collection(db, "room_presence", roomName, "users"));
          const fresh = Date.now() - ROOM_FULL_FRESH_MS;
          const inside = snap.docs.filter(
            (d) => d.id !== uid && toMillis(d.get("lastSeen")) >= fresh
          ).length;
          const max = roomInfoRef.current.maxUsers;
          if (inside >= max) {
            left = true; // nothing to clean up — we never went in
            setBlocked(`"${roomName}" is full (${max}/${max}). Please try again later.`);
            return;
          }
        } catch (err) {
          console.error("room full check failed", err);
        }
        if (left) return;
      }

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
          // A new visit gets a server-time mark (the app does the same).
          ...(alreadyHere ? {} : { entryMarker: serverTimestamp() }),
        },
        { merge: true }
      ).catch((err) => console.error("presence write failed", err));

      // Where this visit's chat starts.
      if (alreadyHere) {
        const saved = savedEntry(uid, roomName);
        const at = saved && saved.visitId === visitId ? saved.at : existingMarkerMs || Date.now() - 30_000;
        saveEntry(uid, roomName, { visitId: visitId!, at });
        if (!disposed) setSinceMs(at);
      } else {
        let at = Date.now() - 30_000;
        try {
          const mark = toMillis((await getDoc(presenceRef)).get("entryMarker"));
          if (mark) at = mark;
        } catch {
          // offline — the browser clock will do
        }
        saveEntry(uid, roomName, { visitId: visitId!, at });
        if (!disposed) setSinceMs(at);
      }

      rememberRecentRoom(roomName);
      if (!left) addOpenRoom(uid, roomName);

      if (!alreadyHere && !left && !profile.quiet) {
        addDoc(collection(db, "room_messages", roomName, "messages"), {
          text: presenceLine(roomName, profile.username, profile.level, true),
          sender: profile.username,
          senderUid: uid,
          type: "room_entry",
          createdAt: serverTimestamp(),
        }).catch((err) => console.error("entry message failed", err));
      }

      // Left while we were still entering: the cleanup already ran, so don't
      // start a heartbeat nothing would ever stop.
      if (left || disposed) return;
      heartbeat = setInterval(() => {
        setDoc(presenceRef, { lastSeen: serverTimestamp() }, { merge: true }).catch(() => {});
        updateDoc(doc(db, "users", uid), { lastActiveAt: serverTimestamp() }).catch(() => {});
      }, PRESENCE_HEARTBEAT_MS);
    })();

    leaveRef.current = leave;
    const onPageHide = () => leave();
    window.addEventListener("pagehide", onPageHide);

    return () => {
      disposed = true;
      window.removeEventListener("pagehide", onPageHide);
      if (heartbeat) clearInterval(heartbeat);
      if (left) return;
      // Still an open tab: moving to another page or room keeps you in here.
      if (isRoomOpen(uid, roomName)) return;
      pendingLeaves.set(
        leaveKey,
        setTimeout(() => {
          pendingLeaves.delete(leaveKey);
          leave();
        }, 1500)
      );
    };
  }, [user, profile, roomName, blocked, roomLoaded, modLoaded, myModLoaded]);

  // Merge server messages with this device's own notices, oldest first.
  // Same display rules as the app (RoomPage.kt): your own entered/left lines
  // are hidden from you, and one person's "has entered" (or "has left") never
  // shows twice in a row — a second copy can come from an older app version or
  // a second device, and entered/left always alternate per person.
  const myUid = user?.uid;
  const shown = useMemo(() => {
    const last = new Map<string, string>();
    return [...messages.filter((m) => sinceMs !== null && m.createdAtMs > sinceMs), ...localNotes]
      .sort((a, b) => a.createdAtMs - b.createdAtMs)
      .filter((m) => {
        if (m.type !== "room_entry" && m.type !== "room_leave") return true;
        if (myUid && m.senderUid === myUid) return false;
        const who = m.sender.trim().toLowerCase() || m.senderUid;
        if (!who) return true;
        const keep = last.get(who) !== m.type;
        last.set(who, m.type);
        return keep;
      });
  }, [messages, localNotes, myUid, sinceMs]);

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

  // Everything the moderator commands and the ⋯ menu need.
  const modCtx = (): ModContext | null => {
    if (!user || !profile) return null;
    const write = (data: Record<string, unknown>) =>
      addDoc(collection(db, "room_messages", roomName, "messages"), {
        sender: profile.username,
        senderUid: user.uid,
        createdAt: serverTimestamp(),
        ...data,
      }).catch(() => note("Message could not be sent. Please try again."));
    return {
      roomName,
      username: profile.username,
      room: roomInfo,
      perms,
      people: roomUsers.map((u) => ({ uid: u.uid, username: u.username })),
      note,
      post: (t, type = "chat") => write({ text: t, type, giftName: "", clientCreatedAt: Date.now() }),
      postModeration: (t, color) => write({ text: t, type: "moderation", moderationColor: color }),
    };
  };

  // 📷 Photo message: same Storage folder and message shape as the app.
  const sendPhoto = async (file: File | undefined) => {
    if (!file || !user || !profile || uploading) return;
    if (!perms.canShareMedia) return note(`${roomName}: Photos are turned off in this room.`);
    if (muted || (silenced && !perms.canRoomWide)) {
      return note(muted ? "🔇 You are muted in this room." : "🔇 This room is currently silenced.");
    }
    setUploading(true);
    try {
      const url = await uploadChatImage(`room_images/${storageSafeSegment(roomName)}`, file);
      await addDoc(collection(db, "room_messages", roomName, "messages"), {
        text: `${profile.username}: 📷 Photo`,
        sender: profile.username,
        senderUid: user.uid,
        type: "image",
        imageUrl: url,
        createdAt: serverTimestamp(),
      });
      stickToBottom.current = true;
    } catch (err: any) {
      console.error(err);
      note(`${roomName}: ${err?.message || "Photo could not be sent."}`);
    } finally {
      setUploading(false);
    }
  };

  // 🎤 Voice message: same Storage folder and message shape as the app.
  const sendVoice = async (audio: Blob) => {
    if (!user || !profile) return;
    if (!perms.canShareMedia) throw new Error("Voice messages are turned off in this room.");
    if (muted || (silenced && !perms.canRoomWide)) {
      throw new Error(muted ? "🔇 You are muted in this room." : "🔇 This room is currently silenced.");
    }
    const type = audio.type || "audio/webm";
    const ext = type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm";
    const r = storageRef(storage, `room_audio/${storageSafeSegment(roomName)}/${crypto.randomUUID()}.${ext}`);
    await uploadBytes(r, audio, { contentType: type });
    const url = await getDownloadURL(r);
    await addDoc(collection(db, "room_messages", roomName, "messages"), {
      text: `${profile.username}: 🎤 Voice message`,
      sender: profile.username,
      senderUid: user.uid,
      type: "voice",
      audioUrl: url,
      createdAt: serverTimestamp(),
    });
    stickToBottom.current = true;
  };

  const send = async () => {
    const clean = text.trim();
    if (!clean || !user || !profile || sending) return;

    // Moderator commands come before mute / silence, as in the app.
    const ctx = clean.startsWith("/") ? modCtx() : null;
    if (ctx && handleModCommand(clean, ctx)) {
      setText("");
      return;
    }

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
          // /me, /hug, /roll … are seen by everyone, so mute / silence apply.
          if (muted || (silenced && !perms.canRoomWide)) {
            note(muted ? "🔇 You are muted in this room." : "🔇 This room is currently silenced.");
            return;
          }
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

    // "!" commands belong to the game rooms (handled above); elsewhere "!hi" is chat.
    if (clean.startsWith("/")) {
      note("Unknown command. Type /help to see the commands.");
      setText("");
      return;
    }
    if (muted || (silenced && !perms.canRoomWide)) {
      note(muted ? "🔇 You are muted in this room." : "🔇 This room is currently silenced.");
      return;
    }

    setSending(true);
    try {
      await addDoc(collection(db, "room_messages", roomName, "messages"), {
        text: `${profile.username}: ${replyTo ? `↩ ${replyTo.sender}: ${replyTo.snippet}\n` : ""}${clean}`,
        sender: profile.username,
        senderUid: user.uid,
        type: "chat",
        giftName: "",
        createdAt: serverTimestamp(),
        clientCreatedAt: Date.now(),
      });
      setText("");
      setReplyTo(null);
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
      <PageShell light>
        <p className="py-20 text-center text-sm text-[#5B6B8C]">Loading…</p>
      </PageShell>
    );
  }

  if (blocked) {
    return (
      <PageShell light>
        <div className="mx-auto max-w-md px-4 py-20 text-center">
          <div className="text-4xl">🚫</div>
          <p className="mt-4 font-semibold">{blocked}</p>
          <Link
            href="/rooms"
            className="mt-6 inline-block rounded-2xl bg-[#2F80ED] px-6 py-3 text-sm font-semibold text-white shadow"
          >
            ← Back to rooms
          </Link>
        </div>
      </PageShell>
    );
  }

  // Leave: close this room's tab, leave it and go to another open room.
  const leaveRoom = () => {
    removeOpenRoom(user.uid, roomName);
    leaveRef.current?.();
    const next = readOpenRooms(user.uid).slice(-1)[0];
    router.push(next ? roomHref(next) : "/rooms");
  };

  // Clear Chat: empties this browser's view of the room; newer messages keep coming.
  const clearChat = () => {
    const newest = messages.reduce((a, m) => Math.max(a, m.createdAtMs), sinceMs ?? 0);
    setSinceMs(newest);
    setLocalNotes([]);
    const saved = savedEntry(user.uid, roomName);
    if (saved) saveEntry(user.uid, roomName, { ...saved, at: newest });
  };

  const checkBalance = async () => {
    try {
      const snap = await getDoc(doc(db, "users", user.uid));
      note(`💰 Your balance: ${Number(snap.get("balance") || 0).toLocaleString()} coins`);
    } catch {
      note("Could not read your balance. Please try again.");
    }
  };

  const favorite = favorites.includes(roomName);
  const menuItems: [string, string, () => void, boolean?][] = [
    ["ℹ️", "Room Info", () => setInfoOpen(true)],
    [favorite ? "💔" : "❤️", favorite ? "Remove from favorites" : "Add to favorites", () => toggleFavorite(roomName)],
    ["🧹", "Clear Chat", clearChat],
    ["💰", "Check Balance", checkBalance],
    ["🎁", "Send Gift", () => setGiftTarget("")],
    ["👥", `Participants (${roomUsers.length})`, () => setShowUsers(true)],
    ...(perms.canKick ? ([["👢", "Kick User", () => setKickOpen(true)]] as [string, string, () => void][]) : []),
    ["🚪", "Leave Room", leaveRoom, true],
  ];

  return (
    <PageShell light bottomNav={false}>
      <div className="relative mx-auto flex h-screen-minus-bar max-w-5xl flex-col px-2 pt-2 sm:px-6 sm:py-3">
        <div className="flex min-h-0 flex-1 gap-3">
          {/* Messages */}
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-t-2xl border border-b-0 border-[#CFE3F5] bg-[#E8F4FC] sm:rounded-b-2xl sm:border-b">
            <div
              ref={listRef} data-notranslate
              onScroll={(e) => {
                const el = e.currentTarget;
                stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
              }}
              className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 py-3"
            >
              {/* Room cards, like the app: manager, welcome text, who is here */}
              <div className="space-y-1.5 pb-1">
                <p className="rounded-xl border border-[#1B8F7A] bg-gradient-to-r from-[#1FA2B8] to-[#2FAE85] px-3.5 py-2.5 text-[15px] text-white">
                  👥 This room is managed by: {roomInfo.ownerName || "migwith"}
                </p>
                {roomInfo.description && (
                  <p className="whitespace-pre-wrap rounded-xl border border-[#1B8F7A] bg-gradient-to-r from-[#1FA2B8] to-[#2FAE85] px-3.5 py-2.5 text-[15px] text-white">
                    {roomInfo.description}
                  </p>
                )}
                {locked && (
                  <p className="rounded-xl border border-[#D85A30] bg-[#4A1B0C] px-3.5 py-2.5 text-[13px] font-bold text-[#F0997B]">
                    🔒 This room is locked. Only admins/mods can enter until it&apos;s unlocked.
                  </p>
                )}
                <div className="rounded-xl border border-[#1B8F7A] bg-gradient-to-r from-[#1FA2B8] to-[#2FAE85] px-3.5 py-2.5 text-[15px]">
                  <p className="text-white">👫 Currently in this room:</p>
                  {roomUsers.length > 0 && <p className="mt-1 text-black">{roomUsers.map((u) => u.username).join(", ")}</p>}
                </div>
              </div>
              {shown.map((m) => (
                <MessageRow
                  key={m.id}
                  m={m}
                  mine={m.senderUid === user.uid}
                  giftImage={giftImages.get(m.giftName.toLowerCase()) || ""}
                  onReply={(sender, snippet) => {
                    setReplyTo({ sender, snippet });
                    inputRef.current?.focus();
                  }}
                />
              ))}
            </div>

            {/* Game tables keep their dark look */}
            {(luxury || royale || teenPatti || cricket || twentyNine || lowCard || ludo) && (
              <div data-noswipe className="bg-[#0B1F3A] text-white">
                {luxury && <LuxuryBetBox state={luxury} note={note} />}
                {royale && <RoyaleTable state={royale} />}
                {teenPatti && <TeenPattiTable state={teenPatti} uid={user.uid} />}
                {cricket && <CricketBox state={cricket} uid={user.uid} />}
                {twentyNine && <TwentyNineTable state={twentyNine} />}
                {lowCard && <LowCardBox state={lowCard} uid={user.uid} />}
                {ludo && <LudoTable state={ludo} />}
              </div>
            )}

            {/* Text bar, like the app's */}
            <ChatBar
              text={text}
              setText={setText}
              inputRef={inputRef}
              onSend={send}
              canSend={!sending && !!text.trim() && !!profile}
              placeholder={muted ? "You are muted" : silenced ? "Room is silenced" : "Type a message..."}
              maxLength={1000}
              disabled={!profile}
              onGift={() => setGiftTarget("")}
              onMore={() => setMenuOpen(true)}
              photo={{
                onFile: sendPhoto,
                disabled: !perms.canShareMedia,
                uploading,
                title: perms.canShareMedia ? "Send a photo" : "Photos are turned off in this room",
              }}
              voice={
                <VoiceRecorder
                  disabled={!profile || !perms.canShareMedia}
                  onSend={sendVoice}
                  onError={(m) => note(`${roomName}: ${m}`)}
                  onActive={setVoiceActive}
                />
              }
              voiceActive={voiceActive}
              reply={replyTo && { ...replyTo, onCancel: () => setReplyTo(null) }}
            />
          </div>

          {/* People in the room */}
          <aside
            className={`${showUsers ? "block" : "hidden"} absolute inset-x-2 top-2 z-20 max-h-[60vh] overflow-y-auto rounded-2xl border border-[#CFE3F5] bg-white p-3 shadow-lg lg:static lg:block lg:max-h-none lg:w-60 lg:shadow-sm`}
          >
            <div className="mb-2 flex items-center">
              <h2 className="flex-1 text-xs font-bold uppercase tracking-widest text-[#35507E]">
                In this room ({roomUsers.length})
              </h2>
              <button type="button" onClick={() => setShowUsers(false)} aria-label="Close" className="px-1 text-lg text-[#6B7A99] lg:hidden">
                ✕
              </button>
            </div>
            <ul className="space-y-1" data-notranslate>
              {roomUsers.map((u) => (
                <li key={u.uid} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm">
                  <span>{badgeForLevel(u.level)}</span>
                  <Link
                    href={`/profile/${encodeURIComponent(u.username)}`}
                    className="truncate font-semibold text-[#0B2A5B] hover:text-[#2F80ED]"
                  >
                    {u.username}
                  </Link>
                  {(() => {
                    const k = u.username.toLowerCase();
                    if (roomInfo.ownerUid && u.uid === roomInfo.ownerUid) return <span title="Room owner">👑</span>;
                    if (roomInfo.superMods.includes(k)) return <span title="Super Mod">🌟</span>;
                    if (roomInfo.moderators.includes(k)) return <span title="Moderator">⭐</span>;
                    return null;
                  })()}
                  <span className="ml-auto text-xs text-[#6B7A99]">{u.level}</span>
                  {u.uid !== user.uid && (perms.canKick || perms.canBan || perms.canMute || perms.canManagePrivate) && (
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setMenuFor(menuFor === u.uid ? null : u.uid)}
                        title="Moderate"
                        className="rounded px-1 text-[#5B6B8C] hover:bg-[#EAF4FE] hover:text-[#0B2A5B]"
                      >
                        ⋯
                      </button>
                      {menuFor === u.uid && (
                        <div className="absolute right-0 top-6 z-30 w-40 overflow-hidden rounded-xl border border-[#D5E3F5] bg-white text-sm text-[#0B2A5B] shadow-xl">
                          {(
                            [
                              perms.canKick && ["👢 Kick", (c: ModContext) => kickUser(c, u.username)],
                              perms.canBan && ["🚫 Ban", (c: ModContext) => banUser(c, u.username, true)],
                              perms.canMute && ["🔇 Mute", (c: ModContext) => muteUser(c, u.username, true)],
                              perms.canMute && ["🔊 Unmute", (c: ModContext) => muteUser(c, u.username, false)],
                              perms.isUserRoom &&
                                perms.canManagePrivate &&
                                (roomInfo.moderators.includes(u.username.toLowerCase())
                                  ? ["🛑 Remove Mod", (c: ModContext) => setModerator(c, u.username, false)]
                                  : ["⭐ Make Mod", (c: ModContext) => setModerator(c, u.username, true)]),
                            ].filter(Boolean) as [string, (c: ModContext) => unknown][]
                          ).map(([label, run]) => (
                            <button
                              key={label}
                              type="button"
                              onClick={() => {
                                setMenuFor(null);
                                const c = modCtx();
                                if (c) run(c);
                              }}
                              className="block w-full px-3 py-2 text-left hover:bg-[#EAF4FE]"
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
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

      {/* ⋮ Room menu */}
      {menuOpen && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/40 p-2 pb-safe" onClick={() => setMenuOpen(false)}>
          <div className="w-[62%] min-w-[230px] max-w-[280px] overflow-hidden rounded-[24px] bg-[#EEF0F3] shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="bg-gradient-to-r from-[#1E5BC6] to-[#1A4DA8] px-4 py-3 text-white">
              <p data-notranslate className="truncate text-[15px] font-black">
                {roomName}
                {locked && <span className="ml-1.5 text-sm">🔒</span>}
                {silenced && <span className="ml-1 text-sm">🔇</span>}
              </p>
              <p className="text-[11px] text-white/85">Room menu · {roomUsers.length} here</p>
            </div>
            <ul className="max-h-[70vh] space-y-1.5 overflow-y-auto p-2">
              {menuItems.map(([icon, label, run, danger]) => (
                <li key={label}>
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      run();
                    }}
                    className={`flex w-full items-center gap-2.5 rounded-full px-2 py-1.5 text-left text-[13px] font-semibold ${
                      danger ? "bg-[#F4DDDD] text-[#C62828]" : "bg-[#E1E4EA] text-[#0B1F3A]"
                    }`}
                  >
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-base ${danger ? "bg-[#EFC6C6]" : "bg-[#CFDDF0]"}`}>
                      {icon}
                    </span>
                    <span className="flex-1">{label}</span>
                    <span className={`pr-1 text-sm ${danger ? "text-[#C62828]" : "text-[#6B7A99]"}`}>›</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Room Info */}
      {infoOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-2 pb-safe sm:items-center" onClick={() => setInfoOpen(false)}>
          <div className="w-full max-w-sm space-y-2 rounded-3xl bg-white p-5 text-sm text-[#0B2A5B] shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h2 data-notranslate className="text-lg font-black">ℹ️ {roomName}</h2>
            {roomInfo.description && (
              <p data-notranslate className="whitespace-pre-wrap text-[#35507E]">
                {roomInfo.description}
              </p>
            )}
            <ul className="space-y-1 pt-1">
              <li>👑 Managed by: <b data-notranslate>{roomInfo.ownerName || "migwith"}</b></li>
              <li>👥 In the room: <b>{roomUsers.length}</b>{roomInfo.maxUsers > 0 && ` / ${roomInfo.maxUsers}`}</li>
              <li>🔐 {roomInfo.privacy || "Public"}{locked && " · 🔒 Locked"}{silenced && " · 🔇 Silenced"}</li>
              {roomInfo.lockLevel > 0 && <li>⭐ Entry level: {roomInfo.lockLevel}+</li>}
              {roomInfo.superMods.length > 0 && <li data-notranslate>🌟 Super Mods: {roomInfo.superMods.join(", ")}</li>}
              {roomInfo.moderators.length > 0 && <li data-notranslate>⭐ Mods: {roomInfo.moderators.join(", ")}</li>}
            </ul>
            <button type="button" onClick={() => setInfoOpen(false)} className="mt-2 w-full rounded-xl bg-[#2F80ED] py-2.5 font-bold text-white">
              OK
            </button>
          </div>
        </div>
      )}

      {/* Kick User */}
      {kickOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-2 pb-safe sm:items-center" onClick={() => setKickOpen(false)}>
          <div className="w-full max-w-sm rounded-3xl bg-white p-5 text-[#0B2A5B] shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-black">👢 Kick User</h2>
            <ul className="mt-2 max-h-[50vh] space-y-1 overflow-y-auto">
              {roomUsers.filter((u) => u.uid !== user.uid).length === 0 && <li className="text-sm text-[#6B7A99]">No one else is here.</li>}
              {roomUsers
                .filter((u) => u.uid !== user.uid)
                .map((u) => (
                  <li key={u.uid} className="flex items-center gap-2 rounded-xl bg-[#F4F9FF] px-3 py-2">
                    <span data-notranslate className="flex-1 truncate font-semibold">
                      {u.username}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        const c = modCtx();
                        if (c) kickUser(c, u.username);
                        setKickOpen(false);
                      }}
                      className="rounded-lg bg-rose-500 px-3 py-1 text-xs font-bold text-white"
                    >
                      Kick
                    </button>
                  </li>
                ))}
            </ul>
            <button type="button" onClick={() => setKickOpen(false)} className="mt-3 w-full rounded-xl border border-[#D5E3F5] py-2.5 text-sm font-bold text-[#5B6B8C]">
              Close
            </button>
          </div>
        </div>
      )}
    </PageShell>
  );
}

function MessageRow({
  m,
  mine,
  giftImage,
  onReply,
}: {
  m: ChatMessage;
  mine: boolean;
  giftImage: string;
  onReply: (sender: string, snippet: string) => void;
}) {
  const time = timeLabel(m.createdAtMs);
  const stamp = time && <span className="ml-1.5 whitespace-nowrap align-baseline text-[9px] text-[#9AA8C2]">{time}</span>;

  // "Bangladesh: imran [25] has entered." — on the left, room name in orange.
  if (m.type === "room_entry" || m.type === "room_leave") {
    const colon = m.text.indexOf(": ");
    return (
      <p className="px-1 text-left text-[13px] leading-snug">
        {colon > 0 && <span className="font-semibold text-[#E6731E]">{m.text.slice(0, colon + 1)} </span>}
        <span className={m.type === "room_entry" ? "text-[#0B2A5B]" : "text-[#6B7A99]"}>
          {colon > 0 ? m.text.slice(colon + 2) : m.text}
        </span>
        {stamp}
      </p>
    );
  }

  if (m.local) {
    return <p className="whitespace-pre-wrap text-center text-xs text-amber-700">{m.text}</p>;
  }

  if (m.type === "moderation" || m.type === "broadcast") {
    const tone =
      m.moderationColor === "red"
        ? "bg-rose-100 text-rose-700"
        : m.moderationColor === "green"
          ? "bg-emerald-100 text-emerald-700"
          : "bg-[#DCEBFB] text-[#174EA6]";
    return (
      <p className={`whitespace-pre-wrap rounded-lg px-3 py-1.5 text-center text-xs font-semibold ${tone}`}>
        {m.text}
      </p>
    );
  }

  if (m.type === "social") {
    return (
      <p className="text-center text-sm font-semibold text-fuchsia-700">
        {m.text.replace(/\*\*/g, "")}
        {time && <span className="ml-2 text-[10px] font-normal text-[#8A9BBC]">{time}</span>}
      </p>
    );
  }

  if (m.type === "me") {
    return (
      <p className="px-3 text-sm italic text-violet-700">
        * {m.sender && m.text.startsWith(`${m.sender}: `) ? `${m.sender} ${m.text.slice(m.sender.length + 2)}` : m.text}
        {time && <span className="ml-2 text-[10px] not-italic text-[#8A9BBC]">{time}</span>}
      </p>
    );
  }

  if (m.type === "gift") {
    const clean = m.text.replace(/^<</, "").replace(/>>/, "");
    return (
      <div className="flex items-center justify-center gap-2 rounded-xl border border-pink-200 bg-pink-50 px-3 py-2 text-center text-sm font-semibold text-pink-700">
        {giftImage && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={giftImage} alt={m.giftName} className="h-8 w-8 object-contain" />
        )}
        <span className="whitespace-pre-wrap break-words">{clean}</span>
        {time && <span className="text-[10px] font-normal text-[#8A9BBC]">{time}</span>}
      </div>
    );
  }

  // Plain lines, no bubbles: other people's messages on the left as
  // "name: message", mine on the right (no name). Tiny time after the text.
  const split = m.sender && m.text.startsWith(`${m.sender}: `);
  let body = split ? m.text.slice(m.sender.length + 2) : m.text;

  // Lucky voucher drops (written by the server, no "name:" in front): small pink line.
  if (!split && /voucher/i.test(m.text)) {
    return (
      <p className="px-1 text-left text-[13px] leading-snug text-[#E8327E]">
        {m.text}
        {stamp}
      </p>
    );
  }

  // A reply starts with the quoted line the app writes: "↩ name: snippet\n".
  let quote: string | null = null;
  if (body.startsWith("↩ ") && body.includes("\n")) {
    quote = body.slice(2, body.indexOf("\n"));
    body = body.slice(body.indexOf("\n") + 1);
  }

  // Swipe right on someone else's message (not bots) to reply to it.
  const canReply = !mine && !!split && !/ Bot$/.test(m.sender);
  const snippet =
    m.type === "image" && m.imageUrl
      ? "📷 Photo"
      : m.type === "voice" && m.audioUrl
        ? "🎤 Voice message"
        : body.length > 60
          ? body.slice(0, 60) + "…"
          : body;

  return (
    <SwipeToReply enabled={canReply} onReply={() => onReply(m.sender, snippet)}>
      <div className={`flex px-1 ${mine ? "justify-end" : "justify-start"}`}>
        <div className={`max-w-[85%] text-[15px] leading-snug ${mine ? "text-right" : "text-left"}`}>
          {quote && (
            <span
              className={`mb-0.5 block w-fit max-w-full truncate border-l-2 border-[#2F80ED] bg-[#2F80ED]/5 px-2 py-0.5 text-left text-xs text-[#6B7A99] ${
                mine ? "ml-auto" : ""
              }`}
            >
              ↩ {quote}
            </span>
          )}
          {!mine && split && <span className="mr-1 font-bold text-[#174EA6]">{m.sender}:</span>}
          {m.type === "image" && m.imageUrl ? (
            <>
              <a href={m.imageUrl} target="_blank" rel="noreferrer" className={`mt-1 block ${mine ? "ml-auto w-fit" : "w-fit"}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={m.imageUrl} alt="Photo" loading="lazy" className="max-h-64 max-w-full rounded-lg" />
              </a>
              {stamp}
            </>
          ) : m.type === "voice" && m.audioUrl ? (
            <>
              <audio controls src={m.audioUrl} className={`mt-1 h-9 max-w-full ${mine ? "ml-auto" : ""}`} />
              {stamp}
            </>
          ) : (
            <>
              <span className="whitespace-pre-wrap break-words text-[#0B2A5B]">{body}</span>
              {stamp}
            </>
          )}
        </div>
      </div>
    </SwipeToReply>
  );
}
