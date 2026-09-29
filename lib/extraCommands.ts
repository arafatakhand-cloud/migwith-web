"use client";

import {
  collection,
  doc,
  getDoc,
  getDocs,
  getDocFromServer,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "./firebase";
import { OFFICIAL_COUNTRY_ROOMS, isAutoRoomDescription, officialRoomDefaultDescription } from "./rooms";

// Room commands the app has that live outside the moderator list (RoomPage.kt):
//   /block, /unblock                — hide someone's messages for yourself
//   /colorrequests, /approvecolor,
//   /rejectcolor                    — Color Shop purchase review (founder)
//   /luxconfig                      — Luxury Bot sequence config (founder)
//   /seeddescriptions               — default Room Info texts (room admin)

export type ExtraContext = {
  uid: string;
  username: string;
  roomName: string;
  isFounder: boolean;
  isRoomAdmin: boolean;
  note: (text: string) => void;
};

const errMsg = (e: any) => e?.message || "Please try again.";

// users/{uid}.blockedUsers — the same list the profile page and Settings edit.
async function setBlocked(uid: string, target: string, blocked: boolean): Promise<void> {
  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);
  const raw = snap.get("blockedUsers");
  const current = Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string") : [];
  const already = current.some((n) => n.toLowerCase() === target.toLowerCase());
  if (blocked === already) return;
  const updated = blocked ? [...current, target] : current.filter((n) => n.toLowerCase() !== target.toLowerCase());
  await updateDoc(ref, { blockedUsers: updated });
}

const CHARACTER_BY_WORD: Record<string, string> = {
  chor: "🕵️ Chor",
  dakat: "🥷 Dakat",
  police: "👮 Police",
  babu: "👨 Babu",
  krishok: "🧑‍🌾 Krishok",
  mohajon: "💰 Mohajon",
};

function parsePairs(text: string): string[][] | null {
  const pairs: string[][] = [];
  for (const raw of text.split(",")) {
    const parts = raw.trim().split("+");
    if (parts.length !== 2) return null;
    const a = CHARACTER_BY_WORD[parts[0].trim().toLowerCase()];
    const b = CHARACTER_BY_WORD[parts[1].trim().toLowerCase()];
    if (!a || !b) return null;
    pairs.push([a, b]);
  }
  return pairs.length ? pairs : null;
}

function luxConfig(ctx: ExtraContext, clean: string) {
  const u = ctx.username;
  if (!ctx.isFounder) return ctx.note(`${u}: Only the founder account can use /luxconfig.`);
  const rest = clean.replace(/^\/luxconfig/i, "").trim();
  const usage =
    `${u}: Usage:\n/luxconfig easy chor+dakat, police+babu\n/luxconfig medium chor+krishok\n` +
    "/luxconfig tier hard off\n/luxconfig reset";
  let data: Record<string, unknown>;
  if (!rest) return ctx.note(usage);
  if (/^reset$/i.test(rest)) {
    data = { easyPairs: null, mediumPairs: null, tiersEnabled: null };
  } else if (/^easy /i.test(rest)) {
    const pairs = parsePairs(rest.slice(5));
    if (!pairs) return ctx.note(`${u}: Couldn't parse those pairs. Example: chor+dakat, police+babu`);
    data = { easyPairs: pairs };
  } else if (/^medium /i.test(rest)) {
    const pairs = parsePairs(rest.slice(7));
    if (!pairs) return ctx.note(`${u}: Couldn't parse those pairs. Example: chor+krishok, police+chor`);
    data = { mediumPairs: pairs };
  } else if (/^tier /i.test(rest)) {
    const [tier, onOff] = rest.slice(5).trim().toLowerCase().split(/\s+/);
    if (!["single", "easy", "medium", "hard", "trio"].includes(tier) || !["on", "off"].includes(onOff)) {
      return ctx.note(`${u}: Usage: /luxconfig tier <single|easy|medium|hard|trio> <on|off>`);
    }
    data = { tiersEnabled: { [tier]: onOff === "on" } };
  } else {
    return ctx.note(usage);
  }
  httpsCallable(functions, "setLuxuryBotSequenceConfig")(data)
    .then(() => ctx.note(`🎛️ ${u} updated Luxury Bot's sequence config.`))
    .catch((e) => ctx.note(`${u}: Could not update config. ${errMsg(e)}`));
}

