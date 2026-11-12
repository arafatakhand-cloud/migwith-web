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
export function parseFeel(clean: string): { feeling: Feeling | null; target: string; note: string } {
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
    const f: Feeling | null = !feeling ? feelingOf(w) : null;
    if (f) feeling = f;
    else rest.push(w);
  }
  return { feeling, target: (rest[0] || "").replace(/^@/, ""), note };
}

export const FEEL_USAGE =
  "💭 Usage: /feel [name] feeling [-m message] — e.g. /feel miglife sad -m Sorry for that\n" +
  "Feelings: " + ROOM_FEELINGS.map((f) => `${f.emoji} ${f.label.toLowerCase().replace(/ /g, "")}`).join(" · ");
