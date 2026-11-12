import { httpsCallable } from "firebase/functions";
import { functions } from "./firebase";

// 💭 /feel [name] feeling [-m message] → "<<vip [50] feels 😢 Sad with miglife [44]!>> — "message""
// (the same list as the app's RoomCommands.kt; the key is what people type)

export type Feeling = { key: string; emoji: string; label: string; category?: string };

/** the groups shown as tabs in FeelMig */
export const FEEL_CATEGORIES = ["Happy", "Love", "Sad", "Angry", "Fear", "Surprise", "Shy", "Body", "Faith"];

export const ROOM_FEELINGS: Feeling[] = [
  { key: "happy", emoji: "😊", label: "Happy", category: "Happy" },
  { key: "joyful", emoji: "😄", label: "Joyful", category: "Happy" },
  { key: "cheerful", emoji: "😁", label: "Cheerful", category: "Happy" },
  { key: "excited", emoji: "🥳", label: "Excited", category: "Happy" },
  { key: "thankful", emoji: "🙏", label: "Thankful", category: "Happy" },
  { key: "grateful", emoji: "🤲", label: "Grateful", category: "Happy" },
  { key: "proud", emoji: "🥹", label: "Proud", category: "Happy" },
  { key: "blessed", emoji: "😇", label: "Blessed", category: "Happy" },
  { key: "peaceful", emoji: "🕊️", label: "Peaceful", category: "Happy" },
  { key: "relaxed", emoji: "😌", label: "Relaxed", category: "Happy" },
  { key: "content", emoji: "☺️", label: "Content", category: "Happy" },
  { key: "hopeful", emoji: "🤞", label: "Hopeful", category: "Happy" },
  { key: "optimistic", emoji: "🌤️", label: "Optimistic", category: "Happy" },
  { key: "playful", emoji: "😜", label: "Playful", category: "Happy" },
  { key: "crazy", emoji: "🤪", label: "Crazy", category: "Happy" },
  { key: "funny", emoji: "😂", label: "Funny", category: "Happy" },
  { key: "lucky", emoji: "🍀", label: "Lucky", category: "Happy" },
  { key: "cool", emoji: "😎", label: "Cool", category: "Happy" },
  { key: "confident", emoji: "💯", label: "Confident", category: "Happy" },
  { key: "inspired", emoji: "💡", label: "Inspired", category: "Happy" },
  { key: "motivated", emoji: "💪", label: "Motivated", category: "Happy" },
  { key: "energetic", emoji: "⚡", label: "Energetic", category: "Happy" },
  { key: "determined", emoji: "😤", label: "Determined", category: "Happy" },
  { key: "celebrating", emoji: "🎉", label: "Celebrating", category: "Happy" },
  { key: "festive", emoji: "🎊", label: "Festive", category: "Happy" },
  { key: "satisfied", emoji: "😋", label: "Satisfied", category: "Happy" },
  { key: "loved", emoji: "😍", label: "Loved", category: "Love" },
  { key: "romantic", emoji: "🥰", label: "Romantic", category: "Love" },
  { key: "inlove", emoji: "💘", label: "In love", category: "Love" },
  { key: "affectionate", emoji: "😘", label: "Affectionate", category: "Love" },
  { key: "caring", emoji: "🤗", label: "Caring", category: "Love" },
  { key: "friendly", emoji: "🤝", label: "Friendly", category: "Love" },
  { key: "missingyou", emoji: "🥺", label: "Missing you", category: "Love" },
  { key: "cared", emoji: "💞", label: "Cared for", category: "Love" },
  { key: "sad", emoji: "😢", label: "Sad", category: "Sad" },
  { key: "crying", emoji: "😭", label: "Crying", category: "Sad" },
  { key: "heartbroken", emoji: "💔", label: "Heartbroken", category: "Sad" },
  { key: "lonely", emoji: "😔", label: "Lonely", category: "Sad" },
  { key: "hurt", emoji: "🤕", label: "Hurt", category: "Sad" },
  { key: "disappointed", emoji: "😞", label: "Disappointed", category: "Sad" },
  { key: "down", emoji: "😩", label: "Down", category: "Sad" },
  { key: "gloomy", emoji: "🌧️", label: "Gloomy", category: "Sad" },
  { key: "nostalgic", emoji: "🥲", label: "Nostalgic", category: "Sad" },
  { key: "homesick", emoji: "🏠", label: "Homesick", category: "Sad" },
  { key: "sorry", emoji: "🙇", label: "Sorry", category: "Sad" },
  { key: "regretful", emoji: "😓", label: "Regretful", category: "Sad" },
  { key: "empty", emoji: "😶‍🌫️", label: "Empty", category: "Sad" },
  { key: "angry", emoji: "😡", label: "Angry", category: "Angry" },
  { key: "furious", emoji: "🤬", label: "Furious", category: "Angry" },
  { key: "annoyed", emoji: "😒", label: "Annoyed", category: "Angry" },
  { key: "irritated", emoji: "🙄", label: "Irritated", category: "Angry" },
  { key: "frustrated", emoji: "😫", label: "Frustrated", category: "Angry" },
  { key: "jealous", emoji: "😾", label: "Jealous", category: "Angry" },
  { key: "grumpy", emoji: "😠", label: "Grumpy", category: "Angry" },
  { key: "offended", emoji: "😑", label: "Offended", category: "Angry" },
  { key: "scared", emoji: "😨", label: "Scared", category: "Fear" },
  { key: "shocked", emoji: "😱", label: "Shocked", category: "Fear" },
  { key: "worried", emoji: "😟", label: "Worried", category: "Fear" },
  { key: "nervous", emoji: "😬", label: "Nervous", category: "Fear" },
  { key: "anxious", emoji: "😰", label: "Anxious", category: "Fear" },
  { key: "insecure", emoji: "😥", label: "Insecure", category: "Fear" },
  { key: "overwhelmed", emoji: "🫠", label: "Overwhelmed", category: "Fear" },
  { key: "panicked", emoji: "😵", label: "Panicked", category: "Fear" },
  { key: "surprised", emoji: "😲", label: "Surprised", category: "Surprise" },
  { key: "amazed", emoji: "🤩", label: "Amazed", category: "Surprise" },
  { key: "speechless", emoji: "😶", label: "Speechless", category: "Surprise" },
  { key: "confused", emoji: "😕", label: "Confused", category: "Surprise" },
  { key: "curious", emoji: "🧐", label: "Curious", category: "Surprise" },
  { key: "thoughtful", emoji: "🤔", label: "Thoughtful", category: "Surprise" },
  { key: "mindblown", emoji: "🤯", label: "Mind blown", category: "Surprise" },
  { key: "shy", emoji: "😳", label: "Shy", category: "Shy" },
  { key: "embarrassed", emoji: "😅", label: "Embarrassed", category: "Shy" },
  { key: "ashamed", emoji: "🫣", label: "Ashamed", category: "Shy" },
  { key: "guilty", emoji: "😣", label: "Guilty", category: "Shy" },
  { key: "awkward", emoji: "🙃", label: "Awkward", category: "Shy" },
  { key: "sleepy", emoji: "😴", label: "Sleepy", category: "Body" },
  { key: "tired", emoji: "🥱", label: "Tired", category: "Body" },
  { key: "exhausted", emoji: "😪", label: "Exhausted", category: "Body" },
  { key: "sick", emoji: "🤒", label: "Sick", category: "Body" },
  { key: "hungry", emoji: "🍔", label: "Hungry", category: "Body" },
  { key: "cold", emoji: "🥶", label: "Cold", category: "Body" },
  { key: "hot", emoji: "🥵", label: "Hot", category: "Body" },
  { key: "dizzy", emoji: "😵‍💫", label: "Dizzy", category: "Body" },
  { key: "bored", emoji: "🫥", label: "Bored", category: "Body" },
  { key: "prayerful", emoji: "📿", label: "Prayerful", category: "Faith" },
  { key: "ramadanmubarak", emoji: "🌙", label: "Ramadan Mubarak", category: "Faith" },
  { key: "eidmubarak", emoji: "🕌", label: "Eid Mubarak", category: "Faith" },
  { key: "alhamdulillah", emoji: "☝️", label: "Alhamdulillah", category: "Faith" },
];

