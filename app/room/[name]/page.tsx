"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocFromServer,
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
import { db, functions, storage } from "../../../lib/firebase";
import { httpsCallable } from "firebase/functions";
import { useCurrentUser } from "../../../lib/useCurrentUser";
import {
  PRESENCE_HEARTBEAT_MS,
  ROOM_PRESENCE_STALE_MS,
  badgeForLevel,
  leaveDocId,
  newVisitId,
  presenceBadgesForDoc,
  presenceLine,
  roomHref,
  resolveRoomDescription,
} from "../../../lib/rooms";
import { ChatBar } from "../../_components/ChatBar";
import { GiftNamePicker, giftPickerQuery } from "../../_components/GiftNamePicker";
import { SwipeToReply } from "../../_components/SwipeToReply";
import { addOpenRoom, isRoomOpen, readOpenRooms, removeOpenRoom } from "../../../lib/openRooms";
import { readRoomSession, writeRoomSession, type SessionMessage } from "../../../lib/roomSession";
import { useSenderColors } from "../../../lib/senderColors";
import { PageShell } from "../../_components/PageShell";
import {
  GiftPanel,
  loadGiftCatalog,
  type Gift,
  type GiftResult,
} from "../../_components/GiftPanel";
import { LUXURY_ROOM, LuxuryBetBox, useLuxuryBot } from "../../_components/LuxuryBot";
import {
  LUXURY_BET_ROOM,
  LuxuryBetStartButton,
  LuxuryBetTable,
  LuxuryBetWelcomeLine,
  luxuryBetHandleCommand,
  useLuxuryBet,
} from "../../_components/LuxuryBet";
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
import { handleExtraCommand } from "../../../lib/extraCommands";
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
import { isMainFounderName, useFounderPerms } from "../../../lib/founder";
import { useBadgeImages } from "../../../lib/badgeImages";
import { chatPx, useChatTextSize } from "../../../lib/chatTextSize";
import { withEmotes } from "../../_components/Emote";
import { BackPill } from "../../_components/BackButton";

type ChatMessage = SessionMessage;

type RoomUser = { uid: string; username: string; level: number; lastSeenMs: number };

// invisible: logged in as Invisible (users.isInvisible) — no presence doc,
// no heartbeat, no "has entered/left". quiet: that, or Presence Status
// "INVISIBLE", which still writes presence but hides the announcements.
type Profile = { username: string; level: number; badge: string; badges: string[]; role: string; invisible: boolean; quiet: boolean };

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

// One RoomView per room (keyed by name), so switching room tabs starts from
// that room's own saved session instead of the previous room's state.
export default function RoomPage() {
  const params = useParams<{ name: string }>();
  const roomName = decodeURIComponent(params.name);
  const { user, loading } = useCurrentUser();
  // Wait for the account first, so the room's saved session can be read on mount.
  if (loading || !user) return <RoomView key="" roomName={roomName} />;
  return <RoomView key={roomName} roomName={roomName} />;
}

