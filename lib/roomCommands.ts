"use client";

import { addDoc, collection, deleteDoc, doc, getDocs, limit, query, serverTimestamp, updateDoc, where } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "./firebase";

// Room chat "/" commands, with the same texts and message types as the app's
// RoomPage.kt so web and app users see identical lines.

export type CommandContext = {
  username: string;
  uid: string;
  roomName: string;
  /** Post a line everyone in the room sees (room_messages). */
  post: (text: string, type: string) => void;
  /** Show a line only on this device. */
  note: (text: string) => void;
};

const SOCIAL: Record<string, (u: string, t: string) => string> = {
  "/hug": (u, t) => `${u} gives ${t} a warm tight hug! 🤗`,
  "/kiss": (u, t) => `${u} plants a kiss on ${t}! 💋`,
  "/love": (u, t) => `${u} sends love to ${t}! ❤️`,
  "/heart": (u, t) => `${u} sends a heart to ${t}! 💖`,
  "/cuddle": (u, t) => `${u} cuddles up with ${t}! 🫂`,
  "/pat": (u, t) => `${u} gives ${t} a gentle pat! 🥰`,
  "/poke": (u, t) => `${u} pokes ${t} 👉`,
  "/tickle": (u, t) => `${u} tickles ${t}! 😂`,
  "/highfive": (u, t) => `${u} gives ${t} a high-five! 🙌`,
  "/hfive": (u, t) => `${u} gives ${t} a high-five! 🙌`,
  "/wink": (u, t) => `${u} winks at ${t}! 😉`,
  "/blush": (u, t) => `${u} blushes at ${t}! 😳`,
  "/slap": (u, t) => `${u} playfully slaps ${t}! 👋`,
  "/hold": (u, t) => `${u} holds ${t}'s hand! 🤝`,
  "/boo": (u, t) => `${u} jumps out and boos ${t}! 👻`,
  "/laugh": (u, t) => `${u} bursts out laughing with ${t}! 😂`,
  "/cry": (u, t) => `${u} cries on ${t}'s shoulder! 😭`,
  "/dance": (u, t) => `${u} breaks into a dance with ${t}! 💃`,
  "/sing": (u, t) => `${u} sings a song for ${t}! 🎤`,
  "/wave": (u, t) => `${u} waves at ${t}! 👋`,
  "/smile": (u, t) => `${u} flashes a smile at ${t}! 😊`,
  "/angry": (u, t) => `${u} is fuming at ${t}! 😡`,
  "/scare": (u, t) => `${u} jumps out to scare ${t}! 😱`,
  "/surprise": (u, t) => `${u} surprises ${t}! 🎉`,
  "/clap": (u, t) => `${u} claps for ${t}! 👏`,
  "/cheer": (u, t) => `${u} cheers loudly for ${t}! 🎉`,
  "/bro": (u, t) => `${u} calls ${t} their bro! 🤝`,
  "/sis": (u, t) => `${u} calls ${t} their sis! 💗`,
  "/friend": (u, t) => `${u} wants to be friends with ${t}! 🤝`,
  "/bestie": (u, t) => `${u} declares ${t} their bestie! 💞`,
  "/respect": (u, t) => `${u} shows ${t} some respect! 🫡`,
  "/sorry": (u, t) => `${u} says a sincere sorry to ${t}! 🙏`,
  "/thanks": (u, t) => `${u} thanks ${t}! 🙏`,
  "/thank": (u, t) => `${u} thanks ${t}! 🙏`,
  "/welcome": (u, t) => `${u} gives ${t} a warm welcome! 🌟`,
  "/birthday": (u, t) => `${u} wishes ${t} a very Happy Birthday! 🎂🎉`,
  "/goodmorning": (u, t) => `${u} wishes ${t} a good morning! 🌅`,
  "/goodnight": (u, t) => `${u} wishes ${t} good night! 🌙`,
  "/rose": (u, t) => `${u} hands ${t} a rose! 🌹`,
  "/flower": (u, t) => `${u} sends flowers to ${t}! 🌸`,
  "/cake": (u, t) => `${u} sends a cake to ${t}! 🎂`,
  "/coffee": (u, t) => `${u} offers ${t} a coffee! ☕`,
  "/chocolate": (u, t) => `${u} sends chocolate to ${t}! 🍫`,
  "/diamond": (u, t) => `${u} sends a diamond to ${t}! 💎`,
  "/ring": (u, t) => `${u} sends a ring to ${t}! 💍`,
  "/crown": (u, t) => `${u} places a crown on ${t}! 👑`,
  "/teddy": (u, t) => `${u} sends a teddy bear to ${t}! 🧸`,
  "/present": (u, t) => `${u} sends a present to ${t}! 🎁`,
  "/hi": (u) => `${u} waves and says Hi! 👋`,
  "/hello": (u) => `${u} says Hello! 👋`,
  "/bye": (u) => `${u} says Bye! 👋`,
  "/brb": (u) => `${u} will be right back! 🔙`,
  "/afk": (u) => `${u} has gone AFK! 💤`,
  "/away": (u) => `${u} is away! 🟠`,
  "/back": (u) => `${u} is back! 👋`,
  "/sleep": (u) => `${u} is heading off to sleep! 😴`,
  "/busy": (u) => `${u} is busy right now! ⏳`,
  "/online": (u) => `${u} just came online! 🟢`,
  "/wb": (u) => `Welcome back, ${u}! 👋`,
  "/jump": (u) => `${u} jumps for joy! 🦘`,
  "/run": (u) => `${u} takes off running! 🏃`,
  "/welcomeall": (u) => `${u} welcomes everyone! 🌟`,
  "/beibei": (u, t) => `${u} summons Beibei's luck for ${t}! 🐟`,
  "/challenge": (u, t) => `${u} throws down a challenge to ${t}! ⚔️`,
  "/champion": (u, t) => `${u} crowns ${t} the champion! 🏆`,
  "/cheers": (u, t) => `${u} raises a toast with ${t}! 🥂`,
  "/frenzy": (u, t) => `${u} whips up a frenzy with ${t}! 🔥`,
  "/go": (u, t) => `${u} shouts "Go ${t}!" 🏃`,
  "/gold": (u, t) => `${u} hands ${t} the gold! 🥇`,
  "/huanhuan": (u, t) => `${u} lights it up with Huanhuan for ${t}! 🔥`,
  "/jingjing": (u, t) => `${u} shares a Jingjing hug with ${t}! 🐼`,
  "/lose": (u, t) => `${u} admits defeat to ${t}. 😞`,
  "/luck": (u, t) => `${u} wishes ${t} good luck! 🍀`,
  "/medal": (u, t) => `${u} awards a medal to ${t}! 🎖️`,
  "/nini": (u, t) => `${u} sends a Nini kite to ${t}! 🪁`,
  "/proud": (u, t) => `${u} is so proud of ${t}! 🥹`,
  "/record": (u, t) => `${u} sets a new record with ${t}! 📈`,
  "/taunt": (u, t) => `${u} taunts ${t}! 😏`,
  "/torch": (u, t) => `${u} passes the torch to ${t}! 🔥`,
  "/win": (u, t) => `${u} wins against ${t}! 🏅`,
  "/winner": (u, t) => `${u} declares ${t} the winner! 🏆`,
  "/yingying": (u, t) => `${u} races Yingying with ${t}! 🦌`,
  "/goal": (u) => `${u} scores a GOAL! ⚽🎯 YESSS!`,
  "/penalty": (u, t) => `${u} wins a penalty against ${t}! 🎯`,
  "/freekick": (u, t) => `${u} lines up a free kick against ${t}! 🥅`,
  "/offside": (u, t) => `${u} calls ${t} OFFSIDE! 🚩`,
  "/handball": (u, t) => `${u} calls handball on ${t}! ✋`,
  "/red": (u, t) => `${u} shows ${t} a RED CARD! 🟥`,
  "/yellow": (u, t) => `${u} shows ${t} a YELLOW CARD! 🟨`,
};