// other words people may type for the same feeling
const ALIASES: Record<string, string> = {
  love: "loved",
  happiness: "happy",
  joy: "joyful",
  sadness: "sad",
  upset: "sad",
  mad: "angry",
  rage: "furious",
  ill: "sick",
  alone: "lonely",
  thanks: "thankful",
  lol: "funny",
  broken: "heartbroken",
  missing: "missingyou",
  miss: "missingyou",
  wow: "amazed",
  chill: "relaxed",
  calm: "peaceful",
  strong: "motivated",
  hope: "hopeful",
  envy: "jealous",
  apologetic: "sorry",
  afraid: "scared",
  fear: "scared",
  cry: "crying",
  sorrow: "sad",
  depressed: "down",
  fine: "content",
  party: "celebrating",
  pray: "prayerful",
  ramadan: "ramadanmubarak",
  eid: "eidmubarak",
  thinking: "thoughtful",
  shame: "ashamed",
};

export function feelingOf(word: string): Feeling | null {
  const k = word.toLowerCase().replace(/[^a-z]/g, "");
  const key = ALIASES[k] || k;
  return ROOM_FEELINGS.find((f) => f.key === key) || null;
}

/** "/feel miglife sad -m Sorry" → { feeling, target: "miglife", note: "Sorry" } (null feeling = not understood). */
export function parseFeel(clean: string, list?: CatalogFeel[]): { feeling: Feeling | null; target: string; note: string } {
  const parts = clean.trim().split(/\s+/).slice(1);
  const m = parts.findIndex((w) => w.toLowerCase() === "-m");
  const words = (m >= 0 ? parts.slice(0, m) : parts).filter(Boolean);
  const note = m >= 0 ? parts.slice(m + 1).join(" ").trim().slice(0, 200) : "";
  let feeling: Feeling | null = null;
  const rest: string[] = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    // "missing you" is two words
    if (!feeling && /^miss(ing)?$/i.test(w) && words[i + 1]?.toLowerCase() === "you") {
      feeling = feelingOf("missingyou");
      i++;
      continue;
    }
    const c: CatalogFeel | null = !feeling && list ? matchFeeling(w, list) : null;
    const f: Feeling | null = !feeling ? (c ? { key: c.id, emoji: c.emoji, label: c.label } : list ? null : feelingOf(w)) : null;
    if (f) feeling = f;
    else rest.push(w);
  }
  return { feeling, target: (rest[0] || "").replace(/^@/, ""), note };
}

