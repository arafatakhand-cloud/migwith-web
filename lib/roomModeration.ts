"use client";

import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type DocumentData,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "./firebase";
import { isMainFounderName } from "./founder";

// Room roles and moderation, same rules and Firestore writes as the app's
// RoomPage.kt. The Firestore rules check every write again on the server.

export type RoomInfo = {
  exists: boolean;
  category: string;
  privacy: string;
  ownerUid: string;
  ownerName: string;
  description: string;
  lockLevel: number;
  allowMedia: boolean;
  allowVideo: boolean;
  publicKick: boolean;
  maxUsers: number;
  capacityEnforced: boolean;
  moderators: string[];
  superMods: string[];
};

export const EMPTY_ROOM: RoomInfo = {
  exists: false,
  category: "",
  privacy: "Public",
  ownerUid: "",
  ownerName: "",
  description: "",
  lockLevel: 0,
  allowMedia: true,
  allowVideo: true,
  publicKick: false,
  maxUsers: 50,
  capacityEnforced: false,
  moderators: [],
  superMods: [],
};

export function roomInfoFrom(d: DocumentData | undefined): RoomInfo {
  if (!d) return EMPTY_ROOM;
  const names = (v: unknown) =>
    Array.isArray(v) ? v.map((x) => String(x ?? "").trim().toLowerCase()).filter(Boolean) : [];
  return {
    exists: true,
    category: String(d.category || ""),
    privacy: String(d.privacy || "Public"),
    ownerUid: String(d.ownerUid || ""),
    ownerName: String(d.ownerName || ""),
    description: String(d.description || ""),
    lockLevel: Number(d.lockLevel || 0),
    allowMedia: d.allowMedia !== false,
    allowVideo: d.allowVideo !== false,
    publicKick: d.publicKick === true,
    maxUsers: Number(d.maxUsers || 50),
    capacityEnforced: typeof d.capacityEnforced === "boolean" ? d.capacityEnforced : d.capacityByLevel === true,
    moderators: names(d.moderators),
    superMods: names(d.superMods),
  };
}

const STAFF_ROLES = new Set(["admin", "administrator", "superadmin", "staff", "owner", "ceo"]);

export function normRole(raw: unknown): string {
  return String(raw ?? "").trim().toLowerCase().replace(/[- ]/g, "_");
}

export type RoomPerms = ReturnType<typeof roomPerms>;

export function roomPerms(room: RoomInfo, uid: string, username: string, role: string, hiddenFounder = false) {
  const me = username.trim().toLowerCase();
  const isOwnerUser = isMainFounderName(me);
  // A hidden founder (miglife secret → Founders) is room admin and staff everywhere.
  const isHiddenFounder = hiddenFounder && !isOwnerUser;
  const isAppStaffHere = isOwnerUser || isHiddenFounder || ["admin", "staff", "superadmin"].includes(role);
  const isRoomAdmin = isOwnerUser || isHiddenFounder || ["admin", "superadmin"].includes(role);
  const isRoomMod = isHiddenFounder || ["staff", "admin", "superadmin"].includes(role);
  // A room made by migwith is Public; one made by anybody else is Private.
  const isUserRoom = room.exists && room.category === "user" && room.privacy !== "Public";
  const isThisRoomOwner = !!uid && !!room.ownerUid && room.ownerUid === uid;
  const isSuperMod = isUserRoom && room.superMods.includes(me);
  const isPrivateMod = isUserRoom && room.moderators.includes(me);
  const canManagePrivate = isUserRoom && (isThisRoomOwner || isSuperMod || isAppStaffHere);
  const canAssignSuperMod = isUserRoom && (isThisRoomOwner || isRoomAdmin);
  const canModeratePrivate = isUserRoom && (canManagePrivate || isPrivateMod);
  return {
    isOwnerUser,
    isHiddenFounder,
    isAppStaffHere,
    isRoomAdmin,
    isRoomMod,
    isUserRoom,
    isThisRoomOwner,
    canManagePrivate,
    canAssignSuperMod,
    canModeratePrivate,
    canKick: isUserRoom ? canModeratePrivate : isAppStaffHere,
    canBan: isUserRoom ? canModeratePrivate : isRoomAdmin || isRoomMod,
    canUnban: isUserRoom ? canModeratePrivate : isRoomAdmin,
    canMute: isRoomAdmin || isRoomMod,
    canRoomWide: isRoomAdmin || isRoomMod || canModeratePrivate, // silence / lock
    canSetLevel: isUserRoom ? canManagePrivate : isRoomAdmin || isRoomMod,
    canShareMedia: room.allowMedia || isAppStaffHere || canModeratePrivate,
    /** Not held back by the room lock or entry level. */
    bypassesEntry: isRoomAdmin || isRoomMod || canModeratePrivate,
  };
}