const STATUS: Record<string, string> = {
  "/brb": "AWAY",
  "/away": "AWAY",
  "/afk": "AWAY",
  "/busy": "BUSY",
  "/back": "ONLINE",
  "/online": "ONLINE",
};

const EIGHT_BALL = [
  "It is certain.", "Without a doubt.", "Yes, definitely.", "You may rely on it.", "As I see it, yes.",
  "Most likely.", "Outlook good.", "Yes.", "Signs point to yes.", "Reply hazy, try again.",
  "Ask again later.", "Better not tell you now.", "Cannot predict now.", "Concentrate and ask again.",
  "Don't count on it.", "My reply is no.", "My sources say no.", "Outlook not so good.", "Very doubtful.",
];

const FORTUNES = [
  "A beautiful, smart, and loving person will be coming into your life.",
  "A dubious friend may be an enemy in camouflage.",
  "A fresh start will put you on your way.",
  "A golden egg of opportunity falls into your lap this month.",
  "Now is the time to try something new.",
  "Patience is your greatest asset today.",
  "The best things in life are yet to come.",
  "You will discover a talent you didn't know you had.",
  "A pleasant surprise is waiting for you.",
  "Good things come to those who wait, but better things come to those who work.",
  "Your hard work is about to pay off.",
  "An unexpected friendship will brighten your day.",
  "Fortune favors the bold — take that first step.",
  "A small act of kindness will come back to you tenfold.",
  "This is a good time to trust your instincts.",
];

