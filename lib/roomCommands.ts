"use client";

import { addDoc, collection, deleteDoc, doc, getDocs, limit, query, serverTimestamp, updateDoc, where } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "./firebase";
import { extraSocialMessage } from "./socialExtra";
import { unfriendViaServer } from "./friends";

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
  /** Open the 📜 Command page (tap a command to use it). */
  openCommands?: () => void;
  /** Show the /whois popup (whoisUser result). */
  showWhois?: (info: Record<string, unknown>) => void;
  /** A title + text + OK popup (like the app's AlertDialog). */
  popup?: (title: string, text: string) => void;
};

// Short forms people actually type: /gn = /goodnight, /gm = /goodmorning, …
const SOCIAL_ALIASES: Record<string, string> = {
  "/gn": "/goodnight",
  "/gm": "/goodmorning",
  "/ga": "/goodafternoon",
  "/ge": "/goodevening",
  "/ty": "/thanks",
  "/hbd": "/birthday",
  "/gl": "/luck",
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
  "/goodnight": (u, t) => `${u} signs off — good night & sweet dreams, ${t}! 🌙`,
  "/goodafternoon": (u, t) => `${u} wishes ${t} a good afternoon! ☀️`,
  "/goodevening": (u, t) => `${u} wishes ${t} a good evening! 🌇`,
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
  "📜 miGlife Commands:\n" +
  "/hug @user • /kiss @user • /love @user • /heart @user • /cuddle @user • /pat @user • /poke @user • /tickle @user\n" +
  "/highfive @user • /wink @user • /blush @user • /slap @user • /hold @user • /boo @user • /laugh @user • /cry @user • /dance @user • /sing @user\n" +
  "/wave @user • /smile @user • /angry @user • /scare @user • /surprise @user • /clap @user • /cheer @user\n" +
  "/bro @user • /sis @user • /friend @user • /bestie @user • /respect @user • /sorry @user • /thanks @user • /welcome @user\n" +
  "/birthday @user • /goodmorning @user • /goodafternoon @user • /goodevening @user • /goodnight @user\n" +
  "Short: /gm • /ga • /ge • /gn • /ty • /hbd • /gl (+ @user)\n" +
  "/rose @user • /flower @user • /cake @user • /coffee @user • /chocolate @user • /diamond @user • /ring @user • /crown @user • /teddy @user • /present @user\n" +
  "/hi • /hello • /bye • /sleep • /wb\n" +
  "Status: /brb • /away • /afk (🟠 Away) • /busy (🔴 Busy) • /back • /online (🟢 Online)\n" +
  "Info: /whois @user\n" +
  "/me text • /jump • /run • /welcomeall\n" +
  "/8ball question • /fortune • /roll [max]\n" +
  "/beibei • /challenge • /champion • /cheers • /frenzy • /go • /gold • /huanhuan • /jingjing • /lose • /luck • /medal • /nini • /proud\n" +
  "/record • /taunt • /torch • /win • /winner • /yingying\n" +
  "/goal • /penalty • /freekick • /offside • /handball • /red • /yellow\n" +
  "Friends: /f user (friend request) • /uf user (unfriend) • /block user • /unblock user\n" +
  "Game bots: /bot lowcard • /bot cricket • /bot trivia • /bot stop\n" +
  "/pick [code] (Lucky Voucher) • /invite @user • /commands • /help";

const pickVoucher = httpsCallable<{ roomId: string; code: string }, { amount?: number }>(functions, "pickVoucher");
const whoisUser = httpsCallable<{ username: string }, Record<string, unknown>>(functions, "whoisUser");
const checkUserTag = httpsCallable<{ username: string }, { username?: string; tags?: { kind?: string }[] }>(functions, "checkUserTag");

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
  // BUG FIX (the same person twice in Requests), like the app: /f used to add
  // a new request every time, even when one was already pending or you were
  // already friends. Both directions are checked first.
  try {
    const col = collection(db, "friend_requests");
    const [mineSnap, theirsSnap] = await Promise.all([
      getDocs(query(col, where("fromUsername", "==", ctx.username), where("toUsername", "==", target.username))),
      getDocs(query(col, where("fromUsername", "==", target.username), where("toUsername", "==", ctx.username))),
    ]);
    const mine = mineSnap.docs.map((d) => String(d.get("status") || ""));
    const theirs = theirsSnap.docs.map((d) => String(d.get("status") || ""));
    if (mine.includes("accepted") || theirs.includes("accepted")) return ctx.note(`🤝 You and ${target.username} are already friends.`);
    if (mine.includes("pending")) return ctx.note(`🤝 You already sent ${target.username} a friend request.`);
    if (theirs.includes("pending"))
      return ctx.note(`🤝 ${target.username} already sent you a request — accept it in Friends → Requests.`);
  } catch {
    // can't check → send it anyway, like the app
  }
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
      fromUsername: ctx.username,
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
    // the server logs who ended it and tells the other person (old way if it isn't deployed yet)
    if (!(await unfriendViaServer(target.username, "web /uf"))) await Promise.all(docs.map((d) => deleteDoc(d.ref)));
    ctx.note(`💔 ${target.username} removed from your friends.`);
  } catch (e: any) {
    ctx.note(`💔 Unfriend failed. ${e?.message || "Please try again."}`);
  }
}