async function listColorRequests(ctx: ExtraContext) {
  const u = ctx.username;
  if (!ctx.isFounder) return ctx.note(`${u}: Only the founder account can use /colorrequests.`);
  try {
    const snap = await getDocs(query(collection(db, "color_purchase_requests"), where("status", "==", "pending")));
    if (snap.empty) return ctx.note(`${u}: No pending color purchase requests.`);
    const lines = snap.docs
      .map((d) => `• ${d.id} — ${d.get("username") || "?"} wants ${d.get("colorName") || "?"} (${Number(d.get("price") || 0).toLocaleString()} coins)`)
      .join("\n");
    ctx.note(`${u}: Pending color requests:\n${lines}\n\nUse /approvecolor <id> or /rejectcolor <id>`);
  } catch (e) {
    ctx.note(`${u}: Could not load requests. ${errMsg(e)}`);
  }
}

async function seedDescriptions(ctx: ExtraContext) {
  if (!ctx.isRoomAdmin) return;
  ctx.note("📝 Writing the default description into every public room…");
  const names = new Set<string>([...OFFICIAL_COUNTRY_ROOMS, "👻 Luxury Bot Official", "🃏 LowCard Official", "🎁 Gift Official"]);
  try {
    (await getDocs(query(collection(db, "rooms"), where("privacy", "==", "Public")))).docs.forEach((d) => names.add(d.id));
  } catch {
    // the official rooms are still done
  }
  let written = 0;
  let kept = 0;
  let failed = 0;
  let firstProblem = "";
  for (const name of names) {
    try {
      const ref = doc(db, "rooms", name);
      // Read from the server (not a cached copy), like the app.
      const stored = String((await getDocFromServer(ref)).get("description") || "").trim();
      if (!isAutoRoomDescription(name, stored)) {
        kept++;
        continue;
      }
      await setDoc(
        ref,
        { name, description: officialRoomDefaultDescription(name), updatedBy: ctx.username, updatedAt: serverTimestamp() },
        { merge: true }
      );
      written++;
    } catch (e) {
      failed++;
      firstProblem ||= `${name}: ${errMsg(e)}`;
    }
  }
  ctx.note(
    `📝 Done: ${written} written, ${kept} kept (already had their own text)` +
      (failed ? `, ${failed} failed — ${firstProblem}` : ".")
  );
}

/** Returns true when the text was one of these commands. */
export function handleExtraCommand(clean: string, ctx: ExtraContext): boolean {
  const parts = clean.trim().split(/\s+/);
  const cmd = (parts[0] || "").toLowerCase();
  const arg = (parts[1] || "").replace(/^@/, "");
  const u = ctx.username;

  switch (cmd) {
    case "/block":
    case "/unblock": {
      const on = cmd === "/block";
      if (!arg) {
        ctx.note(`${ctx.roomName}: Usage: ${cmd} username`);
        return true;
      }
      if (arg.toLowerCase() === u.toLowerCase()) {
        ctx.note(`${ctx.roomName}: You cannot block yourself.`);
        return true;
      }
      setBlocked(ctx.uid, arg, on)
        .then(() =>
          ctx.note(
            on
              ? `${ctx.roomName}: ${arg} has been blocked. Their messages are now hidden for you.`
              : `${ctx.roomName}: ${arg} has been unblocked.`
          )
        )
        .catch(() => ctx.note(`${ctx.roomName}: Could not ${on ? "block" : "unblock"} ${arg}. Please try again.`));
      return true;
    }
    case "/luxconfig":
      luxConfig(ctx, clean);
      return true;
    case "/colorrequests":
      listColorRequests(ctx);
      return true;
    case "/approvecolor": {
      if (!arg) {
        ctx.note(`${u}: Usage: /approvecolor <requestId>`);
        return true;
      }
      if (!ctx.isFounder) {
        ctx.note(`${u}: Only the founder account can use /approvecolor.`);
        return true;
      }
      httpsCallable(functions, "approveColorPurchase")({ requestId: arg })
        .then(() => ctx.note(`${u}: Approved color request ${arg}.`))
        .catch((e) => ctx.note(`${u}: Could not approve. ${errMsg(e)}`));
      return true;
    }
    case "/rejectcolor": {
      if (!arg) {
        ctx.note(`${u}: Usage: /rejectcolor <requestId>`);
        return true;
      }
      httpsCallable(functions, "rejectColorPurchase")({ requestId: arg })
        .then(() => ctx.note(`${u}: Rejected color request ${arg} — coins refunded.`))
        .catch((e) => ctx.note(`${u}: Could not reject. ${errMsg(e)}`));
      return true;
    }
    case "/seeddescriptions":
      seedDescriptions(ctx);
      return true;
  }
  return false;
}
