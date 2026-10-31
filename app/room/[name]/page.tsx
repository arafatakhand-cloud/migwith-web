"use client";

import type { User } from "firebase/auth";
import { createPortal } from "react-dom";
import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { awardUserXp } from "../../../lib/xp";
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
  LUXURY_BOT_REMOVED_ROOM,
  ROOM_OPENED_ELSEWHERE,
  roomDeviceId,
} from "../../../lib/rooms";
import { ChatBar } from "../../_components/ChatBar";
import { GiftNamePicker, giftPickerQuery } from "../../_components/GiftNamePicker";
import { SwipeToReply } from "../../_components/SwipeToReply";
import { ReactionShakeEmoji } from "../../_components/ReactionShakeEmoji";
import {
  addOpenRoom,
  deletePresenceUnlessParked,
  clearAutoLeft,
  isAutoLeft,
  isRoomOpen,
  onAutoLeft,
  postStaleLeaveLineOnce,
  readOpenRooms,
  removeOpenRoom,
} from "../../../lib/openRooms";
import { readRoomSession, writeRoomSession, type SessionMessage } from "../../../lib/roomSession";
import { COUNTRY_REP_BADGE, cachedRoleOf, supporterTeamOf, useSenderColors } from "../../../lib/senderColors";
import { SupporterBadge } from "../../_components/SupporterBadge";
import { openReport } from "../../_components/ReportDialog";
import { PageShell } from "../../_components/PageShell";
import { ImageViewerHost, openImageViewer } from "../../_components/ImageViewer";
import {
  GiftPanel,
  loadGiftCatalog,
  type Gift,
  type GiftResult,
} from "../../_components/GiftPanel";
import { hideGameTableLine, useGameTablesVersion } from "../../../lib/gameTables";
import { LUXURY_ROOM, LuxuryBetBox, useLuxuryBot } from "../../_components/LuxuryBot";
import {
  LUXURY_BET_ART_BY_EMOJI,
  LUXURY_BET_ROOM,
  LuxuryBetStartButton,
  LuxuryBetTable,
  LuxuryBetWelcomeLine,
  luxuryBetHandleCommand,
  useLuxuryBet,
} from "../../_components/LuxuryBet";
import { ROYALE_ROOM, RoyaleTable, royaleHandleCommand, useRoyale, useRoyalePrefs } from "../../_components/RoyaleGame";
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
import {
  HORSE_RACE_ROOM,
  HorseRacePanel,
  NUMBER_GUESS_ROOM,
  NumGuessPanel,
  horseHandleCommand,
  numGuessHandleCommand,
  useHorseRace,
  useNumGuess,
} from "../../_components/GuessRace";
import { LIAR_DICE_ROOM, LiarDicePanel, liarDiceHandleCommand, useLiarDice } from "../../_components/LiarDice";
import { ROYAL_TREASURE_ROOM, RoyalTreasurePanel, royalTreasureHandleCommand, useRoyalTreasure } from "../../_components/RoyalTreasure";
import { LOWCARD_ROOM, LowCardBox, lowCardHandleCommand, useLowCard } from "../../_components/LowCard";
import { LUDO_FREE_ROOM, LUDO_ROOM, LudoTable, ludoHandleCommand, useLudo } from "../../_components/Ludo";
import { NotInRoomPage } from "../../_components/NotInRoomPage";
import { handleRoomCommand } from "../../../lib/roomCommands";
import { handleExtraCommand } from "../../../lib/extraCommands";
import { rememberRecentRoom, useRoomPrefs } from "../../../lib/roomPrefs";
import { storageSafeSegment, uploadChatImage } from "../../../lib/imageUpload";
import type { PickedSticker } from "../../../lib/stickers";
import { StickerImg } from "../../_components/StickerImg";
import { VoiceRecorder } from "../../_components/VoiceRecorder";
import { getDownloadURL, ref as storageRef, uploadBytes } from "firebase/storage";
import {
  EMPTY_ROOM,
  banUser,
  handleModCommand,
  kickUser,
  bumpUser,
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
import { shareAllowed, shareKeysOf, type ShareTable } from "../../../lib/sharePerms";
import { useBadgeImages } from "../../../lib/badgeImages";
import { chatPx, useChatTextSize } from "../../../lib/chatTextSize";
import { withEmotes } from "../../_components/Emote";
import { BackPill } from "../../_components/BackButton";
import { RoomInfoPage } from "../../_components/RoomInfoPage";
import { MORE_REACTIONS, QUICK_REACTIONS } from "../../../lib/reactions";
import { RainbowName } from "../../_components/RainbowName";
import { RoomLinkDialog, YouTubePreviewCard, withLinks } from "../../_components/RoomLinks";
import { findRoomLinks, firstYouTubeLink } from "../../../lib/roomLinks";
import { useSpecialColors } from "../../../lib/specialColor";
import { RoomInfoCards } from "../../_components/RoomInfoCards";
import { brandMiglife, MIGLIFE_DISPLAY_NAME } from "../../../lib/brand";
import { migIdFromAliasEmail } from "../../../lib/migAlias";
import { noteServerTime, serverNow } from "../../../lib/serverTime";
import { hideRoomTranslation, languageName, requestRoomTranslation, useRoomTranslation } from "../../../lib/roomTranslate";
import {
  NO_NEW_BELOW,
  addNewBelow,
  chatBotAccent,
  chatLineAtMentionsMe,
  chatBotKey,
  chatHideBotLine,
  newBelowLabel,
  toggleHideBots,
  useHideBots,
  type NewBelowStats,
} from "../../../lib/chatBots";
import { RoomFireworksHost, RoomHeartsHost } from "../../_components/RoomEffects";
import { EntryEffectHost, claimOwnEntryFx, requestOwnEntryFx } from "../../_components/EntryEffects";
import { useIsClassic } from "../../../lib/uiStyle";
import { CommandListPage } from "../../_components/CommandList";
import { WhoisPopup, type WhoisInfo } from "../../_components/WhoisPopup";
import { PhotoEditor } from "../../_components/PhotoEditor";
import { BalanceCard, PhotoConfirm, RoundResultCard, SimpleDialog, WarningDialog, type BalanceInfo } from "../../_components/RoomPopups";
import { GiftImg } from "../../_components/GiftImg";
import { watchBlockedNames } from "../../../lib/blocks";
import { flashToast } from "../../../lib/flashToast";

// 🔒 Same words as the app's toasts for a locked room / a level too low.
const ROOM_LOCKED_MSG = "This room is locked by an admin/mod.";
const isEntryBlock = (b: string) => b === ROOM_LOCKED_MSG || /^This room needs level \d+ or higher\.$/.test(b);

type ChatMessage = SessionMessage;
// 🚫 the reject toasts already shown (kept across tab switches, so a tab coming back never repeats one)
const shownRejectIds = new Set<string>();

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
// 👢 A kicked person can't come back into the room for this long (same in the app; the rules enforce it).
const KICK_MINUTES = 30;

// 👢👋🚫🔓🔇🔊 kick / bump / ban / unban / mute lines (like the app)
/** Shrinks its line's text (down to 4 px smaller) until it fits on ONE line,
 *  instead of breaking in two on a phone. If even 4 px smaller is still more
 *  than one line (a long Gift Shower), it goes back to the normal size.
 *  Lines are counted from the text's own boxes, so the time stamp and padding
 *  don't matter. */
function FitOneLine({ base, grow = false, children }: { base: number; grow?: boolean; children: (px: number) => ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  // 🎁 grow: a single gift line starts bigger (chat size + 3) and shrinks until it
  // fits on one line, so it fills the whole chat width (like the app).
  const start = grow ? base + 3 : base;
  const [fit, setFit] = useState({ base, px: start, done: false });
  // a new text size in Settings starts the fitting again
  if (fit.base !== base) setFit({ base, px: start, done: false });
  const px = fit.base === base ? fit.px : start;
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || fit.done) return;
    const range = document.createRange();
    range.selectNodeContents(el);
    // a new line starts where a text box sits clearly lower than the first one
    // (the small time stamp / emoji on the same line sit only a little lower)
    const tops = Array.from(range.getClientRects()).filter((r) => r.width > 0).map((r) => r.top);
    const first = Math.min(...tops);
    const wraps = tops.some((t) => t - first > px * 0.9);
    if (!wraps) setFit((f) => (f.done ? f : { ...f, done: true }));
    else if (px > base - 4) setFit((f) => ({ ...f, px: f.px - 0.5 }));
    else setFit((f) => ({ ...f, px: f.base, done: true })); // too long anyway: normal size
  });
  return <div ref={ref}>{children(px)}</div>;
}

// A name colour readable on a white card: very light ones (admin yellow, staff
// neon green, cyan…) get a little darker; the rest stay as they are.
function inkOnWhite(c: string): string {
  const m = /^#([0-9a-f]{6})$/i.exec(c);
  if (!m) return c;
  const n = parseInt(m[1], 16);
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum > 0.6 ? `color-mix(in srgb, ${c} 65%, black)` : c;
}

// 🎁 A failed gift, said plainly for people: the server's reason without the
// emoji in front or any technical code like "[404]" (that stays in the log).
function giftErrorText(e: any): string {
  console.warn("gift send failed", e?.code, e?.message);
  const raw = String(e?.message || "").replace(/\s*\[\d{3}\]\s*$/, "").replace(/^🎁\s*/, "").trim();
  if (/not.?found/i.test(String(e?.code || "")) && !raw) return "This gift was not found. Please pick one from the Gift Gallery.";
  return raw || "Something went wrong. Please try again.";
}

export default function RoomPage() {
  const params = useParams<{ name: string }>();
  const roomName = decodeURIComponent(params.name);
  const { user, loading } = useCurrentUser();
  const router = useRouter();
  // 👻 Luxury Bot Official was removed from the app: an old link goes to the room list.
  const removed = roomName === LUXURY_BOT_REMOVED_ROOM;
  useEffect(() => {
    if (removed) router.replace("/rooms");
  }, [removed, router]);
  if (removed) return null;
  // Wait for the account first, so the room's saved session can be read on mount.
  if (loading || !user) return <RoomView key="" roomName={roomName} user={user} loading />;
  return <RoomView key={roomName} roomName={roomName} user={user} loading={false} />;
}

