"use client";

import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  limit,
  limitToLast,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type QueryDocumentSnapshot,
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
  roomDisplayName,
} from "../../../lib/rooms";
import { ChatBar } from "../../_components/ChatBar";
import { GiftNamePicker, giftPickerQuery } from "../../_components/GiftNamePicker";
import { SwipeToReply } from "../../_components/SwipeToReply";
import { ReactionShakeEmoji } from "../../_components/ReactionShakeEmoji";
import {
  addOpenRoom,
  deletePresenceUnlessParked,
  isRoomOpen,
  postStaleLeaveLineOnce,
  readOpenRooms,
  removeOpenRoom,
} from "../../../lib/openRooms";
import { readRoomSession, writeRoomSession, type SessionMessage } from "../../../lib/roomSession";
import { useSenderColors } from "../../../lib/senderColors";
import { PageShell } from "../../_components/PageShell";
import {
  GiftPanel,
  loadGiftCatalog,
  type Gift,
  type GiftResult,
} from "../../_components/GiftPanel";
import { hideGameTableLine, useGameTablesVersion } from "../../../lib/gameTables";
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
  TpCardFace,
  teenPattiHandleCommand,
  useTeenPatti,
} from "../../_components/TeenPatti";
import { CRICKET_ROOM, CricketBox, cricketHandleCommand, useCricket } from "../../_components/CricketGame";
import { TN_FREE_ROOM, TN_ROOM, TwentyNineTable, twentyNineHandleCommand, useTwentyNine } from "../../_components/TwentyNine";
import { CricketCelebrationHost } from "../../_components/CricketCelebration";
import { TRIVIA_ROOM, TriviaPanel, triviaHandleCommand, useTrivia } from "../../_components/Trivia";
import { LOWCARD_ROOM, LowCardBox, lowCardHandleCommand, useLowCard } from "../../_components/LowCard";
import { LUDO_FREE_ROOM, LUDO_ROOM, LudoTable, ludoHandleCommand, useLudo } from "../../_components/Ludo";
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
  setEntryLevel,
  setModerator,
  type ModContext,
  type RoomInfo,
} from "../../../lib/roomModeration";
import { isMainFounderName, useFounderPerms } from "../../../lib/founder";
import { useBadgeImages } from "../../../lib/badgeImages";
import { chatPx, useChatTextSize } from "../../../lib/chatTextSize";
import { withEmotes } from "../../_components/Emote";
import { BackPill } from "../../_components/BackButton";
import { RoomInfoPage } from "../../_components/RoomInfoPage";
import { RainbowName } from "../../_components/RainbowName";
import { RoomLinkDialog, YouTubePreviewCard, withLinks } from "../../_components/RoomLinks";
import { findRoomLinks, firstYouTubeLink } from "../../../lib/roomLinks";
import { useSpecialColors } from "../../../lib/specialColor";
import { brandMiglife, MIGLIFE_DISPLAY_NAME } from "../../../lib/brand";
import { canBeInvisibleByRole } from "../../../lib/invisible";
import { migIdFromAliasEmail } from "../../../lib/migAlias";
import { noteServerTime, serverNow, serverTimeKnown } from "../../../lib/serverTime";
import { RoomFireworksHost, RoomHeartsHost } from "../../_components/RoomEffects";
import { EntryEffectHost } from "../../_components/EntryEffects";
import { useIsClassic } from "../../../lib/uiStyle";

type ChatMessage = SessionMessage;