const HELP =
  "📜 MIG WITH Commands:\n" +
  "/hug @user • /kiss @user • /love @user • /heart @user • /cuddle @user • /pat @user • /poke @user • /tickle @user\n" +
  "/highfive @user • /wink @user • /blush @user • /slap @user • /hold @user • /boo @user • /laugh @user • /cry @user • /dance @user • /sing @user\n" +
  "/wave @user • /smile @user • /angry @user • /scare @user • /surprise @user • /clap @user • /cheer @user\n" +
  "/bro @user • /sis @user • /friend @user • /bestie @user • /respect @user • /sorry @user • /thanks @user • /welcome @user\n" +
  "/birthday @user • /goodmorning @user • /goodnight @user\n" +
  "/rose @user • /flower @user • /cake @user • /coffee @user • /chocolate @user • /diamond @user • /ring @user • /crown @user • /teddy @user • /present @user\n" +
  "/hi • /hello • /bye • /sleep • /wb\n" +
  "Status: /brb • /away • /afk (🟠 Away) • /busy (🔴 Busy) • /back • /online (🟢 Online)\n" +
  "Info: /whois @user\n" +
  "/me text • /jump • /run • /welcomeall\n" +
  "/8ball question • /fortune • /roll [max]\n" +
  "/beibei • /challenge • /champion • /cheers • /frenzy • /go • /gold • /huanhuan • /jingjing • /lose • /luck • /medal • /nini • /proud\n" +
  "/record • /taunt • /torch • /win • /winner • /yingying\n" +
  "/goal • /penalty • /freekick • /offside • /handball • /red • /yellow\n" +
  "Friends: /fr @user (friend request) • /uf @user (unfriend)\n" +
  "/pick [code] (Lucky Voucher) • /invite @user • /commands • /help";

const pickVoucher = httpsCallable<{ roomId: string; code: string }, { amount?: number }>(functions, "pickVoucher");
const whoisUser = httpsCallable<{ username: string }, Record<string, unknown>>(functions, "whoisUser");

// One user by name: exact username first, then any upper/lower case
// (usernameLower) — the app's findUserByName.
export async function findUserByName(name: string): Promise<{ uid: string; username: string } | null> {
  const clean = name.trim().replace(/^@/, "");
  if (!clean) return null;
  const users = collection(db, "users");
  for (const q of [
    query(users, where("username", "==", clean), limit(1)),
    query(users, where("usernameLower", "==", clean.toLowerCase()), limit(1)),
  ]) {
    const d = (await getDocs(q)).docs[0];
    if (d) return { uid: d.id, username: String(d.get("username") || clean).trim() || clean };
  }
  return null;
}

// /fr name — same flat friend_requests doc + alert as the app. Only the sender
// sees the confirmation (it never goes to the room chat).
async function sendFriendRequest(ctx: CommandContext, name: string) {
  const target = await findUserByName(name).catch(() => null);
  if (!target) return ctx.note(`🤝 User not found: ${name.trim()}`);
  if (target.username.toLowerCase() === ctx.username.toLowerCase()) return;
  try {
    await addDoc(collection(db, "friend_requests"), {
      fromUsername: ctx.username,
      toUsername: target.username,
      status: "pending",
      createdAt: serverTimestamp(),
    });
    ctx.note(`🤝 Friend request sent to ${target.username}!`);
    addDoc(collection(db, "alerts"), {
      toUsername: target.username,
      message: `${ctx.username} sent you a friend request.`,
      type: "friend_request",
      read: false,
      createdAt: serverTimestamp(),
    }).catch(() => {});
  } catch (e: any) {
    ctx.note(`🤝 Friend request failed. ${e?.message || "Permission denied."}`);
  }
}

// /uf name — removes the friendship straight away (either friend may end it).
async function unfriend(ctx: CommandContext, name: string) {
  const target = await findUserByName(name).catch(() => null);
  if (!target) return ctx.note(`💔 User not found: ${name.trim()}`);
  try {
    const col = collection(db, "friend_requests");
    const snaps = await Promise.all([
      getDocs(query(col, where("fromUsername", "==", ctx.username), where("toUsername", "==", target.username), where("status", "==", "accepted"))),
      getDocs(query(col, where("fromUsername", "==", target.username), where("toUsername", "==", ctx.username), where("status", "==", "accepted"))),
    ]);
    const docs = snaps.flatMap((s) => s.docs);
    if (docs.length === 0) return ctx.note(`💔 ${target.username} is not in your friends list.`);
    await Promise.all(docs.map((d) => deleteDoc(d.ref)));
    ctx.note(`💔 ${target.username} removed from your friends.`);
  } catch (e: any) {
    ctx.note(`💔 Unfriend failed. ${e?.message || "Please try again."}`);
  }
}