// The account comes from RoomPage: a hook of its own here started as "no user"
// on every tab switch, so the saved session (the half-typed message, chat,
// scroll) wasn't read and an empty draft was saved over it.
function RoomView({ roomName, user, loading }: { roomName: string; user: User | null; loading: boolean }) {
  const router = useRouter();
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
  // the photo perk is for VIP / miglife only (not the 🎂 birthday colour)
  const specialHasMe = specialColors.paid(profile?.username);
  const [messages, setMessages] = useState<ChatMessage[]>(initial?.messages ?? []);
  // Start of this visit (see savedEntry); null until known.
  const [sinceMs, setSinceMs] = useState<number | null>(initial?.sinceMs ?? null);
  const [localNotes, setLocalNotes] = useState<ChatMessage[]>(initial?.localNotes ?? []);
  const [presence, setPresence] = useState<RoomUser[]>([]);
  const [muted, setMuted] = useState(false);
  const [silenced, setSilenced] = useState(false);
  const [locked, setLocked] = useState(false);
  // 📢 the announcement as it was when I came in (like the reference app): it is pinned
  // under "Currently in this room" for this visit; a change while I'm here only shows
  // as a pink line in the chat.
  const [announcement, setAnnouncement] = useState<string | null>(null);
  const [roomInfo, setRoomInfo] = useState<RoomInfo>(EMPTY_ROOM);
  const [roomLoaded, setRoomLoaded] = useState(false);
  const [modLoaded, setModLoaded] = useState(false);
  const [myModLoaded, setMyModLoaded] = useState(false);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [voiceActive, setVoiceActive] = useState(false);
  const [blocked, setBlocked] = useState("");
  // 👢 minutes left before a kicked person may come back in (30 min after the kick)
  const [kickMinutesLeft, setKickMinutesLeft] = useState(KICK_MINUTES);
  // 👋 /bump: out of the room, but may come straight back in
  const [bumped, setBumped] = useState(false);
  // ⏰ My spot here was cleared (away too long, kicked or banned) → I'm not in
  // the room any more: no quiet "has entered" again, sending shows a popup.
  const [autoLeft, setAutoLeft] = useState(() => !!user && isAutoLeft(user.uid, roomName));
  // ⚠️ "You are not in this room" popup (a message typed after being taken out)
  const [notInRoomOpen, setNotInRoomOpen] = useState(false);
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
  // where the ⋮ button is on screen: the menu opens right above it (on a wide screen it used to open at the far left)
  const [menuAnchor, setMenuAnchor] = useState<{ left: number; bottom: number } | null>(null);
  // The Participants panel beside the room menu (like the app).
  // 👥 the Room Participants list (slides in from the right) and its ••• menu
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [peopleMenuFor, setPeopleMenuFor] = useState<string | null>(null);
  // the Participants list starts right under the top bar
  const [peopleTop, setPeopleTop] = useState(0);
  useEffect(() => {
    if (!peopleOpen) return;
    const bar = document.querySelector("[data-topbar]");
    setPeopleTop(bar ? Math.max(0, bar.getBoundingClientRect().bottom) : 0);
  }, [peopleOpen]);
  // 🛡 the moderation tools live on their own page inside the room menu (like the app)
  const [modToolsOpen, setModToolsOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [kickOpen, setKickOpen] = useState(false);
  // a short toast inside the Kick user list ("You are not authorized to kick him")
  const [kickToast, setKickToast] = useState("");
  const kickToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showKickToast = (t: string) => {
    setKickToast(t);
    if (kickToastTimer.current) clearTimeout(kickToastTimer.current);
    kickToastTimer.current = setTimeout(() => setKickToast(""), 2000);
  };
  const { favorites, toggleFavorite } = useRoomPrefs();
  const [gifts, setGifts] = useState<Gift[]>([]);
  const [giftTarget, setGiftTarget] = useState<string | null>(null);
  // 📜 The Command page (every room command; tap one → into the message box).
  const [commandsOpen, setCommandsOpen] = useState(false);
  // 👤 /whois popup (whoisUser result); null = closed
  const [whoisInfo, setWhoisInfo] = useState<WhoisInfo | null>(null);
  // 🪟 popups like the app's: title + text + OK, the balance card, the Luxury
  // Bot round result and the "Send this photo?" confirmation
  const [popup, setPopup] = useState<{ title: string; text: string } | null>(null);
  const [balanceCard, setBalanceCard] = useState<BalanceInfo | null>(null);
  const [roundResult, setRoundResult] = useState<{ round: number; won: number; bet: number } | null>(null);
  const [pendingPhoto, setPendingPhoto] = useState<File | null>(null);
  const [editingPhoto, setEditingPhoto] = useState<File | null>(null);
  const lastResultRound = useRef(0);

  const listRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // Leaves this room now (the ✕ on the room tab).
  const leaveRef = useRef<(() => void) | null>(null);
  // Called before each message I send. If my spot went missing while this tab
  // stayed open (the same account left on another phone / tab, which posted
  // "has left"), I come back in first — new visit + "has entered" — so the
  // chat never shows "has left" followed by my message. Set by the presence effect.
  const restorePresenceRef = useRef<(() => Promise<void>) | null>(null);
  const stickToBottom = useRef(initial?.stickToBottom ?? true);
  // How many new lines arrived while you were scrolled up (the ⬇ pill, like the app).
  const [newBelow, setNewBelow] = useState(0);
  const [farUp, setFarUp] = useState(false);
  // what those lines were: people / bots / a mention of me (the smart ⬇ pill)
  const [newBelowStats, setNewBelowStats] = useState<NewBelowStats>(NO_NEW_BELOW);
  // 🤖 "Bot messages: Hide" (room ⋮ menu) — lines that mention you still show
  const hideBots = useHideBots();
  const lastSeenIdRef = useRef<string | null>(null);
  // Clear Chat for this device (set once the page has rendered; used by /cc).
  const clearChatRef = useRef<(() => void) | null>(null);
  const scrollTopRef = useRef(initial?.scrollTop ?? 0);
  // Highest scroll position while following the newest line (see onScroll).
  const pinnedTopRef = useRef(0);
  // ✋ When the reader last touched / wheeled / keyed the chat. Only a move UP made
  // by the reader lets go of the bottom — the browser also moves scrollTop up by
  // itself (old lines trimmed off the top, the bet box changing height), which in
  // a fast bet round froze the chat under "⬇ 75 new messages".
  const userScrollAtRef = useRef(0);
  const userTouchingRef = useRef(false);

  // ⏰ Auto left while this room is open on screen (back after a long time away).
  useEffect(() => {
    if (!user) return;
    return onAutoLeft(() => {
      if (isAutoLeft(user.uid, roomName)) setAutoLeft(true);
    });
  }, [user, roomName]);

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
  // 🎉 Luxury Bot: the server writes the round result onto my own bet doc;
  // show it once, right away (an old result, e.g. on opening the room, isn't news).
  useEffect(() => {
    if (roomName !== LUXURY_ROOM || !user?.uid) return;
    return onSnapshot(doc(db, "room_game", LUXURY_ROOM, "user_bets", user.uid), (snap) => {
      const r = Number(snap.get("resultRound") || 0);
      if (!r || r <= lastResultRound.current) return;
      lastResultRound.current = r;
      if (serverNow() - Number(snap.get("resultAt") || 0) > 45_000) return;
      const bet = Number(snap.get("totalBet") || 0);
      if (bet > 0) setRoundResult({ round: r, won: Number(snap.get("wonAmount") || 0), bet });
    });
  }, [roomName, user?.uid]);
  useEffect(() => {
    if (!roundResult) return;
    const t = setTimeout(() => setRoundResult(null), 4000);
    return () => clearTimeout(t);
  }, [roundResult]);
  // 🎰 Luxury Bet (only in the Luxury Bet room) — run by the server.
  const luxuryBet = useLuxuryBet(roomName === LUXURY_BET_ROOM, user?.uid, note);
  // Eye button: show only my own Luxury Bet bet lines.
  // 👁 "only my bets": kept per room for this browser tab, so going to another
  // room and back doesn't show the hidden bids again (like the app)
  const onlyMyBetsKey = `migwith.onlyMyBets.${roomName}`;
  const [onlyMyBets, setOnlyMyBets] = useState(() => {
    try {
      return typeof window !== "undefined" && sessionStorage.getItem(onlyMyBetsKey) === "1";
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      if (onlyMyBets) sessionStorage.setItem(onlyMyBetsKey, "1");
      else sessionStorage.removeItem(onlyMyBetsKey);
    } catch {
      // private mode: just not remembered
    }
  }, [onlyMyBets, onlyMyBetsKey]);
  // 👑 MIG Royale round + bets (only in the MIG Royale room).
  const royale = useRoyale(roomName === ROYALE_ROOM, user?.uid, note);
  const royalePrefs = useRoyalePrefs();
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
  // 🎯 Number Guess / 🐎 Horse Race (null in every other room)
  const numGuess = useNumGuess(roomName, user?.uid, note);
  const horseRace = useHorseRace(roomName, user?.uid, note);
  // 🎲 Liar's Dice (null in every other room)
  const liarDice = useLiarDice(roomName, user?.uid, note);
  const royalTreasure = useRoyalTreasure(roomName, user?.uid, note);
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
      .then(async (snap) => {
        const level = Number(snap.get("level") || 1);
        const username = String(snap.get("username") || migIdFromAliasEmail(user.email) || "");
        setProfile({
          username,
          level,
          badge: String(snap.get("levelBadgeIcon") || badgeForLevel(level)),
          badges: withMerchantBadge(presenceBadgesForDoc(snap.data()), await hasRunningMerchantTerm(username)),
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
  // "@" + part of a name at the end of the text → the mention list (like the app)
  const mentionQuery = (() => {
    const at = text.lastIndexOf("@");
    if (at < 0) return null;
    const after = text.slice(at + 1);
    return /\s/.test(after) ? null : after;
  })();
  const roomDescription = resolveRoomDescription(roomName, roomInfo.description);
  const roomInfoRef = useRef(roomInfo);
  roomInfoRef.current = roomInfo;

  // 🔐 Share Permissions table (miglife sets it): who may share pictures / voice.
  const [shareTable, setShareTable] = useState<ShareTable | null>(null);
  useEffect(() => {
    getDoc(doc(db, "app_settings", "media_sharing_permissions"))
      .then((s) => setShareTable((s.data() as ShareTable) || {}))
      .catch(() => setShareTable({}));
  }, []);
  const shareKeys = useMemo(() => shareKeysOf(profile?.badges || []), [profile?.badges]);
  const picAllowed = isMainFounderName(profile?.username) || shareAllowed(shareTable, shareKeys, "picture");
  const voiceAllowed = isMainFounderName(profile?.username) || shareAllowed(shareTable, shareKeys, "voice");
  const perms = useMemo(
    () => {
      const p = roomPerms(roomInfo, user?.uid || "", profile?.username || "", profile?.role || "", founder.isHiddenFounder);
      // Only the Share Permissions table decides who may share (pictures / voice).
      return { ...p, canShareMedia: picAllowed, canShareVoice: voiceAllowed };
    },
    [roomInfo, user, profile, founder.isHiddenFounder, picAllowed, voiceAllowed]
  );
  const permsRef = useRef(perms);
  permsRef.current = perms;
  const lockedRef = useRef(locked);
  lockedRef.current = locked;
  // 🔒 I was in the room before it got locked (the server showed it unlocked
  // while it was open here, or this tab already had a visit): a lock only stops
  // new people coming in, it never sends me out (miglife asked).
  const insideBeforeLockRef = useRef(false);
  // 🔁 Rejoin (after an auto left): a NEW visit with its own "has entered",
  // even though this tab is still open with the old visit's chat.
  const rejoinRef = useRef(false);
  const sinceMsRef = useRef(sinceMs);
  sinceMsRef.current = sinceMs;

  // Kicked, banned, full or not allowed in: the tab closes.
  useEffect(() => {
    if (blocked && user) removeOpenRoom(user.uid, roomName);
  }, [blocked, user, roomName]);
  // 🔒 Locked / level too low: a toast and back to the rooms list (like the app).
  useEffect(() => {
    if (!isEntryBlock(blocked)) return;
    flashToast(blocked);
    router.replace("/rooms");
  }, [blocked, router]);

  // Entry level and room lock — admins / mods of this room are not held back.
  useEffect(() => {
    if (perms.bypassesEntry) {
      // Their rights arrived after the level / lock message (e.g. a hidden
      // founder whose founder record loaded late): let them in after all.
      setBlocked((b) => (b === ROOM_LOCKED_MSG || b.startsWith("This room needs level") ? "" : b));
      return;
    }
    if (!profile || !roomLoaded || !modLoaded) return;
    // Already inside (this visit started) → a lock or a higher level keeps me in;
    // they only stop people coming in (like the app).
    if (roomInfo.lockLevel > 0 && profile.level < roomInfo.lockLevel && sinceMs === null) {
      setBlocked(`This room needs level ${roomInfo.lockLevel} or higher.`);
    } else if (locked && !insideBeforeLockRef.current && sinceMs === null) {
      setBlocked(ROOM_LOCKED_MSG);
    }
  }, [profile, roomLoaded, modLoaded, perms.bypassesEntry, roomInfo.lockLevel, locked, sinceMs]);

  // Live chat — the latest 150 messages, same collection the app uses.
  // 🔒 The server lets only people IN the room read its chat: opening a room,
  // this can start a moment before my presence spot is written and be refused —
  // then it tries again shortly (a refused listener never resumes by itself).
  const [chatRetry, setChatRetry] = useState(0);
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
      (err) => {
        console.error("room chat listener failed", err);
        if ((err as { code?: string })?.code === "permission-denied" && chatRetry < 40) {
          window.setTimeout(() => setChatRetry((n) => n + 1), 1500);
        }
      }
    );
  }, [user, roomName, chatRetry]);

  // Who is in the room.
  useEffect(() => {
    if (!user) return;
    return onSnapshot(
      collection(db, "room_presence", roomName, "users"),
      (snap) => {
        // BUG FIX (false "has left" while the person was still chatting), like
        // the app: watchers used to DELETE a spot they thought was 3 h old and
        // post "has left". The server's detectStaleRoomPresence already does
        // that every minute with the real server time, so a stale spot is only
        // hidden from the list here and never deleted.
        // My own heartbeat's server stamp still teaches the server clock.
        const mine = snap.docs.find((d) => d.id === user.uid);
        if (mine && !mine.metadata.hasPendingWrites) noteServerTime(toMillis(mine.get("lastSeen")));
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
        // 👢 Kicked less than 30 minutes ago (kickedAt) — even after the "kicked"
        // flag was cleared — can't come back in yet.
        const kickedAt = snap.get("kickedAt", { serverTimestamps: "estimate" });
        const kickedAtMs = kickedAt && typeof kickedAt.toMillis === "function" ? kickedAt.toMillis() : 0;
        const kickLeftMs = kickedAtMs ? kickedAtMs + KICK_MINUTES * 60_000 - Date.now() : 0;
        const kickedNow = snap.get("kicked") === true || kickLeftMs > 0;
        // 👢🚫 Kicked or banned: really leave right away — take my spot out of
        // the room and close its tab. Before, the spot stayed (and the heartbeat
        // put it back when the moderator removed it), so the person never left.
        if (snap.get("banned") === true || kickedNow) {
          removeOpenRoom(user.uid, roomName);
          leaveRef.current?.();
        }
        if (snap.get("banned") === true) {
          setBlocked("You are banned from this room.");
        } else if (kickedNow) {
          setKickMinutesLeft(kickLeftMs > 0 ? Math.min(KICK_MINUTES, Math.max(1, Math.ceil(kickLeftMs / 60_000))) : KICK_MINUTES);
          setBumped(snap.get("bumped") === true && snap.get("kicked") === true && kickLeftMs <= 0);
          setBlocked("You were kicked from this room.");
          // The kicked person clears their own flag (kickedAt stays and keeps
          // them out for the 30 minutes).
          if (snap.get("kicked") === true)
            updateDoc(userRef, { kicked: false, bumped: false, updatedAt: serverTimestamp() }).catch(() => {});
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
        if (!snap.metadata.fromCache && snap.get("locked") !== true) insideBeforeLockRef.current = true;
        setAnnouncement((a) => (a === null ? String(snap.get("announcement") || "").trim() : a));
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
    // ⏰ Auto left (minimised too long): not in the room — no entering again by
    // itself; close the tab (✕) and open the room again to come back in.
    if (autoLeft || isAutoLeft(user.uid, roomName)) return;
    // Checked here too: the effect that sets "blocked" runs in the same commit,
    // too late to stop this one from posting "has entered".
    const info = roomInfoRef.current;
    if (
      !permsRef.current.bypassesEntry &&
      ((info.lockLevel > 0 && profile.level < info.lockLevel && sinceMsRef.current === null) ||
        (lockedRef.current && !insideBeforeLockRef.current && sinceMsRef.current === null))
    ) {
      return;
    }
    const uid = user.uid;
    // WHO MAY BE INVISIBLE (like the app): "Login as Invisible" and the
    // Presence Status "INVISIBLE" only work for the Founder, official Admins
    // and Staff — in every room (a private room's owner / Super Mods can no
    // longer hide). Everybody else enters normally, with "has entered" / "has left".
    // 🚫 Nobody enters invisibly any more (miglife asked) — everyone gets the
    // presence doc and the "has entered" / "has left" lines.
    const invisibleAllowed = false;
    const hideMe = profile.invisible && invisibleAllowed; // no presence doc at all
    const quietMe = profile.quiet && invisibleAllowed; // no entered / left lines
    const presenceRef = doc(db, "room_presence", roomName, "users", uid);
    const leaveKey = `${uid}|${roomName}`;
    const deviceId = roomDeviceId();
    let visitId: string | null = null;
    let unwatchSpot: (() => void) | null = null;
    let left = false;
    let disposed = false; // this effect was cleaned up (a leave may be pending)
    let heartbeat: ReturnType<typeof setInterval> | null = null;
    // The presence write in flight (entering, or a heartbeat re-entering). A
    // leave waits for it, so the spot can't be written again AFTER it was
    // deleted and its "has left" posted (a ghost in "Currently in this room").
    let presenceWrite: Promise<unknown> = Promise.resolve();
    // my spot here is gone (removed from another phone / tab) while this tab stays open
    let spotGone = false;
    let goneWhileHere = false;

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
        // ✨ a real entry while invisible: nobody else sees it, but my own entry
        // effect still plays for me (like the app). Not on a tab switch.
        if (!isRoomOpen(uid, roomName) && !resumed) claimOwnEntryFx(roomName) && requestOwnEntryFx(roomName);
        const at = saved && isRoomOpen(uid, roomName) ? saved.at : Date.now() - 30_000;
        saveEntry(uid, roomName, { visitId: "invisible", at });
        setSinceMs(at);
        rememberRecentRoom(roomName);
        addOpenRoom(uid, roomName);
        return;
      }
      // An open tab that already has this visit's session is the same visit
      // (the app keeps roomEntryAt for as long as the tab is open).
      const rejoining = rejoinRef.current;
      rejoinRef.current = false;
      const tabSession = isRoomOpen(uid, roomName) && !rejoining ? readRoomSession(uid, roomName) : null;
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
            const otherDevice = String(existing.get("deviceId") || "");
            // ONE PLACE PER ROOM: I'm still listed here from another phone /
            // browser (not a /parked spot).
            if (fresh && otherDevice && otherDevice !== deviceId && !(parkedUntil > serverNow())) {
              if (resumed || tabSession) {
                // This tab was the OLD place: the other one took over.
                left = true;
                if (!disposed) setBlocked(ROOM_OPENED_ELSEWHERE);
                return;
              }
              // This is the NEW place: the old one gets "has left" first, then
              // this visit enters with "has entered" (below).
              const shop = existing.get("shopBadges");
              staleOld = {
                name: String(existing.get("username") || "").trim() || profile.username,
                level: Number(existing.get("level") || 1),
                badges: Array.isArray(shop) && shop.length ? shop.map(String) : profile.badges,
                visitId: String(existing.get("visitId") || "") || null,
                hidden: String(existing.get("presenceStatus") || "").trim().toUpperCase() === "INVISIBLE",
              };
            } else if (fresh) {
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
          shopBadges: profile.badges, // like the app: the "has left" line (server / other phones) shows the same badges as "has entered"
          // Hidden (allowed) people stay out of "Currently in this room".
          presenceStatus: quietMe ? "INVISIBLE" : "ONLINE",
          lastSeen: serverTimestamp(),
          visitId,
          deviceId,
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
            : saved
              ? existingMarkerMs || Date.now() - 30_000
              : Date.now() - 30_000); // nothing saved here (e.g. after logout): only what is said from now on
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

      // ✨ My own entry effect plays for me whenever I OPEN the room (also when
      // invisible, and also when I was still listed in it from another phone or
      // a visit that never pressed Back — that used to hide it). Not on a tab
      // switch / coming back to an open tab.
      if (!resumed && !tabSession && !left) claimOwnEntryFx(roomName) && requestOwnEntryFx(roomName);
      if (!alreadyHere && !left) awardUserXp(uid, 5, "room_enter", 30 * 60_000, roomName); // like the app (Level 50+: once per room per 24 h)
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
      // Entered from another phone / browser later → close the room here
      // without touching the spot (it's theirs now) and without a "has left"
      // (the new place already wrote it).
      unwatchSpot = onSnapshot(
        presenceRef,
        (snap) => {
          spotGone = !snap.exists();
          const other = snap.exists() ? String(snap.get("deviceId") || "") : "";
          if (!other || other === deviceId || left || disposed) return;
          left = true;
          if (heartbeat) clearInterval(heartbeat);
          restorePresenceRef.current = null;
          setBlocked(ROOM_OPENED_ELSEWHERE);
        },
        () => {}
      );
      let lastBeatOk = Date.now();
      // Back in after my spot was removed from elsewhere: a new visit (its own
      // "has left" id later) and a "has entered" line, like opening the room again.
      let reEntering: Promise<void> | null = null;
      const reEnter = () =>
        (reEntering ??= (async () => {
          if (left || disposed) return;
          visitId = newVisitId();
          await (presenceWrite = setDoc(presenceRef, {
            uid,
            username: profile.username,
            activity: "",
            level: profile.level,
            levelBadgeIcon: profile.badge,
            shopBadges: profile.badges, // like the app: the "has left" line (server / other phones) shows the same badges as "has entered"
            presenceStatus: quietMe ? "INVISIBLE" : "ONLINE",
            lastSeen: serverTimestamp(),
            visitId,
            deviceId,
            entryMarker: serverTimestamp(),
          }).catch((err) => console.error("presence write failed", err)));
          spotGone = false;
          goneWhileHere = false;
          lastBeatOk = Date.now();
          // keep this tab's chat as it is, only the visit id is new
          saveEntry(uid, roomName, { visitId, at: savedEntry(uid, roomName)?.at ?? Date.now() - 30_000 });
          if (!quietMe) {
            await addDoc(collection(db, "room_messages", roomName, "messages"), {
              text: presenceLine(roomName, profile.username, profile.level, true, profile.badges),
              sender: profile.username,
              senderUid: uid,
              type: "room_entry",
              createdAt: serverTimestamp(),
            }).catch((err) => console.error("entry message failed", err));
          }
        })().finally(() => {
          reEntering = null;
        }));
      restorePresenceRef.current = async () => {
        if (left || disposed) return;
        if (spotGone || goneWhileHere) return reEnter();
        updateDoc(presenceRef, { lastSeen: serverTimestamp() })
          .then(() => {
            lastBeatOk = Date.now();
          })
          .catch((err) => {
            if (err?.code === "not-found") reEnter();
          });
      };
      heartbeat = setInterval(() => {
        // updateDoc, not a merge: if someone cleared this presence doc (3 h
        // without a heartbeat, e.g. a sleeping laptop), it must not come back
        // as a nameless half doc. Instead this is a new visit, like the app:
        // full presence doc + "has entered".
        updateDoc(presenceRef, { lastSeen: serverTimestamp() }).then(() => {
          lastBeatOk = Date.now();
        }).catch((err) => {
          if (err?.code !== "not-found" || left || disposed) return;
          if (isAutoLeft(uid, roomName)) return; // left on purpose (minimised too long)
          // Still beating a moment ago → the spot was removed from elsewhere
          // (the same account left on another phone / tab, which posted "has
          // left"), not a 3 h timeout. Stay out of the list until I chat again:
          // then I come back in with a "has entered" (restorePresenceRef).
          if (goneWhileHere || Date.now() - lastBeatOk < PRESENCE_HEARTBEAT_MS * 4) {
            goneWhileHere = true;
            return;
          }
          // Away too long (sleeping laptop, closed lid…), or taken out of the
          // room: I'm not in it any more. Like the app — no coming back in by
          // itself with a new "has entered"; to come back, open the room again.
          left = true;
          if (heartbeat) clearInterval(heartbeat);
          restorePresenceRef.current = null;
          setAutoLeft(true);
          note(`${roomName} : You have been auto left due to inactivity, kick or ban by other!`);
        });
        updateDoc(doc(db, "users", uid), { lastActiveAt: serverTimestamp() }).catch(() => {});
      }, PRESENCE_HEARTBEAT_MS);
    })();

    leaveRef.current = leave;
    // Like the app: closing / reloading the browser is NOT leaving (that posted
    // "has left" while the same account was still chatting elsewhere). You
    // leave with the room tab's ✕ or Log out; a closed browser's spot goes
    // stale and the server clears it later.

    return () => {
      disposed = true;
      restorePresenceRef.current = null;
      unwatchSpot?.();
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
  }, [user, profile, roomName, blocked, roomLoaded, modLoaded, myModLoaded, founder.loaded, autoLeft]);

  // Merge server messages with this device's own notices, oldest first.
  // Same display rules as the app (RoomPage.kt): your own entered/left lines
  // are hidden from you, and one person's "has entered" (or "has left") never
  // shows twice in a row — a second copy can come from an older app version or
  // a second device. A copy is one that comes within 10 minutes of the first:
  // a later "has left" is a new departure (the person was put back quietly in
  // between) and shows, like the app.
  const myUid = user?.uid;
  const shown = useMemo(() => {
    const last = new Map<string, { type: string; at: number }>();
    return [...messages.filter((m) => sinceMs !== null && m.createdAtMs > sinceMs), ...localNotes]
      .sort((a, b) => a.createdAtMs - b.createdAtMs)
      .filter((m) => {
        if (m.type !== "room_entry" && m.type !== "room_leave") return true;
        if (myUid && m.senderUid === myUid) return false;
        const who = m.sender.trim().toLowerCase() || m.senderUid;
        if (!who) return true;
        const prev = last.get(who);
        const keep = !prev || prev.type !== m.type || m.createdAtMs - prev.at > 10 * 60_000;
        last.set(who, { type: m.type, at: m.createdAtMs });
        return keep;
      });
  }, [messages, localNotes, myUid, sinceMs]);

  // People I blocked (user_blocks/{uid}, /block): their lines are hidden for me, like the app.
  const [blockedNames, setBlockedNames] = useState<string[]>([]);
  useEffect(() => {
    if (!myUid) return;
    return watchBlockedNames(myUid, (names) => setBlockedNames(names.map((x) => x.toLowerCase())));
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
  // 🚫 a NEW "Bet rejected" line of MIG Royale shows as a short toast over the box, once.
  // The lines already in the chat (history, or the one shown before) never pop up again.
  const [rejectToast, setRejectToast] = useState<{ id: string; text: string } | null>(null);
  useEffect(() => {
    if (roomName !== ROYALE_ROOM) return;
    // only MY failed bet (a local line made just now) — never the history, the chat or a tab coming back
    for (let i = shown.length - 1; i >= 0; i--) {
      const m = shown[i];
      if (!m.text.startsWith("MIG Royale Bot: Bet rejected")) continue;
      if (m.type !== "local" || shownRejectIds.has(m.id)) return;
      shownRejectIds.add(m.id);
      setRejectToast({ id: m.id, text: m.text.replace(/^MIG Royale Bot: /, "") });
      return;
    }
  }, [shown, roomName]);
  useEffect(() => {
    if (!rejectToast) return;
    const t = setTimeout(() => setRejectToast(null), 2800);
    return () => clearTimeout(t);
  }, [rejectToast]);

  const visible = useMemo(() => {
    const blocked = new Set(blockedNames);
    return shown.filter((m) => {
      if (m.type !== "room_entry" && m.type !== "room_leave" && chatHideBotLine(hideBots, m.text, roomName, myName)) return false;
      // 🔒 MIG Royale's "Fair round — cards were locked before betting." line is hidden (miglife asked)
      if (m.text.includes("Fair round — cards were locked before betting")) return false;
      // 🚫 MIG Royale's "Bet rejected…" lines show as a toast over the box, not in the chat
      if (roomName === ROYALE_ROOM && m.text.startsWith("MIG Royale Bot: Bet rejected")) return false;
      // 📣 MIG Royale's "X has N coins on the table — …" bet lines are shown in the box's live ticker instead
      if (roomName === ROYALE_ROOM && !royalePrefs.betLines && /^MIG Royale Bot: .+ has [\d,]+ coins on the table/.test(m.text)) return false;
      // 💬 "Hide game messages in chat" (⋯ menu): every MIG Royale Bot line hides (the box shows it all)
      if (roomName === ROYALE_ROOM && royalePrefs.hideGame && m.text.startsWith("MIG Royale Bot:")) return false;
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
  }, [shown, onlyMyBets, myName, blockedNames, myUid, tableGame, tablesVersion, hideBots, roomName, royalePrefs]);

  // ✋ New lines never drag you down while you read older ones: they are
  // counted for the "⬇ new messages" pill instead (your own lines don't count).
  useEffect(() => {
    const last = visible.length ? visible[visible.length - 1].id : null;
    const prev = lastSeenIdRef.current;
    lastSeenIdRef.current = last;
    if (stickToBottom.current) {
      setNewBelow(0);
      setNewBelowStats(NO_NEW_BELOW);
      return;
    }
    if (!prev || last === prev) return;
    const i = visible.findIndex((m) => m.id === prev);
    const arrived = i >= 0 ? visible.slice(i + 1).filter((m) => !(m.senderUid && m.senderUid === myUid)) : [];
    if (arrived.length > 0) {
      setNewBelow((n) => n + arrived.length);
      setNewBelowStats((st) => addNewBelow(st, arrived.map((m) => m.text), roomName, myName));
    }
  }, [visible, myUid, roomName, myName]);

  // Uploaded pictures for the badges in the enter/left lines.
  const badgeImages = useBadgeImages(!!user);
  // Room text size (Settings → Chat), in px.
  const fontPx = chatPx(useChatTextSize());

  // Game rooms read as a plain running log: every line on the left.
  const gameRoom = [LUXURY_ROOM, LUXURY_BET_ROOM, LOWCARD_ROOM, TEEN_PATTI_ROOM, LUDO_ROOM, LUDO_FREE_ROOM, CRICKET_ROOM, ROYALE_ROOM, TN_ROOM, TN_FREE_ROOM, TRIVIA_ROOM, NUMBER_GUESS_ROOM, HORSE_RACE_ROOM, LIAR_DICE_ROOM, ROYAL_TREASURE_ROOM].includes(roomName);
  // ✨ Only entries made AFTER I came in (and not older than a minute) can play an
  // effect. Before, when the chat loaded late (it can only be read once my spot is
  // written), the "has entered" lines of people who came in before me looked new
  // and their effects played again for me.
  const entryFxLines = useMemo(
    () => messages.filter((m) => sinceMs !== null && m.createdAtMs > sinceMs && serverNow() - m.createdAtMs < 60_000),
    [messages, sinceMs]
  );

  // Game rooms get no Entry Effects (like the app's isEntryFxGameRoom).
  // (a room with a game bot on DOES get entry effects now — except while that
  // bot's game is running, like the app)
  const entryFxGameRoom =
    gameRoom ||
    [LUXURY_ROOM, LUXURY_BET_ROOM, LOWCARD_ROOM, TEEN_PATTI_ROOM, LUDO_ROOM, LUDO_FREE_ROOM, CRICKET_ROOM, ROYALE_ROOM, TN_ROOM, TN_FREE_ROOM, TRIVIA_ROOM].some((g) =>
      roomName.startsWith(`${g} #`)
    );

  // Name colours (role / Color Shop / Lucky pink) for everyone in the chat.
  const colorOf = useSenderColors(
    useMemo(
      () => [
        ...shown.map((m) => (m.sender ? m.sender : m.text.slice(0, Math.max(0, m.text.indexOf(":")))).trim()),
        // the people in the room too (their 🌍 Country Representative badge in the list)
        ...presence.map((p) => p.username),
      ],
      [shown, presence]
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
      if (!m.senderUid || m.createdAtMs <= 0) return;
      // BUG FIX ("lomi has left" but lomi kept chatting), like the app: a
      // message sent AFTER the "has left" means they are still here.
      const map = m.type === "room_leave" ? leftAt : enteredAt;
      map.set(m.senderUid, Math.max(map.get(m.senderUid) || 0, m.createdAtMs));
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
      modName: perms.isHiddenFounder || isMainFounderName(profile.username) ? "administrator" : profile.username,
      room: roomInfo,
      perms,
      modLevel: profile.level,
      people: roomUsers.map((u) => ({ uid: u.uid, username: u.username, level: u.level })),
      note,
      post: (t, type = "chat") => write({ text: t, type, giftName: "", clientCreatedAt: Date.now() }),
      postModeration: (t, color) => write({ text: t, type: "moderation", moderationColor: color }),
      clearForMe: () => clearChatRef.current?.(),
    };
  };

  // 🎨 Sticker: a picture from a pack I own (the rules check it), sent at once.
  const sendSticker = async (st: PickedSticker) => {
    if (!user || !profile) return;
    if (muted || (silenced && !perms.canRoomWide)) {
      return note(muted ? "🔇 You are muted in this room." : "🔇 This room is currently silenced.");
    }
    try {
      await addDoc(collection(db, "room_messages", roomName, "messages"), {
        text: `${profile.username}: 🎨 Sticker`,
        sender: profile.username,
        senderUid: user.uid,
        type: "sticker",
        imageUrl: st.url,
        stickerPack: st.packId,
        createdAt: serverTimestamp(),
      });
      stickToBottom.current = true;
    } catch (err: any) {
      console.error(err);
      note(`${roomName}: Sticker could not be sent.`);
    }
  };

  // 📷 Photo message: same Storage folder and message shape as the app.
  const sendPhoto = async (file: File | undefined) => {
    if (!file || !user || !profile || uploading) return;
    if (!perms.canShareMedia) return note(`${roomName}: Photos are not allowed for your role.`);
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
    if (!perms.canShareVoice) throw new Error("Voice messages are not allowed for your role.");
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
    if (autoLeft) {
      // Nothing sent: the room says why and how to come back in.
      note(`${roomName} : You are not in ${roomName} chat room`);
      setNotInRoomOpen(true);
      return;
    }

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
        const sendShower = httpsCallable<
          { roomId: string; targets: string[]; giftName: string; message: string; postRoomLine: boolean },
          { sentTo?: string[]; giftName?: string; giftIcon?: string; failed?: { target?: string; reason?: string }[]; roomLinePosted?: boolean }
        >(functions, "sendGiftShower");
        // at least 2 s between two Gift Showers (a quick second one waits its turn)
        // ⚡ postRoomLine: the server writes the room line together with the payment
        stickToBottom.current = true;
        queueGiftShower(() => sendShower({ roomId: roomName, targets: everyone, giftName, message, postRoomLine: true }))
          .then(({ data }) => {
            const sent = data?.sentTo || [];
            const shownGift = data?.giftName || giftName;
            const icon = data?.giftIcon || giftByName.get(giftName.toLowerCase())?.icon || "🎁";
            if (sent.length) {
              // +10 XP for a gift shower (the most one award may give), 30 s "gift" cooldown
              awardUserXp(user.uid, 10, "gift", 30_000);
              const others = sent.length - 5;
              const toText = sent.slice(0, 5).join(", ") + (others > 0 ? ` and ${others} other` : "");
              // (an older server didn't write the line — post it here, as before)
              if (data?.roomLinePosted !== true) addDoc(collection(db, "room_messages", roomName, "messages"), {
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
            if (failed.length) setPopup({ title: "🎁 Gift Shower", text: `These people did not get the ${shownGift}:\n${failed.join("\n")}` });
          })
          .catch((e: any) => setPopup({ title: "🎁 Gift Shower", text: `The gift shower did not send.\n\n${giftErrorText(e)}` }));
        return;
      }
      stickToBottom.current = true;
      httpsCallable<
        { roomId: string; target: string; giftName: string; message: string; postRoomLine: boolean },
        { giftName?: string; recipient?: string; giftIcon?: string; recipientLevel?: number; roomLinePosted?: boolean }
      >(functions, "sendGift")({ roomId: roomName, target, giftName, message, postRoomLine: true })
        .then(({ data }) => {
          awardUserXp(user.uid, 5, "gift", 30_000); // +5 XP for a gift, like the app
          // ⚡ the server already wrote the room line together with the payment
          if (data?.roomLinePosted === true) return;
          announceGift({
            giftName: data?.giftName || giftName,
            giftIcon: data?.giftIcon || giftByName.get(giftName.toLowerCase())?.icon || "🎁",
            recipient: data?.recipient || target,
            message,
            recipientLevel: Number(data?.recipientLevel) || undefined,
          });
        })
        .catch((e: any) => setPopup({ title: "🎁 Gift not sent", text: `That gift could not be sent.\n\n${giftErrorText(e)}` }));
      return;
    }

    // ✨ /entry or /effects — the Entry Effects shop (like the app).
    if (/^\/(entry|effects)$/i.test(clean)) {
      setText("");
      router.push("/entry-effects");
      return;
    }

    // 🅿️ /unpark or /park cancel — end my park early; the whole hours still left
    // come back as coins (server: unparkRoomPresence).
    const parkArg = (clean.split(/\s+/)[1] || "").toLowerCase();
    if (/^\/unpark$/i.test(clean) || (/^\/park\b/i.test(clean) && ["cancel", "off", "stop", "end"].includes(parkArg))) {
      setText("");
      httpsCallable<{ roomId: string }, { wasParked?: boolean; refund?: number; refundHours?: number }>(functions, "unparkRoomPresence")({ roomId: roomName })
        // a popup, like the app (not a line in the chat)
        .then(({ data }) =>
          setPopup({
            title: "🅿️ Park",
            text: !data?.wasParked
              ? `You are not parked in ${roomName}.`
              : (data.refund ?? 0) > 0
                ? `Park cancelled in ${roomName}.\n${data.refundHours ?? 0}h unused — ${data.refund} coins refunded.`
                : `Park cancelled in ${roomName}.\nLess than 1 hour was left, nothing to refund.`,
          })
        )
        .catch((e: any) => setPopup({ title: "🅿️ Park", text: `Could not cancel park: ${e?.message || "Please try again."}` }));
      return;
    }

    // /park 1-24 — keep your name in "Currently in this room" (paid, on the server).
    if (/^\/park\b/i.test(clean)) {
      setText("");
      const hours = Number(clean.split(/\s+/)[1]);
      if (!Number.isInteger(hours) || hours < 1 || hours > 24)
        return setPopup({ title: "🅿️ Park", text: "Usage: /park <hours> — a whole number from 1 to 24.\n/park cancel ends it early." });
      // a popup, like the app (not a line in the chat)
      httpsCallable<{ roomId: string; hours: number }, { cost?: number }>(functions, "parkRoomPresence")({ roomId: roomName, hours })
        .then(({ data }) =>
          setPopup({
            title: "🅿️ Parked",
            text: `You are parked in ${roomName} for ${hours}h (${data?.cost ?? hours * 50} coins).\nYour name stays in the room even when you leave.`,
          })
        )
        .catch((e: any) => setPopup({ title: "🅿️ Park", text: `Could not park: ${e?.message || "Please try again."}` }));
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
    if (numGuess && numGuessHandleCommand(numGuess, clean, note)) {
      setText("");
      return;
    }
    if (horseRace && horseHandleCommand(horseRace, clean, note)) {
      setText("");
      return;
    }
    if (royalTreasure && royalTreasureHandleCommand(royalTreasure, clean, note)) {
      setText("");
      return;
    }
    if (liarDice && liarDiceHandleCommand(liarDice, clean, note)) {
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
        openCommands: () => setCommandsOpen(true),
        roomUsers: roomUsers.map((p) => p.username),
        showWhois: setWhoisInfo,
        popup: (title, text) => setPopup({ title, text }),
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

    awardUserXp(user.uid, 2, "chat_message", 15_000); // like the app
    setSending(true);
    try {
      // back in first ("has entered") if I was taken out from another phone / tab
      await restorePresenceRef.current?.();
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
    stickToBottom.current = true;
    // ⚡ the server already wrote the line together with the payment
    if (r.roomLinePosted) return;
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

  if (blocked === "You are banned from this room." || blocked === "You were kicked from this room.") {
    const banned = blocked.startsWith("You are banned");
    return (
      <PageShell light>
        <WarningDialog
          tone={banned ? "ban" : bumped ? "bump" : "kick"}
          roomName={roomName}
          minutesLeft={kickMinutesLeft}
          totalMinutes={KICK_MINUTES}
          onClose={() => router.push("/rooms")}
        />
      </PageShell>
    );
  }
  if (blocked) {
    // 🔒 Locked / level too low: like the app — a toast and straight back out
    // (the effect below), no page of its own.
    if (isEntryBlock(blocked)) return null;
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

  // 💰 the compact gold balance card (like the app's)
  const checkBalance = async () => {
    setBalanceCard("loading");
    try {
      const snap = await getDoc(doc(db, "users", user.uid));
      setBalanceCard({
        balance: Number(snap.get("balance") || 0),
        level: Number(snap.get("level") || 1),
        xp: Number(snap.get("xp") || 0),
      });
    } catch {
      setBalanceCard("error");
    }
  };

  const favorite = favorites.includes(roomName);
  // ⋮ Room menu helpers (like the app's RoomMenuContent).
  const closeMenu = () => {
    setMenuOpen(false);
    setModToolsOpen(false);
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
  // 🛡 MODERATION TOOLS page (the app's RoomModerationToolsPage): each tool with
  // a short line saying what it does; the ones that need a name fill the box.
  type ModTool = { icon: string; title: string; desc: string; tint: string; act: () => void };
  const modSections: [string, ModTool[]][] = [
    [
      "👤 PEOPLE",
      [
        ...(perms.canKick ? [{ icon: "👢", title: "Kick", desc: "Remove someone from this room", tint: "#FFE8DC", act: () => (closeMenu(), setKickOpen(true)) }] : []),
        { icon: "🔇", title: "Mute", desc: "Stop someone from typing here", tint: "#FFF1D6", act: () => prefill("/mute ") },
        { icon: "⛔", title: "Ban", desc: "Block someone from this room", tint: "#FFE0E0", act: () => prefill("/ban ") },
      ],
    ],
    [
      "🏠 ROOM",
      [
        {
          icon: "🔒",
          title: locked ? "Unlock room" : "Lock room",
          desc: locked ? "Let everyone enter again" : "Nobody new can enter",
          tint: "#E3EEFF",
          act: () => runCommand(locked ? "/unlock" : "/lock"),
        },
        {
          icon: "🤫",
          title: silenced ? "Unsilence" : "Silence",
          desc: silenced ? "Everyone can talk again" : "Only staff can talk",
          tint: "#EDE7FF",
          act: () => runCommand(silenced ? "/unsilence room" : "/silence room"),
        },
        { icon: "📌", title: "Announce", desc: "Pin a message on top of the chat", tint: "#E6F7EE", act: () => prefill("/announcement ") },
        ...(perms.canBroadcast ? [{ icon: "📢", title: "Broadcast", desc: "Send a highlighted notice once", tint: "#FFF4D6", act: () => prefill("/broadcast ") }] : []),
      ],
    ],
    [
      "⭐ TEAM",
      [
        ...(perms.isUserRoom && perms.canManagePrivate ? [{ icon: "🛡", title: "Add Mod", desc: "Make someone a moderator", tint: "#E3F3FF", act: () => prefill("/mod ") }] : []),
        ...(perms.isUserRoom && perms.canAssignSuperMod
          ? [{ icon: "⭐", title: "Add Super Mod", desc: "Make someone a super moderator", tint: "#FFF1CC", act: () => prefill("/smod ") }]
          : []),
        ...((perms.isUserRoom && perms.canManagePrivate) || perms.isRoomAdmin
          ? [{ icon: "⚙️", title: "Room Settings", desc: "Name, rules, welcome message…", tint: "#EFF2F6", act: () => (closeMenu(), setInfoOpen(true)) }]
          : []),
      ],
    ],
  ];

  // the MIG Royale room's table strip takes the chat's light background
  // (useLuxuryBot & co. always return an object, so check the room instead)
  const royaleOnly = !!royale && roomName === ROYALE_ROOM;

  return (
    <PageShell light bottomNav={false}>
      <ImageViewerHost />
      <RoomLinkDialog url={pendingLink} onClose={() => setPendingLink(null)} />
      {reactors && <ReactorsDialog emoji={reactors.emoji} uids={reactors.uids} onClose={() => setReactors(null)} />}
      {/* 📱 On a phone the room fills the screen edge to edge, like the app
          (no frame or margins); on a bigger screen it sits in a framed card. */}
      <div className="relative mx-auto flex h-screen-minus-bar max-w-5xl flex-col sm:px-6 sm:py-3">
        <div className="flex min-h-0 flex-1 gap-3">
          {/* Messages */}
          <div className={`relative flex min-w-0 flex-1 flex-col overflow-hidden border-[#CFE3F5] sm:rounded-2xl sm:border ${classic ? "bg-white" : "room-chat-bg bg-[#FFFFFF]"}`}>
            {/* The chat area: the /gift and @ name lists sit over it (never over the message box). */}
            <div className="relative flex min-h-0 flex-1 flex-col">
            {giftQuery !== null ? (
              <GiftNamePicker
                queryText={giftQuery.q}
                cmd={giftQuery.cmd}
                names={roomUsers.map((u) => u.username).filter((n) => n.toLowerCase() !== (profile?.username || "").toLowerCase())}
                onPick={(t) => {
                  setText(t);
                  inputRef.current?.focus();
                }}
              />
            ) : (
              mentionQuery !== null && (
                // 👤 "@" — mention someone in the room (the app's "Mention a user")
                <GiftNamePicker
                  queryText={mentionQuery}
                  cmd="@"
                  names={roomUsers.map((u) => u.username)}
                  onPick={(t) => {
                    setText(t);
                    inputRef.current?.focus();
                  }}
                  pickText={(name) => `${text.slice(0, text.lastIndexOf("@"))}@${name} `}
                />
              )
            )}
            <div
              ref={listRef} data-notranslate
              onWheel={() => { userScrollAtRef.current = Date.now(); }}
              onTouchStart={() => { userTouchingRef.current = true; userScrollAtRef.current = Date.now(); }}
              onTouchMove={() => { userScrollAtRef.current = Date.now(); }}
              onTouchEnd={() => { userTouchingRef.current = false; userScrollAtRef.current = Date.now(); }}
              onTouchCancel={() => { userTouchingRef.current = false; userScrollAtRef.current = Date.now(); }}
              onPointerDown={() => { userScrollAtRef.current = Date.now(); }}
              onKeyDown={() => { userScrollAtRef.current = Date.now(); }}
              onScroll={(e) => {
                const el = e.currentTarget;
                // BUG FIX (chat stopped following during a fast burst of bet
                // lines and piled up under "⬇ 46 new messages"): this event
                // also fires for our OWN jump to the bottom, and by then more
                // lines had already been added, so it looked "scrolled up".
                // Only a real move UP lets go of the bottom now.
                const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
                // ⬇ the jump button shows whenever the reader is well above the newest line
                setFarUp(el.scrollHeight - el.scrollTop - el.clientHeight > 300);
                if (nearBottom) {
                  stickToBottom.current = true;
                  pinnedTopRef.current = el.scrollTop;
                } else if (stickToBottom.current) {
                  if (el.scrollTop >= pinnedTopRef.current) pinnedTopRef.current = el.scrollTop;
                  else if (el.scrollTop < pinnedTopRef.current - 8) {
                    const byReader = userTouchingRef.current || Date.now() - userScrollAtRef.current < 1500;
                    if (byReader) stickToBottom.current = false;
                    else {
                      // not the reader: stay glued to the newest line
                      pinnedTopRef.current = el.scrollTop;
                      el.scrollTop = el.scrollHeight;
                    }
                  }
                }
                if (stickToBottom.current) {
                  setNewBelow((n) => (n ? 0 : n));
                  setNewBelowStats((st) => (st.people || st.bots || st.mention ? NO_NEW_BELOW : st));
                }
                scrollTopRef.current = el.scrollTop;
                if (user && isRoomOpen(user.uid, roomName)) {
                  const cur = readRoomSession(user.uid, roomName);
                  if (cur) {
                    cur.scrollTop = el.scrollTop;
                    cur.stickToBottom = stickToBottom.current;
                  }
                }
              }}
              // up / down only, like the app: never slides sideways
              className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-x-none px-3 py-3"
            >
              <div ref={contentRef} className="space-y-1">
              {/* Room cards, like the app: manager, welcome text, who is here —
                  the app's own sizes (15 / 15 / 16, announcement 17) */}
              <div className="space-y-1.5 pb-1">
                {classic ? (
                  <>
                <p className={`${infoBox} px-3.5 py-2.5 text-[15px]`}>
                  👥 This room is managed by: {isMainFounderName(roomInfo.ownerName) ? MIGLIFE_DISPLAY_NAME : roomInfo.ownerName || MIGLIFE_DISPLAY_NAME}
                </p>
                <p className={`whitespace-pre-wrap ${infoBox} px-3.5 py-2.5 text-[15px] leading-[22px]`}>
                  {roomDescription}
                </p>
                {locked && (
                  <p className="rounded-xl border border-[#D85A30] bg-[#4A1B0C] px-3.5 py-2.5 text-[13px] font-bold text-[#F0997B]">
                    🔒 This room is locked. Only admins/mods can enter until it&apos;s unlocked.
                  </p>
                )}
                <div className={`${infoBox} px-3.5 py-2.5 text-[16px] leading-[21px]`}>
                  <p>👫 Currently in this room:</p>
                  {roomUsers.length > 0 && <p className={`mt-1 ${classic ? "text-[#16315F]" : "text-black"}`}>{roomUsers.map((u) => brandMiglife(u.username)).join(", ")}</p>}
                </div>
                  </>
                ) : (
                  // ✨ design 3: soft pastel cards
                  <RoomInfoCards
                    manager={isMainFounderName(roomInfo.ownerName) ? MIGLIFE_DISPLAY_NAME : roomInfo.ownerName || MIGLIFE_DISPLAY_NAME}
                    description={roomDescription}
                    people={roomUsers.map((u) => brandMiglife(u.username))}
                    locked={
                      locked && (
                        <p className="rounded-xl border border-[#D85A30] bg-[#4A1B0C] px-3.5 py-2.5 text-[13px] font-bold text-[#F0997B]">
                          🔒 This room is locked. Only admins/mods can enter until it&apos;s unlocked.
                        </p>
                      )
                    }
                  />
                )}
                {/* Room announcement (/announcement), pinned under who is here, like the app */}
                {/* 📢 a pink card "<< text >>", like the reference app (miglife) */}
                {announcement && (
                  <div className="rounded-[12px] px-3 py-2" style={{ background: ANNOUNCE_PINK }}>
                    {/* a long link breaks onto the next line instead of running off the box; links can be tapped */}
                    <p className="whitespace-pre-wrap text-[15px] leading-[22px] text-[#2B2F38] [overflow-wrap:anywhere]">
                      {/* 📢 faces the same way as in the app (the browser's emoji faces the other way) */}
                      <span className="mr-1 inline-block -scale-x-100 text-[18px] leading-none">📢</span>
                      {"<< "}
                      {announcement.split(/(https?:\/\/\S+)/g).map((part, i) =>
                        /^https?:\/\//.test(part) ? (
                          <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="underline decoration-[#2B2F38]/50 underline-offset-2">
                            {part}
                          </a>
                        ) : (
                          part
                        )
                      )}
                      {" >>"}
                    </p>
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
              {visible.map((m, idx) => {
                // 🤖 one tinted panel with a coloured stripe behind each run of
                // lines from the same bot (like the app's botGroupBackdrop)
                const bot = m.type === "room_entry" || m.type === "room_leave" ? null : chatBotKey(m.text, roomName);
                const botOf = (o: ChatMessage | undefined) =>
                  o && o.type !== "room_entry" && o.type !== "room_leave" ? chatBotKey(o.text, roomName) : null;
                const joinAbove = !!bot && botOf(visible[idx - 1]) === bot;
                const joinBelow = !!bot && botOf(visible[idx + 1]) === bot;
                const accent = bot ? chatBotAccent(bot) : "";
                const rowAt = (px: number) => (
                <MessageRow
                  key={m.id}
                  m={m}
                  mine={!!m.senderUid && m.senderUid === user.uid}
                  mentionsMe={
                    !(m.senderUid && m.senderUid === user.uid) &&
                    m.type !== "room_entry" &&
                    m.type !== "room_leave" &&
                    !!myName &&
                    chatLineAtMentionsMe(m.text, myName)
                  }
                  classic={classic}
                  roomName={roomName}
                  gameRoom={gameRoom}
                  colorOf={colorOf}
                  badgeImages={badgeImages}
                  fontPx={px}
                  gift={giftByName.get(m.giftName.toLowerCase()) || null}
                  onMention={(name) => {
                    // Tap a name: add the plain ID (no "@", so not a mention) to the message box, like the app.
                    const lower = name.toLowerCase();
                    setText((t) =>
                      t.split(" ").some((w) => w.toLowerCase() === lower) ? t : t.trim() ? `${t.trimEnd()} ${name} ` : `${name} `
                    );
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
                );
                // 🎁 gift / Gift Shower lines shrink a little to fit on one line (when a
                // little is enough). Kick / ban / lock … lines no longer do: they are at
                // the chat's own size like every other line (miglife: "why two font
                // sizes?" — 🔓 unlocked shrank, 🔒 locked did not).
                const row = m.type === "gift" ? (
                  <FitOneLine key={m.id} base={fontPx}>
                    {rowAt}
                  </FitOneLine>
                ) : (
                  rowAt(fontPx)
                );
                // MIG Royale lines read directly on the chat, like the reference: no tinted panel
                if (!bot || roomName === ROYALE_ROOM) return row;
                return (
                  <div
                    key={m.id}
                    className="-mx-1.5 py-0.5 pl-1.5 pr-1"
                    style={{
                      background: `${accent}${classic ? "12" : "14"}`,
                      boxShadow: `inset 3px 0 0 ${accent}BF`,
                      borderTopLeftRadius: joinAbove ? 0 : 13,
                      borderTopRightRadius: joinAbove ? 0 : 13,
                      borderBottomLeftRadius: joinBelow ? 0 : 13,
                      borderBottomRightRadius: joinBelow ? 0 : 13,
                      marginBottom: joinBelow ? 0 : undefined,
                    }}
                  >
                    {row}
                  </div>
                );
              })}
              </div>
              {/* ⬇ back to the newest line in one tap, whenever you have scrolled up */}
              {/* 🔢 the number of new lines is written on the pill (30 new → "30") */}
              {(farUp || newBelow > 0) && (
                <div className="pointer-events-none sticky bottom-0 flex h-0 justify-end pr-3">
                  <button
                    type="button"
                    aria-label="Jump to newest"
                    onClick={() => {
                      const el = listRef.current;
                      stickToBottom.current = true;
                      setFarUp(false);
                      setNewBelow(0);
                      setNewBelowStats(NO_NEW_BELOW);
                      el?.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
                    }}
                    className="pointer-events-auto flex h-8 min-w-12 px-2.5 -translate-y-12 items-center justify-center rounded-full border border-[#D5E3F5] bg-white text-[18px] font-black leading-none text-[#2B5FD9] shadow-md"
                  >
                    ⌄{newBelow > 0 ? ` ${newBelow > 99 ? "99+" : newBelow}` : ""}
                  </button>
                </div>
              )}
            </div>
            </div>

            {/* 🎆 a game win, ❤️ /love, ✨ someone's entry effect — the whole room sees it */}
            <RoomFireworksHost messages={messages} roomKey={roomName} />
            <RoomHeartsHost messages={messages} roomKey={roomName} />
            {/* (🎁 gift rain is OFF — miglife asked) */}
            {/* ✨ Entry Effects play only in CHAT rooms — never in game rooms (official
                game rooms, their extra "#2" tables, or any room with a game bot on). */}
            {!entryFxGameRoom && (
              <EntryEffectHost
                messages={entryFxLines}
                roomKey={roomName}
                myName={profile?.username || ""}
                blocked={
                  roomActiveBot === "lowcard"
                    ? lowCard?.running === true
                    : roomActiveBot === "cricket"
                      ? cricket?.running === true
                      : roomActiveBot === "trivia"
                        ? trivia?.running === true
                        : false
                }
              />
            )}

            {/* Game tables keep their dark look */}
            {(luxury || luxuryBet || royale || teenPatti || cricket || twentyNine || lowCard || ludo) && (
              // the MIG Royale box alone sits on the chat's own background (no dark strip)
              <div data-noswipe className={`game-strip ${royaleOnly ? "text-[#1B2440]" : "bg-[#0B1F3A] text-white"}`}>
                {luxury && <LuxuryBetBox state={luxury} uid={user.uid} note={note} />}
                {luxuryBet && (
                  <LuxuryBetTable state={luxuryBet} uid={user.uid} onlyMine={onlyMyBets} onToggleOnlyMine={() => setOnlyMyBets((v) => !v)} />
                )}
                {rejectToast && (
                  <div key={rejectToast.id} className="royale-float mx-2 mt-1 rounded-full bg-gradient-to-r from-[#FF5A3C] to-[#E8343E] px-3.5 py-1.5 text-center text-[12px] font-black text-white shadow-[0_6px_16px_rgba(232,52,62,.35)]">
                    🚫 {rejectToast.text}
                  </div>
                )}
                {royale && <RoyaleTable state={royale} footer={<ChatBar
                  text={text}
                  setText={setText}
                  inputRef={inputRef}
                  onSend={send}
                  canSend={!sending && !!text.trim() && !!profile}
                  placeholder={muted ? "You are muted" : silenced ? "Room is silenced" : "Type a message…"}
                  maxLength={1000}
                  disabled={!profile}
                  onGift={() => setGiftTarget("")}
                  onSticker={sendSticker}
                  onMore={(r) => {
                    setMenuAnchor(r ? { left: Math.max(8, Math.min(r.left, window.innerWidth - 196)), bottom: Math.max(8, window.innerHeight - r.top + 8) } : null);
                    setMenuOpen(true);
                  }}
                  photo={{
                    // picking a photo never posts it straight away: "Send this photo?" first
                    onFile: (f: File | undefined) => f && setPendingPhoto(f),
                    disabled: !perms.canShareMedia,
                    uploading,
                    title: perms.canShareMedia ? "Send a photo" : "Photos are not allowed for your role",
                  }}
                  voice={
                    <VoiceRecorder
                      size="md"
                      disabled={!profile || !perms.canShareMedia}
                      onSend={sendVoice}
                      onError={(m) => note(`${roomName}: ${m}`)}
                      onActive={setVoiceActive}
                    />
                  }
                  // ▶ next to ⋮, like the app (hidden while recording)
                  extra={luxuryBet && <LuxuryBetStartButton state={luxuryBet} />}
                  voiceActive={voiceActive}
                  reply={replyTo && { ...replyTo, color: colorOf(replyTo.sender), onCancel: () => setReplyTo(null) }}
                        />
} />}
                {teenPatti && profile && <TeenPattiTable state={teenPatti} uid={user.uid} myUsername={profile.username} roomUsers={roomUsers.map((u) => u.username)} />}
                {cricket && <CricketBox state={cricket} uid={user.uid} />}
                {/* 🎉 SIX/FOUR clapping, OUT finger, DRS third-umpire pop-ups */}
                {cricket && profile && <CricketCelebrationHost messages={messages} roomKey={roomName} myName={profile.username} />}
                {twentyNine && <TwentyNineTable state={twentyNine} roomUsers={roomUsers.map((u) => u.username)} />}
                {lowCard && <LowCardBox state={lowCard} uid={user.uid} />}
                {ludo && <LudoTable state={ludo} myUsername={profile?.username || ""} roomUsers={roomUsers.map((u) => u.username)} />}
              </div>
            )}

            {/* These game boxes have no sideways controls (Number Guess's slider keeps its
                own data-noswipe), so a sideways swipe on them slides the
                room tabs like anywhere else (miglife: "swiping on the race didn't work"). */}
            {/* 🧠 Trivia panel above the input bar (light, like the app) */}
            {trivia && (
              <div>
                <TriviaPanel state={trivia} uid={user.uid} isStaff={perms.isAppStaffHere} />
              </div>
            )}
            {numGuess && (
              <div>
                <NumGuessPanel state={numGuess} />
              </div>
            )}
            {horseRace && (
              <div>
                <HorseRacePanel state={horseRace} />
              </div>
            )}
            {liarDice && (
              <div>
                <LiarDicePanel state={liarDice} />
              </div>
            )}
            {royalTreasure && (
              <div>
                <RoyalTreasurePanel state={royalTreasure} />
              </div>
            )}

            {/* Text bar, like the app's (in the MIG Royale room it sits inside the box) */}
            {!royale && (
            <ChatBar
              text={text}
              setText={setText}
              inputRef={inputRef}
              onSend={send}
              canSend={!sending && !!text.trim() && !!profile}
              placeholder={muted ? "You are muted" : silenced ? "Room is silenced" : "Type a message…"}
              maxLength={1000}
              disabled={!profile}
              onGift={() => setGiftTarget("")}
              onSticker={sendSticker}
              onMore={(r) => {
                setMenuAnchor(r ? { left: Math.max(8, Math.min(r.left, window.innerWidth - 196)), bottom: Math.max(8, window.innerHeight - r.top + 8) } : null);
                setMenuOpen(true);
              }}
              photo={{
                // picking a photo never posts it straight away: "Send this photo?" first
                onFile: (f: File | undefined) => f && setPendingPhoto(f),
                disabled: !perms.canShareMedia,
                uploading,
                title: perms.canShareMedia ? "Send a photo" : "Photos are not allowed for your role",
              }}
              voice={
                <VoiceRecorder
                  size="md"
                  disabled={!profile || !perms.canShareMedia}
                  onSend={sendVoice}
                  onError={(m) => note(`${roomName}: ${m}`)}
                  onActive={setVoiceActive}
                />
              }
              // ▶ next to ⋮, like the app (hidden while recording)
              extra={luxuryBet && <LuxuryBetStartButton state={luxuryBet} />}
              voiceActive={voiceActive}
              reply={replyTo && { ...replyTo, color: colorOf(replyTo.sender), onCancel: () => setReplyTo(null) }}
            />
            )}
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
                  {/* (no 🔥/💎 level icon here — the level number on the right is enough, so the name has room) */}
                  <Link
                    href={`/profile/${encodeURIComponent(u.username)}`}
                    className="min-w-[3.5rem] truncate font-semibold text-[#0B2A5B] hover:text-[#2F80ED]"
                  >
                    {u.username}
                  </Link>
                  {cachedRoleOf(u.username) === "country_representative" && <span className="shrink-0" title="Country Representative">{COUNTRY_REP_BADGE}</span>}
                  {(() => {
                    const team = supporterTeamOf(u.username);
                    return team ? <SupporterBadge team={team} size={9} /> : null;
                  })()}
                  {(() => {
                    const k = u.username.toLowerCase();
                    if (roomInfo.ownerUid && u.uid === roomInfo.ownerUid) return <span title="Room owner">👑</span>;
                    if (roomInfo.superMods.includes(k)) return <span title="Super Mod">🌟</span>;
                    if (roomInfo.moderators.includes(k))
                      return (
                        <span
                          title="Moderator"
                          className="pointer-events-none inline-grid h-[18px] min-w-[18px] shrink-0 select-none place-items-center rounded-full bg-gradient-to-b from-[#FFB74D] to-[#F57C00] px-1.5 text-[10px] font-black leading-none text-white shadow-[0_1px_0_#C25E00,inset_0_1px_0_rgba(255,255,255,.45)]"
                        >
                          M
                        </span>
                      );
                    return null;
                  })()}
                  <span className="ml-auto shrink-0 text-xs text-[#6B7A99]">{u.level}</span>
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
                              perms.canKick && ["👋 Bump", (c: ModContext) => bumpUser(c, u.username)],
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
      {popup && <SimpleDialog title={popup.title} text={popup.text} onClose={() => setPopup(null)} />}
      {balanceCard && <BalanceCard info={balanceCard} onClose={() => setBalanceCard(null)} />}
      {roundResult && <RoundResultCard round={roundResult.round} won={roundResult.won} bet={roundResult.bet} onClose={() => setRoundResult(null)} />}
      {pendingPhoto && (
        <PhotoConfirm
          file={pendingPhoto}
          onCancel={() => setPendingPhoto(null)}
          onSend={() => {
            const f = pendingPhoto;
            setPendingPhoto(null);
            void sendPhoto(f);
          }}
          // GIFs stay as they are (editing would stop the animation)
          onEdit={pendingPhoto.type === "image/gif" ? undefined : () => (setEditingPhoto(pendingPhoto), setPendingPhoto(null))}
        />
      )}
      {/* ✏️ edit the photo before it goes to the room */}
      {editingPhoto && (
        <PhotoEditor
          file={editingPhoto}
          onCancel={() => setEditingPhoto(null)}
          onSend={(f) => {
            setEditingPhoto(null);
            void sendPhoto(f);
          }}
        />
      )}
      {whoisInfo && <WhoisPopup info={whoisInfo} onClose={() => setWhoisInfo(null)} />}
      {commandsOpen && <CommandListPage onPick={(cmd) => (setCommandsOpen(false), prefill(cmd))} onBack={() => setCommandsOpen(false)} />}
      {/* ⋮ Room menu — a small list above the ⋮ button (7 items, like the reference) */}
      {menuOpen && (
        <div className="fixed inset-0 z-50" onClick={closeMenu}>
          <div
            className={`room-sky-card absolute w-[188px] overflow-hidden rounded-[18px] border border-[#E3ECF7] bg-white py-1.5 shadow-[0_8px_28px_rgba(11,31,58,.22)] ${
              menuAnchor ? "" : "bottom-[calc(env(safe-area-inset-bottom)+60px)] left-2"
            }`}
            style={menuAnchor ? { left: menuAnchor.left, bottom: menuAnchor.bottom } : undefined}
            onClick={(e) => e.stopPropagation()}
          >
            {(
              [
                ["info", "Room Info", () => (closeMenu(), setInfoOpen(true))],
                [favorite ? "heartOn" : "heart", favorite ? "Remove favorite" : "Add as favorite", () => (closeMenu(), toggleFavorite(roomName))],
                ["clear", "Clear Chat", () => (closeMenu(), clearChat())],
                ["wallet", "Check Balance", () => (closeMenu(), checkBalance())],
                ["people", "Participants", () => (closeMenu(), setPeopleOpen(true))],
                ["kick", "Kick User", () => (closeMenu(), setKickOpen(true))],
                ["leave", "Leave Room", () => (closeMenu(), leaveRoom())],
              ] as [MenuIconName, string, () => void][]
            ).map(([icon, label, act]) => (
              <button
                key={label}
                type="button"
                onClick={act}
                className="flex w-full items-center gap-3 px-4 py-[10px] text-left text-[14px] text-[#1E2A3B] active:bg-black/5"
              >
                <MenuIcon name={icon} />
                <span className="truncate">{label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 👥 Room Participants — a list that slides in from the right */}
      {/* (on document.body: inside the page the top bar sat over the list's title) */}
      {peopleOpen && createPortal(
        <div
          className="fixed inset-x-0 bottom-0 z-[80] bg-black/25"
          style={{ top: peopleTop }}
          onClick={() => (setPeopleOpen(false), setPeopleMenuFor(null))}
        >
          <aside
            className="room-sky-card absolute bottom-0 right-0 top-0 flex w-[54%] min-w-[200px] max-w-[320px] flex-col border-l border-[#E3ECF7] bg-white shadow-[-8px_0_24px_rgba(11,31,58,.18)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center border-b border-[#EEF2F7] px-3.5 pb-2.5 pt-3">
              <p className="flex-1 text-[12.5px] font-semibold text-[#5B6B8C]">Room Participants</p>
              <button type="button" onClick={() => (setPeopleOpen(false), setPeopleMenuFor(null))} aria-label="Close" className="px-1 text-[15px] text-[#8A96AB]">
                ⤢
              </button>
            </div>
            <ul data-notranslate className="min-h-0 flex-1 overflow-y-auto pb-safe">
              {roomUsers.map((u) => {
                const owner = !!roomInfo.ownerUid && u.uid === roomInfo.ownerUid;
                const actions = (
                  [
                    ["👤 View Profile", () => router.push(`/profile/${encodeURIComponent(u.username)}`)],
                    u.uid !== user.uid && [
                      "@ Mention",
                      () => {
                        const mention = `@${u.username}`;
                        setText((t) => (t.includes(mention) ? t : t.trim() ? `${t.trimEnd()} ${mention} ` : `${mention} `));
                      },
                    ],
                    u.uid !== user.uid && ["🎁 Send Gift", () => setGiftTarget(u.username)],
                    u.uid !== user.uid && perms.canKick && ["👢 Kick", () => { const c = modCtx(); if (c) kickUser(c, u.username); }],
                    u.uid !== user.uid && perms.canKick && ["👋 Bump", () => { const c = modCtx(); if (c) bumpUser(c, u.username); }],
                    u.uid !== user.uid && perms.canBan && ["🚫 Ban", () => { const c = modCtx(); if (c) banUser(c, u.username, true); }],
                    u.uid !== user.uid && perms.canMute && ["🔇 Mute", () => { const c = modCtx(); if (c) muteUser(c, u.username, true); }],
                    u.uid !== user.uid && perms.canMute && ["🔊 Unmute", () => { const c = modCtx(); if (c) muteUser(c, u.username, false); }],
                    u.uid !== user.uid &&
                      perms.isUserRoom &&
                      perms.canManagePrivate &&
                      (roomInfo.moderators.includes(u.username.toLowerCase())
                        ? ["🛑 Remove Mod", () => { const c = modCtx(); if (c) setModerator(c, u.username, false); }]
                        : ["⭐ Make Mod", () => { const c = modCtx(); if (c) setModerator(c, u.username, true); }]),
                  ].filter(Boolean) as [string, () => void][]
                );
                return (
                  <li key={u.uid} className="relative">
                    <div className="flex items-center gap-2 px-3.5 py-[9px]">
                      <span className="min-w-0 flex-1 truncate text-[13.5px]" style={{ color: owner ? "#E0388A" : inkOnWhite(colorOf(u.username)) }}>
                        {u.username}
                      </span>
                      <button
                        type="button"
                        onClick={() => setPeopleMenuFor(peopleMenuFor === u.uid ? null : u.uid)}
                        aria-label={`Options for ${u.username}`}
                        className="shrink-0 px-1 text-[13px] font-black tracking-[1px] text-[#8A96AB]"
                      >
                        •••
                      </button>
                    </div>
                    {peopleMenuFor === u.uid && (
                      <div className="absolute right-2 top-[34px] z-10 w-40 overflow-hidden rounded-xl border-[1.5px] border-white/90 bg-white/95 py-1 text-[13px] text-[#0B2A5B] shadow-[0_8px_24px_rgba(11,31,58,.22)] backdrop-blur-md">
                        {actions.map(([label, run]) => (
                          <button
                            key={label}
                            type="button"
                            onClick={() => {
                              setPeopleMenuFor(null);
                              setPeopleOpen(false);
                              run();
                            }}
                            className="block w-full px-3 py-2 text-left active:bg-black/5"
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </aside>
        </div>
      ,
        document.body
      )}

      {/* ℹ️ Room Info — a full page with ✎ edit, like the app */}
      {infoOpen && profile && (
        <RoomInfoPage
          canTransferOwner={isMainFounderName(profile.username)}
          roomName={roomName}
          shownRoomName={roomDisplayName(roomName)}
          ownerName={isMainFounderName(roomInfo.ownerName) ? MIGLIFE_DISPLAY_NAME : roomInfo.ownerName || MIGLIFE_DISPLAY_NAME}
          description={perms.isUserRoom ? roomInfo.description : roomDescription}
          info={roomInfo}
          perms={perms}
          roomMembers={roomUsers.map((u) => u.username)}
          modName={perms.isHiddenFounder || isMainFounderName(profile.username) ? "administrator" : profile.username}
          onClose={() => setInfoOpen(false)}
          onNote={note}
          onSetEntryLevel={(lvl) => {
            const ctx = modCtx();
            if (ctx) setEntryLevel(ctx, lvl);
          }}
        />
      )}

      {/* ⚠️ You are not in this room */}
      {/* Out of the room (away too long, kicked or banned): NOTHING of the room
          is shown — only this page. Ok closes the tab; open the room again
          from the list to come back in. */}
      {(notInRoomOpen || autoLeft) && (
        <NotInRoomPage
          room={roomName}
          onClose={() => {
            setNotInRoomOpen(false);
            if (user) removeOpenRoom(user.uid, roomName);
            router.replace("/");
          }}
          onRooms={() => {
            setNotInRoomOpen(false);
            if (user) removeOpenRoom(user.uid, roomName);
            router.replace("/rooms");
          }}
          onRejoin={
            autoLeft
              ? () => {
                  if (user) clearAutoLeft(user.uid, roomName);
                  rejoinRef.current = true;
                  // a new entry: a lock / entry level applies to it again
                  insideBeforeLockRef.current = false;
                  setSinceMs(null);
                  setAutoLeft(false);
                }
              : undefined
          }
        />
      )}

      {/* 👢 Kick user — a list of names from the bottom (like the reference) */}
      {kickOpen && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/30" onClick={() => (setKickOpen(false), setKickToast(""))}>
          {kickToast && (
            <div className="pointer-events-none fixed bottom-[calc(env(safe-area-inset-bottom)+28px)] left-1/2 z-[60] -translate-x-1/2 whitespace-nowrap rounded-xl bg-[#333]/90 px-3.5 py-2 text-[12.5px] text-white shadow-lg">
              {kickToast}
            </div>
          )}
          <div
            className="room-sky-card w-full rounded-t-[22px] border-t border-[#E3ECF7] bg-white pb-safe shadow-[0_-8px_24px_rgba(11,31,58,.18)]"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="py-3.5 text-center text-[14px] font-bold text-[#1E2A3B]">Kick user</p>
            <ul data-notranslate className="max-h-[50vh] overflow-y-auto px-5 pb-2">
              {roomUsers.filter((u) => u.uid !== user.uid).length === 0 && (
                <li className="border-t border-black/[0.06] py-3 text-center text-sm text-[#8A96AB]">No one else is here.</li>
              )}
              {roomUsers
                .filter((u) => u.uid !== user.uid)
                .map((u) => (
                  <li key={u.uid} className="border-t border-black/[0.06]">
                    <button
                      type="button"
                      onClick={() => {
                        // Not allowed → only a short note; the list stays open (like the reference).
                        if (!perms.canKick) {
                          showKickToast(perms.isUserRoom ? "You are not authorized to kick him" : "Public kick is disabled for this room");
                          return;
                        }
                        setKickOpen(false);
                        const c = modCtx();
                        if (c) kickUser(c, u.username);
                      }}
                      className="block w-full py-3 text-center text-[14px]"
                      style={{ color: inkOnWhite(colorOf(u.username)) }}
                    >
                      {u.username}
                    </button>
                  </li>
                ))}
            </ul>
          </div>
        </div>
      )}
    </PageShell>
  );
}

// Colours from the app (RoomPage.kt).
// 🌙 these follow the theme (globals.css --room-*): light text in Dark Night
const INK = "var(--room-ink, #0B1F3A)";
const LINK_BLUE = "var(--room-link, #174EA6)";
// Bright blue of the game lines: Luxury Bot bets and every game bot's text.
const BET_BLUE = "var(--room-bet, #1565E8)";
const APP_RED = "var(--room-red, #B3261E)";
const ROOM_ORANGE = "#E6731E";
const ANNOUNCE_PINK = "#FDDCDC";
// 🎨 Every gift line gets one of these colours (miglife's list) — the SAME gift
// shows in a different colour each time. Picked from the message id, so everyone
// sees the same colour and it never changes on reload. (Same list as RoomPage.kt.)
const GIFT_LINE_COLORS = [
  "#1E9E5A", // Green
  "#1E6FD9", // Blue
  "var(--gift-black, #1F1F24)", // Black (light grey in Dark Night)
  "#FF2D95", // Pink
  "#D32F2F", // Red
  "#C08A6E", // Nude
  "#6B8E23", // Avocado
];
function giftLineColor(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  const n = GIFT_LINE_COLORS.length;
  return GIFT_LINE_COLORS[((h % n) + n) % n];
}

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

// "@name" mentions in link blue, bold — a tap opens that person's profile (miglife).
function withMentions(text: string, keyPrefix = "m"): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(/@[A-Za-z0-9_.-]+/g)) {
    const i = match.index ?? 0;
    if (i > last) out.push(text.slice(last, i));
    // "@muri." at the end of a sentence: the dot is not part of the name
    const name = match[0].slice(1).replace(/[.-]+$/, "");
    out.push(
      name ? (
        <Link
          key={`${keyPrefix}${i}`}
          href={`/profile/${encodeURIComponent(name)}`}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          className="font-bold hover:underline"
          style={{ color: LINK_BLUE }}
        >
          {match[0]}
        </Link>
      ) : (
        <span key={`${keyPrefix}${i}`} className="font-bold" style={{ color: LINK_BLUE }}>
          {match[0]}
        </span>
      )
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
// is shown instead, so the badge never turns into an empty gap. A failed
// picture is remembered for this visit, so other lines (and redraws) show the
// emoji straight away instead of trying and blinking again (like the app).
const failedBadgeUrls = new Set<string>();
// A badge picture in an enter / left line: its 15 px place is kept from the
// start (the line never jumps), and the picture fades in once loaded.
const loadedBadgeUrls = new Set<string>();
function BadgeImg({ src, emoji }: { src: string; emoji: string }) {
  const [failed, setFailed] = useState(() => failedBadgeUrls.has(src));
  const [loaded, setLoaded] = useState(() => loadedBadgeUrls.has(src));
  if (failed || failedBadgeUrls.has(src)) return <BadgeEmoji emoji={emoji} />;
  return (
    // 🔍 bigger (1.5 × the text), a small gap on each side; ⭕ round (miglife's
    // choice): the picture fills a circle — like the app
    <span className="relative mx-[2px] inline-block h-[1.5em] w-[1.5em] shrink-0 overflow-hidden rounded-full align-middle" style={{ background: loaded ? undefined : "rgba(0,0,0,.08)" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={emoji}
        referrerPolicy="no-referrer"
        decoding="async"
        ref={(el) => {
          // already in the browser's cache: show it at once
          if (el && el.complete && el.naturalWidth > 0 && !loaded) {
            loadedBadgeUrls.add(src);
            setLoaded(true);
          }
        }}
        onLoad={() => {
          loadedBadgeUrls.add(src);
          setLoaded(true);
        }}
        onError={() => {
          failedBadgeUrls.add(src);
          setFailed(true);
        }}
        className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-200 ${loaded ? "opacity-100" : "opacity-0"}`}
      />
    </span>
  );
}

// The badges in "name [12] 🎓 💎 has entered." drawn as miglife's uploaded
// pictures when there are any (the app's badge_images swap). Every badge —
// picture or plain emoji — sits in the same 1.5 × text box, so they are all
// one size (miglife asked). Badges are the emoji between "[level]" and
// " has entered / has left".
const BADGE_EMOJI_RE = /\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic}\uFE0F?)*/gu;
function withBadgeImages(text: string, images: Record<string, string>): ReactNode[] {
  const lv = text.indexOf("]");
  const end = text.search(/ has (entered|left)/);
  const from = lv >= 0 ? lv + 1 : 0;
  const to = end >= 0 ? end : text.length;
  if (to <= from) return [text];
  const out: ReactNode[] = [text.slice(0, from)];
  const region = text.slice(from, to);
  let last = 0;
  for (const m of region.matchAll(BADGE_EMOJI_RE)) {
    const at = m.index ?? 0;
    if (at > last) out.push(region.slice(last, at));
    const e = m[0];
    const src = images[e] ?? images[e.replace(/\uFE0F/g, "")];
    out.push(src ? <BadgeImg key={from + at} src={src} emoji={e} /> : <BadgeEmoji key={from + at} emoji={e} />);
    last = at + e.length;
  }
  out.push(region.slice(last), text.slice(to));
  return out;
}

// A badge with no uploaded picture: the emoji in the same box as BadgeImg.
function BadgeEmoji({ emoji }: { emoji: string }) {
  return (
    <span className="mx-[2px] inline-flex h-[1.5em] w-[1.5em] shrink-0 items-center justify-center align-middle leading-none">
      <span style={{ fontSize: "1.2em" }}>{emoji}</span>
    </span>
  );
}

// "🎰 Luxury Bet: …" — the bot name in orange, the rest in blue. In the
// Result, the row made only of character icons (👑👑👸👸🐼🐼) is drawn bigger.
// 🖼️ Luxury Bet's character emoji (🫅 👸 🤴 …) drawn as their small picture
// cards, like the bet tiles. Longest first, so 🧙‍♂️ wins over a bare 🧙.
const LB_ART_KEYS = Object.keys(LUXURY_BET_ART_BY_EMOJI).sort((a, b) => b.length - a.length);
function withLbArt(line: string, keyPrefix: string, big: boolean): ReactNode[] {
  const out: ReactNode[] = [];
  let plain = "";
  let k = 0;
  const flush = () => {
    if (plain) out.push(<Fragment key={`${keyPrefix}t${k++}`}>{big ? plain : withMentions(plain, `${keyPrefix}${k}_`)}</Fragment>);
    plain = "";
  };
  for (let i = 0; i < line.length; ) {
    const hit = LB_ART_KEYS.find((e) => line.startsWith(e, i));
    if (hit) {
      flush();
      const art = LUXURY_BET_ART_BY_EMOJI[hit];
      out.push(
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={`${keyPrefix}a${k++}`}
          src={art.src}
          alt={hit}
          draggable={false}
          className={`inline-block object-contain object-bottom align-middle ${big ? "mx-[1px] h-[32px] w-[32px] drop-shadow-[0_2px_2px_rgba(0,0,0,.25)]" : "mx-[1px] h-[1.4em] w-[1.4em]"}`}
        />
      );
      i += hit.length;
      // the U+FE0F after a stripped key belongs to the picture too
      if (line[i] === "\uFE0F") i += 1;
    } else {
      plain += line[i];
      i += 1;
    }
  }
  flush();
  return out;
}

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
              {iconsOnly ? (
                <span className="inline-block py-1 text-[20px] leading-[40px] tracking-[1px]">{withLbArt(line, `lb${i}_`, true)}</span>
              ) : (
                withLbArt(line, `lb${i}_`, false)
              )}
            </span>
          );
        })}
      </span>
    </>
  );
}

// 🎁 Gift Showers go out at least 2 s apart (the app does the same): one sent
// sooner waits until 2 s after the last one, then goes. Its room line is
// posted when the server answers, so the lines come 2 s apart too.
const GIFT_SHOWER_GAP_MS = 2_000;
let giftShowerChain: Promise<unknown> = Promise.resolve();
let lastGiftShowerAt = 0;
function queueGiftShower<T>(run: () => Promise<T>): Promise<T> {
  const next = giftShowerChain.then(async () => {
    const wait = lastGiftShowerAt + GIFT_SHOWER_GAP_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastGiftShowerAt = Date.now();
    return run();
  });
  giftShowerChain = next.catch(() => {});
  return next;
}

// Gift announcement: pink, "[level]" tags in amber, the gift's own icon
// swapped for its uploaded picture when there is one. The "<< … >>" around it
// stays, like the app.
function giftLine(text: string, giftIcon: string, giftImage: string, fontPx: number): ReactNode[] {
  const clean = text;
  const out: ReactNode[] = [];
  let k = 0;
  const pushSegment = (seg: string) => {
    if (giftIcon && giftImage && seg.includes(giftIcon)) {
      seg.split(giftIcon).forEach((piece, i) => {
        if (i > 0)
          out.push(
            <GiftImg key={`g${k++}`} src={giftImage} fallback={giftIcon} className="mx-0.5 inline h-[1.4em] w-[1.4em] object-contain align-middle" />
          );
        if (piece) out.push(...emotesIn(piece));
      });
    } else out.push(...emotesIn(seg));
  };
  // miglife emotes (;h1 …) in the gift's message show as pictures, like chat.
  const emotesIn = (seg: string) => withEmotes(seg, fontPx).map((n, i) => <Fragment key={`e${k++}_${i}`}>{n}</Fragment>);
  let last = 0;
  for (const m of clean.matchAll(/\[[^\]]*\]/g)) {
    const i = m.index ?? 0;
    if (i > last) pushSegment(clean.slice(last, i));
    out.push(
      <span key={`l${k++}`}>
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
  mentionsMe = false,
}: {
  m: ChatMessage;
  mine: boolean;
  /** 🟠 someone wrote "@me" in this line: the whole line gets an orange highlight. */
  mentionsMe?: boolean;
  /** 📟 Classic style: every line on the left, own name shown too. */
  classic: boolean;
  roomName: string;
  /** Game rooms: everything on the left, full-width plain lines, no swipe reply. */
  gameRoom: boolean;
  colorOf: (name: string, atMs?: number) => string;
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
  // 🌐 this message's translation (long-press → Translate)
  const translation = useRoomTranslation(m.id);
  const hold = useRef<{ t: ReturnType<typeof setTimeout>; x: number; y: number } | null>(null);
  const time = timeLabel(m.createdAtMs);
  const stamp = time && <span className="ml-1.5 whitespace-nowrap align-baseline text-[9px] text-[#9AA8C2]">{time}</span>;
  // 🕘 Own messages (right side), like the app: ONE line → the time in FRONT of
  // the text; 2+ lines → the time at the END. Worked out from the real layout
  // (with the time in front); once it wraps it stays at the end.
  const stampFront = time && <span className="mr-1.5 whitespace-nowrap align-baseline text-[9px] text-[#9AA8C2]">{time}</span>;
  const ownBodyRef = useRef<HTMLSpanElement>(null);
  const ownKey = `${m.text}|${fontPx}`;
  const [ownWrap, setOwnWrap] = useState({ key: "", wraps: false });
  const ownWraps = ownWrap.key === ownKey && ownWrap.wraps;
  // A wrapped own message is only as wide as its longest line (a first line that
  // broke early left empty space on its right), like the app.
  const [ownTight, setOwnTight] = useState({ key: "", w: 0 });
  useLayoutEffect(() => {
    const el = ownBodyRef.current;
    if (!el) return;
    if (ownWraps) {
      if (ownTight.key === ownKey) return;
      const range = document.createRange();
      range.setStartBefore(el);
      range.setEndAfter(el.nextElementSibling ?? el);
      const rects = Array.from(range.getClientRects()).filter((r) => r.width > 0);
      if (!rects.length) return;
      const w = Math.ceil(Math.max(...rects.map((r) => r.right)) - Math.min(...rects.map((r) => r.left))) + 1;
      setOwnTight({ key: ownKey, w });
      return;
    }
    const tops = Array.from(el.getClientRects())
      .filter((r) => r.width > 0)
      .map((r) => r.top);
    if (!tops.length) return;
    const first = Math.min(...tops);
    if (tops.some((t) => t - first > fontPx * 0.9)) setOwnWrap({ key: ownKey, wraps: true });
  });
  const reactions = Object.entries(m.reactions || {});
  const stopHold = () => {
    if (hold.current) clearTimeout(hold.current.t);
    hold.current = null;
  };
  // 😂 Long-press (or right-click) opens the reactions picker.
  const holdFor = (on: boolean) =>
    on
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
  const reactionRow = (right: boolean) =>
    reactions.length > 0 && (
      <span className={`mb-0.5 flex gap-2 px-1.5 ${right ? "justify-end" : "justify-start"}`}>
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
    );

  // Lucky User announcement (pickBangladeshLuckyUser): a celebration card, like the app.
  if (m.text.startsWith("🍀 Lucky Bot:")) return <LuckyCard text={m.text} time={time} />;

  // "Bangladesh: imran [25] has entered." — on the left, room name in orange, the rest black.
  if (m.type === "room_entry" || m.type === "room_leave") {
    const colon = m.text.indexOf(": ");
    let body = brandMiglife(colon > 0 ? m.text.slice(colon + 2) : m.text);
    // 🚫 a Mentor (💼) is never a Merchant — older lines lose the 🛒 next to 💼
    if (body.includes("💼")) body = body.replace(/ ?🛒/g, "");
    // ⚽ Supporter Colours: the team badge goes just before "has entered / has left".
    const team = m.sender ? supporterTeamOf(m.sender) : null;
    const cut = team ? body.search(/ has (entered|left)/) : -1;
    return (
      <p className="px-1 text-left text-[13px] leading-snug">
        {colon > 0 && (
          <span className="font-bold" style={{ color: ROOM_ORANGE }}>
            {m.text.slice(0, colon + 1)}{" "}
          </span>
        )}
        {team && cut > 0 ? (
          <span className="text-black">
            {withBadgeImages(body.slice(0, cut), badgeImages)}{" "}
            {/* jersey as tall as the other badges (1.5 × the 13 px text) */}
            <SupporterBadge team={team} size={11} />
            {withBadgeImages(body.slice(cut), badgeImages)}
          </span>
        ) : (
          <span className="text-black">{withBadgeImages(body, badgeImages)}</span>
        )}
        {stamp}
      </p>
    );
  }

  // 🛡 Kick / ban / mute / lock / silence, like mig33 (miglife):
  // "Bangladesh : mental[23] has been banned by life[51]" — room name in the room's own orange (bold), the rest black.
  if (m.type === "moderation") {
    return (
      <p className="whitespace-pre-wrap px-1 text-left leading-snug" style={{ fontSize: fontPx }}>
        <span className="font-bold" style={{ color: ROOM_ORANGE }}>
          {roomName} :{" "}
        </span>
        <span className="text-black">{brandMiglife(m.text)}</span>
        {stamp}
      </p>
    );
  }

  // 📢 "<< life has set the announcement to … >>": a pink card across the chat, like the reference app.
  if (m.type === "announcement") {
    return (
      <div className="rounded-[12px] px-3 py-2" style={{ background: ANNOUNCE_PINK }}>
        {/* the icon sits in the text, so a long line wraps under it — no time, like the reference app */}
        <p className="whitespace-pre-wrap leading-snug text-[#2B2F38] [overflow-wrap:anywhere]" style={{ fontSize: fontPx }}>
          <span className="mr-1 inline-block -scale-x-100 text-[1.2em] leading-none">📢</span>
          {brandMiglife(m.text)}
        </p>
      </div>
    );
  }

  // /broadcast: shown once, on a gold card.
  if (m.type === "broadcast" || m.type === "friend_request") {
    const gold = m.type === "broadcast";
    return (
      <div className="flex px-1">
        <p
          className="max-w-[336px] whitespace-pre-wrap rounded-[9px] border px-[7px] py-[7px] text-[14px] leading-snug"
          style={{ background: gold ? "#FFF1D6" : "#E3F7F0", borderColor: gold ? "#EF9F27" : "#2FBF8F", color: "#0B1F3A" }}
        >
          {/* 📢 faces the same way as in the app (the browser's emoji faces the other way) */}
          {gold && m.text.startsWith("📢") && <span className="inline-block -scale-x-100">📢</span>}
          {/* emotes (";m3", ":)") as pictures, like chat lines */}
          {withEmotes(brandMiglife(gold && m.text.startsWith("📢") ? m.text.slice("📢".length) : m.text), fontPx, (t, k) => withMentions(t, `b${k}`))}
          {stamp}
        </p>
      </div>
    );
  }

  // /hug, /roll, 8ball …: centered, one red colour, bold — shown with its
  // "**" stars, exactly like the app ("**friend bows down to everyone! 🙇**").
  // No time stamp: "**rkn rolls 72**" reads as a plain announcement.
  if (m.type === "social") {
    return (
      <p className="px-2 text-center font-bold leading-snug" style={{ color: APP_RED, fontSize: fontPx }}>
        {brandMiglife(m.text)}
      </p>
    );
  }

  // /me: "name action" in red, on the left.
  if (m.type === "me") {
    const c = m.text.indexOf(":");
    return (
      <p className="px-1 text-left leading-snug" style={{ color: APP_RED, fontSize: fontPx }}>
        {/* emote codes (;m3 …) show as pictures here too, like a normal line */}
        {withEmotes(brandMiglife(c > 0 ? `${m.text.slice(0, c).trim()} ${m.text.slice(c + 1).trimStart()}` : m.text), fontPx)}
        {stamp}
      </p>
    );
  }

  if (m.type === "gift") {
    // 🎁 A gift line can get reactions (like the app) — a Gift Shower can't.
    const giftReact = !m.local && !!m.id && !m.text.includes("GIFT SHOWER");
    return (
      <div className="relative" style={{ WebkitTouchCallout: giftReact ? "none" : undefined }} {...holdFor(giftReact)}>
        {picker && (
          <ReactionPicker
            mineSide={false}
            reactions={m.reactions || {}}
            myUid={myUid}
            copyText=""
            onPick={(e) => {
              setPicker(false);
              onReact(e);
            }}
            onClose={() => setPicker(false)}
          />
        )}
        {reactionRow(false)}
        {/* ONE text size for every gift line (the chat text size + 1, like the
            app), so a gift shower doesn't look big-small-big. Full width, so
            its edges line up with the other chat lines on both sides.
            Justified (like Word's "Justify"): every full line ends at the same
            right edge, whatever names / gift fill it. */}
        <p
          // 🎁 gift / Gift Shower: bold, every line centred, normal size (like the app)
          className="w-full whitespace-pre-wrap break-words rounded-[9px] px-[7px] py-[7px] text-center font-bold leading-snug"
          style={{ fontSize: fontPx, color: giftLineColor(m.id || m.text) }}
        >
          {/* "name[51]" — no space before the level, like the app */}
          {giftLine(m.text.replace(/ \[/g, "["), gift?.icon || "", gift?.imageUrl || "", fontPx)}
        </p>
      </div>
    );
  }

  // Lucky voucher drops (written by the server, no "name:" in front): small pink line.
  const splitByUid = m.sender && m.text.startsWith(`${m.sender}: `);
  if (!splitByUid && /voucher/i.test(m.text)) {
    return (
      <p className="px-1 text-left text-[13px] leading-snug text-[#E8327E]">
        {/* 🏷 the room's name first ("Bangladesh: Hurray! …"), like the app */}
        <span className="font-bold" style={{ color: ROOM_ORANGE }}>
          {roomName}:{" "}
        </span>
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
  // my own line shows my name too (miglife / VIP / 🎂 birthday colour)
  const ownNameShown = rightSide && !isRoomLine && !!senderName && special.has(senderName);
  // Swipe right on someone else's message (not bots, not in game rooms) to reply to it.
  // the text to translate: without a "↩ quote" line in front
  const plainBody = body.startsWith("↩ ") && body.includes("\n") ? body.slice(body.indexOf("\n") + 1) : body;
  const canReply = !mine && !m.local && !!senderName && !/ Bot$/.test(senderName) && !isRoomLine;
  const snippet =
    m.type === "image" && m.imageUrl
      ? "📷 Photo"
      : m.type === "sticker" && m.imageUrl
        ? "🎨 Sticker"
      : m.type === "voice" && m.audioUrl
        ? "🎤 Voice message"
        : body.length > 60
          ? body.slice(0, 60) + "…"
          : body;

  // Reactions work on real chat lines only (not local notices or the room's own lines).
  const canReact = !m.local && !isRoomLine && !!m.id && (m.type === "chat" || m.type === "image" || m.type === "voice" || m.type === "sticker");
  const holdHandlers = holdFor(canReact);

  // ⏰ "Room : You have been auto left …" / "Room : You are not in Room chat room":
  // a plain full-width line (no card), the room's name in red — like the app.
  const outNote = m.local ? /^(.+?) : (You have been auto left|You are not in )/.exec(m.text) : null;
  if (outNote) {
    return (
      <div className="w-full px-1 leading-snug" style={{ fontSize: fontPx }}>
        <b className="text-[#D7261E]">{outNote[1]} :</b> <span style={{ color: INK }}>{m.text.slice(outNote[1].length + 3)}</span>
      </div>
    );
  }

  // 📏 Full-width chat (miglife): every room's lines run across the whole chat
  // like the game rooms' (your own lines stay on the right). It used to be only
  // the game rooms and the Classic style.
  const fullWidthLines = true;

  return (
    <SwipeToReply enabled={canReply} fullWidth={fullWidthLines && !rightSide} onReply={() => onReply(senderName, snippet)}>
      <div className={`flex px-1 ${rightSide ? "justify-end" : "justify-start"}`}>
        {/* Own lines sit on the right, but a long one reads left to right: every line starts at the same left edge, like the app. */}
        <div
          className={`relative ${fullWidthLines && !rightSide ? "w-full" : "max-w-[85%]"} leading-snug text-left ${
            mentionsMe ? "rounded-md border-l-[3px] border-[#FF8A00] px-1.5 py-0.5" : ""
          }`}
          style={{
            fontSize: fontPx,
            ...(mentionsMe ? { background: "rgba(255, 138, 0, 0.14)" } : {}),
            WebkitTouchCallout: canReact ? "none" : undefined,
            // a wrapped own text line: only as wide as its longest line
            width:
              rightSide && ownWraps && ownTight.key === ownKey && !quote && !translation && !ytLink && m.type !== "image" && m.type !== "voice"
                ? ownTight.w
                : undefined,
          }}
          {...holdHandlers}
        >
          {picker && (
            <ReactionPicker
              mineSide={rightSide}
              reactions={m.reactions || {}}
              myUid={myUid}
              copyText={m.type === "image" || m.type === "voice" ? "" : body}
              onTranslate={
                m.id && !m.local && m.type !== "image" && m.type !== "voice" && /\p{L}/u.test(plainBody)
                  ? () => {
                      setPicker(false);
                      requestRoomTranslation(m.id, plainBody);
                    }
                  : undefined
              }
              onReport={
                !mine && m.id && !m.local && m.senderUid && m.sender
                  ? () => {
                      setPicker(false);
                      openReport({
                        kind: "room_message",
                        targetUsername: m.sender,
                        roomId: roomName,
                        messageId: m.id,
                        preview: m.type === "image" ? "📷 Photo" : m.type === "voice" ? "🎤 Voice" : plainBody.slice(0, 200),
                      });
                    }
                  : undefined
              }
              onPick={(e) => {
                setPicker(false);
                onReact(e);
              }}
              onClose={() => setPicker(false)}
            />
          )}
          {/* Reaction emotes sit OUTSIDE the bubble, right above it, as plain emoji + count. */}
          {reactionRow(rightSide)}
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
          {/* own line WITH the name (miglife / VIP / birthday colour): the time
              sits on the left of the name — "8:50 PM pro: hi" */}
          {rightSide && !ownWraps && ownNameShown && m.type !== "image" && m.type !== "voice" && stampFront}
          {(!mine || classic || (!isRoomLine && special.has(senderName))) && senderName && (
            <span
              className={`mr-1 font-bold ${isRoomLine || m.local ? "" : "cursor-pointer"}`}
              style={{ color: isRoomLine ? ROOM_ORANGE : colorOf(senderName, m.createdAtMs) }}
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
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  openImageViewer(m.imageUrl!);
                }}
                className={`mt-1 block ${rightSide ? "ml-auto w-fit" : "w-fit"}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={m.imageUrl} alt="Photo" loading="lazy" className="max-h-64 max-w-full rounded-lg" />
              </button>
              {stamp}
            </>
          ) : m.type === "sticker" && m.imageUrl ? (
            <>
              {/* 🎨 a sticker: big, no frame */}
              <StickerImg url={m.imageUrl} className={`mt-1 block h-28 w-28 object-contain ${rightSide ? "ml-auto" : ""}`} />
              {stamp}
            </>
          ) : m.type === "voice" && m.audioUrl ? (
            <>
              <audio controls src={m.audioUrl} className={`mt-1 h-9 max-w-full ${rightSide ? "ml-auto" : ""}`} />
              {stamp}
            </>
          ) : (
            <>
              {rightSide && !ownWraps && !ownNameShown && stampFront}
              <span
                ref={rightSide ? ownBodyRef : undefined}
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
              {(!rightSide || ownWraps) && stamp}
              {/* 🌐 translation under the message (tap to hide) */}
              {translation && (
                <span
                  className="mt-0.5 block cursor-pointer text-left italic"
                  style={{ fontSize: Math.max(11, fontPx - 1), color: translation.kind === "failed" ? "#D9534F" : translation.kind === "done" ? "#2F5FA8" : "#6B7788" }}
                  onClick={() => translation.kind !== "loading" && translation.kind !== "downloading" && hideRoomTranslation(m.id)}
                >
                  {translation.kind === "loading"
                    ? "🌐 Translating…"
                    : translation.kind === "downloading"
                      ? "🌐 Downloading language (first time only)…"
                      : translation.kind === "done"
                        ? `🌐 ${translation.text}${translation.from ? `  · ${languageName(translation.from)}` : ""}`
                        : `🌐 ${translation.reason}`}
                </span>
              )}
              {ytLink && <YouTubePreviewCard videoId={ytLink.id} onPlay={() => onLink(ytLink.url)} />}
            </>
          )}
        </div>
      </div>
    </SwipeToReply>
  );
}

const REACTION_EMOJIS = QUICK_REACTIONS;

// The long-press menu over a room message — ONE dark pill like the app (demo D):
// 6 reactions (a dot under the one you gave) and ＋ for more (like WhatsApp), a thin line, then small round
// 📋 Copy / 🌐 Translate / 🚩 Report buttons. Hover or hold one to see its name.
// Tap outside to close.
function ReactionPicker({
  mineSide,
  reactions,
  myUid,
  copyText,
  onTranslate,
  onReport,
  onPick,
  onClose,
}: {
  mineSide: boolean;
  reactions: Record<string, string[]>;
  myUid: string;
  copyText: string;
  /** "🌐 Translate" (only for a message with words in it) */
  onTranslate?: () => void;
  /** "🚩 Report" (someone else's message) */
  onReport?: () => void;
  onPick: (emoji: string) => void;
  onClose: () => void;
}) {
  const [hint, setHint] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  const copy = copyText.trim()
    ? () => {
        const plain = copyText.startsWith("↩ ") && copyText.includes("\n") ? copyText.slice(copyText.indexOf("\n") + 1) : copyText;
        navigator.clipboard?.writeText(plain).catch(() => {});
        onClose();
      }
    : undefined;
  const actions: [string, string, string, (() => void) | undefined][] = [
    ["📋", "Copy text", "#5AA2FF", copy],
    ["🌐", "Translate", "#4CD38A", onTranslate],
    ["🚩", "Report", "#FF7A7A", onReport],
  ];
  const shown = actions.filter((a) => a[3]);
  const hintProps = (label: string) => ({
    onMouseEnter: () => setHint(label),
    onMouseLeave: () => setHint(null),
    onTouchStart: () => setHint(label),
    onTouchEnd: () => setHint(null),
  });
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} onContextMenu={(e) => (e.preventDefault(), onClose())} />
      <div className={`absolute bottom-full z-50 mb-2 flex flex-col gap-1 ${mineSide ? "right-0 items-end" : "left-0 items-start"}`}>
        <div className="flex h-7 items-end">
          {hint && <span className="rounded-[10px] bg-[#161E34]/95 px-2.5 py-1 text-xs font-bold text-white">{hint}</span>}
        </div>
        {/* ＋ more reactions */}
        {more && (
          <div className="reaction-pop grid w-[248px] grid-cols-8 gap-0.5 rounded-[18px] border border-white/10 bg-[#161E34]/[0.95] p-1.5 shadow-[0_10px_26px_rgba(0,0,0,.35)] backdrop-blur-md">
            {MORE_REACTIONS.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => onPick(e)}
                className={`flex h-[28px] w-[28px] items-center justify-center rounded-full text-[18px] transition-transform hover:scale-125 ${reactions[e]?.includes(myUid) ? "bg-white/15" : ""}`}
              >
                {e}
              </button>
            ))}
          </div>
        )}
        <div className="reaction-pop flex items-center rounded-[30px] border border-white/10 bg-[#161E34]/[0.93] px-1 py-0.5 shadow-[0_10px_26px_rgba(0,0,0,.35)] backdrop-blur-md">
          {REACTION_EMOJIS.map(([e, name], i) => {
            const byMe = reactions[e]?.includes(myUid);
            return (
              <button key={e} type="button" onClick={() => onPick(e)} {...hintProps(name)} className="flex flex-col items-center">
                <span
                  className={`reaction-emoji flex h-7 w-7 items-center justify-center rounded-full text-[18px] transition-transform hover:-translate-y-2 hover:scale-[1.45] ${
                    byMe ? "bg-white/15" : ""
                  }`}
                  style={{ animationDelay: `${i * 40}ms` }}
                >
                  {e}
                </span>
                <span className={`h-1 w-1 rounded-full ${byMe ? "bg-[#7FB2FF]" : ""}`} />
              </button>
            );
          })}
          <button
            type="button"
            aria-label="More reactions"
            onClick={() => setMore((v) => !v)}
            {...hintProps("More")}
            className={`mx-0.5 flex h-7 w-7 items-center justify-center rounded-full text-[17px] font-black text-white ${more ? "bg-white/25" : "bg-white/10"}`}
          >
            {more ? "×" : "+"}
          </button>
          {shown.length > 0 && <span className="mx-1 h-5 w-px bg-white/20" />}
          {shown.map(([icon, label, tint, run]) => (
            <button
              key={label}
              type="button"
              aria-label={label}
              onClick={run}
              {...hintProps(label)}
              className="mx-0.5 flex h-[26px] w-[26px] items-center justify-center rounded-full border text-[12px]"
              style={{ background: `${tint}38`, borderColor: `${tint}73` }}
            >
              {icon}
            </button>
          ))}
        </div>
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

// 🏪 A Merchant whose role field says something else (Country Representative,
// "user" …) is still a Merchant while their Merchant Program record
// (mentor_merchants, 30 days) runs — like the Members page and the server's
// isMerchantAccount. Their 🛒 then shows in "has entered / has left" too.
async function hasRunningMerchantTerm(username: string): Promise<boolean> {
  if (!username) return false;
  try {
    const names = [...new Set([username, username.toLowerCase()])];
    const snap = await getDocs(query(collection(db, "mentor_merchants"), where("merchantUsername", "in", names)));
    const now = Date.now();
    return snap.docs.some((d) => (d.get("expiresAt")?.toMillis?.() || 0) > now);
  } catch {
    return false;
  }
}

function withMerchantBadge(badges: string[], merchant: boolean): string[] {
  // 🚫 a Mentor (💼) is never a Merchant — no 🛒 next to a Mentor badge
  if (badges.includes("💼")) return badges.filter((b) => b !== "🛒");
  if (!merchant || badges.includes("🛒")) return badges;
  // right after the role badge (if any), before the Color Shop badges — like a role badge
  const roleCount = badges.filter((b) => ROLE_BADGES.has(b)).length;
  return [...badges.slice(0, roleCount), "🛒", ...badges.slice(roleCount)];
}
const ROLE_BADGES = new Set(["💼", "🛒", "🛠️", "⚙️", "✨", "🏛️", "🌍"]);

// ⋮ room menu icons: thin line icons, like the reference
type MenuIconName = "info" | "heart" | "heartOn" | "clear" | "wallet" | "people" | "kick" | "leave";
function MenuIcon({ name }: { name: MenuIconName }) {
  const p = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden className="shrink-0 text-[#3A4658]">
      {name === "info" && (
        <>
          <circle cx="12" cy="12" r="9" {...p} />
          <path d="M12 11v6M12 7.5v.01" {...p} />
        </>
      )}
      {(name === "heart" || name === "heartOn") && (
        <path
          d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"
          {...p}
          fill={name === "heartOn" ? "#E5484D" : "none"}
          stroke={name === "heartOn" ? "#E5484D" : "currentColor"}
        />
      )}
      {name === "clear" && (
        <>
          <path d="M4 20h7M14.5 4.5l5 5L11 18l-5-5z" {...p} />
          <path d="M9 10l5 5" {...p} />
        </>
      )}
      {name === "wallet" && (
        <>
          <rect x="3.5" y="6.5" width="17" height="13" rx="2.5" {...p} />
          <path d="M3.5 10h17M16 14.5h1.5M7 6.5l8-3 1 3" {...p} />
        </>
      )}
      {name === "people" && (
        <>
          <circle cx="9" cy="8.5" r="3" {...p} />
          <path d="M3.5 19c.6-3 2.8-4.5 5.5-4.5s4.9 1.5 5.5 4.5" {...p} />
          <circle cx="16.5" cy="9" r="2.4" {...p} />
          <path d="M15.5 14.3c2.4-.2 4.4 1.1 5 3.9" {...p} />
        </>
      )}
      {name === "kick" && (
        <>
          <path d="M8 4v8.5c0 1 .5 1.8 1.4 2.2L16 18h3.5c.8 0 1-1 .3-1.4L14 13V4" {...p} />
          <path d="M8 8h6M3.5 19.5h17" {...p} />
        </>
      )}
      {name === "leave" && (
        <>
          <path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4" {...p} />
          <path d="M14 8l4 4-4 4M18 12H9" {...p} />
        </>
      )}
    </svg>
  );
}