export function feelUsage(list?: { emoji: string; label: string }[]): string {
  const all = list && list.length ? list : ROOM_FEELINGS;
  return (
    "💭 Usage: /feel [name] feeling [-m message] — 5 coins — e.g. /feel miglife sad -m Sorry for that\n" +
    "Feelings: " + all.map((f) => `${f.emoji} ${f.label.toLowerCase().replace(/ /g, "")}`).join(" · ")
  );
}

// ---------------------------------------------------------------------------
// 💭 FeelMig (the "feel" server function): the live list miGlife manages,
// and sending a feeling — 5 coins, the server writes the room line.
// ---------------------------------------------------------------------------

export type CatalogFeel = { id: string; label: string; emoji: string; category?: string; imageUrl: string; price: number; sortOrder: number; active: boolean };

const feelCall = httpsCallable<Record<string, unknown>, Record<string, unknown>>(functions, "feel");
let listCache: Promise<CatalogFeel[]> | null = null;

/** The feelings (miGlife's list; the starter 30 until it changes one). */
export function loadFeelings(fresh = false): Promise<CatalogFeel[]> {
  if (!listCache || fresh)
    listCache = feelCall({ action: "list" })
      .then((r) => ((r.data as { feelings?: CatalogFeel[] }).feelings || []))
      .catch(() => {
        listCache = null;
        return ROOM_FEELINGS.map((f, i) => ({ id: f.key, label: f.label, emoji: f.emoji, category: f.category, imageUrl: "", price: 5, sortOrder: i, active: true }));
      });
  return listCache;
}

/** For miGlife's editor: every feeling (hidden ones too) and whether I may change them. */
export async function loadFeelingsToManage(): Promise<{ manager: boolean; feelings: CatalogFeel[] }> {
  const r = await feelCall({ action: "list", manage: true });
  return r.data as { manager: boolean; feelings: CatalogFeel[] };
}

/** A typed word → the feeling in the live list (or the starter list's aliases). */
export function matchFeeling(word: string, list: CatalogFeel[]): CatalogFeel | null {
  const k = word.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!k) return null;
  const byKey = list.find((f) => f.id === k || f.label.toLowerCase().replace(/[^a-z0-9]/g, "") === k);
  if (byKey) return byKey;
  const starter = feelingOf(word);
  return starter ? list.find((f) => f.id === starter.key) || null : null;
}

export async function sendFeel(roomId: string, feeling: string, target: string, message: string) {
  await feelCall({ action: "send", roomId, feeling, target, message });
}

export async function manageFeel(data: Record<string, unknown>): Promise<{ ok: boolean; url?: string }> {
  const r = await feelCall(data);
  return r.data as { ok: boolean; url?: string };
}
