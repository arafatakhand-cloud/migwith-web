import { httpsCallable } from "firebase/functions";
import { functions } from "./firebase";

// 🔊 SoundMig (the "soundmig" server function): short sounds played in a room.
// The coins all go to the house. The room line is type "sound" with soundUrl.

export type Sound = { id: string; emoji: string; name: string; group: string; seconds: number; price: number; url: string; active: boolean; order: number };

export const SOUND_GROUPS: [string, string][] = [
  ["fun", "😂 Fun"],
  ["love", "💕 Love"],
  ["party", "🎉 Party"],
  ["royal", "👑 Royal"],
];

const call = httpsCallable<Record<string, unknown>, Record<string, unknown>>(functions, "soundmig");

export async function loadSounds(): Promise<{ manager: boolean; sounds: Sound[] }> {
  const r = await call({ action: "list", manage: true });
  return r.data as { manager: boolean; sounds: Sound[] };
}

export async function playSound(roomId: string, soundId: string) {
  await call({ action: "play", roomId, soundId });
}

export async function manageSound(data: Record<string, unknown>): Promise<{ ok: boolean; url?: string }> {
  const r = await call(data);
  return r.data as { ok: boolean; url?: string };
}

// ---- playing (one at a time) + this browser's 🔊 / 🔇 choice ----
let current: HTMLAudioElement | null = null;
const played = new Set<string>();

export function soundsMuted(): boolean {
  try {
    return localStorage.getItem("mig_sound_muted") === "1";
  } catch {
    return false;
  }
}

export function setSoundsMuted(on: boolean) {
  try {
    localStorage.setItem("mig_sound_muted", on ? "1" : "0");
  } catch {}
  if (on) stopSound();
}

export function stopSound() {
  if (current) {
    current.pause();
    current = null;
  }
}

export function previewSound(url: string) {
  if (!url) return;
  stopSound();
  const a = new Audio(url);
  current = a;
  a.play().catch(() => {});
}

/** A new room line of type "sound": play it once if fresh (last 20 s) and sounds are on. */
export function onRoomSoundLine(id: string, url: string, createdAtMs: number) {
  if (!id || played.has(id)) return;
  played.add(id);
  if (!createdAtMs || Date.now() - createdAtMs > 20_000) return;
  if (soundsMuted()) return;
  previewSound(url);
}

// 🎵 20 starter sounds made for miGlife (original, no outside music) in /public/sounds/starter.
// Secret → Manage Sounds / SoundMig admin: "Add 20 starter sounds" uploads them all once.
export const STARTER_SOUNDS: { file: string; emoji: string; name: string; group: string; seconds: number; price: number }[] = [
  { file: "boing", emoji: "🤸", name: "Boing", group: "fun", seconds: 1, price: 0 },
  { file: "badum_tss", emoji: "🥁", name: "Ba-dum Tss", group: "fun", seconds: 2, price: 20 },
  { file: "sad_wah", emoji: "😢", name: "Sad Wah Wah", group: "fun", seconds: 3, price: 20 },
  { file: "pop", emoji: "🫧", name: "Pop Pop", group: "fun", seconds: 1, price: 0 },
  { file: "crickets", emoji: "🦗", name: "Crickets", group: "fun", seconds: 3, price: 20 },
  { file: "heartbeat", emoji: "💓", name: "Heartbeat", group: "love", seconds: 2, price: 30 },
  { file: "kiss", emoji: "💋", name: "Kiss Kiss", group: "love", seconds: 1, price: 30 },
  { file: "sparkle", emoji: "✨", name: "Magic Sparkle", group: "love", seconds: 2, price: 30 },
  { file: "music_box", emoji: "💕", name: "Music Box", group: "love", seconds: 3, price: 30 },
  { file: "wedding_bells", emoji: "🔔", name: "Wedding Bells", group: "love", seconds: 4, price: 50 },
  { file: "party_horn", emoji: "🎉", name: "Party Horn", group: "party", seconds: 1, price: 20 },
  { file: "applause", emoji: "👏", name: "Applause", group: "party", seconds: 3, price: 20 },
  { file: "air_horn", emoji: "📯", name: "Air Horn", group: "party", seconds: 2, price: 30 },
  { file: "level_up", emoji: "⬆️", name: "Level Up", group: "party", seconds: 1, price: 20 },
  { file: "disco_beat", emoji: "🪩", name: "Disco Beat", group: "party", seconds: 3, price: 30 },
  { file: "royal_fanfare", emoji: "👑", name: "Royal Fanfare", group: "royal", seconds: 3, price: 100 },
  { file: "ka_ching", emoji: "💰", name: "Ka-ching", group: "royal", seconds: 1, price: 50 },
  { file: "gong", emoji: "🥇", name: "Big Gong", group: "royal", seconds: 3, price: 100 },
  { file: "crown_chime", emoji: "👸", name: "Crown Chime", group: "royal", seconds: 3, price: 100 },
  { file: "victory", emoji: "🏆", name: "Victory", group: "royal", seconds: 4, price: 100 },
];

/** uploads the starter sounds not already in the list (by name); returns how many were added */
export async function addStarterSounds(have: string[], onStep?: (done: number, total: number) => void): Promise<number> {
  const names = new Set(have.map((n) => n.trim().toLowerCase()));
  const todo = STARTER_SOUNDS.filter((s) => !names.has(s.name.toLowerCase()));
  let done = 0;
  for (const [i, s] of todo.entries()) {
    const blob = await (await fetch(`/sounds/starter/${s.file}.mp3`)).blob();
    const base64 = await new Promise<string>((ok, bad) => {
      const r = new FileReader();
      r.onload = () => ok(String(r.result).split(",")[1] || "");
      r.onerror = () => bad(r.error);
      r.readAsDataURL(blob);
    });
    const up = await manageSound({ action: "upload", contentType: "audio/mpeg", fileBase64: base64 });
    if (!up.url) continue;
    const { file: _file, ...rest } = s;
    void _file;
    await manageSound({ action: "save", sound: { ...rest, url: up.url, active: true, order: 100 + STARTER_SOUNDS.indexOf(s) } });
    done++;
    onStep?.(i + 1, todo.length);
  }
  return done;
}
