"use client";

// What an open room tab remembers while you look at another tab, like the
// app's RoomSession: where this visit's chat starts, the messages already
// shown (bot and game notices included), the half-typed message, the reply
// quote and the scroll position. Kept in memory and in this browser tab's
// sessionStorage (so a reload keeps it too); dropped when the room is left.

export type SessionMessage = {
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

export type RoomSession = {
  sinceMs: number | null;
  messages: SessionMessage[];
  localNotes: SessionMessage[];
  text: string;
  replyTo: { sender: string; snippet: string } | null;
  scrollTop: number;
  stickToBottom: boolean;
};

const MAX_NOTES = 200;
const sessions = new Map<string, RoomSession>();
const storeKey = (uid: string, room: string) => `migwith.roomSession.${uid}.${room}`;

export function readRoomSession(uid: string, room: string): RoomSession | null {
  const k = storeKey(uid, room);
  const inMemory = sessions.get(k);
  if (inMemory) return inMemory;
  try {
    const v = JSON.parse(sessionStorage.getItem(k) || "null");
    if (v && typeof v === "object" && Array.isArray(v.localNotes)) {
      const s: RoomSession = {
        sinceMs: typeof v.sinceMs === "number" ? v.sinceMs : null,
        messages: Array.isArray(v.messages) ? v.messages : [],
        localNotes: v.localNotes,
        text: typeof v.text === "string" ? v.text : "",
        replyTo: v.replyTo && typeof v.replyTo.sender === "string" ? v.replyTo : null,
        scrollTop: Number(v.scrollTop) || 0,
        stickToBottom: v.stickToBottom !== false,
      };
      sessions.set(k, s);
      return s;
    }
  } catch {
    // storage blocked or bad data
  }
  return null;
}

export function writeRoomSession(uid: string, room: string, s: RoomSession) {
  const k = storeKey(uid, room);
  const trimmed = { ...s, localNotes: s.localNotes.slice(-MAX_NOTES) };
  sessions.set(k, trimmed);
  try {
    sessionStorage.setItem(k, JSON.stringify(trimmed));
  } catch {
    // storage full or blocked: the in-memory copy still works
  }
}

export function dropRoomSession(uid: string, room: string) {
  const k = storeKey(uid, room);
  sessions.delete(k);
  try {
    sessionStorage.removeItem(k);
  } catch {
    // storage blocked
  }
}