export type ModContext = {
  roomName: string;
  username: string;
  /** The name written into moderation lines: "Admin" for a hidden founder. */
  modName: string;
  room: RoomInfo;
  perms: RoomPerms;
  /** People in the room right now. */
  people: { uid: string; username: string }[];
  note: (text: string) => void;
  /** A line everyone sees (type "chat" by default). */
  post: (text: string, type?: string) => void;
  /** A red / green moderation line everyone sees. */
  postModeration: (text: string, color: "red" | "green") => void;
  /** Empties this device's view of the room (after /cc). */
  clearForMe?: () => void;
};

const changeManagementRole = httpsCallable(functions, "changeManagementRole");
const clearRoomChatCall = httpsCallable(functions, "clearRoomChat");

// /mod and /dmod in an official room change the person's app role (staff /
// user) — on the server only, like the app.
async function setAppRole(ctx: ModContext, name: string, role: "staff" | "user") {
  if (key(name) === key(ctx.username)) return ctx.note(`${ctx.roomName}: You cannot change your own role.`);
  const target = await lookup(ctx, name).catch(() => null);
  if (!target) return ctx.note(`${ctx.roomName}: User not found: ${name.trim()}`);
  try {
    await changeManagementRole({
      targetUid: target.uid,
      role,
      operationId: "role_" + crypto.randomUUID().replace(/-/g, ""),
    });
    if (role === "staff") ctx.postModeration(`⭐ ${target.username} was made a room moderator by ${ctx.modName}.`, "green");
    else ctx.postModeration(`🛑 ${target.username} is no longer a room moderator.`, "red");
  } catch (e: any) {
    ctx.note(`${ctx.roomName}: Role update failed. ${e?.message || "Permission denied."}`);
  }
}

// /cc — deleting room messages is server-only.
async function clearRoomChat(ctx: ModContext) {
  try {
    await clearRoomChatCall({ roomId: ctx.roomName });
    ctx.clearForMe?.();
  } catch (e: any) {
    ctx.note(`${ctx.roomName}: Could not clear the chat. ${e?.message || "Please try again."}`);
  }
}

const key = (s: string) => s.trim().toLowerCase();

function targetDoc(roomName: string, name: string) {
  return doc(db, "room_moderation", roomName, "users", key(name));
}

async function removePresence(roomName: string, name: string) {
  const snap = await getDocs(
    query(collection(db, "room_presence", roomName, "users"), where("username", "==", name.trim()))
  );
  await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
}

// The person, from the room when they are here, else from users/.
async function lookup(ctx: ModContext, name: string): Promise<{ uid: string; username: string } | null> {
  const clean = name.trim().replace(/^@/, "");
  const here = ctx.people.find((p) => key(p.username) === key(clean));
  if (here) return here;
  const users = collection(db, "users");
  for (const q of [
    query(users, where("usernameLower", "==", key(clean)), limit(1)),
    query(users, where("username", "==", clean), limit(1)),
  ]) {
    const snap = await getDocs(q);
    const d = snap.docs[0];
    if (d) return { uid: d.id, username: String(d.get("username") || clean).trim() };
  }
  return null;
}

async function appRoleOf(name: string): Promise<string> {
  const users = collection(db, "users");
  for (const q of [
    query(users, where("usernameLower", "==", key(name)), limit(1)),
    query(users, where("username", "==", name.trim()), limit(1)),
  ]) {
    const d = (await getDocs(q)).docs[0];
    if (d) return normRole(d.get("role"));
  }
  return "";
}

