import { httpsCallable } from "firebase/functions";
import { functions } from "./firebase";

// 💭 /feel [name] feeling [-m message] → "<<vip [50] feels 😢 Sad with miglife [44]!>> — "message""
// (the same list as the app's RoomCommands.kt; the key is what people type)

export type Feeling = { key: string; emoji: string; label: string };

export const ROOM_FEELINGS: Feeling[] = [
  { key: "happy", emoji: "😊", label: "Happy" },
  { key: "sad", emoji: "😢", label: "Sad" },
  { key: "loved", emoji: "😍", label: "Loved" },
  { key: "angry", emoji: "😡", label: "Angry" },
  { key: "excited", emoji: "🥳", label: "Excited" },
  { key: "sleepy", emoji: "😴", label: "Sleepy" },
  { key: "sick", emoji: "🤒", label: "Sick" },
  { key: "lonely", emoji: "😔", label: "Lonely" },
  { key: "thankful", emoji: "🙏", label: "Thankful" },
  { key: "cool", emoji: "😎", label: "Cool" },
  { key: "funny", emoji: "😂", label: "Funny" },
  { key: "heartbroken", emoji: "💔", label: "Heartbroken" },
  { key: "missingyou", emoji: "🥺", label: "Missing you" },
  { key: "proud", emoji: "🥹", label: "Proud" },
  { key: "blessed", emoji: "😇", label: "Blessed" },
  { key: "shy", emoji: "😳", label: "Shy" },
  { key: "surprised", emoji: "😲", label: "Surprised" },
  { key: "confused", emoji: "😕", label: "Confused" },
  { key: "worried", emoji: "😟", label: "Worried" },
  { key: "nervous", emoji: "😬", label: "Nervous" },
  { key: "bored", emoji: "😑", label: "Bored" },
  { key: "hungry", emoji: "😋", label: "Hungry" },
  { key: "relaxed", emoji: "😌", label: "Relaxed" },
  { key: "crazy", emoji: "🤪", label: "Crazy" },
  { key: "motivated", emoji: "💪", label: "Motivated" },
  { key: "hopeful", emoji: "🤞", label: "Hopeful" },
  { key: "peaceful", emoji: "🕊️", label: "Peaceful" },
  { key: "jealous", emoji: "😒", label: "Jealous" },
  { key: "sorry", emoji: "🙇", label: "Sorry" },
  { key: "lucky", emoji: "🍀", label: "Lucky" },
];

// other words people may type for the same feeling
const ALIASES: Record<string, string> = {
  love: "loved", happiness: "happy", sadness: "sad", upset: "sad", mad: "angry", tired: "sleepy", ill: "sick",
  alone: "lonely", thanks: "thankful", grateful: "thankful", lol: "funny", broken: "heartbroken",
  missing: "missingyou", miss: "missingyou",
  shocked: "surprised", wow: "surprised", scared: "worried", anxious: "nervous", chill: "relaxed", calm: "peaceful", strong: "motivated", hope: "hopeful", envy: "jealous", apologetic: "sorry",
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
// 💭 Feel Gallery (the "feel" server function): the live list miGlife manages,
// and sending a feeling — 5 coins, the server writes the room line.
// ---------------------------------------------------------------------------

export type CatalogFeel = { id: string; label: string; emoji: string; imageUrl: string; price: number; sortOrder: number; active: boolean };

const feelCall = httpsCallable<Record<string, unknown>, Record<string, unknown>>(functions, "feel");
let listCache: Promise<CatalogFeel[]> | null = null;

/** The feelings (miGlife's list; the starter 30 until it changes one). */
export function loadFeelings(fresh = false): Promise<CatalogFeel[]> {
  if (!listCache || fresh)
    listCache = feelCall({ action: "list" })
      .then((r) => ((r.data as { feelings?: CatalogFeel[] }).feelings || []))
      .catch(() => {
        listCache = null;
        return ROOM_FEELINGS.map((f, i) => ({ id: f.key, label: f.label, emoji: f.emoji, imageUrl: "", price: 5, sortOrder: i, active: true }));
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
