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