// Who can NOT be kicked or banned by me: myself, the owner, the app's own
// admins/staff; Super Mods only by the owner; Mods only by owner / Super Mod.
async function isProtected(ctx: ModContext, name: string): Promise<boolean> {
  const k = key(name);
  const { perms, room } = ctx;
  const appRole = await appRoleOf(name).catch(() => "");
  if (k === key(ctx.username)) return true;
  if (!perms.isUserRoom) {
    return isMainFounderName(k) || k === key(room.ownerName) || (!perms.isAppStaffHere && STAFF_ROLES.has(appRole));
  }
  return (
    k === key(room.ownerName) ||
    STAFF_ROLES.has(appRole) ||
    (room.superMods.includes(k) && !(perms.isThisRoomOwner || perms.isRoomAdmin)) ||
    (room.moderators.includes(k) && !perms.canManagePrivate)
  );
}

const fail = (ctx: ModContext, what: string) => (e: any) =>
  ctx.note(`${ctx.roomName}: ${what} failed. ${e?.message || "Permission denied."}`);

export async function kickUser(ctx: ModContext, name: string) {
  if (!ctx.perms.canKick) return ctx.note(`${ctx.roomName}: You cannot kick in this room.`);
  if (await isProtected(ctx, name)) return ctx.note(`${ctx.roomName}: You cannot kick ${name.trim()}.`);
  const row = ctx.people.find((p) => key(p.username) === key(name));
  if (!row) return ctx.note(`${ctx.roomName}: ${name.trim()} is not in this room.`);
  try {
    await setDoc(
      targetDoc(ctx.roomName, row.username),
      { uid: row.uid, username: row.username, kicked: true, updatedBy: ctx.modName, updatedAt: serverTimestamp() },
      { merge: true }
    );
    removePresence(ctx.roomName, row.username).catch(() => {});
    ctx.post(
      ctx.perms.isUserRoom
        ? `👢 ${row.username} was kicked from the room by ${ctx.modName}.`
        : `👢 ${row.username} was kicked from the room.`
    );
  } catch (e) {
    fail(ctx, "Kick")(e);
  }
}

export async function banUser(ctx: ModContext, name: string, ban: boolean) {
  if (ban ? !ctx.perms.canBan : !ctx.perms.canUnban)
    return ctx.note(`${ctx.roomName}: You cannot ${ban ? "ban" : "unban"} in this room.`);
  if (ban && (await isProtected(ctx, name))) return ctx.note(`${ctx.roomName}: You cannot ban ${name.trim()}.`);
  const target = await lookup(ctx, name).catch(() => null);
  if (!target) return ctx.note(`${ctx.roomName}: User not found: ${name.trim()}`);
  try {
    await setDoc(
      targetDoc(ctx.roomName, target.username),
      { uid: target.uid, username: target.username, banned: ban, updatedBy: ctx.modName, updatedAt: serverTimestamp() },
      { merge: true }
    );
    const by = ctx.perms.isUserRoom ? ctx.modName : "a room administrator";
    if (ban) {
      removePresence(ctx.roomName, target.username).catch(() => {});
      ctx.postModeration(`🚫 ${target.username} has been banned from this room by ${by}.`, "red");
    } else {
      ctx.postModeration(`🔓 ${target.username} has been unbanned from this room by ${by}.`, "green");
    }
  } catch (e) {
    fail(ctx, "Moderation")(e);
  }
}

export async function muteUser(ctx: ModContext, name: string, mute: boolean) {
  if (!ctx.perms.canMute) return ctx.note(`${ctx.roomName}: You cannot mute in this room.`);
  if (mute && (await isProtected(ctx, name))) return ctx.note(`${ctx.roomName}: You cannot mute ${name.trim()}.`);
  const target = await lookup(ctx, name).catch(() => null);
  if (!target) return ctx.note(`${ctx.roomName}: User not found: ${name.trim()}`);
  try {
    await setDoc(
      targetDoc(ctx.roomName, target.username),
      { uid: target.uid, username: target.username, muted: mute, updatedBy: ctx.modName, updatedAt: serverTimestamp() },
      { merge: true }
    );
    ctx.post(mute ? `🔇 ${target.username} is muted in this room.` : `🔊 ${target.username} is unmuted in this room.`);
  } catch (e) {
    fail(ctx, "Moderation")(e);
  }
}