type RoomUser = { uid: string; username: string; level: number; lastSeenMs: number; parkedUntil?: number };

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
  const specialColors = useSpecialColors();
  // 🔗 a link tapped in the room chat (normal link → "leaving miglife" check,
  // YouTube → plays here in a popup).
  const [pendingLink, setPendingLink] = useState<string | null>(null);
  // Own message → who reacted with an emoji.
  const [reactors, setReactors] = useState<{ emoji: string; uids: string[] } | null>(null);
  // This open tab's saved session (lib/roomSession): coming back to the tab
  // shows the same chat, draft and scroll position, like the app.
  const [initial] = useState(() => (user && isRoomOpen(user.uid, roomName) ? readRoomSession(user.uid, roomName) : null));

  const [profile, setProfile] = useState<Profile | null>(null);
  const specialHasMe = specialColors.has(profile?.username);
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
  const classic = useIsClassic();
  // 📟 Classic: light grey info boxes with dark-red system text (the app's RoomHeaderBrush).
  const infoBox = classic
    ? "rounded border border-[#C9D2DE] bg-gradient-to-b from-[#F6F7F9] to-[#ECEFF3] text-[#9A2E14]"
    : "rounded-xl border border-[#1B8F7A] bg-gradient-to-r from-[#1FA2B8] to-[#2FAE85] text-white";
  // Swipe right on someone's message to reply (same "↩ name: snippet" quote the app writes).
  const [replyTo, setReplyTo] = useState<{ sender: string; snippet: string } | null>(initial?.replyTo ?? null);
  const [sending, setSending] = useState(false);
  const [showUsers, setShowUsers] = useState(false);
  // ⋮ Room menu (like the app's) and its Room Info / Kick User sheets.
  const [menuOpen, setMenuOpen] = useState(false);
  // The Participants panel beside the room menu (like the app).
  const [menuPeople, setMenuPeople] = useState(false);
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
  // How many new lines arrived while you were scrolled up (the ⬇ pill, like the app).
  const [newBelow, setNewBelow] = useState(0);
  const lastSeenIdRef = useRef<string | null>(null);
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

  // One reaction per person per message, like the app: the same emoji again
  // clears it; a new one moves it (both in one update).
  const setRoomReaction = (m: ChatMessage, emoji: string) => {
    const uid = user?.uid;
    if (!uid || !m.id || m.local) return;
    const ref = doc(db, "room_messages", roomName, "messages", m.id);
    const previous = Object.entries(m.reactions || {}).find(([, uids]) => uids.includes(uid))?.[0];
    if (previous === emoji) {
      updateDoc(ref, { [`reactions.${emoji}`]: arrayRemove(uid) }).catch(() => {});
      return;
    }
    const updates: Record<string, unknown> = { [`reactions.${emoji}`]: arrayUnion(uid) };
    if (previous) updates[`reactions.${previous}`] = arrayRemove(uid);
    updateDoc(ref, updates).catch(() => setDoc(ref, { reactions: { [emoji]: [uid] } }, { merge: true }).catch(() => {}));
  };

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
  // 🤖 LowCard / Cricket Bot switched on in THIS room (/bot lowcard,
  // /bot cricket — room_bots/{room} is written by the roomBotControl Cloud Function).
  const [roomActiveBot, setRoomActiveBot] = useState<string | null>(null);
  useEffect(() => {
    setRoomActiveBot(null);
    if (!user || !roomName) return;
    return onSnapshot(
      doc(db, "room_bots", roomName),
      (d) => setRoomActiveBot(String(d.get("bot") || "") || null),
      // Usually the rules not letting us read room_bots — keep what we know instead of wiping it.
      (err) => console.error("room_bots listener failed", err)
    );
  }, [user, roomName]);
  // 🏏 Cricket (the Cricket room, or any room where Cricket Bot is on).
  const cricket = useCricket(roomName === CRICKET_ROOM || roomActiveBot === "cricket" ? roomName : null, user?.uid, note);
  // 🃏 29 table (only in the 29 room).
  const twentyNine = useTwentyNine(roomName === TN_ROOM || roomName === TN_FREE_ROOM ? roomName : null, user?.uid, note);
  // 🃏 LowCard (the LowCard room, or any room where LowCard Bot is on).
  const lowCard = useLowCard(roomName === LOWCARD_ROOM || roomActiveBot === "lowcard" ? roomName : null, user?.uid, note);
  // 🧠 Trivia (the Trivia room, or a chat room where /bot trivia is on).
  const trivia = useTrivia(roomName === TRIVIA_ROOM || roomActiveBot === "trivia" ? roomName : null, user?.uid, note);
  // 🎲 Ludo (only in the Ludo room).
  const ludo = useLudo(roomName === LUDO_ROOM || roomName === LUDO_FREE_ROOM ? roomName : null, user?.uid, note);

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
          username: String(snap.get("username") || migIdFromAliasEmail(user.email) || ""),
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
    () => {
      const p = roomPerms(roomInfo, user?.uid || "", profile?.username || "", profile?.role || "", founder.isHiddenFounder);
      // 🌈 Special Edition Colour holders may always share pictures and voice.
      return specialHasMe ? { ...p, canShareMedia: true } : p;
    },
    [roomInfo, user, profile, founder.isHiddenFounder, specialHasMe]
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
    if (perms.bypassesEntry) {
      // Their rights arrived after the level / lock message (e.g. a hidden
      // founder whose founder record loaded late): let them in after all.
      setBlocked((b) => (b.startsWith("This room needs level") || b.startsWith("🔒 This room is locked") ? "" : b));
      return;
    }
    if (!profile || !roomLoaded || !modLoaded) return;
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
            reactions: Object.fromEntries(
              Object.entries((d.get("reactions") || {}) as Record<string, unknown>)
                .map(([e, uids]) => [e, Array.isArray(uids) ? uids.filter((u): u is string => typeof u === "string") : []] as const)
                .filter(([, uids]) => uids.length > 0)
            ),
            // Pending (just-sent) messages have no server time yet.
            createdAtMs: toMillis(d.get("createdAt", { serverTimestamps: "estimate" })),
          }))
        );
      },
      (err) => console.error("room chat listener failed", err)
    );
  }, [user, roomName]);

  // Who is in the room.
  const staleHandled = useRef(new Set<string>());
  useEffect(() => {
    if (!user) return;
    return onSnapshot(
      collection(db, "room_presence", roomName, "users"),
      (snap) => {
        // Like the app: someone gone 3 h without a heartbeat (and not parked)
        // is cleared by whoever is watching, and their "has left" is posted
        // right after (the rules only accept a watcher's line once the doc is
        // gone). Invisible people were never announced, so no line.
        // SERVER time, not this computer's clock (like the app): a clock
        // running hours ahead would think everybody is stale and clear them.
        // Learned from my own heartbeat's server stamp; until then, no clearing.
        const mine = snap.docs.find((d) => d.id === user.uid);
        if (mine && !mine.metadata.hasPendingWrites) noteServerTime(toMillis(mine.get("lastSeen")));
        if (!serverTimeKnown()) return void setPresence(presenceList(snap.docs));
        const now = serverNow();
        const cutoff = now - ROOM_PRESENCE_STALE_MS;
        snap.docs.forEach((d) => {
          if (d.id === user.uid) return;
          const seen = toMillis(d.get("lastSeen", { serverTimestamps: "estimate" }));
          const parked = Number(d.get("parkedUntil") || 0) > now;
          if (!seen || seen >= cutoff || parked || staleHandled.current.has(d.id + seen)) return;
          staleHandled.current.add(d.id + seen);
          const name = String(d.get("username") || "").trim();
          const hidden = String(d.get("presenceStatus") || "").trim().toUpperCase() === "INVISIBLE";
          const shop = d.get("shopBadges");
          deleteDoc(d.ref)
            .then(() => {
              if (!hidden && name) {
                postStaleLeaveLineOnce(
                  roomName,
                  d.id,
                  name,
                  Number(d.get("level") || 1),
                  Array.isArray(shop) ? shop.map(String) : [],
                  String(d.get("visitId") || "") || null
                );
              }
            })
            .catch(() => {});
        });
        setPresence(presenceList(snap.docs));
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
          // Loaded after a ban / kick was already shown: let them in after all.
          setBlocked((b) => (b === "You are banned from this room." || b === "You were kicked from this room." ? "" : b));
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
    // Also wait for the founder record: a hidden founder may enter invisibly.
    if (!user || !profile || blocked || !roomLoaded || !modLoaded || !myModLoaded || !founder.loaded) return;
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
    // Presence Status "INVISIBLE" only work for the Founder, official Admins
    // and Staff — in every room (a private room's owner / Super Mods can no
    // longer hide). Everybody else enters normally, with "has entered" / "has left".
    const invisibleAllowed =
      permsRef.current.isOwnerUser ||
      permsRef.current.isHiddenFounder ||
      canBeInvisibleByRole(profile.username, profile.role);
    const hideMe = profile.invisible && invisibleAllowed; // no presence doc at all
    const quietMe = profile.quiet && invisibleAllowed; // no entered / left lines
    const presenceRef = doc(db, "room_presence", roomName, "users", uid);
    const leaveKey = `${uid}|${roomName}`;
    let visitId: string | null = null;
    let left = false;
    let disposed = false; // this effect was cleaned up (a leave may be pending)
    let heartbeat: ReturnType<typeof setInterval> | null = null;
    // The presence write in flight (entering, or a heartbeat re-entering). A
    // leave waits for it, so the spot can't be written again AFTER it was
    // deleted and its "has left" posted (a ghost in "Currently in this room").
    let presenceWrite: Promise<unknown> = Promise.resolve();

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
      const leftVisit = visitId;
      // "has left" only once the delete really went through: a /parked spot
      // stays in the room and gets no line (like the app).
      presenceWrite.then(() => deletePresenceUnlessParked(presenceRef)).then((deleted) => {
        if (!deleted || quietMe) return;
        setDoc(doc(db, "room_messages", roomName, "messages", leaveDocId(uid, leftVisit)), {
          text: presenceLine(roomName, profile.username, profile.level, false, profile.badges),
          sender: profile.username,
          senderUid: uid,
          type: "room_leave",
          createdAt: serverTimestamp(),
        }).catch(() => {});
      });
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
      // The old visit that ended by inactivity (doc still here, but stale).
      let staleOld: { name: string; level: number; badges: string[]; visitId: string | null; hidden: boolean } | null = null;
      for (let attempt = 0; attempt < 5 && !left; attempt++) {
        try {
          const existing = await getDocFromServer(presenceRef);
          checked = true;
          if (existing.exists()) {
            const lastSeen = toMillis(existing.get("lastSeen", { serverTimestamps: "estimate" }));
            const parkedUntil = Number(existing.get("parkedUntil") || 0);
            const fresh =
              lastSeen >= serverNow() - ROOM_PRESENCE_STALE_MS || parkedUntil > serverNow();
            if (fresh) {
              alreadyHere = true;
              visitId = String(existing.get("visitId") || "") || null;
              existingMarkerMs = toMillis(existing.get("entryMarker"));
            } else {
              const shop = existing.get("shopBadges");
              staleOld = {
                name: String(existing.get("username") || "").trim() || profile.username,
                level: Number(existing.get("level") || 1),
                badges: Array.isArray(shop) && shop.length ? shop.map(String) : profile.badges,
                visitId: String(existing.get("visitId") || "") || null,
                hidden: String(existing.get("presenceStatus") || "").trim().toUpperCase() === "INVISIBLE",
              };
            }
          }
          break;
        } catch (err) {
          console.error(err);
          await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
        }
      }
      if (!checked) {
        alreadyHere = true;
        // Like the app: the server couldn't be reached (network not ready yet
        // after the laptop/phone woke up). A recent saved visit is resumed
        // instead of starting fresh, which hid everything said before now.
        const saved = savedEntry(uid, roomName);
        if (saved && saved.visitId !== "invisible" && Date.now() - saved.at < ROOM_PRESENCE_STALE_MS) {
          visitId = visitId || saved.visitId;
        }
      }
      // Like the app: the previous visit timed out (3 h without heartbeat) but
      // nobody posted its "has left". Close that old visit FIRST, so the chat
      // reads "has left" → "has entered". (The new visit gets a new visitId.)
      if (staleOld && !alreadyHere && !staleOld.hidden && !left) {
        await postStaleLeaveLineOnce(roomName, uid, staleOld.name, staleOld.level, staleOld.badges, staleOld.visitId);
      }
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
            (d) => d.id !== uid && toMillis(d.get("lastSeen", { serverTimestamps: "estimate" })) >= fresh
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

      await (presenceWrite = setDoc(
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
      ).catch((err) => console.error("presence write failed", err)));

      // Where this visit's chat starts.
      if (alreadyHere) {
        const saved = savedEntry(uid, roomName);
        const at =
          tabSession?.sinceMs ??
          (saved && (saved.visitId === visitId || (existingMarkerMs > 0 && Math.abs(existingMarkerMs - saved.at) < 1000))
            ? saved.at // the same visit: its visitId, or its own entry marker (a heartbeat may rewrite the id)
            : existingMarkerMs || Date.now() - 30_000);
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
        // updateDoc, not a merge: if someone cleared this presence doc (3 h
        // without a heartbeat, e.g. a sleeping laptop), it must not come back
        // as a nameless half doc. Instead this is a new visit, like the app:
        // full presence doc + "has entered".
        updateDoc(presenceRef, { lastSeen: serverTimestamp() }).catch((err) => {
          if (err?.code !== "not-found" || left || disposed) return;
          visitId = newVisitId();
          presenceWrite = setDoc(presenceRef, {
            uid,
            username: profile.username,
            activity: "",
            level: profile.level,
            levelBadgeIcon: profile.badge,
            shopBadges: [],
            presenceStatus: quietMe ? "INVISIBLE" : "ONLINE",
            lastSeen: serverTimestamp(),
            visitId,
            entryMarker: serverTimestamp(),
          }).catch(() => {});
          if (!quietMe) {
            addDoc(collection(db, "room_messages", roomName, "messages"), {
              text: presenceLine(roomName, profile.username, profile.level, true, profile.badges),
              sender: profile.username,
              senderUid: uid,
              type: "room_entry",
              createdAt: serverTimestamp(),
            }).catch(() => {});
          }
        });
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
  }, [user, profile, roomName, blocked, roomLoaded, modLoaded, myModLoaded, founder.loaded]);

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

  // Live "is a game running?" line for game rooms (and chat rooms with a game
  // bot on), shown under the 📢 announcement — only to someone who has no line
  // from that bot in their chat yet (they came in after the game started).
  const [gameStatusLine, setGameStatusLine] = useState<string | null>(null);
  useEffect(() => {
    const botName =
      roomName === CRICKET_ROOM
        ? "Cricket Bot"
        : roomName === LOWCARD_ROOM
          ? "LowCard Bot"
          : roomName === LUDO_ROOM || roomName === LUDO_FREE_ROOM
            ? "Ludo Bot"
            : roomName === ROYALE_ROOM
              ? "MIG Royale Bot"
              : roomName === TN_ROOM || roomName === TN_FREE_ROOM
                ? "29 Bot"
                : roomName === TEEN_PATTI_ROOM
                  ? "Teen Patti Bot"
                  : roomActiveBot === "lowcard"
                    ? "LowCard Bot"
                    : roomActiveBot === "cricket"
                      ? "Cricket Bot"
                      : null;
    if (!botName || !user) {
      setGameStatusLine(null);
      return;
    }
    const free = roomName === TN_FREE_ROOM || roomName === LUDO_FREE_ROOM;
    const manyTables = [LUDO_ROOM, LUDO_FREE_ROOM, TEEN_PATTI_ROOM, TN_ROOM, TN_FREE_ROOM].includes(roomName);
    return onSnapshot(
      doc(db, "room_game", roomName),
      (d) => {
        // 29 writes "running" / "entry" (the other games "gameRunning" / "entryCost")
        const running = d.get("gameRunning") === true || d.get("running") === true;
        const phase = String(d.get("phase") || "").toUpperCase();
        const cost = Number(d.get("entryCost") ?? d.get("entry") ?? d.get("fee") ?? d.get("boot") ?? 200);
        const costText = free ? "free — no coins" : `${cost.toLocaleString()} coins`;
        const gameName = botName.replace(/ Bot$/, "");
        setGameStatusLine(
          running && phase.includes("JOIN")
            ? `${botName}: ${gameName} game is running. !j to join. Cost ${costText}`
            : running && manyTables
              ? `${botName}: Games are running. Type !start to open your own table (many tables can play at once).`
              : running
                ? `${botName}: A ${gameName} game is in progress. Wait for it to finish, then type !start to play.`
                : `${botName}: No game running. Type !start to start a game (cost ${costText}).`
        );
      },
      () => {}
    );
  }, [roomName, roomActiveBot, user]);
  const statusBotInFeed = useMemo(() => {
    if (!gameStatusLine) return false;
    const prefix = gameStatusLine.slice(0, gameStatusLine.indexOf(":") + 1).toLowerCase();
    return shown.some((m) => {
      const l = m.text.trimStart().toLowerCase();
      return l.startsWith(prefix) || l.includes(` ${prefix}`);
    });
  }, [gameStatusLine, shown]);

  // Eye mode (Luxury Bet): other people's bet lines are taken out of the list.
  const myName = (profile?.username || "").toLowerCase();
  // 🎴 Many tables at once: only the bot lines of the table this phone shows.
  const tablesVersion = useGameTablesVersion();
  const tableGame = roomName === TEEN_PATTI_ROOM ? "tp" : roomName === TN_ROOM || roomName === TN_FREE_ROOM ? "tn" : roomName === LUDO_ROOM || roomName === LUDO_FREE_ROOM ? "ludo" : null;
  const visible = useMemo(() => {
    const blocked = new Set(blockedNames);
    return shown.filter((m) => {
      if (tableGame && m.type !== "room_entry" && m.type !== "room_leave" && hideGameTableLine(tableGame, m.text)) return false;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, onlyMyBets, myName, blockedNames, myUid, tableGame, tablesVersion]);

  // ✋ New lines never drag you down while you read older ones: they are
  // counted for the "⬇ new messages" pill instead (your own lines don't count).
  useEffect(() => {
    const last = visible.length ? visible[visible.length - 1].id : null;
    const prev = lastSeenIdRef.current;
    lastSeenIdRef.current = last;
    if (stickToBottom.current) {
      setNewBelow(0);
      return;
    }
    if (!prev || last === prev) return;
    const i = visible.findIndex((m) => m.id === prev);
    const added = i >= 0 ? visible.slice(i + 1).filter((m) => !(m.senderUid && m.senderUid === myUid)).length : 0;
    if (added > 0) setNewBelow((n) => n + added);
  }, [visible, myUid]);

  // Uploaded pictures for the badges in the enter/left lines.
  const badgeImages = useBadgeImages(!!user);
  // Room text size (Settings → Chat), in px.
  const fontPx = chatPx(useChatTextSize());

  // Game rooms read as a plain running log: every line on the left.
  const gameRoom = [LUXURY_ROOM, LUXURY_BET_ROOM, LOWCARD_ROOM, TEEN_PATTI_ROOM, LUDO_ROOM, LUDO_FREE_ROOM, CRICKET_ROOM, ROYALE_ROOM, TN_ROOM, TN_FREE_ROOM, TRIVIA_ROOM].includes(roomName);
  // Game rooms get no Entry Effects (like the app's isEntryFxGameRoom).
  const entryFxGameRoom =
    gameRoom ||
    !!roomActiveBot ||
    [LUXURY_ROOM, LUXURY_BET_ROOM, LOWCARD_ROOM, TEEN_PATTI_ROOM, LUDO_ROOM, LUDO_FREE_ROOM, CRICKET_ROOM, ROYALE_ROOM, TN_ROOM, TN_FREE_ROOM, TRIVIA_ROOM].some((g) =>
      roomName.startsWith(`${g} #`)
    );

  // Name colours (role / Color Shop / Lucky pink) for everyone in the chat.
  const colorOf = useSenderColors(
    useMemo(
      () => shown.map((m) => (m.sender ? m.sender : m.text.slice(0, Math.max(0, m.text.indexOf(":")))).trim()),
      [shown]
    )
  );

  // People in the room: fresh presence, and (like the app) a "has left" wins
  // unless a newer "has entered" came after it, or the person really kept being
  // active for 5+ minutes after it — a last heartbeat landing a moment AFTER the
  // "has left" no longer keeps a ghost in "Currently in this room".
  const roomUsers = useMemo(() => {
    const leftAt = new Map<string, number>();
    const enteredAt = new Map<string, number>();
    messages.forEach((m) => {
      if ((m.type === "room_leave" || m.type === "room_entry") && m.senderUid && m.createdAtMs > 0) {
        const map = m.type === "room_leave" ? leftAt : enteredAt;
        map.set(m.senderUid, Math.max(map.get(m.senderUid) || 0, m.createdAtMs));
      }
    });
    const cutoff = serverNow() - ROOM_PRESENCE_STALE_MS;
    return presence
      // Like the app: a fresh heartbeat, no heartbeat stamp yet, or a /parked spot.
      .filter((p) => p.username && (!p.lastSeenMs || p.lastSeenMs >= cutoff || (p.parkedUntil || 0) > serverNow()))
      .filter((p) => {
        if (p.uid === user?.uid) return true;
        const left = leftAt.get(p.uid);
        if (!left) return true;
        return (enteredAt.get(p.uid) || 0) > left || p.lastSeenMs > left + 5 * 60_000;
      })
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

    // 🤖 ROOM BOTS — /bot lowcard · /bot cricket: ANYBODY switches a game bot
    // on in a public or private chat room; the full game then runs there for
    // everyone (!start, !j, …). /bot stop switches it off — while a game is
    // running only app Admin / Staff / Super Admin or the private room's owner
    // may stop it (the server refunds everyone). roomBotControl checks the
    // same rules on the server; this only gives a quick, friendly answer.
    const botCmd = clean.trim().match(/^\/bot(?:\s+(\S+))?$/i);
    if (botCmd) {
      setText("");
      const arg = (botCmd[1] || "").toLowerCase();
      const botLabel = (bot: string | null) => (bot === "cricket" ? "Cricket Bot" : bot === "trivia" ? "Trivia Bot" : "LowCard Bot");
      if (!["lowcard", "cricket", "trivia", "stop"].includes(arg)) {
        note("🤖 Use /bot lowcard, /bot cricket or /bot trivia to add a game bot, /bot stop to remove it.");
        return;
      }
      // chat rooms only (public or private) — never inside a game room
      // (also every extra game table "… #2", and the free game rooms)
      if (
        / official$/i.test(roomName.trim().replace(/ #\d+$/, "")) ||
        roomName.startsWith("🎰 Luxury Bet") ||
        roomName.startsWith(TN_FREE_ROOM) ||
        roomName.startsWith(LUDO_FREE_ROOM)
      ) {
        note("🤖 Game bots can be added only in chat rooms (public or private), not in game rooms.");
        return;
      }
      let which: string;
      let act: string;
      if (arg === "stop") {
        // roomActiveBot can be null when room_bots couldn't be read — the
        // server then stops whichever bot is on (or says none is).
        const gameRunning =
          roomActiveBot === "lowcard"
            ? lowCard?.running === true
            : roomActiveBot === "cricket"
              ? cricket?.running === true
              : roomActiveBot === "trivia"
                ? trivia?.running === true
                : false;
        const canStopRunningGame = perms.isAppStaffHere || (perms.isUserRoom && !!roomInfo.ownerUid && roomInfo.ownerUid === user.uid);
        if (gameRunning && !canStopRunningGame) {
          note(`${botLabel(roomActiveBot)}: A game is running. Only Admin, Staff, Super Admin or the room owner can stop it.`);
          return;
        }
        which = roomActiveBot || "";
        act = "stop";
      } else {
        if (roomActiveBot && roomActiveBot !== arg) {
          note(`${botLabel(roomActiveBot)} is already on in this room. Type /bot stop first.`);
          return;
        }
        which = arg;
        act = "start";
      }
      httpsCallable<{ roomId: string; bot: string; action: string }, { already?: boolean; stopped?: string }>(functions, "roomBotControl")({
        roomId: roomName,
        bot: which,
        action: act,
      })
        .then(({ data }) => {
          // Show / hide the game box right away from the server's answer —
          // don't depend only on the room_bots listener.
          if (act === "start") setRoomActiveBot(which);
          else if (data?.stopped) setRoomActiveBot(null);
          if (data?.already === true) note(`${botLabel(which)}: already on in this room.`);
        })
        .catch((e: any) => {
          const why = e?.message || "Could not change the bot.";
          note(which ? `${botLabel(which)}: ${why}` : `🤖 ${why}`);
        });
      return;
    }
    // The old /start lowcard · /stop cricket … commands are gone.
    if (/^\/(start|stop)\s+(lowcard|cricket)$/i.test(clean.trim())) {
      setText("");
      note("🤖 This command changed — use /bot lowcard, /bot cricket or /bot stop.");
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
        { giftName?: string; recipient?: string; giftIcon?: string; recipientLevel?: number }
      >(functions, "sendGift")({ roomId: roomName, target, giftName, message })
        .then(({ data }) =>
          announceGift({
            giftName: data?.giftName || giftName,
            giftIcon: data?.giftIcon || giftByName.get(giftName.toLowerCase())?.icon || "🎁",
            recipient: data?.recipient || target,
            message,
            recipientLevel: Number(data?.recipientLevel) || undefined,
          })
        )
        .catch((e: any) => note(`🎁 That gift did not actually send: ${e?.message || "Gift sending failed."}`));
      return;
    }

    // ✨ /entry or /effects — the Entry Effects shop (like the app).
    if (/^\/(entry|effects)$/i.test(clean)) {
      setText("");
      router.push("/entry-effects");
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

    if (trivia && triviaHandleCommand(trivia, clean, note)) {
      setText("");
      return;
    }
    if (!trivia && /^!trivia\b/i.test(clean.trim())) {
      setText("");
      note("🧠 Trivia Bot is not on in this room — type /bot trivia to switch it on (chat rooms only).");
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

    if (twentyNine && twentyNineHandleCommand(twentyNine, clean, note)) {
      setText("");
      return;
    }

    if (cricket && cricketHandleCommand(cricket, clean, note, 200)) {
      setText("");
      return;
    }

    if (teenPatti && teenPattiHandleCommand(teenPatti, clean, note)) {
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
  const announceGift = async (r: GiftResult) => {
    if (!user || !profile) return;
    // The receiver's level (like the app): the server's answer first, then
    // who is in the room, else their profile — so it shows even when the
    // person is not in the room.
    let recipientLevel: number | undefined = r.recipientLevel && r.recipientLevel > 0 ? r.recipientLevel : undefined;
    recipientLevel ??= roomUsers.find((u) => u.username.toLowerCase() === r.recipient.toLowerCase())?.level;
    if (recipientLevel === undefined) {
      try {
        const snap = await getDocs(query(collection(db, "users"), where("username", "==", r.recipient), limit(1)));
        const lvl = Number(snap.docs[0]?.get("level"));
        if (lvl > 0) recipientLevel = Math.floor(lvl);
      } catch {
        // no level then
      }
    }
    const tag = recipientLevel ? ` [${recipientLevel}]` : "";
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
  // ⋮ Room menu helpers (like the app's RoomMenuContent).
  const closeMenu = () => {
    setMenuOpen(false);
    setMenuPeople(false);
  };
  const prefill = (cmd: string) => {
    closeMenu();
    setText(cmd);
    setTimeout(() => inputRef.current?.focus(), 0);
  };
  const runCommand = (cmd: string) => {
    closeMenu();
    const ctx = modCtx();
    if (ctx) handleModCommand(cmd, ctx);
  };
  const myRole: [string, string, string] = perms.isOwnerUser || perms.isThisRoomOwner
    ? ["★ OWNER", "#FFD35A", "#5A3B00"]
    : perms.isRoomAdmin
      ? ["🔰 ADMIN", "#FFE4E4", "#B91C1C"]
      : perms.isRoomMod
        ? ["🔰 STAFF", "#FFE4E4", "#B91C1C"]
        : perms.isPrivateSuperMod
          ? ["⭐ SUPER MOD", "#EFE7FF", "#5B2BD6"]
          : perms.isPrivateMod
            ? ["🛡 MOD", "#DFF7EA", "#15803D"]
            : ["👤 MEMBER", "#E3F3FF", "#0369A1"];
  const canModMenu = perms.isAppStaffHere || perms.canModeratePrivate;
  const modTiles: [string, string, () => void][] = [
    ...(perms.canKick ? ([["👢", "Kick", () => (closeMenu(), setKickOpen(true))]] as [string, string, () => void][]) : []),
    ["🔇", "Mute", () => prefill("/mute ")],
    ["⛔", "Ban", () => prefill("/ban ")],
    ["🔒", locked ? "Unlock" : "Lock", () => runCommand(locked ? "/unlock" : "/lock")],
    ["🤫", silenced ? "Unsilence" : "Silence", () => runCommand(silenced ? "/unsilence room" : "/silence room")],
    ["📌", "Announce", () => prefill("/announcement ")],
    ...(perms.canBroadcast ? ([["📢", "Broadcast", () => prefill("/broadcast ")]] as [string, string, () => void][]) : []),
    ...(perms.isUserRoom && perms.canManagePrivate ? ([["🛡", "+ Mod", () => prefill("/mod ")]] as [string, string, () => void][]) : []),
    ...(perms.isUserRoom && perms.canAssignSuperMod ? ([["⭐", "+ S.Mod", () => prefill("/smod ")]] as [string, string, () => void][]) : []),
    ...((perms.isUserRoom && perms.canManagePrivate) || perms.isRoomAdmin
      ? ([["⚙️", "Settings", () => (closeMenu(), setInfoOpen(true))]] as [string, string, () => void][])
      : []),
  ];

  return (
    <PageShell light bottomNav={false}>
      <RoomLinkDialog url={pendingLink} onClose={() => setPendingLink(null)} />
      {reactors && <ReactorsDialog emoji={reactors.emoji} uids={reactors.uids} onClose={() => setReactors(null)} />}
      <div className="relative mx-auto flex h-screen-minus-bar max-w-5xl flex-col px-2 pt-2 sm:px-6 sm:py-3">
        <div className="flex min-h-0 flex-1 gap-3">
          {/* Messages */}
          <div className={`relative flex min-w-0 flex-1 flex-col overflow-hidden rounded-t-2xl border border-b-0 border-[#CFE3F5] sm:rounded-b-2xl sm:border-b ${classic ? "bg-white" : "bg-[#E8F4FC]"}`}>
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
                if (stickToBottom.current) setNewBelow((n) => (n ? 0 : n));
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
                <p className={`${infoBox} px-3.5 py-2.5 text-[15px]`}>
                  👥 This room is managed by: {isMainFounderName(roomInfo.ownerName) ? MIGLIFE_DISPLAY_NAME : roomInfo.ownerName || MIGLIFE_DISPLAY_NAME}
                </p>
                <p className={`whitespace-pre-wrap ${infoBox} px-3.5 py-2.5 text-[15px]`}>
                  {roomDescription}
                </p>
                {locked && (
                  <p className="rounded-xl border border-[#D85A30] bg-[#4A1B0C] px-3.5 py-2.5 text-[13px] font-bold text-[#F0997B]">
                    🔒 This room is locked. Only admins/mods can enter until it&apos;s unlocked.
                  </p>
                )}
                <div className={`${infoBox} px-3.5 py-2.5 text-[15px]`}>
                  <p>👫 Currently in this room:</p>
                  {roomUsers.length > 0 && <p className={`mt-1 ${classic ? "text-[#16315F]" : "text-black"}`}>{roomUsers.map((u) => brandMiglife(u.username)).join(", ")}</p>}
                </div>
                {/* Room announcement (/announcement), pinned under who is here, like the app */}
                {announcement && (
                  <div className="flex items-start gap-2 rounded-[14px] border border-[#EF9F27] px-3.5 py-2.5">
                    <span className="text-lg leading-none">📢</span>
                    <p className="min-w-0 flex-1 whitespace-pre-wrap text-[15px] leading-[21px] text-[#8A5A00]">{announcement}</p>
                  </div>
                )}
                {gameStatusLine && !statusBotInFeed && (
                  <p className="rounded-[14px] bg-white px-3 py-2.5 text-[15px] leading-[21px] text-[#16315F] shadow-sm">
                    <b className="text-[#1B8A3A]">{gameStatusLine.slice(0, gameStatusLine.indexOf(":"))}</b>
                    {gameStatusLine.slice(gameStatusLine.indexOf(":"))}
                  </p>
                )}
              </div>
              {luxuryBet?.canSee && <LuxuryBetWelcomeLine state={luxuryBet} />}
              {visible.map((m) => (
                <MessageRow
                  key={m.id}
                  m={m}
                  mine={!!m.senderUid && m.senderUid === user.uid}
                  classic={classic}
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
                  onLink={setPendingLink}
                  myUid={user.uid}
                  onReact={(emoji) => setRoomReaction(m, emoji)}
                  onShowReactors={(emoji, uids) => setReactors({ emoji, uids })}
                  onReply={(sender, snippet) => {
                    setReplyTo({ sender, snippet });
                    inputRef.current?.focus();
                  }}
                />
              ))}
              </div>
              {/* ⬇ NEW MESSAGES: only while you are scrolled up reading older lines */}
              {newBelow > 0 && (
                <div className="pointer-events-none sticky bottom-0 flex h-0 justify-center">
                  <button
                    type="button"
                    onClick={() => {
                      const el = listRef.current;
                      stickToBottom.current = true;
                      setNewBelow(0);
                      el?.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
                    }}
                    className={`pointer-events-auto h-fit -translate-y-11 rounded-full px-3.5 py-1.5 text-[13px] font-bold text-white shadow-lg ${classic ? "bg-gradient-to-b from-[#FF9D2E] to-[#F07A00]" : "bg-gradient-to-r from-[#833AB4] via-[#5B5BF0] to-[#0072FF]"}`}
                  >
                    ⬇ {newBelow} new message{newBelow === 1 ? "" : "s"}
                  </button>
                </div>
              )}
            </div>

            {/* 🎆 a game win, ❤️ /love, ✨ someone's entry effect — the whole room sees it */}
            <RoomFireworksHost messages={messages} roomKey={roomName} />
            <RoomHeartsHost messages={messages} roomKey={roomName} />
            {/* ✨ Entry Effects play only in CHAT rooms — never in game rooms (official
                game rooms, their extra "#2" tables, or any room with a game bot on). */}
            {!entryFxGameRoom && <EntryEffectHost messages={messages} roomKey={roomName} myName={profile?.username || ""} />}

            {/* Game tables keep their dark look */}
            {(luxury || luxuryBet || royale || teenPatti || cricket || twentyNine || lowCard || ludo) && (
              <div data-noswipe className="bg-[#0B1F3A] text-white">
                {luxury && <LuxuryBetBox state={luxury} uid={user.uid} note={note} />}
                {luxuryBet && (
                  <LuxuryBetTable state={luxuryBet} uid={user.uid} onlyMine={onlyMyBets} onToggleOnlyMine={() => setOnlyMyBets((v) => !v)} />
                )}
                {royale && <RoyaleTable state={royale} />}
                {teenPatti && profile && <TeenPattiTable state={teenPatti} uid={user.uid} myUsername={profile.username} roomUsers={roomUsers.map((u) => u.username)} />}
                {cricket && <CricketBox state={cricket} uid={user.uid} />}
                {/* 🎉 SIX/FOUR clapping, OUT finger, DRS third-umpire pop-ups */}
                {cricket && profile && <CricketCelebrationHost messages={messages} roomKey={roomName} myName={profile.username} />}
                {twentyNine && <TwentyNineTable state={twentyNine} roomUsers={roomUsers.map((u) => u.username)} />}
                {lowCard && <LowCardBox state={lowCard} uid={user.uid} />}
                {ludo && <LudoTable state={ludo} myUsername={profile?.username || ""} roomUsers={roomUsers.map((u) => u.username)} />}
              </div>
            )}

            {/* 🧠 Trivia panel above the input bar (light, like the app) */}
            {trivia && (
              <div data-noswipe>
                <TriviaPanel state={trivia} uid={user.uid} isStaff={perms.isAppStaffHere} />
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
                <VoiceRecorder
                  disabled={!profile || !perms.canShareMedia}
                  onSend={sendVoice}
                  onError={(m) => note(`${roomName}: ${m}`)}
                  onActive={setVoiceActive}
                />
                {/* ▶ after 🎤, like the app (hidden while recording) */}
                {luxuryBet && !voiceActive && <LuxuryBetStartButton state={luxuryBet} />}
                </>
              }
              voiceActive={voiceActive}
              reply={replyTo && { ...replyTo, color: colorOf(replyTo.sender), onCancel: () => setReplyTo(null) }}
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
        <div className="fixed inset-0 z-50 flex items-end gap-2 bg-black/35 p-2 pb-safe" onClick={closeMenu}>
          {/* ✨ Room menu (half-page card), like the app: header with my role, three big
              buttons, the rest, and the moderation tiles for people who may use them. */}
          <div
            className="max-h-[85vh] w-[62%] min-w-[230px] max-w-[300px] overflow-y-auto rounded-[28px] bg-white pb-2.5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className={`px-3 py-[11px] text-white ${classic ? "bg-gradient-to-b from-[#5A8FD6] to-[#2F6ABD]" : "bg-gradient-to-br from-[#1565D8] via-[#5B5BF0] to-[#833AB4]"}`}>
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] border border-white/55 bg-white/20 text-lg">🏠</span>
                <div className="min-w-0 flex-1">
                  <p data-notranslate className="truncate text-[15px] font-bold">
                    {roomDisplayName(roomName)}
                    {locked && <span className="ml-1.5 text-sm">🔒</span>}
                    {silenced && <span className="ml-1 text-sm">🔇</span>}
                  </p>
                  <p className="flex items-center gap-1 text-[10.5px] text-[#E6EEFF]">
                    <span className="inline-block h-[7px] w-[7px] rounded-full bg-[#4ADE80]" />
                    {roomUsers.length}
                    {roomInfo.maxUsers > 0 && ` / ${roomInfo.maxUsers}`} here
                  </p>
                </div>
              </div>
              <span
                className="mt-[7px] inline-block rounded-full px-[9px] py-[3px] text-[9.5px] font-black"
                style={{ background: myRole[1], color: myRole[2] }}
              >
                {myRole[0]}
              </span>
            </div>

            {/* Three big buttons */}
            <div className="flex justify-evenly px-2 py-[9px]">
              {(
                [
                  ["ℹ️", "Info", "#E7F0FF", () => (closeMenu(), setInfoOpen(true)), 0],
                  [favorite ? "❤️" : "🤍", "Favorite", "#FFE8EE", () => toggleFavorite(roomName), 0],
                  ["👥", "People", "#E8F7EF", () => setMenuPeople((v) => !v), roomUsers.length],
                ] as [string, string, string, () => void, number][]
              ).map(([icon, label, bg, act, badge]) => (
                <button key={label} type="button" onClick={act} className="flex flex-col items-center rounded-[14px] px-1.5 py-0.5">
                  <span className="relative">
                    <span className="flex h-[42px] w-[42px] items-center justify-center rounded-[13px] text-[19px]" style={{ background: bg }}>
                      {icon}
                    </span>
                    {badge > 0 && (
                      <span className="absolute -right-[5px] -top-1 rounded-[10px] bg-[#E5484D] px-[5px] py-px text-[8.5px] font-bold text-white">
                        {badge > 99 ? "99+" : badge}
                      </span>
                    )}
                  </span>
                  <span className="mt-[3px] text-[10px] font-extrabold text-[#3A4B6B]">{label}</span>
                </button>
              ))}
            </div>

            <ul className="space-y-1.5 px-2">
              {(
                [
                  ["💰", "Check Balance", () => (closeMenu(), checkBalance())],
                  ["🧹", "Clear Chat", () => (closeMenu(), clearChat())],
                  ["📤", "Invite Friend", () => prefill("/invite ")],
                ] as [string, string, () => void][]
              ).map(([icon, label, act]) => (
                <li key={label}>
                  <button type="button" onClick={act} className="flex w-full items-center gap-2.5 rounded-2xl bg-[#F1F4F8] px-2 py-1.5 text-left text-[13px] font-semibold text-[#0B1F3A]">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#DCE7F5] text-base">{icon}</span>
                    <span className="flex-1">{label}</span>
                    <span className="pr-1 text-sm text-[#6B7A99]">›</span>
                  </button>
                </li>
              ))}
            </ul>

            {/* 🛡 Moderation — only for people who may use it */}
            {canModMenu && (
              <>
                <p className="px-3.5 pb-1 pt-[9px] text-[9.5px] font-black tracking-[0.08em] text-[#7D8AA5]">🛡 MODERATION</p>
                <div className="grid grid-cols-3 gap-[5px] px-2.5">
                  {modTiles.map(([icon, label, act]) => (
                    <button
                      key={label}
                      type="button"
                      onClick={act}
                      className="flex flex-col items-center rounded-[11px] border border-[#FFE2CF] bg-[#FFF6F0] py-1.5"
                    >
                      <span className="text-[15px] leading-5">{icon}</span>
                      <span className="max-w-full truncate px-0.5 text-[8.5px] font-extrabold text-[#8A4A1C]">{label}</span>
                    </button>
                  ))}
                </div>
              </>
            )}

            {/* Leave — red, on its own */}
            <button
              type="button"
              onClick={() => (closeMenu(), leaveRoom())}
              className="mx-2.5 mt-2 block w-[calc(100%-20px)] rounded-[14px] bg-gradient-to-r from-[#FF5F6D] to-[#E5484D] py-2.5 text-[13px] font-black text-white shadow-md"
            >
              🚪 Leave Room
            </button>
          </div>

          {menuPeople && (
            <div
              className="max-h-[70vh] min-w-[150px] max-w-[220px] overflow-y-auto rounded-[28px] bg-gradient-to-b from-[#0B2A5B] to-[#15589B] pb-2 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <p className="px-3.5 pb-3 pt-3.5 text-[13px] font-bold text-white">👥 Participants ({roomUsers.length})</p>
              <ul data-notranslate className="space-y-[5px] px-2">
                {roomUsers.map((u) => (
                  <li key={u.uid}>
                    <Link
                      href={`/profile/${encodeURIComponent(u.username)}`}
                      className="flex items-center gap-[7px] rounded-[14px] bg-white/10 px-2 py-[7px]"
                    >
                      <span className="relative shrink-0">
                        <span
                          className="flex h-[26px] w-[26px] items-center justify-center rounded-full text-[11px] font-bold text-white"
                          style={{ background: colorOf(u.username) }}
                        >
                          {u.username.charAt(0).toUpperCase() || "U"}
                        </span>
                        <span className="absolute -bottom-px -right-px h-[9px] w-[9px] rounded-full border-[1.5px] border-[#10306E] bg-[#4ADE80]" />
                      </span>
                      <span className="truncate text-[13px] font-bold" style={{ color: colorOf(u.username) }}>
                        {u.username}
                      </span>
                      {roomInfo.ownerUid && u.uid === roomInfo.ownerUid && <span className="text-[13px] font-bold text-[#FFC83D]">★</span>}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* ℹ️ Room Info — a full page with ✎ edit, like the app */}
      {infoOpen && profile && (
        <RoomInfoPage
          roomName={roomName}
          shownRoomName={roomDisplayName(roomName)}
          ownerName={isMainFounderName(roomInfo.ownerName) ? MIGLIFE_DISPLAY_NAME : roomInfo.ownerName || MIGLIFE_DISPLAY_NAME}
          description={perms.isUserRoom ? roomInfo.description : roomDescription}
          info={roomInfo}
          perms={perms}
          roomMembers={roomUsers.map((u) => u.username)}
          modName={perms.isHiddenFounder ? "Admin" : profile.username}
          onClose={() => setInfoOpen(false)}
          onNote={note}
          onSetEntryLevel={(lvl) => {
            const ctx = modCtx();
            if (ctx) setEntryLevel(ctx, lvl);
          }}
        />
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

// 🏏 Cricket Bot's {6} {4} {OUT} {NOTOUT} {DRS} tokens become "Sports TV"
// plates (slanted, shining frame, glow, metallic letters, moving shine; SIX
// and OUT pulse, SIX twinkles, DRS has a blinking red dot). Runs 0-3 are
// little red cricket balls (0 = dark dot ball) — like the app.
type CricketPlate = { icon: string; label: string; frame: string[]; inside: string[]; letters: string[]; glow: string; striped?: boolean; pulse?: boolean };
const CRICKET_PLATES: Record<string, CricketPlate> = {
  "6": { icon: "🔥", label: "SIX!", frame: ["#FFF59D", "#FFB300", "#FF6F00", "#FFF59D"], inside: ["#4A148C", "#880E4F", "#311B92"], letters: ["#FFF9C4", "#FFD54F", "#FF8F00"], glow: "#FFB300", pulse: true },
  "4": { icon: "⚡", label: "FOUR!", frame: ["#E0F7FA", "#00E5FF", "#2979FF", "#E0F7FA"], inside: ["#0D47A1", "#01579B", "#002171"], letters: ["#FFFFFF", "#80D8FF", "#00B0FF"], glow: "#00B0FF" },
  OUT: { icon: "☝", label: "OUT!", frame: ["#FFCDD2", "#FF1744", "#B71C1C", "#FFCDD2"], inside: ["#1A0000", "#3B0000"], letters: ["#FF8A80", "#FF5252", "#FF1744"], glow: "#FF1744", striped: true, pulse: true },
  NOTOUT: { icon: "✔", label: "NOT OUT", frame: ["#B9F6CA", "#00E676", "#00695C", "#B9F6CA"], inside: ["#004D40", "#1B5E20"], letters: ["#FFFFFF", "#B9F6CA", "#69F0AE"], glow: "#00E676" },
  DUCK: { icon: "🦆", label: "DUCK", frame: ["#FFF9C4", "#FFEB3B", "#F57F17", "#FFF9C4"], inside: ["#3E2723", "#5D4037"], letters: ["#FFFDE7", "#FFEE58", "#FFB300"], glow: "#FFD600", pulse: true },
  DRS: { icon: "", label: "DRS REVIEW", frame: ["#EDE7F6", "#B388FF", "#651FFF", "#EDE7F6"], inside: ["#1A0A3D", "#311B92"], letters: ["#FFFFFF", "#EDE7F6", "#B388FF"], glow: "#7C4DFF" },
};
const CRICKET_BADGE_W: Record<string, number> = { "6": 56, "4": 64, OUT: 56, DUCK: 68, NOTOUT: 76, DRS: 92 };
const SLANT = "polygon(24% 0, 100% 0, calc(100% - 24%) 100%, 0 100%)";

function CricketBadge({ token }: { token: string }) {
  const plate = CRICKET_PLATES[token];
  // sizes follow the app's sp values relative to a 14sp line (em)
  const em = (sp: number) => `${sp / 14}em`;
  if (!plate) {
    const dot = token === "0";
    return (
      <span className="relative mx-px inline-flex items-center justify-center align-middle" style={{ width: em(21), height: em(23) }}>
        <span
          className="relative flex items-center justify-center overflow-hidden rounded-full font-black leading-none text-white"
          style={{
            width: em(19),
            height: em(19),
            fontSize: em(10.5),
            boxShadow: "0 1px 2px rgba(0,0,0,.45)",
            background: dot ? "radial-gradient(circle at 35% 30%, #90A4AE, #455A64 55%, #263238)" : "radial-gradient(circle at 35% 30%, #FF8A80, #D32F2F 55%, #7F0000)",
          }}
        >
          {/* stitched seam: two dashed arcs */}
          <span className="pointer-events-none absolute inset-[16%] rounded-full" style={{ border: "1.3px dashed rgba(255,255,255,.8)", borderTopColor: "transparent", borderBottomColor: "transparent" }} />
          <span className="relative">{token}</span>
        </span>
      </span>
    );
  }
  const slantK = `${(0.24 * 23) / (CRICKET_BADGE_W[token] ?? 56) * 100}%`;
  const clip = SLANT.replaceAll("24%", slantK);
  const layers = [
    "linear-gradient(to bottom, rgba(255,255,255,.25), rgba(255,255,255,0) 50%)",
    plate.striped ? "repeating-linear-gradient(-45deg, rgba(255,23,68,.14) 0 3px, transparent 3px 6px)" : "",
    token === "DRS" ? "repeating-linear-gradient(to bottom, rgba(255,255,255,.08) 0 1px, transparent 1px 3px)" : "",
    `linear-gradient(135deg, ${plate.inside.join(", ")})`,
  ].filter(Boolean);
  return (
    <span
      className={`relative mx-px inline-block align-middle ${plate.pulse ? "cb-pulse" : ""}`}
      style={{ width: em(CRICKET_BADGE_W[token]), height: em(23), padding: `${em(1.5)} ${em(2)}`, filter: `drop-shadow(0 0 3px ${plate.glow})` }}
    >
      <span className="block h-full w-full" style={{ clipPath: clip, background: `linear-gradient(135deg, ${plate.frame.join(", ")})`, padding: em(1.5) }}>
        <span className="relative flex h-full w-full items-center justify-center overflow-hidden" style={{ clipPath: clip, background: layers.join(", ") }}>
          <span className="cb-shine pointer-events-none absolute inset-y-0 w-[40%]" />
          {token === "DRS" ? (
            <span className="cb-twinkle mr-[3px] inline-block rounded-full" style={{ width: 5, height: 5, background: "#FF1744" }} />
          ) : (
            <span className="mr-[2px] leading-none" style={{ fontSize: em(9) }}>
              {plate.icon}
            </span>
          )}
          <span
            className="relative whitespace-nowrap font-black italic leading-none"
            style={{
              fontSize: em(10),
              letterSpacing: em(0.7),
              background: `linear-gradient(to bottom, ${plate.letters.join(", ")})`,
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              color: "transparent",
              filter: "drop-shadow(0 1.5px 1px rgba(0,0,0,.6))",
            }}
          >
            {plate.label}
          </span>
        </span>
      </span>
      {token === "6" && (
        <span className="cb-twinkle pointer-events-none absolute right-[5px] top-0 leading-none text-white" style={{ fontSize: em(7) }}>
          ✦
        </span>
      )}
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
      parts.push(
        body.slice(last, i),
        <span key={`c${i}`} className="mx-px inline-flex align-middle">
          <TpCardFace card={m[1] + m[2]} width={15} />
        </span>
      );
      last = i + m[0].length;
    }
    parts.push(body.slice(last));
  } else if (name === "Cricket Bot") {
    let last = 0;
    for (const m of body.matchAll(/\{(\d|OUT|NOTOUT|DRS|DUCK)\}/g)) {
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

// One badge picture; if it can't load (deleted / bad link / offline), its emoji
// is shown instead, so the badge never turns into an empty gap (like the app).
function BadgeImg({ src, emoji }: { src: string; emoji: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <>{emoji}</>;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={emoji} onError={() => setFailed(true)} className="mx-px inline h-[15px] w-[15px] rounded-full object-cover align-middle" />
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
      out.push(<BadgeImg key={i} src={images[hit]} emoji={hit} />);
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
            <img key={`g${k++}`} src={giftImage} alt="" className="mx-0.5 inline h-[1.25em] w-[1.25em] rounded-full object-cover align-middle" />
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
  classic,
  roomName,
  gameRoom,
  colorOf,
  badgeImages,
  fontPx,
  gift,
  onMention,
  onReply,
  onLink,
  myUid,
  onReact,
  onShowReactors,
}: {
  m: ChatMessage;
  mine: boolean;
  /** 📟 Classic style: every line on the left, own name shown too. */
  classic: boolean;
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
  /** A link was tapped in a message. */
  onLink: (url: string) => void;
  myUid: string;
  /** Long-press picker: react with this emoji (same emoji again clears it). */
  onReact: (emoji: string) => void;
  /** Own message: who reacted with this emoji. */
  onShowReactors: (emoji: string, uids: string[]) => void;
}) {
  // 🌈 miglife + Special Edition Colour holders: rainbow names. (A hook, so it
  // must run before any of the early returns below.)
  const special = useSpecialColors();
  // 😂 Long-press (or right-click) a chat message: reactions + Copy.
  const [picker, setPicker] = useState(false);
  const hold = useRef<{ t: ReturnType<typeof setTimeout>; x: number; y: number } | null>(null);
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
        <span className="text-black">{withBadgeImages(brandMiglife(colon > 0 ? m.text.slice(colon + 2) : m.text), badgeImages)}</span>
        {stamp}
      </p>
    );
  }

  if (m.type === "moderation") {
    const color = m.moderationColor === "red" ? "#D32F2F" : m.moderationColor === "green" ? "#2E7D32" : LINK_BLUE;
    return (
      <p className="whitespace-pre-wrap px-1 text-left text-[13px] font-semibold leading-snug" style={{ color }}>
        {brandMiglife(m.text)}
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
          {withMentions(brandMiglife(m.text))}
          {stamp}
        </p>
      </div>
    );
  }

  // /hug, /roll, 8ball …: centered, one red colour, bold.
  if (m.type === "social") {
    return (
      <p className="px-2 text-center text-[14px] font-bold leading-snug" style={{ color: APP_RED }}>
        {brandMiglife(m.text.replace(/\*\*/g, ""))}
        {stamp}
      </p>
    );
  }

  // /me: "name action" in red, on the left.
  if (m.type === "me") {
    const c = m.text.indexOf(":");
    return (
      <p className="px-1 text-left leading-snug" style={{ color: APP_RED, fontSize: fontPx }}>
        {brandMiglife(c > 0 ? `${m.text.slice(0, c).trim()} ${m.text.slice(c + 1).trimStart()}` : m.text)}
        {stamp}
      </p>
    );
  }

  if (m.type === "gift") {
    return (
      <div className="flex justify-center">
        {/* ONE text size for every gift line (the chat text size + 1, like the
            app), so a gift shower doesn't look big-small-big. */}
        <p
          className="w-[94%] whitespace-pre-wrap break-words rounded-[9px] bg-[#FFE6F2] px-[7px] py-[7px] text-left leading-snug text-[#FF2D95]"
          style={{ fontSize: fontPx }}
        >
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

  // 🔗 The first YouTube link of a normal message gets a thumbnail card.
  const ytLink = m.type === "image" || m.type === "voice" ? null : firstYouTubeLink(body);
  // Own messages sit on the right in EVERY room, game rooms included (like the
  // app) — except in the Classic style, where every line is on the left.
  const rightSide = mine && !classic;
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

  // Reactions work on real chat lines only (not local notices or the room's own lines).
  const canReact = !m.local && !isRoomLine && !!m.id && (m.type === "chat" || m.type === "image" || m.type === "voice");
  const reactions = Object.entries(m.reactions || {});
  const stopHold = () => {
    if (hold.current) clearTimeout(hold.current.t);
    hold.current = null;
  };
  const holdHandlers = canReact
    ? {
        onPointerDown: (e: React.PointerEvent) => {
          stopHold();
          hold.current = { t: setTimeout(() => setPicker(true), 450), x: e.clientX, y: e.clientY };
        },
        onPointerMove: (e: React.PointerEvent) => {
          if (hold.current && Math.hypot(e.clientX - hold.current.x, e.clientY - hold.current.y) > 10) stopHold();
        },
        onPointerUp: stopHold,
        onPointerCancel: stopHold,
        onPointerLeave: stopHold,
        onContextMenu: (e: React.MouseEvent) => {
          e.preventDefault();
          stopHold();
          setPicker(true);
        },
      }
    : {};

  return (
    <SwipeToReply enabled={canReply} onReply={() => onReply(senderName, snippet)}>
      <div className={`flex px-1 ${rightSide ? "justify-end" : "justify-start"}`}>
        {/* Own lines sit on the right, but a long one reads left to right: every line starts at the same left edge, like the app. */}
        <div
          className={`relative ${(gameRoom || classic) && !rightSide ? "w-full" : "max-w-[85%]"} leading-snug text-left`}
          style={{ fontSize: fontPx, WebkitTouchCallout: canReact ? "none" : undefined }}
          {...holdHandlers}
        >
          {picker && (
            <ReactionPicker
              mineSide={rightSide}
              reactions={m.reactions || {}}
              myUid={myUid}
              copyText={m.type === "image" || m.type === "voice" ? "" : body}
              onPick={(e) => {
                setPicker(false);
                onReact(e);
              }}
              onClose={() => setPicker(false)}
            />
          )}
          {/* Reaction emotes sit OUTSIDE the bubble, right above it, as plain emoji + count. */}
          {reactions.length > 0 && (
            <span className={`mb-0.5 flex gap-2 px-1.5 ${rightSide ? "justify-end" : "justify-start"}`}>
              {reactions.map(([e, uids]) => {
                const byMe = uids.includes(myUid);
                return (
                  <span
                    key={e}
                    className={`text-[13px] leading-4 ${byMe ? "font-bold" : ""} ${mine ? "cursor-pointer" : ""}`}
                    style={{ color: byMe ? LINK_BLUE : "#68758D" }}
                    onClick={mine ? () => onShowReactors(e, uids) : undefined}
                  >
                    <ReactionShakeEmoji emoji={e} count={uids.length} /> {uids.length}
                  </span>
                );
              })}
            </span>
          )}
          {quote &&
            (() => {
              // The quote shows its author in the SAME colour as their chat name.
              const qc = quote.indexOf(":");
              const qName = qc > 0 ? quote.slice(0, qc).trim() : "";
              const author = qName.toLowerCase() === "you" ? senderName : qName;
              const qColor = author ? colorOf(author) : "#2F80ED";
              return (
                <span
                  className={`mb-0.5 block w-fit max-w-full truncate border-l-2 px-2 py-0.5 text-left text-xs text-[#6B7A99] ${rightSide ? "ml-auto" : ""}`}
                  style={{ borderColor: qColor, background: `color-mix(in srgb, ${qColor} 6%, transparent)` }}
                >
                  ↩ {qName ? <b style={{ color: qColor }}>{qName}:</b> : null}
                  {withEmotes(qName ? quote.slice(qc + 1) : quote, 12)}
                </span>
              );
            })()}
          {/* Own lines hide your own ID — except miglife, who sees their rainbow ID too,
              and the Classic style, which shows your own name ("legend: hi"). */}
          {(!mine || classic || (!isRoomLine && special.has(senderName))) && senderName && (
            <span
              className={`mr-1 font-bold ${isRoomLine || m.local ? "" : "cursor-pointer"}`}
              style={{ color: isRoomLine ? ROOM_ORANGE : colorOf(senderName) }}
              onClick={isRoomLine || m.local ? undefined : () => onMention(senderName)}
            >
              {!isRoomLine && special.has(senderName) ? (
                <RainbowName name={brandMiglife(senderName)} style={special.styleOf(senderName)} />
              ) : (
                brandMiglife(senderName)
              )}
              :
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
              <span
                className="whitespace-pre-wrap break-words"
                style={{ color: INK }}
                onClick={(e) => {
                  // Missed the exact letters? A tap anywhere on a message that
                  // holds ONE link still opens it (like the app).
                  if ((e.target as HTMLElement).closest("a")) return;
                  const links = findRoomLinks(body);
                  if (links.length === 1) onLink(links[0].url);
                }}
              >
                {/* 🔗 links first: blue + underlined + tappable, and emote codes inside a link stay text */}
                {withLinks(brandMiglife(body), "b", onLink, (seg, k) => (
                  <Fragment key={k}>{withEmotes(seg, fontPx, (t, k2) => withMentions(t, `${k}${k2}`))}</Fragment>
                ))}
              </span>
              {stamp}
              {ytLink && <YouTubePreviewCard videoId={ytLink.id} onPlay={() => onLink(ytLink.url)} />}
            </>
          )}
        </div>
      </div>
    </SwipeToReply>
  );
}

const REACTION_EMOJIS: [string, string][] = [
  ["😂", "Haha"],
  ["❤️", "Love"],
  ["👍", "Like"],
  ["😮", "Wow"],
  ["😢", "Sad"],
];

// The long-press menu over a room message: 5 reactions (a dot under the one
// you gave) and Copy, like the app. Tap outside to close.
function ReactionPicker({
  mineSide,
  reactions,
  myUid,
  copyText,
  onPick,
  onClose,
}: {
  mineSide: boolean;
  reactions: Record<string, string[]>;
  myUid: string;
  copyText: string;
  onPick: (emoji: string) => void;
  onClose: () => void;
}) {
  const [hovered, setHovered] = useState<string | null>(null);
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} onContextMenu={(e) => (e.preventDefault(), onClose())} />
      <div className={`absolute bottom-full z-50 mb-2 flex flex-col gap-2 ${mineSide ? "right-0 items-end" : "left-0 items-start"}`}>
        <div className="flex h-7 items-end">
          {hovered && (
            <span className="rounded-[10px] bg-[#1A1A2E]/90 px-2.5 py-1 text-xs font-bold text-white">
              {REACTION_EMOJIS.find(([e]) => e === hovered)?.[1]}
            </span>
          )}
        </div>
        <div className="reaction-pop flex gap-0.5 rounded-[30px] border border-[#2F80ED]/20 bg-white px-2 py-1.5 shadow-xl">
          {REACTION_EMOJIS.map(([e], i) => {
            const byMe = reactions[e]?.includes(myUid);
            return (
              <button
                key={e}
                type="button"
                onClick={() => onPick(e)}
                onMouseEnter={() => setHovered(e)}
                onMouseLeave={() => setHovered(null)}
                className="flex flex-col items-center"
                style={{ animationDelay: `${i * 40}ms` }}
              >
                <span
                  className={`reaction-emoji flex h-[42px] w-[42px] items-center justify-center rounded-full text-[25px] transition-transform hover:-translate-y-2 hover:scale-[1.45] ${
                    byMe ? "bg-[#2F80ED]/15" : ""
                  }`}
                  style={{ animationDelay: `${i * 40}ms` }}
                >
                  {e}
                </span>
                <span className={`h-1 w-1 rounded-full ${byMe ? "bg-[#2F80ED]" : ""}`} />
              </button>
            );
          })}
        </div>
        {copyText.trim() && (
          <button
            type="button"
            onClick={() => {
              const plain = copyText.startsWith("↩ ") && copyText.includes("\n") ? copyText.slice(copyText.indexOf("\n") + 1) : copyText;
              navigator.clipboard?.writeText(plain).catch(() => {});
              onClose();
            }}
            className="flex items-center gap-2 rounded-[18px] border border-[#2F80ED]/20 bg-white px-4 py-2 text-sm font-bold text-[#0B1F3A] shadow-lg"
          >
            <span className="flex h-[26px] w-[26px] items-center justify-center rounded-full bg-[#2F80ED]/10 text-[13px]">📋</span>
            Copy
          </button>
        )}
      </div>
    </>
  );
}

// Own message: who reacted with an emoji (names looked up once).
function ReactorsDialog({ emoji, uids, onClose }: { emoji: string; uids: string[]; onClose: () => void }) {
  const [names, setNames] = useState<Record<string, string>>({});
  useEffect(() => {
    let alive = true;
    uids.forEach((uid) =>
      getDoc(doc(db, "users", uid))
        .then((s) => alive && setNames((n) => ({ ...n, [uid]: String(s.get("username") || "Unknown") })))
        .catch(() => {})
    );
    return () => {
      alive = false;
    };
  }, [uids]);
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4" onClick={onClose}>
      <div className="w-full max-w-xs rounded-2xl bg-white p-4 text-[#0B1F3A]" onClick={(e) => e.stopPropagation()}>
        <p className="text-lg font-extrabold">
          {emoji} {uids.length}
        </p>
        <ul className="mt-2 max-h-72 space-y-1.5 overflow-y-auto">
          {uids.map((u) => (
            <li key={u} className="text-[15px] font-semibold">
              {names[u] || "…"}
            </li>
          ))}
        </ul>
        <button type="button" onClick={onClose} className="mt-3 w-full rounded-xl bg-[#2F80ED] py-2 font-bold text-white">
          Close
        </button>
      </div>
    </div>
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

/** People shown in the room (presence docs that are not INVISIBLE). */
function presenceList(docs: QueryDocumentSnapshot[]) {
  return docs
    .filter((d) => d.get("presenceStatus") !== "INVISIBLE")
    .map((d) => ({
      uid: d.id,
      username: String(d.get("username") || ""),
      level: Number(d.get("level") || 1),
      lastSeenMs: toMillis(d.get("lastSeen", { serverTimestamps: "estimate" })),
      // /park (paid): the spot stays listed until parkedUntil passes, however
      // old lastSeen is — the same rule as the app's list and the server.
      parkedUntil: Number(d.get("parkedUntil") || 0),
    }));
}