function RoomView({ roomName }: { roomName: string }) {
  const router = useRouter();
  const { user, loading } = useCurrentUser();
  const founder = useFounderPerms();
  // This open tab's saved session (lib/roomSession): coming back to the tab
  // shows the same chat, draft and scroll position, like the app.
  const [initial] = useState(() => (user && isRoomOpen(user.uid, roomName) ? readRoomSession(user.uid, roomName) : null));

  const [profile, setProfile] = useState<Profile | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>(initial?.messages ?? []);
  // Start of this visit (see savedEntry); null until known.
  const [sinceMs, setSinceMs] = useState<number | null>(initial?.sinceMs ?? null);
  const [localNotes, setLocalNotes] = useState<ChatMessage[]>(initial?.localNotes ?? []);
  const [presence, setPresence] = useState<RoomUser[]>([]);
  const [muted, setMuted] = useState(false);
  const [silenced, setSilenced] = useState(false);
  const [locked, setLocked] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [roomInfo, setRoomInfo] = useState<RoomInfo>(EMPTY_ROOM);
  const [roomLoaded, setRoomLoaded] = useState(false);
  const [modLoaded, setModLoaded] = useState(false);
  const [myModLoaded, setMyModLoaded] = useState(false);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [voiceActive, setVoiceActive] = useState(false);
  const [blocked, setBlocked] = useState("");
  const [text, setText] = useState(initial?.text ?? "");
  // Swipe right on someone's message to reply (same "↩ name: snippet" quote the app writes).
  const [replyTo, setReplyTo] = useState<{ sender: string; snippet: string } | null>(initial?.replyTo ?? null);
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
  const contentRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Leaves this room now (the ✕ on the room tab).
  const leaveRef = useRef<(() => void) | null>(null);
  const stickToBottom = useRef(initial?.stickToBottom ?? true);
  // Clear Chat for this device (set once the page has rendered; used by /cc).
  const clearChatRef = useRef<(() => void) | null>(null);
  const scrollTopRef = useRef(initial?.scrollTop ?? 0);

  // Keep this tab's session up to date while it is open.
  useEffect(() => {
    if (!user || !isRoomOpen(user.uid, roomName)) return;
    writeRoomSession(user.uid, roomName, {
      sinceMs,
      messages,
      localNotes,
      text,
      replyTo,
      scrollTop: scrollTopRef.current,
      stickToBottom: stickToBottom.current,
    });
  }, [user, roomName, sinceMs, messages, localNotes, text, replyTo]);

  // Back on this tab: return to where the reader was.
  useEffect(() => {
    const el = listRef.current;
    if (!el || !initial) return;
    el.scrollTop = initial.stickToBottom ? el.scrollHeight : initial.scrollTop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
  // 🎰 Luxury Bet (only in the Luxury Bet room) — run by the server.
  const luxuryBet = useLuxuryBet(roomName === LUXURY_BET_ROOM, user?.uid, note);
  // Eye button: show only my own Luxury Bet bet lines.
  const [onlyMyBets, setOnlyMyBets] = useState(false);
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
          badges: presenceBadgesForDoc(snap.data()),
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
  const giftQuery = giftPickerQuery(text);
  const roomDescription = resolveRoomDescription(roomName, roomInfo.description);
  const roomInfoRef = useRef(roomInfo);
  roomInfoRef.current = roomInfo;

  const perms = useMemo(
    () => roomPerms(roomInfo, user?.uid || "", profile?.username || "", profile?.role || "", founder.isHiddenFounder),
    [roomInfo, user, profile, founder.isHiddenFounder]
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
        // A hidden founder can never be muted, banned or kicked from a room.
        if (permsRef.current.isHiddenFounder) {
          setMuted(false);
          setMyModLoaded(true);
          return;
        }
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
        setAnnouncement(String(snap.get("announcement") || "").trim());
        setModLoaded(true);
      },
      () => setModLoaded(true)
    );
    return () => {
      offUser();
      offRoom();
    };
  }, [user, profile, roomName, founder.isHiddenFounder]);

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
    // WHO MAY BE INVISIBLE (like the app): "Login as Invisible" and the
    // Presence Status "INVISIBLE" only work for the Founder, Global Admin and
    // Staff — and in a private room also for its owner and Super Mods.
    // Everybody else enters normally, with "has entered" / "has left".
    const me = profile.username.trim().toLowerCase();
    const isPrivateRoom = info.exists && info.category === "user" && info.privacy !== "Public";
    const invisibleAllowed =
      permsRef.current.isOwnerUser ||
      permsRef.current.isHiddenFounder ||
      ["admin", "superadmin", "staff"].includes(profile.role) ||
      (isPrivateRoom && ((!!info.ownerUid && info.ownerUid === uid) || info.superMods.includes(me)));
    const hideMe = profile.invisible && invisibleAllowed; // no presence doc at all
    const quietMe = profile.quiet && invisibleAllowed; // no entered / left lines
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
      if (hideMe) return;
      deleteDoc(presenceRef).catch(() => {});
      if (quietMe) return;
      setDoc(doc(db, "room_messages", roomName, "messages", leaveDocId(uid, visitId)), {
        text: presenceLine(roomName, profile.username, profile.level, false, profile.badges),
        sender: profile.username,
        senderUid: uid,
        type: "room_leave",
        createdAt: serverTimestamp(),
      }).catch(() => {});
    };

    (async () => {
      // Invisible: read the room without showing up in it (same as the app).
      if (hideMe) {
        // No presence doc to stamp, so the browser clock marks the visit.
        const saved = savedEntry(uid, roomName);
        const at = saved && isRoomOpen(uid, roomName) ? saved.at : Date.now() - 30_000;
        saveEntry(uid, roomName, { visitId: "invisible", at });
        setSinceMs(at);
        rememberRecentRoom(roomName);
        addOpenRoom(uid, roomName);
        return;
      }
      // An open tab that already has this visit's session is the same visit
      // (the app keeps roomEntryAt for as long as the tab is open).
      const tabSession = isRoomOpen(uid, roomName) ? readRoomSession(uid, roomName) : null;
      let alreadyHere = resumed || !!tabSession;
      let existingMarkerMs = 0;
      // Like the app: asked from the server up to 5 times. If it still can't be
      // reached we assume the person is still here (no "has entered") —
      // missing one entry line is better than a false one.
      let checked = false;
      for (let attempt = 0; attempt < 5 && !left; attempt++) {
        try {
          const existing = await getDocFromServer(presenceRef);
          checked = true;
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
          break;
        } catch (err) {
          console.error(err);
          await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
        }
      }
      if (!checked) alreadyHere = true;
      if (left) return;

      // A level-based private room only holds its capacity. The owner, migwith
      // and anyone already inside are always let in (same rule as the app).
      if (
        !alreadyHere &&
        roomInfoRef.current.capacityEnforced &&
        roomInfoRef.current.ownerUid !== uid &&
        !isMainFounderName(profile.username)
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
          // Hidden (allowed) people stay out of "Currently in this room".
          presenceStatus: quietMe ? "INVISIBLE" : "ONLINE",
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
        const at =
          tabSession?.sinceMs ??
          (saved && saved.visitId === visitId ? saved.at : existingMarkerMs || Date.now() - 30_000);
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

      if (!alreadyHere && !left && !quietMe) {
        addDoc(collection(db, "room_messages", roomName, "messages"), {
          text: presenceLine(roomName, profile.username, profile.level, true, profile.badges),
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

  // People I blocked (users/{uid}.blockedUsers, /block): their lines are hidden for me, like the app.
  const [blockedNames, setBlockedNames] = useState<string[]>([]);
  useEffect(() => {
    if (!myUid) return;
    return onSnapshot(
      doc(db, "users", myUid),
      (s) => {
        const raw = s.get("blockedUsers");
        setBlockedNames(Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string").map((x) => x.toLowerCase()) : []);
      },
      () => {}
    );
  }, [myUid]);

  // Eye mode (Luxury Bet): other people's bet lines are taken out of the list.
  const myName = (profile?.username || "").toLowerCase();
  const visible = useMemo(() => {
    const blocked = new Set(blockedNames);
    return shown.filter((m) => {
      if (blocked.size && !m.local && m.senderUid !== myUid) {
        const who = (m.sender || (m.text.indexOf(":") > 0 ? m.text.slice(0, m.text.indexOf(":")) : "")).trim().toLowerCase();
        if (who && blocked.has(who) && m.type !== "room_entry" && m.type !== "room_leave") return false;
      }
      if (onlyMyBets) {
        const bet = /^🎰 Luxury Bet: (.+?) placed [\d,]+ coins? on /.exec(m.text);
        if (bet && bet[1].trim().toLowerCase() !== myName) return false;
      }
      return true;
    });
  }, [shown, onlyMyBets, myName, blockedNames, myUid]);

  // Uploaded pictures for the badges in the enter/left lines.
  const badgeImages = useBadgeImages(!!user);
  // Room text size (Settings → Chat), in px.
  const fontPx = chatPx(useChatTextSize());

  // Game rooms read as a plain running log: every line on the left.
  const gameRoom = [LUXURY_ROOM, LUXURY_BET_ROOM, LOWCARD_ROOM, TEEN_PATTI_ROOM, LUDO_ROOM, CRICKET_ROOM, ROYALE_ROOM, TN_ROOM].includes(roomName);

  // Name colours (role / Color Shop / Lucky pink) for everyone in the chat.
  const colorOf = useSenderColors(
    useMemo(
      () => shown.map((m) => (m.sender ? m.sender : m.text.slice(0, Math.max(0, m.text.indexOf(":")))).trim()),
      [shown]
    )
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

  // Also stay pinned when the list changes size without a new message: a
  // picture or gift finishing loading, or the game box below growing
  // (a bet placed, the round moving on), so the newest bet line stays in view.
  useEffect(() => {
    const el = listRef.current;
    const inner = contentRef.current;
    if (!el || !inner || typeof ResizeObserver === "undefined") return;
    // When the list itself gets shorter (the bet box opening, a game table,
    // the keyboard), scroll by the height it lost so the lines that were at
    // the bottom stay in view right above the box (like the app).
    let lastHeight = el.clientHeight;
    const ro = new ResizeObserver(() => {
      const lost = lastHeight - el.clientHeight;
      lastHeight = el.clientHeight;
      if (stickToBottom.current) el.scrollTop = el.scrollHeight;
      else if (lost > 0) el.scrollTop += lost;
    });
    ro.observe(el);
    ro.observe(inner);
    return () => ro.disconnect();
  }, [loading, user, blocked]);

  // Everything the moderator commands and the ⋯ menu need.
  const modCtx = (): ModContext | null => {
    if (!user || !profile) return null;
    // A hidden founder's moderation lines carry no name (they say "Admin").
    const write = (data: Record<string, unknown>) =>
      addDoc(collection(db, "room_messages", roomName, "messages"), {
        ...(perms.isHiddenFounder ? {} : { sender: profile.username }),
        senderUid: user.uid,
        createdAt: serverTimestamp(),
        ...data,
      }).catch(() => note("Message could not be sent. Please try again."));
    return {
      roomName,
      username: profile.username,
      modName: perms.isHiddenFounder ? "Admin" : profile.username,
      room: roomInfo,
      perms,
      people: roomUsers.map((u) => ({ uid: u.uid, username: u.username })),
      note,
      post: (t, type = "chat") => write({ text: t, type, giftName: "", clientCreatedAt: Date.now() }),
      postModeration: (t, color) => write({ text: t, type: "moderation", moderationColor: color }),
      clearForMe: () => clearChatRef.current?.(),
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
    if (
      clean.startsWith("/") &&
      handleExtraCommand(clean, {
        uid: user.uid,
        username: profile.username,
        roomName,
        isFounder: isMainFounderName(profile.username),
        isRoomAdmin: perms.isRoomAdmin,
        note,
      })
    ) {
      setText("");
      return;
    }

    // Admin/Staff stop of a running Luxury Bot / LowCard round: the server
    // refunds every bet first, then closes the round (the app's !stop).
    if (clean.toLowerCase() === "!stop") {
      setText("");
      if (perms.isAppStaffHere && (luxury || lowCard)) {
        const botLabel = lowCard ? "LowCard Bot" : "👻 Luxury Bot";
        httpsCallable<{ roomId: string }, { reason?: string; refunded?: boolean }>(functions, "adminStopBot")({ roomId: roomName })
          .then(({ data }) => {
            const reason = String(data?.reason || "");
            if (reason === "settling") note(`${botLabel}: The round is paying out right now. Try !stop again in a few seconds.`);
            else if (reason.startsWith("not-running")) note(`${botLabel}: The bot is not running.`);
            else if (data?.refunded !== true) modCtx()?.post(`${botLabel}: Bot stopped.`);
          })
          .catch((e: any) => note(`${botLabel}: Could not stop the bot. ${e?.message || "Please try again."}`));
      }
      return;
    }

    // /gift name Gift [-m message] — and "/gift all Gift" (Gift Shower: everyone
    // else in the room). The room line is posted only after the server sent it.
    if (/^\/gift\b/i.test(clean)) {
      setText("");
      const parts = clean.split(/\s+/);
      const m = parts.findIndex((w, i) => i > 1 && w.toLowerCase() === "-m");
      const target = (parts[1] || "").replace(/^@/, "");
      const giftName = (m > 2 ? parts.slice(2, m) : parts.slice(2)).join(" ").trim();
      const message = m > 2 ? parts.slice(m + 1).join(" ").trim().slice(0, 200) : "";
      if (!target || !giftName) {
        note("🎁 Usage: /gift username Rose [-m message]");
        return;
      }
      const suffix = message ? ` — "${message}"` : "";
      if (target.toLowerCase() === "all") {
        const everyone = roomUsers.map((u) => u.username).filter((n) => n.toLowerCase() !== profile.username.toLowerCase()).slice(0, 40);
        if (everyone.length === 0) return note("🎁 There is nobody else in this room right now.");
        if (gifts.length && !giftByName.has(giftName.toLowerCase())) return note(`🎁 No active gift named "${giftName}".`);
        httpsCallable<
          { roomId: string; targets: string[]; giftName: string; message: string },
          { sentTo?: string[]; giftName?: string; giftIcon?: string; failed?: { target?: string; reason?: string }[] }
        >(functions, "sendGiftShower")({ roomId: roomName, targets: everyone, giftName, message })
          .then(({ data }) => {
            const sent = data?.sentTo || [];
            const shownGift = data?.giftName || giftName;
            const icon = data?.giftIcon || giftByName.get(giftName.toLowerCase())?.icon || "🎁";
            if (sent.length) {
              const others = sent.length - 5;
              const toText = sent.slice(0, 5).join(", ") + (others > 0 ? ` and ${others} other` : "");
              addDoc(collection(db, "room_messages", roomName, "messages"), {
                text: `<<🎁*GIFT SHOWER* ${profile.username}[${profile.level}] gives a ${shownGift} ${icon} to ${toText}! Hurray!>>${suffix}`,
                sender: profile.username,
                senderUid: user.uid,
                type: "gift",
                giftName: shownGift,
                createdAt: serverTimestamp(),
                clientCreatedAt: Date.now(),
              }).catch(() => {});
            }
            const failed = (data?.failed || []).map((f) => `• ${f.target || ""} — ${String(f.reason || "").replace(/^🎁/, "").trim() || "Gift sending failed."}`);
            if (failed.length) note(`These people did not get the ${shownGift}:\n${failed.join("\n")}`);
          })
          .catch((e: any) => note(`The gift shower did not send. Reason: ${e?.message || "Gift sending failed."}`));
        return;
      }
      httpsCallable<
        { roomId: string; target: string; giftName: string; message: string },
        { giftName?: string; recipient?: string; giftIcon?: string }
      >(functions, "sendGift")({ roomId: roomName, target, giftName, message })
        .then(({ data }) =>
          announceGift({
            giftName: data?.giftName || giftName,
            giftIcon: data?.giftIcon || giftByName.get(giftName.toLowerCase())?.icon || "🎁",
            recipient: data?.recipient || target,
            message,
          })
        )
        .catch((e: any) => note(`🎁 That gift did not actually send: ${e?.message || "Gift sending failed."}`));
      return;
    }

    // /park 1-24 — keep your name in "Currently in this room" (paid, on the server).
    if (/^\/park\b/i.test(clean)) {
      setText("");
      const hours = Number(clean.split(/\s+/)[1]);
      if (!Number.isInteger(hours) || hours < 1 || hours > 24) return note("Usage: /park <hours> — a whole number from 1 to 24.");
      httpsCallable<{ roomId: string; hours: number }, { cost?: number }>(functions, "parkRoomPresence")({ roomId: roomName, hours })
        .then(({ data }) => note(`🅿️ Parked in ${roomName} for ${hours}h (${data?.cost ?? hours * 50} coins).`))
        .catch((e: any) => note(`Could not park: ${e?.message || "Please try again."}`));
      return;
    }

    if (luxury && clean.toLowerCase() === "!start") {
      setText("");
      if (luxury.running) note("👻 Luxury Bot: A round is already running.");
      else luxury.start();
      return;
    }

    if (luxuryBet && luxuryBetHandleCommand(luxuryBet, clean, note)) {
      setText("");
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

  const giftByName = useMemo(
    () => new Map(gifts.map((g) => [g.name.toLowerCase(), { icon: g.icon, imageUrl: g.imageUrl }])),
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
          <BackPill href="/rooms" label="Back to rooms" className="mt-6" />
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
  clearChatRef.current = clearChat;

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
          <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden rounded-t-2xl border border-b-0 border-[#CFE3F5] bg-[#E8F4FC] sm:rounded-b-2xl sm:border-b">
            {giftQuery !== null && (
              <GiftNamePicker
                queryText={giftQuery.q}
                cmd={giftQuery.cmd}
                names={roomUsers.map((u) => u.username).filter((n) => n.toLowerCase() !== (profile?.username || "").toLowerCase())}
                onPick={(t) => {
                  setText(t);
                  inputRef.current?.focus();
                }}
              />
            )}
            <div
              ref={listRef} data-notranslate
              onScroll={(e) => {
                const el = e.currentTarget;
                stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
                scrollTopRef.current = el.scrollTop;
                if (user && isRoomOpen(user.uid, roomName)) {
                  const cur = readRoomSession(user.uid, roomName);
                  if (cur) {
                    cur.scrollTop = el.scrollTop;
                    cur.stickToBottom = stickToBottom.current;
                  }
                }
              }}
              className="min-h-0 flex-1 overflow-y-auto px-3 py-3"
            >
              <div ref={contentRef} className="space-y-1">
              {/* Room cards, like the app: manager, welcome text, who is here */}
              <div className="space-y-1.5 pb-1">
                <p className="rounded-xl border border-[#1B8F7A] bg-gradient-to-r from-[#1FA2B8] to-[#2FAE85] px-3.5 py-2.5 text-[15px] text-white">
                  👥 This room is managed by: {isMainFounderName(roomInfo.ownerName) ? "miglife" : roomInfo.ownerName || "miglife"}
                </p>
                <p className="whitespace-pre-wrap rounded-xl border border-[#1B8F7A] bg-gradient-to-r from-[#1FA2B8] to-[#2FAE85] px-3.5 py-2.5 text-[15px] text-white">
                  {roomDescription}
                </p>
                {locked && (
                  <p className="rounded-xl border border-[#D85A30] bg-[#4A1B0C] px-3.5 py-2.5 text-[13px] font-bold text-[#F0997B]">
                    🔒 This room is locked. Only admins/mods can enter until it&apos;s unlocked.
                  </p>
                )}
                <div className="rounded-xl border border-[#1B8F7A] bg-gradient-to-r from-[#1FA2B8] to-[#2FAE85] px-3.5 py-2.5 text-[15px]">
                  <p className="text-white">👫 Currently in this room:</p>
                  {roomUsers.length > 0 && <p className="mt-1 text-black">{roomUsers.map((u) => u.username).join(", ")}</p>}
                </div>
                {/* Room announcement (/announcement), pinned under who is here, like the app */}
                {announcement && (
                  <div className="flex items-start gap-2 rounded-[14px] border border-[#EF9F27] px-3.5 py-2.5">
                    <span className="text-lg leading-none">📢</span>
                    <p className="min-w-0 flex-1 whitespace-pre-wrap text-[15px] leading-[21px] text-[#8A5A00]">{announcement}</p>
                  </div>
                )}
              </div>
              {luxuryBet?.canSee && <LuxuryBetWelcomeLine state={luxuryBet} />}
              {visible.map((m) => (
                <MessageRow
                  key={m.id}
                  m={m}
                  mine={!!m.senderUid && m.senderUid === user.uid}
                  roomName={roomName}
                  gameRoom={gameRoom}
                  colorOf={colorOf}
                  badgeImages={badgeImages}
                  fontPx={fontPx}
                  gift={giftByName.get(m.giftName.toLowerCase()) || null}
                  onMention={(name) => {
                    // Tap a name: add "@name" to the message box, like the app.
                    const mention = `@${name}`;
                    setText((t) => (t.includes(mention) ? t : t.trim() ? `${t.trimEnd()} ${mention} ` : `${mention} `));
                    inputRef.current?.focus();
                  }}
                  onReply={(sender, snippet) => {
                    setReplyTo({ sender, snippet });
                    inputRef.current?.focus();
                  }}
                />
              ))}
              </div>
            </div>

            {/* Game tables keep their dark look */}
            {(luxury || luxuryBet || royale || teenPatti || cricket || twentyNine || lowCard || ludo) && (
              <div data-noswipe className="bg-[#0B1F3A] text-white">
                {luxury && <LuxuryBetBox state={luxury} note={note} />}
                {luxuryBet && (
                  <LuxuryBetTable state={luxuryBet} onlyMine={onlyMyBets} onToggleOnlyMine={() => setOnlyMyBets((v) => !v)} />
                )}
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
                <>
                {luxuryBet && <LuxuryBetStartButton state={luxuryBet} />}
                <VoiceRecorder
                  disabled={!profile || !perms.canShareMedia}
                  onSend={sendVoice}
                  onError={(m) => note(`${roomName}: ${m}`)}
                  onActive={setVoiceActive}
                />
                </>
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
            <p data-notranslate className="whitespace-pre-wrap text-[#35507E]">
              {roomDescription}
            </p>
            <ul className="space-y-1 pt-1">
              <li>👑 Managed by: <b data-notranslate>{isMainFounderName(roomInfo.ownerName) ? "miglife" : roomInfo.ownerName || "miglife"}</b></li>
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

// Colours from the app (RoomPage.kt).
const INK = "#0B1F3A";
const LINK_BLUE = "#174EA6";
// Bright blue of the game lines: Luxury Bot bets and every game bot's text.
const BET_BLUE = "#1565E8";
const APP_RED = "#B3261E";
const ROOM_ORANGE = "#E6731E";

// A little playing card in a chat line ("10♥", "A♠"), like the app's.
function InlineCard({ card }: { card: string }) {
  const suit = card.slice(-1);
  const red = suit === "♥" || suit === "♦";
  return (
    <span
      className="mx-px inline-flex h-[20px] w-[15px] flex-col items-center justify-center rounded-[4px] align-middle leading-none text-white"
      style={{ background: red ? "#E24B4A" : "#2C2C2A" }}
    >
      <span className="text-[8px] font-bold">{card.slice(0, -1)}</span>
      <span className="text-[7px]">{suit}</span>
    </span>
  );
}

// Cricket Bot's {4} {6} {OUT} {NOTOUT} {DRS} tokens become small badges.
function CricketBadge({ token }: { token: string }) {
  const [label, bg] =
    token === "OUT"
      ? ["OUT", "#D32F2F"]
      : token === "NOTOUT"
        ? ["NOT OUT", "#2E7D32"]
        : token === "DRS"
          ? ["📺 DRS", "#1565C0"]
          : token === "4" || token === "6"
            ? [token, "#E53935"]
            : [token, "#E0E0E0"];
  const single = token.length === 1;
  const ink = single && token !== "4" && token !== "6" ? "#D32F2F" : "#FFFFFF";
  return (
    <span
      className={`mx-px inline-flex h-4 items-center justify-center align-middle text-[9px] font-extrabold leading-none ${
        single ? "w-4 rounded-full" : "rounded-full px-1.5"
      }`}
      style={{ background: bg, color: ink }}
    >
      {label}
    </span>
  );
}

// "@name" mentions in link blue, bold.
function withMentions(text: string, keyPrefix = "m"): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(/@[A-Za-z0-9_.-]+/g)) {
    const i = match.index ?? 0;
    if (i > last) out.push(text.slice(last, i));
    out.push(
      <span key={`${keyPrefix}${i}`} className="font-bold" style={{ color: LINK_BLUE }}>
        {match[0]}
      </span>
    );
    last = i + match[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

// A game bot's line: bot name in its colour, the rest in blue, cards and
// cricket tokens drawn as little pictures.
const GAME_BOTS: [string, string][] = [
  ["LowCard Bot", "#1B8E3E"],
  ["Teen Patti Bot", "#7B1FA2"],
  ["MIG Royale Bot", "#7B1FA2"],
  ["29 Bot", "#E53935"],
  ["Ludo Bot", "#E91E63"],
  ["Cricket Bot", "#1B8E3E"],
];

function gameBotLine(text: string): ReactNode | null {
  const bot = GAME_BOTS.find(([name]) => text.toLowerCase().startsWith(`${name.toLowerCase()}:`));
  if (!bot) return null;
  const [name, color] = bot;
  const body = text.slice(name.length);
  const parts: ReactNode[] = [];
  if (name === "LowCard Bot") {
    // "…: 10♥" — the card sits at the very end, glued to the last word.
    const m = body.match(/(10|[2-9JQKA])([♠♥♦♣])$/);
    if (m && m.index !== undefined) {
      parts.push(body.slice(0, m.index).trimEnd() + " ", <InlineCard key="c" card={m[0]} />);
    } else parts.push(body);
  } else if (name === "Teen Patti Bot" || name === "MIG Royale Bot") {
    let last = 0;
    for (const m of body.matchAll(/\[(10|[2-9JQKA])([♠♥♦♣])\]/g)) {
      const i = m.index ?? 0;
      parts.push(body.slice(last, i), <InlineCard key={`c${i}`} card={m[1] + m[2]} />);
      last = i + m[0].length;
    }
    parts.push(body.slice(last));
  } else if (name === "Cricket Bot") {
    let last = 0;
    for (const m of body.matchAll(/\{(\d|OUT|NOTOUT|DRS)\}/g)) {
      const i = m.index ?? 0;
      parts.push(body.slice(last, i), <CricketBadge key={`b${i}`} token={m[1]} />);
      last = i + m[0].length;
    }
    parts.push(body.slice(last));
  } else parts.push(body);
  return (
    <>
      <span className="font-bold" style={{ color }}>
        {name}
      </span>
      <span style={{ color: BET_BLUE }}>{parts}</span>
    </>
  );
}

// "👻 Luxury Bot: …" — the ghost stays in the stored text but is never shown;
// "Luxury Bot:" in pink; a bet line ("… placed 500 coins on …") in blue,
// every other line in the normal ink.
function luxuryLine(text: string): ReactNode | null {
  const shown = text.replace(/^👻\s*/, "");
  if (!/^Luxury Bot:/i.test(shown)) return null;
  const isBet = /\bplaced\s+[\d,]+\s+coins?\s+on\b/i.test(shown);
  return (
    <>
      <span className="font-bold text-[#E91E63]">{shown.slice(0, "Luxury Bot".length)}</span>
      <span style={{ color: isBet ? BET_BLUE : INK }}>{withMentions(shown.slice("Luxury Bot".length))}</span>
    </>
  );
}

// The badges in "name [12] 🎓 💎 has entered." drawn as miglife's uploaded
// pictures when there are any (the app's badge_images swap).
function withBadgeImages(text: string, images: Record<string, string>): ReactNode[] {
  const emojis = Object.keys(images);
  if (emojis.length === 0) return [text];
  const out: ReactNode[] = [];
  let plain = "";
  let i = 0;
  while (i < text.length) {
    const hit = emojis.find((e) => text.startsWith(e, i));
    if (hit) {
      if (plain) out.push(plain);
      plain = "";
      out.push(
        // eslint-disable-next-line @next/next/no-img-element
        <img key={i} src={images[hit]} alt={hit} className="mx-px inline h-[15px] w-[15px] rounded-full object-cover align-middle" />
      );
      i += hit.length;
    } else {
      plain += text[i];
      i += 1;
    }
  }
  if (plain) out.push(plain);
  return out;
}

// "🎰 Luxury Bet: …" — the bot name in orange, the rest in blue. In the
// Result, the row made only of character icons (👑👑👸👸🐼🐼) is drawn bigger.
function luxuryBetLine(text: string): ReactNode | null {
  const prefix = "🎰 Luxury Bet";
  if (!text.startsWith(`${prefix}:`)) return null;
  const body = text.slice(prefix.length);
  const lines = body.split("\n");
  return (
    <>
      <span className="font-bold" style={{ color: ROOM_ORANGE }}>
        {prefix}
      </span>
      <span style={{ color: BET_BLUE }}>
        {lines.map((line, i) => {
          const iconsOnly = i > 0 && line.trim() !== "" && !/[\p{L}\p{N}\s:|]/u.test(line);
          return (
            <span key={i}>
              {i > 0 && "\n"}
              {iconsOnly ? <span className="text-[20px] leading-[26px] tracking-[1px]">{line}</span> : withMentions(line, `lb${i}_`)}
            </span>
          );
        })}
      </span>
    </>
  );
}

// Gift announcement: pink, "[level]" tags in amber, the gift's own icon
// swapped for its uploaded picture when there is one.
function giftLine(text: string, giftIcon: string, giftImage: string): ReactNode[] {
  const clean = text.replace(/^<</, "").replace(/>>/, "");
  const out: ReactNode[] = [];
  let k = 0;
  const pushSegment = (seg: string) => {
    if (giftIcon && giftImage && seg.includes(giftIcon)) {
      seg.split(giftIcon).forEach((piece, i) => {
        if (i > 0)
          out.push(
            // eslint-disable-next-line @next/next/no-img-element
            <img key={`g${k++}`} src={giftImage} alt="" className="mx-0.5 inline h-[18px] w-[18px] rounded-full object-cover align-middle" />
          );
        if (piece) out.push(piece);
      });
    } else out.push(seg);
  };
  let last = 0;
  for (const m of clean.matchAll(/\[[^\]]*\]/g)) {
    const i = m.index ?? 0;
    if (i > last) pushSegment(clean.slice(last, i));
    out.push(
      <span key={`l${k++}`} className="text-[#FFC107]">
        {m[0]}
      </span>
    );
    last = i + m[0].length;
  }
  if (last < clean.length) pushSegment(clean.slice(last));
  return out;
}

function MessageRow({
  m,
  mine,
  roomName,
  gameRoom,
  colorOf,
  badgeImages,
  fontPx,
  gift,
  onMention,
  onReply,
}: {
  m: ChatMessage;
  mine: boolean;
  roomName: string;
  /** Game rooms: everything on the left, full-width plain lines, no swipe reply. */
  gameRoom: boolean;
  colorOf: (name: string) => string;
  /** Badge emoji -> uploaded picture, for the enter/left lines. */
  badgeImages: Record<string, string>;
  /** Room text size in px (Settings → Chat). */
  fontPx: number;
  gift: { icon: string; imageUrl: string } | null;
  onMention: (name: string) => void;
  onReply: (sender: string, snippet: string) => void;
}) {
  const time = timeLabel(m.createdAtMs);
  const stamp = time && <span className="ml-1.5 whitespace-nowrap align-baseline text-[9px] text-[#9AA8C2]">{time}</span>;

  // Lucky User announcement (pickBangladeshLuckyUser): a celebration card, like the app.
  if (m.text.startsWith("🍀 Lucky Bot:")) return <LuckyCard text={m.text} time={time} />;

  // "Bangladesh: imran [25] has entered." — on the left, room name in orange, the rest black.
  if (m.type === "room_entry" || m.type === "room_leave") {
    const colon = m.text.indexOf(": ");
    return (
      <p className="px-1 text-left text-[13px] leading-snug">
        {colon > 0 && (
          <span className="font-bold" style={{ color: ROOM_ORANGE }}>
            {m.text.slice(0, colon + 1)}{" "}
          </span>
        )}
        <span className="text-black">{withBadgeImages(colon > 0 ? m.text.slice(colon + 2) : m.text, badgeImages)}</span>
        {stamp}
      </p>
    );
  }

  if (m.type === "moderation") {
    const color = m.moderationColor === "red" ? "#D32F2F" : m.moderationColor === "green" ? "#2E7D32" : LINK_BLUE;
    return (
      <p className="whitespace-pre-wrap px-1 text-left text-[13px] font-semibold leading-snug" style={{ color }}>
        {m.text}
        {stamp}
      </p>
    );
  }

  // /broadcast: shown once, on a gold card.
  if (m.type === "broadcast" || m.type === "friend_request") {
    const gold = m.type === "broadcast";
    return (
      <div className="flex px-1">
        <p
          className="max-w-[336px] whitespace-pre-wrap rounded-[9px] border px-[7px] py-[7px] text-[14px] leading-snug"
          style={{ background: gold ? "#FFF1D6" : "#E3F7F0", borderColor: gold ? "#EF9F27" : "#2FBF8F", color: INK }}
        >
          {withMentions(m.text)}
          {stamp}
        </p>
      </div>
    );
  }

  // /hug, /roll, 8ball …: centered, one red colour, bold.
  if (m.type === "social") {
    return (
      <p className="px-2 text-center text-[14px] font-bold leading-snug" style={{ color: APP_RED }}>
        {m.text.replace(/\*\*/g, "")}
        {stamp}
      </p>
    );
  }

  // /me: "name action" in red, on the left.
  if (m.type === "me") {
    const c = m.text.indexOf(":");
    return (
      <p className="px-1 text-left leading-snug" style={{ color: APP_RED, fontSize: fontPx }}>
        {c > 0 ? `${m.text.slice(0, c).trim()} ${m.text.slice(c + 1).trimStart()}` : m.text}
        {stamp}
      </p>
    );
  }

  if (m.type === "gift") {
    return (
      <div className="flex justify-center">
        <p className="w-[94%] whitespace-pre-wrap break-words rounded-[9px] bg-[#FFE6F2] px-[7px] py-[7px] text-left text-[14px] leading-snug text-[#FF2D95]">
          {giftLine(m.text, gift?.icon || "", gift?.imageUrl || "")}
          {stamp}
        </p>
      </div>
    );
  }

  // Lucky voucher drops (written by the server, no "name:" in front): small pink line.
  const splitByUid = m.sender && m.text.startsWith(`${m.sender}: `);
  if (!splitByUid && /voucher/i.test(m.text)) {
    return (
      <p className="px-1 text-left text-[13px] leading-snug text-[#E8327E]">
        {m.text}
        {stamp}
      </p>
    );
  }

  // Bot and game lines (also this device's own game notices).
  const bot = gameBotLine(m.text) ?? luxuryLine(m.text) ?? luxuryBetLine(m.text);
  if (bot) {
    return (
      <p className="whitespace-pre-wrap break-words px-1 text-left leading-snug" style={{ fontSize: fontPx }}>
        {bot}
        {stamp}
      </p>
    );
  }

  // "name: message" — the sender is whatever comes before the first colon,
  // like the app (local notices such as "Bangladesh: …" included).
  const colon = m.text.indexOf(":");
  const senderName = splitByUid ? m.sender : colon > 0 && colon <= 40 ? m.text.slice(0, colon).trim() : "";
  let body = senderName ? m.text.slice(m.text.indexOf(":") + 1).replace(/^ /, "") : m.text;

  // A reply starts with the quoted line the app writes: "↩ name: snippet\n".
  let quote: string | null = null;
  if (body.startsWith("↩ ") && body.includes("\n")) {
    quote = body.slice(2, body.indexOf("\n"));
    body = body.slice(body.indexOf("\n") + 1);
  }

  // Own messages sit on the right in EVERY room, game rooms included (like the app).
  const rightSide = mine;
  const isRoomLine = senderName.toLowerCase() === roomName.toLowerCase();
  // Swipe right on someone else's message (not bots, not in game rooms) to reply to it.
  const canReply = !mine && !gameRoom && !m.local && !!senderName && !/ Bot$/.test(senderName) && !isRoomLine;
  const snippet =
    m.type === "image" && m.imageUrl
      ? "📷 Photo"
      : m.type === "voice" && m.audioUrl
        ? "🎤 Voice message"
        : body.length > 60
          ? body.slice(0, 60) + "…"
          : body;

  return (
    <SwipeToReply enabled={canReply} onReply={() => onReply(senderName, snippet)}>
      <div className={`flex px-1 ${rightSide ? "justify-end" : "justify-start"}`}>
        {/* Own lines sit on the right, but a long one reads left to right: every line starts at the same left edge, like the app. */}
        <div className={`${gameRoom && !rightSide ? "w-full" : "max-w-[85%]"} leading-snug text-left`} style={{ fontSize: fontPx }}>
          {quote && (
            <span
              className={`mb-0.5 block w-fit max-w-full truncate border-l-2 border-[#2F80ED] bg-[#2F80ED]/5 px-2 py-0.5 text-left text-xs text-[#6B7A99] ${
                rightSide ? "ml-auto" : ""
              }`}
            >
              ↩ {quote}
            </span>
          )}
          {!mine && senderName && (
            <span
              className={`mr-1 font-bold ${isRoomLine || m.local ? "" : "cursor-pointer"} ${
                !isRoomLine && isMainFounderName(senderName) ? "miglife-rainbow" : ""
              }`}
              style={{ color: isRoomLine ? ROOM_ORANGE : colorOf(senderName) }}
              onClick={isRoomLine || m.local ? undefined : () => onMention(senderName)}
            >
              {senderName}:
            </span>
          )}
          {m.type === "image" && m.imageUrl ? (
            <>
              <a href={m.imageUrl} target="_blank" rel="noreferrer" className={`mt-1 block ${rightSide ? "ml-auto w-fit" : "w-fit"}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={m.imageUrl} alt="Photo" loading="lazy" className="max-h-64 max-w-full rounded-lg" />
              </a>
              {stamp}
            </>
          ) : m.type === "voice" && m.audioUrl ? (
            <>
              <audio controls src={m.audioUrl} className={`mt-1 h-9 max-w-full ${rightSide ? "ml-auto" : ""}`} />
              {stamp}
            </>
          ) : (
            <>
              <span className="whitespace-pre-wrap break-words" style={{ color: INK }}>
                {withEmotes(body, fontPx, (t, k) => withMentions(t, k))}
              </span>
              {stamp}
            </>
          )}
        </div>
      </div>
    </SwipeToReply>
  );
}

// "🍀 Lucky Bot: Congratulations NAME! You are the Lucky User — pink ID for
//  3 hours, +1 level and 5000 coins added to your account! 🎉"
function LuckyCard({ text, time }: { text: string; time: string }) {
  const winner = /Congratulations (.+?)! You are/i.exec(text)?.[1]?.trim() || "Lucky User";
  const coins = Number(/and (\d+) coins/i.exec(text)?.[1] || 5000);
  return (
    <div className="rounded-[20px] bg-gradient-to-r from-[#43C77A] via-[#FF6FB1] to-[#F2B53A] p-[1.5px] shadow-[0_6px_18px_rgba(255,111,177,0.35)]">
      <div className="lucky-shimmer relative overflow-hidden rounded-[19px] bg-gradient-to-br from-[#E8FFF3] via-[#FFEEF7] to-[#FFF6DC] px-3.5 py-3">
        <div className="flex items-center gap-1.5">
          <span className="text-xl">🍀</span>
          <span className="flex-1 text-[13px] font-black tracking-[0.15em] text-[#1E9B5A]">LUCKY USER</span>
          <span className="text-sm">✨🎉✨</span>
        </div>
        <p className="mt-2 text-xs font-semibold text-[#7A6A88]">Congratulations</p>
        <p data-notranslate className="truncate text-2xl font-black text-[#E8327E]">
          {winner}
        </p>
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {[
            ["💗", "Pink ID 3h", "#FF6FB1", "#B2477F"],
            ["⬆️", "+1 Level", "#3B8BF0", "#2D5FA6"],
            ["🪙", `+${coins.toLocaleString()}`, "#E0A21B", "#96701E"],
          ].map(([icon, label, accent, ink]) => (
            <span
              key={label}
              className="flex items-center gap-1 rounded-xl border bg-white/85 px-2 py-1 text-xs font-bold"
              style={{ borderColor: `${accent}73`, color: ink }}
            >
              <span className="text-[13px]">{icon}</span>
              {label}
            </span>
          ))}
        </div>
        {time && <p className="mt-1.5 text-right text-[10px] text-[#9A8FA6]">{time}</p>}
      </div>
    </div>
  );
}
