// 🎵 Profile Theme Songs — short (~15 s) tunes that play when someone opens
// your profile. Every tune is miGlife's own: notes played by the device
// (Web Audio here, the same note lists in the app), no music files, no
// copyright.

export type SongNote = [note: string, beats: number]; // "C5", "E4+G4" (chord), "-" (rest)
export type ProfileSong = {
  id: string;
  name: string;
  emoji: string;
  mood: string;
  price: number;
  bpm: number;
  voice: "trumpet" | "bell" | "soft" | "piano" | "chip" | "pluck";
  colors: [string, string];
  notes: SongNote[];
};

export const PROFILE_SONGS: ProfileSong[] = [
  {
    id: "royal", name: "Royal Fanfare", emoji: "👑", mood: "Grand entrance", price: 150000, bpm: 132, voice: "trumpet",
    colors: ["#F5C542", "#B07A06"],
    notes: [["G4", 0.5], ["C5", 0.5], ["E5", 0.5], ["G5", 1.5], ["E5", 0.5], ["G5", 1.5], ["A5", 0.5], ["G5", 0.5], ["F5", 0.5], ["E5", 0.5], ["D5", 0.5], ["E5", 0.5], ["C5", 2], ["G4", 0.5], ["C5", 0.5], ["E5", 0.5], ["G5", 1], ["A5", 0.5], ["B5", 0.5], ["C6", 1.5], ["B5", 0.5], ["A5", 0.5], ["G5", 0.5], ["F5", 0.5], ["E5", 1], ["D5", 1], ["C5+E5", 1], ["D5+F5", 1], ["E5+G5", 1], ["F5+A5", 1], ["G5+B5", 1], ["A5+C6", 1], ["G5+B5+D6", 1], ["C5+E5+G5+C6", 6]],
  },
  {
    id: "bells", name: "Happy Bells", emoji: "🔔", mood: "Bright & cheerful", price: 100000, bpm: 150, voice: "bell",
    colors: ["#5aa2ff", "#1565D8"],
    notes: [["E6", 0.5], ["G6", 0.5], ["C7", 1], ["B6", 0.5], ["G6", 0.5], ["A6", 1], ["G6", 0.5], ["E6", 0.5], ["F6", 0.5], ["D6", 0.5], ["C6", 2], ["E6", 0.5], ["G6", 0.5], ["C7", 1], ["D7", 0.5], ["C7", 0.5], ["B6", 1], ["A6", 0.5], ["B6", 0.5], ["C7", 0.5], ["A6", 0.5], ["G6", 2], ["F6", 0.5], ["A6", 0.5], ["C7", 1], ["B6", 0.5], ["A6", 0.5], ["G6", 1], ["E6", 0.5], ["G6", 0.5], ["E6", 0.5], ["D6", 0.5], ["C6", 2], ["C6", 0.5], ["E6", 0.5], ["G6", 0.5], ["C7", 0.5], ["E7", 1], ["D7", 1], ["C7+E7", 1], ["G6", 0.5], ["E6", 0.5], ["C6+E6+G6+C7", 4]],
  },
  {
    id: "lofi", name: "Lo-fi Night", emoji: "🌙", mood: "Calm & chill", price: 120000, bpm: 84, voice: "soft",
    colors: ["#8B4DFF", "#4B1BA8"],
    notes: [["A3+C4+E4", 1], ["E5", 0.5], ["C5", 0.5], ["F3+A3+C4", 1], ["D5", 0.5], ["A4", 0.5], ["C4+E4+G4", 1], ["E5", 0.5], ["G5", 0.5], ["G3+B3+D4", 1], ["D5", 1], ["A3+C4+E4", 1], ["C5", 0.5], ["E5", 0.5], ["F3+A3+C4", 1], ["A5", 0.5], ["G5", 0.5], ["C4+E4+G4", 1], ["E5", 1], ["G3+B3+D4", 1], ["B4", 0.5], ["D5", 0.5], ["F3+A3+C4+E5", 2], ["A3+C4+E4+A4", 3]],
  },
  {
    id: "love", name: "Love Piano", emoji: "💖", mood: "Sweet & romantic", price: 140000, bpm: 96, voice: "piano",
    colors: ["#FF5FA8", "#C21E6E"],
    notes: [["C5", 0.5], ["E5", 0.5], ["G5", 1], ["A5", 0.5], ["G5", 0.5], ["E5", 1], ["F5", 0.5], ["E5", 0.5], ["D5", 0.5], ["E5", 0.5], ["C5", 2], ["E5", 0.5], ["G5", 0.5], ["C6", 1], ["B5", 0.5], ["A5", 0.5], ["G5", 1], ["A5", 0.5], ["G5", 0.5], ["F5", 0.5], ["E5", 0.5], ["D5", 2], ["C5", 0.5], ["E5", 0.5], ["G5", 0.5], ["C6", 0.5], ["B5", 1], ["G5", 1], ["A5", 1], ["F5+A5", 1], ["C4+E4+G4+C5+E5", 3]],
  },
  {
    id: "victory", name: "Victory", emoji: "🏆", mood: "Gamer win", price: 130000, bpm: 168, voice: "chip",
    colors: ["#2FC46B", "#0E7A3E"],
    notes: [["C5", 0.33], ["C5", 0.33], ["C5", 0.33], ["C5", 1], ["G#4", 1], ["A#4", 1], ["C5", 0.66], ["A#4", 0.33], ["C5", 2], ["G5", 0.5], ["F5", 0.5], ["D#5", 0.5], ["F5", 0.5], ["G5", 1], ["D#5", 0.5], ["C5", 0.5], ["D#5", 1], ["F5", 0.5], ["D#5", 0.5], ["D5", 0.5], ["D#5", 0.5], ["F5", 1], ["D5", 0.5], ["A#4", 0.5], ["C5", 2], ["C5", 0.33], ["C5", 0.33], ["C5", 0.33], ["C5", 1], ["G#4", 1], ["A#4", 1], ["C5", 0.66], ["A#4", 0.33], ["C5", 2], ["G5", 0.5], ["A#5", 0.5], ["C6", 1], ["A#5", 0.5], ["G5", 0.5], ["D#5", 1], ["F5", 0.5], ["G5", 0.5], ["C6", 3], ["C5", 0.33], ["D#5", 0.33], ["G5", 0.33], ["C6", 2], ["C5+D#5+G5+C6", 4]],
  },
  {
    id: "ektara", name: "Ektara Folk", emoji: "🪕", mood: "Desi folk vibe", price: 160000, bpm: 120, voice: "pluck",
    colors: ["#FF8A3D", "#C2410C"],
    notes: [["D5", 0.5], ["E5", 0.5], ["G5", 0.5], ["A5", 0.5], ["G5", 0.5], ["E5", 0.5], ["D5", 1], ["A4", 0.5], ["D5", 0.5], ["E5", 0.5], ["D5", 0.5], ["B4", 1], ["A4", 1], ["D5", 0.5], ["E5", 0.5], ["G5", 0.5], ["A5", 0.5], ["B5", 0.5], ["A5", 0.5], ["G5", 1], ["A5", 0.5], ["B5", 0.5], ["A5", 0.5], ["G5", 0.5], ["E5", 1], ["D5", 1], ["G5", 0.5], ["G5", 0.5], ["A5", 0.5], ["G5", 0.5], ["E5", 0.5], ["D5", 0.5], ["E5", 1], ["D5", 0.5], ["E5", 0.5], ["G5", 0.5], ["E5", 0.5], ["D5", 0.5], ["B4", 0.5], ["A4", 1], ["D5", 0.5], ["E5", 0.5], ["D5", 0.5], ["A4", 0.5], ["D5", 4]],
  },
];