const pickRandom = <T,>(list: T[]): T => list[Math.floor(Math.random() * list.length)];

// 🎤 /sing — a random short song line, English or Bangla (miGlife's own words, not real lyrics),
// the same list as the app's RoomPage.kt.
const SONGS: [string, string][] = [
  ["pop", "Turn the night up, let the city glow, we're dancing slow wherever the lights go"],
  ["pop", "Got a heart like a radio, playing your name on every station I know"],
  ["rock", "Thunder in my chest, I'm running with the storm, I was never meant to stay inside the norm"],
  ["rock", "Break the walls down, shout it to the sky, we were born to live loud and we were born to fly"],
  ["love", "Every message from you lights my screen like a sunrise in between"],
  ["love", "You're the song stuck in my head, every word you ever said"],
  ["love", "Hold my hand through the rain and the rush, the world goes quiet when you're near enough"],
  ["happy", "Wake up, shake up, the day is brand new, there's a smile out here waiting for you"],
  ["happy", "Clap your hands, stamp your feet, life is sweeter with a beat"],
  ["sad", "Empty chair beside the window, cold tea on the table, I'd call you if I was able"],
  ["sad", "Stars keep shining though the night feels long, I'll keep humming till I find my song"],
  ["rap", "Mic in my hand and the room on mute, every word I spit is a golden route"],
  ["rap", "Started from the lobby now we're running the room, coins in the pocket and the vibes in bloom"],
  ["folk", "Down by the river where the old boats sleep, I left a promise that I mean to keep"],
  ["folk", "Green fields calling, mango trees sway, the road back home is a song all the way"],
  ["party", "Hands up high if you're feeling alright, we're gonna chat till the morning light"],
  ["party", "DJ, play it louder, let the whole room shake, this is the party that the stars can't fake"],
  ["dream", "Paper planes and big ideas, flying past my doubts and fears"],
  ["dream", "One more step and one more try, I'm painting my name across the sky"],
  ["friendship", "Friends like you are hard to find, you're the good news on my mind"],
];