const pickRandom = <T,>(list: T[]): T => list[Math.floor(Math.random() * list.length)];

/**
 * Handles a "/" command. Returns true when the text was a known command (so it
 * is not posted as a normal chat line).
 */
export function handleRoomCommand(clean: string, ctx: CommandContext): boolean {
  const parts = clean.trim().split(/\s+/);
  const command = (parts[0] || "").toLowerCase();
  const target = (parts[1] || "").replace(/^@/, "").trim() || "everyone";
  const { username: u } = ctx;

  if (command === "/commands" || command === "/command" || command === "/help") {
    ctx.note(HELP);
    return true;
  }

  if (command === "/me") {
    const action = clean.trim().slice(3).trim();
    ctx.post(action ? `${u}: ${action}` : u, "me");
    return true;
  }

  if (command === "/8ball") {
    const question = clean.trim().slice(6).trim();
    if (!question) ctx.note(`${u}: Usage: /8ball your question`);
    else ctx.post(`**${u} says: ${pickRandom(EIGHT_BALL)}**`, "social");
    return true;
  }

  if (command === "/fortune") {
    ctx.post(`**${u}'s fortune: ${pickRandom(FORTUNES)}**`, "social");
    return true;
  }

  if (command === "/roll") {
    const n = Number(parts[1]);
    const max = Number.isInteger(n) ? Math.min(1_000_000, Math.max(2, n)) : 100;
    ctx.post(`**${u} rolls ${1 + Math.floor(Math.random() * max)}**`, "social");
    return true;
  }

  if (STATUS[command]) {
    updateDoc(doc(db, "users", ctx.uid), {
      presenceStatus: STATUS[command],
      statusUpdatedAt: serverTimestamp(),
    }).catch(() => {});
    ctx.post(`**${SOCIAL[command](u, target)}**`, "social");
    return true;
  }

  if (SOCIAL[command]) {
    ctx.post(`**${SOCIAL[command](u, target)}**`, "social");
    return true;
  }

  if (command === "/pick") {
    const code = clean.trim().slice(5).trim();
    if (!code) {
      ctx.note(`${u}: Usage: /pick [code]`);
      return true;
    }
    pickVoucher({ roomId: ctx.roomName, code })
      .then(({ data }) =>
        ctx.note(`🎉 You picked the Lucky Voucher and won ${Number(data?.amount || 0).toLocaleString()} coins!`)
      )
      .catch((err: any) => ctx.note(`🎟️ ${err?.message || "Could not claim that voucher."}`));
    return true;
  }

  if (command === "/invite") {
    const who = (parts[1] || "").replace(/^@/, "").trim();
    if (!who) {
      ctx.note(`${u}: Usage: /invite username`);
      return true;
    }
    if (who.toLowerCase() === u.toLowerCase()) return true;
    addDoc(collection(db, "alerts"), {
      toUsername: who,
      fromUsername: u,
      message: `🏠 @${u} invited you to join "${ctx.roomName}"!`,
      type: "mention",
      read: false,
      createdAt: serverTimestamp(),
    })
      .then(() => ctx.note(`${u}: Invite sent to @${who}.`))
      .catch((err: any) => ctx.note(`${u}: Could not send invite. ${err?.message || "Please try again."}`));
    return true;
  }

  if (command === "/fr" || command === "/uf") {
    const who = (parts[1] || "").replace(/^@/, "").trim();
    if (who && who.toLowerCase() !== u.toLowerCase()) {
      if (command === "/fr") sendFriendRequest(ctx, who);
      else unfriend(ctx, who);
    }
    return true;
  }

  if (command === "/whois") {
    const who = (parts[1] || "").replace(/^@/, "").trim();
    if (!who) {
      ctx.note("ℹ Use /whois [username] — e.g. /whois life");
      return true;
    }
    whoisUser({ username: who })
      .then(({ data }) => {
        const lines = Object.entries(data || {})
          .filter(([, v]) => v !== null && v !== "" && typeof v !== "object")
          .map(([k, v]) => `${k}: ${v}`);
        ctx.note(`👤 /whois ${who}\n${lines.join("\n") || "No details."}`);
      })
      .catch((err: any) => ctx.note(`❌ /whois: ${err?.message || "User not found."}`));
    return true;
  }

  return false;
}