const NOTE_INDEX: Record<string, number> = { C: 0, "C#": 1, D: 2, "D#": 3, E: 4, F: 5, "F#": 6, G: 7, "G#": 8, A: 9, "A#": 10, B: 11 };
function freqOf(note: string): number {
  const m = /^([A-G]#?)(\d)$/.exec(note);
  if (!m) return 0;
  const midi = (Number(m[2]) + 1) * 12 + NOTE_INDEX[m[1]];
  return 440 * Math.pow(2, (midi - 69) / 12);
}

let ctx: AudioContext | null = null;
let stopCurrent: (() => void) | null = null;

/** Plays a song (stops the one playing). Returns how long it lasts (ms). */
export function playProfileSong(song: ProfileSong): number {
  if (typeof window === "undefined") return 0;
  stopProfileSong();
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AC) return 0;
  ctx = ctx || new AC();
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  const ac = ctx;
  const master = ac.createGain();
  master.gain.value = 0.22;
  master.connect(ac.destination);
  const beat = 60 / song.bpm;
  let t = ac.currentTime + 0.05;
  const nodes: OscillatorNode[] = [];
  for (const [note, beats] of song.notes) {
    const dur = beats * beat;
    if (note !== "-") {
      for (const n of note.split("+")) {
        const f = freqOf(n);
        if (!f) continue;
        const osc = ac.createOscillator();
        const g = ac.createGain();
        const v = song.voice;
        osc.type = v === "trumpet" ? "sawtooth" : v === "chip" ? "square" : v === "pluck" ? "sawtooth" : v === "soft" ? "triangle" : "sine";
        osc.frequency.value = f;
        let out: AudioNode = g;
        if (v === "trumpet" || v === "pluck") {
          const lp = ac.createBiquadFilter();
          lp.type = "lowpass";
          lp.frequency.value = v === "pluck" ? 2200 : 1800;
          g.connect(lp);
          out = lp;
        }
        out.connect(master);
        osc.connect(g);
        const peak = (v === "chip" ? 0.35 : v === "bell" ? 0.6 : 0.5) / Math.sqrt(note.split("+").length);
        const decay = v === "bell" ? Math.max(dur, 0.9) : v === "pluck" ? Math.min(dur, 0.35) : v === "piano" ? Math.max(dur, 0.6) : dur;
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(peak, t + (v === "soft" ? 0.08 : 0.012));
        if (v === "trumpet" || v === "chip" || v === "soft") {
          g.gain.setValueAtTime(peak * 0.85, t + Math.max(0.02, dur - 0.06));
          g.gain.linearRampToValueAtTime(0, t + dur);
        } else {
          g.gain.exponentialRampToValueAtTime(0.0008, t + decay);
        }
        osc.start(t);
        osc.stop(t + decay + 0.05);
        nodes.push(osc);
      }
    }
    t += dur;
  }
  const total = (t - ac.currentTime) * 1000;
  stopCurrent = () => {
    nodes.forEach((o) => {
      try { o.stop(); } catch {}
    });
    master.disconnect();
  };
  return total;
}

export function stopProfileSong() {
  if (stopCurrent) stopCurrent();
  stopCurrent = null;
}