// …and Bangla: miGlife's own lines plus real lines (কলি) from songs that are
// free to use now (public domain: Rabindranath, Lalon, Hason Raja,
// Dwijendralal, Atulprasad, Rajanikanta). /sing picks Bangla or English half
// the time each.
const BANGLA_SONGS: [string, string][] = [
  ["a Bangla song", "নদীর ধারে বসে আছি, তোমার কথা ভাবি, মেঘের ভেলায় চিঠি পাঠাই, তুমি কি তা পাবি"],
  ["a Bangla song", "জোছনা রাতে ছাদে বসে গুনি তারার সারি, তোমার হাসি মনে পড়ে, ফিরি কি আর বাড়ি"],
  ["a Bangla song", "বৃষ্টি নামে টিনের চালে, টাপুর টুপুর সুর, তুমি আছো কাছেই যেন, তবু অনেক দূর"],
  ["a Bangla song", "সকাল বেলার রোদ্দুরে আজ মনটা হলো রঙিন, তোমায় নিয়ে গান বাঁধি আমি সারাটা দিন"],
  ["a Bangla song", "চায়ের কাপে ঝড় উঠেছে, আড্ডা জমে ভারী, বন্ধু তোরা পাশে থাকলে দুঃখ কি আর পারি"],
  ["a Bangla song", "মাটির পথে হেঁটে চলি, ধানের ক্ষেতে হাওয়া, এই দেশেরই গান গাই, এটাই আমার চাওয়া"],
  ["a Bangla song", "কাশফুলের দোলায় দোলে শরৎ এলো ফিরে, নীল আকাশে সাদা মেঘ ভাসে ধীরে ধীরে"],
  ["a Bangla song", "ফোনের পর্দায় তোমার নাম, হাসি থামে না আর, এক লাইনের মেসেজেই ভরে যায় সংসার"],
  ["a Bangla song", "রাত জেগে চ্যাট করি, ঘুম আসে না চোখে, তোমার একটা ইমোজি দেখে আনন্দ লাগে বুকে"],
  ["a Bangla song", "মেঘলা দিনে মন খারাপ, জানালা খোলা রাখি, হাওয়ায় ভেসে আসে যদি তোমার ডাকাডাকি"],
  ["a Bangla song", "নৌকা বাইছে মাঝি ভাই, ভাটিয়ালির টানে, নদী জানে কত কথা লুকিয়ে আছে প্রাণে"],
  ["a Bangla song", "শিমুল পলাশ ফুটেছে আজ, বসন্তের ডাক, মনের ভেতর কোকিল গায়, দুঃখগুলো থাক"],
  ["a Bangla song", "তুমি আমার রুমের আলো, চ্যাটের সেরা লাইন, তোমায় ছাড়া জমে না আর এই আড্ডার টাইম"],
  ["a Bangla song", "হারিয়ে গেছি শহরের ভিড়ে, খুঁজি একটু ছায়া, গ্রামের বাড়ির উঠোন জুড়ে মায়ের হাতের মায়া"],
  ["a Bangla song", "ভোরের পাখি ডেকে বলে ওঠো এবার ভাই, নতুন দিনে নতুন আশা, থেমে থাকার নাই"],
  ["a Bangla song", "একলা পথে চলতে গিয়ে পেয়েছি তোদের সাথ, বন্ধু মানে হাসি কান্না, হাতে রাখা হাত"],
  ["a Bangla song", "সাগর পাড়ে ঢেউয়ের সাথে খেলি লুকোচুরি, বালির ওপর নাম লিখি, ঢেউ নেয় তা চুরি"],
  ["a Bangla song", "হৃদয় জুড়ে তোমার ছবি, চোখের পাতায় স্বপ্ন, তুমি পাশে থাকলে জীবন হয় যে সুসম্পন্ন"],
  ["a Bangla song", "গরম ভাতে ডাল আর আলু ভর্তা, মায়ের রান্না সেরা, পৃথিবীর সব খাবার হারে, এটাই আমার ঘেরা"],
  ["a Bangla song", "জ্যামে বসে গান শুনি, হর্ন বাজে চারপাশ, তবু মনে সুর বাজে, তুমিই আমার আকাশ"],
  ["a Bangla song", "আজ মনটা ভালো নেই, তবু হাসি মুখে, তোমার একটা কথা পেলে ব্যথা যায় যে চুকে"],
  ["a Bangla song", "চাঁদের আলোয় নদীর জলে রুপালি ঝিকিমিকি, তোমার কথা ভেবে আমি গানের খাতায় লিখি"],
  ["a Bangla song", "খেলার মাঠে গোল দিয়েছি, চিৎকারে ফাটে আকাশ, জিতে গেছি আজকে মোরা, পূর্ণ হলো আশ"],
  ["a Bangla song", "ঈদের চাঁদ উঠেছে আজ, খুশির হাওয়া বয়, সবার মুখে হাসি দেখে মনটা ভরে রয়"],
  ["a Bangla song", "পূজার ঢাকের বাদ্যি বাজে, আলোয় ভরা পাড়া, উৎসবের এই দিনগুলোতে সবাই আত্মহারা"],
  ["a Bangla song", "বর্ষা এলো কদম ফুলে, ভিজে গেল মাঠ, কাগজের নৌকা ভাসাই, পার হই যে ঘাট"],
  ["a Bangla song", "দূর প্রবাসে বসে থাকি, মনটা পড়ে দেশে, মায়ের ডাক শুনি যেন বাতাসেরই বেশে"],
  ["a Bangla song", "গিটার হাতে বসে আছি, সুরটা খুঁজে পাই, তোমার নামে নতুন গান আজকে আমি গাই"],
  ["a Bangla song", "ছোট্ট একটা স্বপ্ন আছে, বড় হবে একদিন, পরিশ্রমে জিতব আমি, শোধ হবে সব ঋণ"],
  ["a Bangla song", "শীতের সকাল কুয়াশা ঢাকা, খেজুর রসের হাঁড়ি, ভাপা পিঠার গন্ধে ভরে আমার গ্রামের বাড়ি"],
  ["a Bangla song", "তোমার চোখে আকাশ দেখি, তোমার কথায় গান, তুমি ছাড়া এই জীবনটা লাগে যে বেমান"],
  ["a Bangla song", "রুমে এসে সবাইকে জানাই হাসিমুখে সালাম, এই আড্ডার বন্ধুরা সব আমার প্রাণের দাম"],
  ["a Bangla song", "হাল ছেড়ো না বন্ধু আমার, ঝড় তো আসবেই, অন্ধকারের শেষে আবার সূর্য হাসবেই"],
  ["a Bangla song", "সন্ধ্যা নামে গ্রামের পথে, জোনাকিরা জ্বলে, ঝিঁঝিঁ পোকার গানের সাথে মনের কথা বলে"],
  ["a Bangla song", "বইয়ের পাতায় শুকনো ফুল, পুরোনো এক স্মৃতি, তোমায় নিয়ে লেখা আছে হাজার কবিতা গীতি"],
  ["a Bangla song", "নাচো সবাই তালে তালে, আজকে পার্টি রাতে, আনন্দেরই ঢেউ উঠুক সবার সাথে সাথে"],
  ["a Bangla song", "লাল সবুজের পতাকা উড়ে, বুকে ভরা গর্ব, এই দেশটা আমার মায়ের মতো, সবার সেরা পর্ব"],
  ["a Bangla song", "চুপি চুপি বলছি তোমায়, শোনো মনের কথা, তুমি এলে মুছে যায় সব দুঃখ আর ব্যথা"],
  ["a Bangla song", "ট্রেনের জানালায় মাথা রেখে দেখি সবুজ মাঠ, ছুটে চলে জীবন গাড়ি, পেরিয়ে হাজার ঘাট"],
  ["a Bangla song", "শেষ বিকেলের আলোয় রাঙা পদ্মার ঢেউ, এমন সুন্দর দেশটাকে ভালো না বাসে কেউ"],
  ["a Rabindra Sangeet", "যদি তোর ডাক শুনে কেউ না আসে তবে একলা চলো রে"],
  ["a Rabindra Sangeet", "আমারো পরানো যাহা চায়, তুমি তাই, তুমি তাই গো"],
  ["a Rabindra Sangeet", "পুরানো সেই দিনের কথা ভুলবি কি রে হায়"],
  ["a Rabindra Sangeet", "আকাশ ভরা সূর্য তারা, বিশ্বভরা প্রাণ"],
  ["a Rabindra Sangeet", "আমি চিনি গো চিনি তোমারে, ওগো বিদেশিনী"],
  ["a Rabindra Sangeet", "ভালোবাসি ভালোবাসি, এই সুরে কাছে দূরে জলে স্থলে বাজায় বাঁশি"],
  ["a Rabindra Sangeet", "আজি ঝর ঝর মুখর বাদর দিনে"],
  ["a Rabindra Sangeet", "মেঘের কোলে রোদ হেসেছে, বাদল গেছে টুটি"],
  ["a Rabindra Sangeet", "আমরা সবাই রাজা আমাদের এই রাজার রাজত্বে"],
  ["a Rabindra Sangeet", "ওরে গৃহবাসী খোল্‌ দ্বার খোল্‌, লাগল যে দোল"],
  ["a Rabindra Sangeet", "আমার মুক্তি আলোয় আলোয় এই আকাশে"],
  ["a Rabindra Sangeet", "তুমি রবে নীরবে হৃদয়ে মম"],
  ["a Rabindra Sangeet", "এসো হে বৈশাখ, এসো এসো"],
  ["a Rabindra Sangeet", "আলো আমার আলো ওগো আলোয় ভুবন ভরা"],
  ["a Rabindra Sangeet", "মম চিত্তে নিতি নৃত্যে কে যে নাচে, তাতা থৈথৈ"],
  ["a Rabindra Sangeet", "আমার হিয়ার মাঝে লুকিয়ে ছিলে দেখতে আমি পাইনি"],
  ["a Rabindra Sangeet", "আমি তোমার সঙ্গে বেঁধেছি আমার প্রাণ সুরের বাঁধনে"],
  ["a Rabindra Sangeet", "সখী, ভাবনা কাহারে বলে"],
  ["a Rabindra Sangeet", "আমার এই পথ চাওয়াতেই আনন্দ"],
  ["a Rabindra Sangeet", "গ্রাম ছাড়া ওই রাঙা মাটির পথ, আমার মন ভুলায় রে"],
  ["a Rabindra Sangeet", "যেতে যেতে একলা পথে নিবেছে মোর বাতি"],
  ["a Rabindra Sangeet", "মোর ভাবনারে কী হাওয়ায় মাতালো"],
  ["a Rabindra Sangeet", "আজ জ্যোৎস্নারাতে সবাই গেছে বনে"],
  ["a Rabindra Sangeet", "ও আমার দেশের মাটি, তোমার 'পরে ঠেকাই মাথা"],
  ["a Rabindra Sangeet", "ফাগুন হাওয়ায় হাওয়ায় করেছি যে দান"],
  ["a Rabindra Sangeet", "এই কথাটি মনে রেখো, তোমাদের এই হাসিখেলায়"],
  ["a Lalon geeti", "খাঁচার ভিতর অচিন পাখি কেমনে আসে যায়"],
  ["a Lalon geeti", "সব লোকে কয় লালন কী জাত সংসারে"],
  ["a Lalon geeti", "মিলন হবে কত দিনে, আমার মনের মানুষের সনে"],
  ["a Lalon geeti", "বাড়ির কাছে আরশিনগর, সেথা এক পড়শি বসত করে"],
  ["a Lalon geeti", "জাত গেল জাত গেল বলে, একি আজব কারখানা"],
  ["a Lalon geeti", "আমি অপার হয়ে বসে আছি, ওহে দয়াময়"],
  ["a Lalon geeti", "সময় গেলে সাধন হবে না"],
  ["a Hason Raja song", "লোকে বলে বলে রে, ঘর বাড়ি ভালা নায় আমার"],
  ["a Hason Raja song", "নিশা লাগিলো রে, বাঁকা দুই নয়নে নিশা লাগিলো রে"],
  ["a Hason Raja song", "মাটির পিঞ্জিরার মাঝে বন্দী হইয়া রে, কান্দে হাছন রাজার মন মনিয়া রে"],
  ["a Dwijendralal song", "ধনধান্য পুষ্প ভরা আমাদের এই বসুন্ধরা"],
  ["an Atulprasad song", "মোদের গরব, মোদের আশা, আ মরি বাংলা ভাষা"],
  ["a Rajanikanta song", "মায়ের দেওয়া মোটা কাপড় মাথায় তুলে নে রে ভাই"],
];