async function setRoomFlag(ctx: ModContext, field: "silenced" | "locked", on: boolean) {
  if (!ctx.perms.canRoomWide) return;
  try {
    await setDoc(
      doc(db, "room_moderation", ctx.roomName),
      {
        roomId: ctx.roomName,
        [field]: on,
        ...(field === "locked" ? { lockedBy: ctx.modName } : {}),
        updatedBy: ctx.modName,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
    const u = ctx.modName;
    ctx.post(
      field === "silenced"
        ? on
          ? `🔇 ${u} silenced the room. All users are muted.`
          : `🔊 ${u} unsilenced the room. Chat is enabled again.`
        : on
          ? `🔒 ${u} locked the room. Only admins/mods can enter.`
          : `🔓 ${u} unlocked the room. Everyone can enter again.`
    );
  } catch (e) {
    fail(ctx, "Room update")(e);
  }
}

export async function setEntryLevel(ctx: ModContext, level: number) {
  if (!ctx.perms.canSetLevel) return ctx.note(`${ctx.roomName}: You cannot change this room's entry level.`);
  const lvl = Math.max(0, Math.min(100, Math.trunc(level)));
  try {
    await setDoc(
      doc(db, "rooms", ctx.roomName),
      {
        lockLevel: lvl,
        updatedBy: ctx.modName,
        updatedAt: serverTimestamp(),
        ...(ctx.perms.isUserRoom ? {} : { name: ctx.roomName }),
      },
      { merge: true }
    );
    ctx.post(
      lvl > 0
        ? `🔒 ${ctx.modName} set the entry level of this room to ${lvl}.`
        : `🔓 ${ctx.modName} removed the entry level limit. Anyone can enter.`
    );
  } catch (e) {
    fail(ctx, "Entry level")(e);
  }
}

export async function setModerator(ctx: ModContext, name: string, add: boolean) {
  if (!ctx.perms.isUserRoom) return ctx.note(`${ctx.roomName}: Room mods exist only in private rooms.`);
  if (!ctx.perms.canManagePrivate) return ctx.note(`${ctx.roomName}: Only the room owner or a Super Mod can do that.`);
  const k = key(name);
  if (!k) return;
  if (add && (k === key(ctx.room.ownerName) || ctx.room.superMods.includes(k)))
    return ctx.note(`${ctx.roomName}: ${name.trim()} already has a higher role in this room.`);
  const next = add ? Array.from(new Set([...ctx.room.moderators, k])) : ctx.room.moderators.filter((m) => m !== k);
  if (next.length > 20) return ctx.note(`${ctx.roomName}: A room can have at most 20 moderators.`);
  const target = await lookup(ctx, name).catch(() => null);
  if (!target) return ctx.note(`${ctx.roomName}: User not found: ${name.trim()}`);
  try {
    await updateDoc(doc(db, "rooms", ctx.roomName), {
      moderators: next,
      updatedBy: ctx.modName,
      updatedAt: serverTimestamp(),
    });
    if (add) ctx.postModeration(`⭐ ${target.username} was made a room moderator by ${ctx.modName}.`, "green");
    else ctx.postModeration(`🛑 ${target.username} is no longer a room moderator.`, "red");
  } catch (e) {
    fail(ctx, "Moderator update")(e);
  }
}

export async function setSuperMod(ctx: ModContext, name: string, add: boolean) {
  if (!ctx.perms.isUserRoom) return ctx.note(`${ctx.roomName}: Super Mods exist only in private rooms.`);
  if (!ctx.perms.canAssignSuperMod)
    return ctx.note(`${ctx.roomName}: Only the room owner can make or remove a Super Mod.`);
  const k = key(name);
  if (!k) return;
  if (add && k === key(ctx.room.ownerName)) return ctx.note(`${ctx.roomName}: ${name.trim()} is the owner of this room.`);
  const supers = add ? Array.from(new Set([...ctx.room.superMods, k])) : ctx.room.superMods.filter((m) => m !== k);
  if (supers.length > 10) return ctx.note(`${ctx.roomName}: A room can have at most 10 Super Mods.`);
  const mods = add ? ctx.room.moderators.filter((m) => m !== k) : ctx.room.moderators;
  const target = await lookup(ctx, name).catch(() => null);
  if (!target) return ctx.note(`${ctx.roomName}: User not found: ${name.trim()}`);
  try {
    await updateDoc(doc(db, "rooms", ctx.roomName), {
      superMods: supers,
      moderators: mods,
      updatedBy: ctx.modName,
      updatedAt: serverTimestamp(),
    });
    if (add) ctx.postModeration(`🌟 ${target.username} was made a Super Mod by ${ctx.modName}.`, "green");
    else ctx.postModeration(`🛑 ${target.username} is no longer a Super Mod.`, "red");
  } catch (e) {
    fail(ctx, "Super Mod update")(e);
  }
}

function modHelp(ctx: ModContext): string[] {
  const p = ctx.perms;
  const lines: string[] = [];
  if (p.canKick) lines.push("/kick name");
  if (p.canBan) lines.push("/ban name" + (p.canUnban ? "   /unban name" : ""));
  if (p.canRoomWide) lines.push("/lock   /unlock   /silence room   /unsilence room");
  if (p.canMute) lines.push("/mute name   /unmute name");
  if (p.canSetLevel) lines.push("/level 0-100   (entry level, 0 = anyone)");
  if (p.isUserRoom && p.canManagePrivate) lines.push("/mod name   /dmod name");
  if (!p.isUserRoom && p.isRoomAdmin) lines.push("/mod name   /dmod name   (app moderator)");
  if (p.isRoomAdmin) lines.push("/cc   (clear the room chat for everyone)");
  if (p.canAssignSuperMod) lines.push("/smod name   /dsmod name");
  return lines;
}

/** Room moderator commands. True = handled (not posted as chat). */
export function handleModCommand(clean: string, ctx: ModContext): boolean {
  const parts = clean.trim().split(/\s+/);
  // "/silince" / "/unsilince" are accepted too, like the app.
  const cmd = parts[0].toLowerCase().replace(/^\/(un)?silince$/, "/$1silence");
  const arg = parts[1] || "";
  const needName = (fn: () => void) => (arg ? fn() : ctx.note(`${ctx.roomName}: Usage: ${cmd} username`));

  switch (cmd) {
    case "/k":
    case "/kick":
      needName(() => kickUser(ctx, arg));
      return true;
    case "/b":
    case "/ban":
      needName(() => banUser(ctx, arg, true));
      return true;
    case "/ub":
    case "/unban":
      needName(() => banUser(ctx, arg, false));
      return true;
    case "/m":
    case "/mute":
      needName(() => muteUser(ctx, arg, true));
      return true;
    case "/um":
    case "/unmute":
      needName(() => muteUser(ctx, arg, false));
      return true;
    case "/silence":
    case "/unsilence":
      if (!ctx.perms.canRoomWide) ctx.note(`${ctx.roomName}: You cannot do that in this room.`);
      else if (arg.toLowerCase() !== "room") ctx.note(`${ctx.roomName}: Usage: ${cmd} room`);
      else setRoomFlag(ctx, "silenced", cmd === "/silence");
      return true;
    case "/lock":
    case "/unlock":
      if (!ctx.perms.canRoomWide) ctx.note(`${ctx.roomName}: You cannot do that in this room.`);
      else setRoomFlag(ctx, "locked", cmd === "/lock");
      return true;
    case "/level":
    case "/lvl": {
      const n = Number(arg);
      if (!arg || !Number.isInteger(n)) ctx.note(`${ctx.roomName}: Usage: /level 0-100  (0 = anyone can enter)`);
      else setEntryLevel(ctx, n);
      return true;
    }
    case "/mod":
    case "/dmod":
      if (!ctx.perms.isUserRoom) {
        // Public room: /mod makes the person an app moderator (staff) — only
        // miglife can do that (the server checks too). Say why instead of
        // silently doing nothing.
        if (!ctx.perms.isRoomAdmin) ctx.note(`${ctx.roomName}: In public rooms only miglife can make or remove moderators. In your own private room you can use ${cmd} name.`);
        else if (!arg) ctx.note(`${ctx.roomName}: Usage: ${cmd} username`);
        else setAppRole(ctx, arg, cmd === "/mod" ? "staff" : "user");
        return true;
      }
      needName(() => setModerator(ctx, arg, cmd === "/mod"));
      return true;
    case "/cc":
    case "/clearchat":
      if (ctx.perms.isRoomAdmin) clearRoomChat(ctx);
      return true;
    case "/smod":
    case "/dsmod":
      needName(() => setSuperMod(ctx, arg, cmd === "/smod"));
      return true;
    case "/modhelp":
    case "/modcommands": {
      const lines = modHelp(ctx);
      ctx.note(
        lines.length === 0
          ? `${ctx.roomName}: You have no moderator commands in this room.`
          : `${ctx.roomName}: Your commands:\n${lines.join("\n")}`
      );
      return true;
    }
  }
  return false;
}