/** "life is singing a pop song, "…"" (or "… for sabuj, "…"") */
export function singLine(username: string, target: string): string {
  let kind: string, line: string;
  if (Math.random() < 0.5) [kind, line] = pickRandom(BANGLA_SONGS);
  else {
    const [genre, l] = pickRandom(SONGS);
    [kind, line] = [`a ${genre} song`, l];
  }
  const forWho = target && target !== "everyone" ? ` for ${target}` : "";
  return `${username} is singing ${kind}${forWho}, "${line}" 🎤`;
}

/**
 * Handles a "/" command. Returns true when the text was a known command (so it
 * is not posted as a normal chat line).
 */
export function handleRoomCommand(clean: string, ctx: CommandContext): boolean {
  const parts = clean.trim().split(/\s+/);
  const typed = (parts[0] || "").toLowerCase();
  const command = SOCIAL_ALIASES[typed] ?? typed;
  const target = (parts[1] || "").replace(/^@/, "").trim() || "everyone";
  const { username: u } = ctx;

  if (command === "/commands" || command === "/command" || command === "/help") {
    if (ctx.openCommands) ctx.openCommands();
    else ctx.note(HELP);
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

  // 🎤 a random song line (with a name: sung for them)
  if (command === "/sing") {
    ctx.post(`**${singLine(u, target)}**`, "social");
    return true;
  }

  if (SOCIAL[command]) {
    ctx.post(`**${SOCIAL[command](u, target)}**`, "social");
    return true;
  }

  // 📜 The extra fun commands (the app's RoomCommands.kt): /agree, /bearhug, /poetrybangla …
  const extra = extraSocialMessage(command, u, target);
  if (extra) {
    ctx.post(`**${extra}**`, "social");
    return true;
  }

  if (command === "/pick") {
    const code = clean.trim().slice(5).trim();
    if (!code) {
      ctx.note(`${u}: Usage: /pick [code]`);
      return true;
    }
    // The result is shown only to the picker, in a popup (like the app).
    const show = (title: string, text: string) => (ctx.popup ? ctx.popup(title, text) : ctx.note(`${title}\n${text}`));
    pickVoucher({ roomId: ctx.roomName, code })
      .then(({ data }) => show("🎉 You Won!", `You picked the Lucky Voucher and won ${Number(data?.amount || 0).toLocaleString()} coins!`))
      .catch((err: any) => {
        const msg = String(err?.message || "Could not claim that voucher.");
        const title = /already picked/i.test(msg) ? "😢 Already Claimed" : /expired/i.test(msg) ? "⏰ Time's Up" : /doesn't match/i.test(msg) ? "❌ Wrong Code" : "🎁 Voucher";
        show(title, msg);
      });
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

  // Friend request: /f <MIG ID> (the old /fr still works too) · unfriend: /uf <MIG ID>
  if (command === "/f" || command === "/fr" || command === "/uf") {
    const who = (parts[1] || "").replace(/^@/, "").trim();
    if (!who) {
      ctx.note(command === "/uf" ? "💔 Usage: /uf username — remove a friend" : "🤝 Usage: /f username — send a friend request");
      return true;
    }
    if (who.toLowerCase() !== u.toLowerCase()) {
      if (command === "/uf") unfriend(ctx, who);
      else sendFriendRequest(ctx, who);
    }
    return true;
  }

  // 🏷 /checktag username — is this user tagged (Merchant or Mentor)? Only you see the answer.
  if (command === "/checktag") {
    const who = (parts[1] || "").replace(/^@/, "").trim();
    if (!who) {
      ctx.note("ℹ Use /checktag [username] — e.g. /checktag sailor");
      return true;
    }
    checkUserTag({ username: who })
      .then(({ data }) => {
        const name = String(data?.username || "").trim() || who;
        // the merchant's mentor (mentor_indirect) is not a direct tag
        const tagged = (data?.tags || []).some((t) => t?.kind === "merchant" || t?.kind === "mentor");
        const text = tagged ? `${name} is already tagged.` : `${name} is not tagged.`;
        if (ctx.popup) ctx.popup("🏷 Tag Check", text);
        else ctx.note(`🏷 ${text}`);
      })
      .catch((err: any) => ctx.note(`❌ /checktag: ${err?.message || "User not found."}`));
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
        if (ctx.showWhois && data) {
          ctx.showWhois(data);
          return;
        }
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
