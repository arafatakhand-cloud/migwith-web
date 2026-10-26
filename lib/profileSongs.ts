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
  /** shop tab */
  category: "Happy" | "Sad" | "Flute" | "miGlife";
  price: number;
  bpm: number;
  voice: "trumpet" | "bell" | "soft" | "piano" | "chip" | "pluck" | "flute" | "file";
  /** a low tanpura-like Sa–Pa that hums under the whole tune */
  drone?: string;
  colors: [string, string];
  notes: SongNote[];
  /** 🎤 miglife's uploaded songs: a music file instead of notes */
  url?: string;
  seconds?: number;
};

/** 🎤 One of miglife's uploaded songs (app_settings/shop_overrides.songCatalog.{id}). */
export function customSong(id: string, v: Record<string, unknown>): ProfileSong {
  return {
    id,
    name: String(v.name || "Song"),
    emoji: String(v.emoji || "🎵"),
    mood: String(v.mood || ""),
    category: "miGlife",
    price: Number(v.price || 0),
    bpm: 60,
    voice: "file",
    colors: ["#F5C542", "#8B4DFF"],
    notes: [],
    url: String(v.url || ""),
    seconds: Number(v.seconds || 0),
  };
}

export const PROFILE_SONGS: ProfileSong[] = [
  {
    id: "royal", name: "Royal Fanfare", emoji: "👑", mood: "Grand entrance", category: "Happy", price: 150000, bpm: 132, voice: "trumpet",
    colors: ["#F5C542", "#B07A06"],
    notes: [["G4", 0.5], ["C5", 0.5], ["E5", 0.5], ["G5", 1.5], ["E5", 0.5], ["G5", 1.5], ["A5", 0.5], ["G5", 0.5], ["F5", 0.5], ["E5", 0.5], ["D5", 0.5], ["E5", 0.5], ["C5", 2], ["G4", 0.5], ["C5", 0.5], ["E5", 0.5], ["G5", 1], ["A5", 0.5], ["B5", 0.5], ["C6", 1.5], ["B5", 0.5], ["A5", 0.5], ["G5", 0.5], ["F5", 0.5], ["E5", 1], ["D5", 1], ["C5+E5", 1], ["D5+F5", 1], ["E5+G5", 1], ["F5+A5", 1], ["G5+B5", 1], ["A5+C6", 1], ["G5+B5+D6", 1], ["C5+E5+G5+C6", 6]],
  },
  {
    id: "bells", name: "Happy Bells", emoji: "🔔", mood: "Bright & cheerful", category: "Happy", price: 100000, bpm: 150, voice: "bell",
    colors: ["#5aa2ff", "#1565D8"],
    notes: [["E6", 0.5], ["G6", 0.5], ["C7", 1], ["B6", 0.5], ["G6", 0.5], ["A6", 1], ["G6", 0.5], ["E6", 0.5], ["F6", 0.5], ["D6", 0.5], ["C6", 2], ["E6", 0.5], ["G6", 0.5], ["C7", 1], ["D7", 0.5], ["C7", 0.5], ["B6", 1], ["A6", 0.5], ["B6", 0.5], ["C7", 0.5], ["A6", 0.5], ["G6", 2], ["F6", 0.5], ["A6", 0.5], ["C7", 1], ["B6", 0.5], ["A6", 0.5], ["G6", 1], ["E6", 0.5], ["G6", 0.5], ["E6", 0.5], ["D6", 0.5], ["C6", 2], ["C6", 0.5], ["E6", 0.5], ["G6", 0.5], ["C7", 0.5], ["E7", 1], ["D7", 1], ["C7+E7", 1], ["G6", 0.5], ["E6", 0.5], ["C6+E6+G6+C7", 4]],
  },
  {
    id: "lofi", name: "Lo-fi Night", emoji: "🌙", mood: "Calm & chill", category: "Happy", price: 120000, bpm: 84, voice: "soft",
    colors: ["#8B4DFF", "#4B1BA8"],
    notes: [["A3+C4+E4", 1], ["E5", 0.5], ["C5", 0.5], ["F3+A3+C4", 1], ["D5", 0.5], ["A4", 0.5], ["C4+E4+G4", 1], ["E5", 0.5], ["G5", 0.5], ["G3+B3+D4", 1], ["D5", 1], ["A3+C4+E4", 1], ["C5", 0.5], ["E5", 0.5], ["F3+A3+C4", 1], ["A5", 0.5], ["G5", 0.5], ["C4+E4+G4", 1], ["E5", 1], ["G3+B3+D4", 1], ["B4", 0.5], ["D5", 0.5], ["F3+A3+C4+E5", 2], ["A3+C4+E4+A4", 3]],
  },
  {
    id: "love", name: "Love Piano", emoji: "💖", mood: "Sweet & romantic", category: "Happy", price: 140000, bpm: 96, voice: "piano",
    colors: ["#FF5FA8", "#C21E6E"],
    notes: [["C5", 0.5], ["E5", 0.5], ["G5", 1], ["A5", 0.5], ["G5", 0.5], ["E5", 1], ["F5", 0.5], ["E5", 0.5], ["D5", 0.5], ["E5", 0.5], ["C5", 2], ["E5", 0.5], ["G5", 0.5], ["C6", 1], ["B5", 0.5], ["A5", 0.5], ["G5", 1], ["A5", 0.5], ["G5", 0.5], ["F5", 0.5], ["E5", 0.5], ["D5", 2], ["C5", 0.5], ["E5", 0.5], ["G5", 0.5], ["C6", 0.5], ["B5", 1], ["G5", 1], ["A5", 1], ["F5+A5", 1], ["C4+E4+G4+C5+E5", 3]],
  },
  {
    id: "victory", name: "Victory", emoji: "🏆", mood: "Gamer win", category: "Happy", price: 130000, bpm: 168, voice: "chip",
    colors: ["#2FC46B", "#0E7A3E"],
    notes: [["C5", 0.33], ["C5", 0.33], ["C5", 0.33], ["C5", 1], ["G#4", 1], ["A#4", 1], ["C5", 0.66], ["A#4", 0.33], ["C5", 2], ["G5", 0.5], ["F5", 0.5], ["D#5", 0.5], ["F5", 0.5], ["G5", 1], ["D#5", 0.5], ["C5", 0.5], ["D#5", 1], ["F5", 0.5], ["D#5", 0.5], ["D5", 0.5], ["D#5", 0.5], ["F5", 1], ["D5", 0.5], ["A#4", 0.5], ["C5", 2], ["C5", 0.33], ["C5", 0.33], ["C5", 0.33], ["C5", 1], ["G#4", 1], ["A#4", 1], ["C5", 0.66], ["A#4", 0.33], ["C5", 2], ["G5", 0.5], ["A#5", 0.5], ["C6", 1], ["A#5", 0.5], ["G5", 0.5], ["D#5", 1], ["F5", 0.5], ["G5", 0.5], ["C6", 3], ["C5", 0.33], ["D#5", 0.33], ["G5", 0.33], ["C6", 2], ["C5+D#5+G5+C6", 4]],
  },
  {
    id: "ektara", name: "Ektara Folk", emoji: "🪕", mood: "Desi folk vibe", category: "Happy", price: 160000, bpm: 120, voice: "pluck",
    colors: ["#FF8A3D", "#C2410C"],
    notes: [["D5", 0.5], ["E5", 0.5], ["G5", 0.5], ["A5", 0.5], ["G5", 0.5], ["E5", 0.5], ["D5", 1], ["A4", 0.5], ["D5", 0.5], ["E5", 0.5], ["D5", 0.5], ["B4", 1], ["A4", 1], ["D5", 0.5], ["E5", 0.5], ["G5", 0.5], ["A5", 0.5], ["B5", 0.5], ["A5", 0.5], ["G5", 1], ["A5", 0.5], ["B5", 0.5], ["A5", 0.5], ["G5", 0.5], ["E5", 1], ["D5", 1], ["G5", 0.5], ["G5", 0.5], ["A5", 0.5], ["G5", 0.5], ["E5", 0.5], ["D5", 0.5], ["E5", 1], ["D5", 0.5], ["E5", 0.5], ["G5", 0.5], ["E5", 0.5], ["D5", 0.5], ["B4", 0.5], ["A4", 1], ["D5", 0.5], ["E5", 0.5], ["D5", 0.5], ["A4", 0.5], ["D5", 4]],
  },
  // 😢 20 sad tunes (minor keys, slow)
  {
    id: "sad01", name: "Rainy Window", emoji: "🌧️", mood: "Soft rain, soft heart", category: "Sad", price: 120000, bpm: 69, voice: "piano",
    colors: ["#7F9CC7", "#3F5B8A"],
    notes: [["A2+C3+E3+E5", 0.5], ["D5", 1], ["B4", 0.5], ["F3+A3+C4+C5", 2], ["C3+E3+G3+C5", 1.5], ["B4", 0.5], ["G3+B3+D4+B4", 2], ["A2+C3+E3+C5", 0.5], ["A4", 1], ["B4", 0.5], ["F3+A3+C4+A4", 0.5], ["A4", 1], ["A4", 0.5], ["C3+E3+G3+G4", 1], ["F4", 0.5], ["F4", 0.5], ["C5", 0.5], ["B4", 0.5], ["A2+C3+E3+A4", 3]],
  },
  {
    id: "sad02", name: "Broken Heart", emoji: "💔", mood: "Hurts quietly", category: "Sad", price: 120000, bpm: 72, voice: "piano",
    colors: ["#F07A9A", "#9E2F54"],
    notes: [["E3+G3+B3+G5", 2], ["A3+C4+E4+A5", 0.5], ["G5", 0.5], ["E5", 1], ["C4+E4+G4+E5", 1.5], ["F#5", 0.5], ["B3+D#4+F#4+F#5", 1], ["E5", 1], ["E3+G3+B3+E5", 2], ["A3+C4+E4+E5", 1.5], ["D5", 0.5], ["C4+E4+G4+C5", 1], ["C5", 1], ["G5", 0.5], ["F#5", 0.5], ["E3+G3+B3+E5", 3]],
  },
  {
    id: "sad03", name: "Lonely Night", emoji: "🌃", mood: "Alone with the city", category: "Sad", price: 120000, bpm: 66, voice: "soft",
    colors: ["#5E6AD2", "#2B2F7A"],
    notes: [["D3+F3+A3+A5", 2], ["C4+E4+G4+G5", 0.5], ["F5", 1], ["G5", 0.5], ["A#3+D4+F4+F5", 2], ["C4+E4+G4+G5", 1.5], ["A5", 0.5], ["D3+F3+A3+A5", 0.5], ["A#5", 0.5], ["G5", 1], ["C4+E4+G4+G5", 1], ["E5", 1], ["F5", 0.5], ["E5", 0.5], ["D3+F3+A3+D5", 3]],
  },
  {
    id: "sad04", name: "Tears", emoji: "😢", mood: "When words don't come", category: "Sad", price: 120000, bpm: 70, voice: "piano",
    colors: ["#8FB8E8", "#3A6EA8"],
    notes: [["G3+A#3+D4+A#5", 1.5], ["A5", 0.5], ["D4+F#4+A4+A5", 0.5], ["F5", 1], ["D#5", 0.5], ["D#4+G4+A#4+D#5", 0.5], ["D#5", 1], ["D#5", 0.5], ["C4+D#4+G4+D#5", 2], ["G3+A#3+D4+G5", 0.5], ["A5", 1], ["G5", 0.5], ["D4+F#4+A4+A5", 2], ["D#4+G4+A#4+G5", 0.5], ["G5", 0.5], ["F5", 1], ["A#5", 0.5], ["A5", 0.5], ["G3+A#3+D4+G5", 3]],
  },
  {
    id: "sad05", name: "Missing You", emoji: "🥀", mood: "Someone far away", category: "Sad", price: 120000, bpm: 74, voice: "piano",
    colors: ["#D9708A", "#7A2340"],
    notes: [["C#4+F4+G#4+G#5", 0.5], ["A#5", 0.5], ["G5", 1], ["D#4+G4+A#4+G5", 0.5], ["F5", 0.5], ["D#5", 1], ["F3+G#3+C4+F5", 2], ["F3+G#3+C4+F5", 1], ["D#5", 1], ["C#4+F4+G#4+C#5", 2], ["D#4+G4+A#4+D#5", 1.5], ["F5", 0.5], ["F3+G#3+C4+F5", 2], ["G#5", 0.5], ["G5", 0.5], ["F3+G#3+C4+F5", 3]],
  },
  {
    id: "sad06", name: "Last Goodbye", emoji: "👋", mood: "One more look back", category: "Sad", price: 120000, bpm: 68, voice: "soft",
    colors: ["#A08BD6", "#5B3F9E"],
    notes: [["A2+C3+E3+C5", 1], ["A4", 0.5], ["G4", 0.5], ["D3+F3+A3+F4", 1.5], ["G4", 0.5], ["A2+C3+E3+A4", 1], ["G4", 0.5], ["G4", 0.5], ["E3+G#3+B3+B4", 1], ["G4", 1], ["A2+C3+E3+A4", 1], ["F4", 0.5], ["F4", 0.5], ["D3+F3+A3+F4", 1], ["F4", 1], ["A2+C3+E3+A4", 1], ["F4", 1], ["C5", 0.5], ["B4", 0.5], ["A2+C3+E3+A4", 3]],
  },
  {
    id: "sad07", name: "Empty Room", emoji: "🕯️", mood: "Quiet after everyone left", category: "Sad", price: 120000, bpm: 72, voice: "bell",
    colors: ["#C9B27A", "#7A6430"],
    notes: [["E3+G3+B3+B5", 2], ["C4+E4+G4+C6", 1], ["B5", 1], ["A3+C4+E4+A5", 1], ["G5", 0.5], ["F#5", 0.5], ["B3+D#4+F#4+F#5", 1.5], ["E5", 0.5], ["E3+G3+B3+E5", 1], ["D5", 1], ["C4+E4+G4+E5", 0.5], ["D5", 0.5], ["C5", 1], ["A3+C4+E4+C5", 2], ["G5", 0.5], ["F#5", 0.5], ["E3+G3+B3+E5", 3]],
  },
  {
    id: "sad08", name: "Autumn Leaves", emoji: "🍂", mood: "Falling slowly", category: "Sad", price: 120000, bpm: 76, voice: "pluck",
    colors: ["#E39A5B", "#9A4E16"],
    notes: [["F3+G#3+C4+F5", 0.5], ["G5", 1], ["F5", 0.5], ["G3+B3+D4+G5", 1], ["F5", 1], ["C3+D#3+G3+D#5", 1], ["D5", 1], ["G#3+C4+D#4+C5", 1], ["D5", 1], ["F3+G#3+C4+C5", 2], ["G3+B3+D4+D5", 0.5], ["D#5", 1], ["D5", 0.5], ["C3+D#3+G3+D#5", 1.5], ["D5", 0.5], ["G#3+C4+D#4+C5", 1.5], ["C5", 0.5], ["D#5", 0.5], ["D5", 0.5], ["C3+D#3+G3+C5", 3]],
  },
  {
    id: "sad09", name: "Silent Moon", emoji: "🌑", mood: "Dark and calm", category: "Sad", price: 120000, bpm: 64, voice: "soft",
    colors: ["#6B7A99", "#2E3A55"],
    notes: [["D3+F3+A3+F5", 0.5], ["G5", 0.5], ["G5", 1], ["F3+A3+C4+F5", 1], ["E5", 0.5], ["F5", 0.5], ["A#3+D4+F4+F5", 2], ["C4+E4+G4+E5", 2], ["D3+F3+A3+F5", 2], ["F3+A3+C4+F5", 1.5], ["F5", 0.5], ["F5", 0.5], ["E5", 0.5], ["D3+F3+A3+D5", 3]],
  },
  {
    id: "sad10", name: "Faded Memory", emoji: "📷", mood: "An old photo", category: "Sad", price: 120000, bpm: 70, voice: "bell",
    colors: ["#B6A7C9", "#6A5A84"],
    notes: [["D#4+G4+A#4+A#5", 0.5], ["A5", 0.5], ["A5", 1], ["C4+D#4+G4+G5", 1], ["G5", 1], ["G3+A#3+D4+G5", 1.5], ["D#5", 0.5], ["D4+F#4+A4+A5", 1.5], ["A5", 0.5], ["D#4+G4+A#4+G5", 2], ["C4+D#4+G4+G5", 2], ["G3+A#3+D4+G5", 0.5], ["F5", 0.5], ["F5", 1], ["A#5", 0.5], ["A5", 0.5], ["G3+A#3+D4+G5", 3]],
  },
  {
    id: "sad11", name: "Cold Rain", emoji: "☔", mood: "Grey streets", category: "Sad", price: 120000, bpm: 78, voice: "piano",
    colors: ["#7FA6B8", "#335F73"],
    notes: [["F3+G#3+C4+C6", 1], ["C6", 1], ["C#4+F4+G#4+G#5", 1], ["G5", 0.5], ["G#5", 0.5], ["G#3+C4+D#4+G#5", 2], ["D#4+G4+A#4+G5", 2], ["F3+G#3+C4+F5", 1], ["G5", 1], ["C#4+F4+G#4+F5", 0.5], ["G5", 1], ["F5", 0.5], ["G#3+C4+D#4+D#5", 0.5], ["C#5", 0.5], ["C#5", 1], ["D#4+G4+A#4+D#5", 1.5], ["C#5", 0.5], ["G#5", 0.5], ["G5", 0.5], ["F3+G#3+C4+F5", 3]],
  },
  {
    id: "sad12", name: "Lost Love", emoji: "💌", mood: "What could have been", category: "Sad", price: 120000, bpm: 68, voice: "piano",
    colors: ["#E58FB0", "#9B3A66"],
    notes: [["A2+C3+E3+C5", 0.5], ["D5", 1], ["C5", 0.5], ["D3+F3+A3+D5", 1], ["D5", 1], ["F3+A3+C4+C5", 0.5], ["C5", 1], ["C5", 0.5], ["E3+G#3+B3+B4", 1.5], ["A4", 0.5], ["A2+C3+E3+A4", 0.5], ["A4", 1], ["G4", 0.5], ["D3+F3+A3+F4", 0.5], ["F4", 0.5], ["F4", 1], ["F3+A3+C4+F4", 0.5], ["F4", 1], ["F4", 0.5], ["C5", 0.5], ["B4", 0.5], ["A2+C3+E3+A4", 3]],
  },
  {
    id: "sad13", name: "Distant Star", emoji: "✨", mood: "So far, still shining", category: "Sad", price: 120000, bpm: 74, voice: "bell",
    colors: ["#8CA6E8", "#3B4FA0"],
    notes: [["E3+G3+B3+B5", 1.5], ["B5", 0.5], ["D4+F#4+A4+A5", 2], ["C4+E4+G4+G5", 2], ["D4+F#4+A4+F#5", 2], ["E3+G3+B3+G5", 1], ["A5", 0.5], ["G5", 0.5], ["D4+F#4+A4+A5", 1], ["G5", 1], ["C4+E4+G4+G5", 0.5], ["F#5", 1], ["E5", 0.5], ["G5", 0.5], ["F#5", 0.5], ["E3+G3+B3+E5", 3]],
  },
  {
    id: "sad14", name: "Grey Sky", emoji: "☁️", mood: "No sun today", category: "Sad", price: 120000, bpm: 70, voice: "soft",
    colors: ["#9AA5B4", "#566273"],
    notes: [["D3+F3+A3+F5", 2], ["A3+C#4+E4+E5", 1.5], ["C5", 0.5], ["A#3+D4+F4+A#4", 0.5], ["A#4", 0.5], ["A#4", 1], ["G3+A#3+D4+A#4", 2], ["D3+F3+A3+D5", 1.5], ["C5", 0.5], ["A3+C#4+E4+E5", 1], ["C5", 1], ["A#3+D4+F4+A#4", 2], ["F5", 0.5], ["E5", 0.5], ["D3+F3+A3+D5", 3]],
  },
  {
    id: "sad15", name: "Ocean of Tears", emoji: "🌊", mood: "Waves of feeling", category: "Sad", price: 120000, bpm: 66, voice: "soft",
    colors: ["#5FA8D3", "#1E5F8A"],
    notes: [["D#4+G4+A#4+A#5", 2], ["F4+A4+C5+C6", 1], ["A#5", 1], ["G3+A#3+D4+A#5", 2], ["G3+A#3+D4+A#5", 2], ["D#4+G4+A#4+A#5", 1], ["A5", 0.5], ["G5", 0.5], ["F4+A4+C5+F5", 1], ["G5", 0.5], ["F5", 0.5], ["A#5", 0.5], ["A5", 0.5], ["G3+A#3+D4+G5", 3]],
  },
  {
    id: "sad16", name: "Alone Again", emoji: "🚶", mood: "Walking home alone", category: "Sad", price: 120000, bpm: 72, voice: "pluck",
    colors: ["#A3A3C2", "#55557A"],
    notes: [["C3+D#3+G3+G5", 0.5], ["F5", 1], ["F5", 0.5], ["F3+G#3+C4+F5", 1.5], ["D5", 0.5], ["C3+D#3+G3+D#5", 1], ["C5", 0.5], ["A#4", 0.5], ["G3+B3+D4+D5", 2], ["C3+D#3+G3+D#5", 0.5], ["D5", 0.5], ["D#5", 1], ["F3+G#3+C4+F5", 1], ["F5", 0.5], ["F5", 0.5], ["C3+D#3+G3+D#5", 2], ["D#5", 0.5], ["D5", 0.5], ["C3+D#3+G3+C5", 3]],
  },
  {
    id: "sad17", name: "Midnight Blue", emoji: "💙", mood: "Late-night thoughts", category: "Sad", price: 120000, bpm: 64, voice: "piano",
    colors: ["#4F7BD9", "#1D3C8A"],
    notes: [["F3+G#3+C4+G#5", 1.5], ["F5", 0.5], ["C#4+F4+G#4+F5", 2], ["A#3+C#4+F4+F5", 1], ["D#5", 1], ["C4+E4+G4+G5", 2], ["F3+G#3+C4+G#5", 2], ["C#4+F4+G#4+G#5", 0.5], ["A#5", 0.5], ["G#5", 1], ["G#5", 0.5], ["G5", 0.5], ["F3+G#3+C4+F5", 3]],
  },
  {
    id: "sad18", name: "Paper Boat", emoji: "⛵", mood: "Childhood, gone", category: "Sad", price: 120000, bpm: 76, voice: "bell",
    colors: ["#7EC8C8", "#2C7A7A"],
    notes: [["D3+F3+A3+F5", 2], ["E3+G#3+B3+E5", 1], ["F5", 0.5], ["G5", 0.5], ["A2+C3+E3+E5", 1], ["D5", 1], ["F3+A3+C4+C5", 2], ["D3+F3+A3+D5", 0.5], ["C5", 1], ["A4", 0.5], ["E3+G#3+B3+B4", 0.5], ["A4", 1], ["G4", 0.5], ["A2+C3+E3+A4", 0.5], ["G4", 0.5], ["F4", 1], ["F3+A3+C4+F4", 2], ["C5", 0.5], ["B4", 0.5], ["A2+C3+E3+A4", 3]],
  },
  {
    id: "sad19", name: "Old Letter", emoji: "✉️", mood: "Words from long ago", category: "Sad", price: 120000, bpm: 70, voice: "pluck",
    colors: ["#C9A27E", "#7A5530"],
    notes: [["E3+G3+B3+B5", 0.5], ["A5", 1], ["G5", 0.5], ["G3+B3+D4+G5", 0.5], ["F#5", 0.5], ["E5", 1], ["C4+E4+G4+E5", 2], ["D4+F#4+A4+F#5", 1.5], ["F#5", 0.5], ["E3+G3+B3+G5", 1.5], ["A5", 0.5], ["G3+B3+D4+B5", 2], ["C4+E4+G4+C6", 2], ["G5", 0.5], ["F#5", 0.5], ["E3+G3+B3+E5", 3]],
  },
  {
    id: "sad20", name: "Sad Flute", emoji: "🎶", mood: "A lonely village tune", category: "Sad", price: 120000, bpm: 68, voice: "soft",
    colors: ["#7FC29B", "#2F7A52"],
    notes: [["A#3+D4+F4+A#5", 2], ["G3+A#3+D4+A#5", 1.5], ["A5", 0.5], ["D3+F3+A3+A5", 0.5], ["G5", 0.5], ["G5", 1], ["A3+C#4+E4+A5", 1], ["G5", 1], ["A#3+D4+F4+F5", 1], ["D5", 1], ["G3+A#3+D4+D5", 1.5], ["A#4", 0.5], ["D3+F3+A3+D5", 0.5], ["D5", 0.5], ["E5", 1], ["F5", 0.5], ["E5", 0.5], ["D3+F3+A3+D5", 3]],
  },
  // 🪈 20 sad bansuri tunes (~30 s, raag colours, tanpura drone)
  {
    id: "flute01", name: "Bansuri Lament", emoji: "🎋", mood: "A flute that cries", category: "Flute", price: 150000, bpm: 62, voice: "flute", drone: "D3+A3",
    colors: ["#7FC29B", "#2F7A52"],
    notes: [["E5", 0.15], ["D5", 1.85], ["E5", 1], ["B4", 1], ["A4", 2], ["A4", 2.0], ["-", 0.5], ["A4", 1.5], ["F4", 0.5], ["E4", 1], ["A4", 1], ["D5", 0.15], ["B4", 1.85], ["D5", 2.0], ["-", 0.5], ["D5", 1], ["D5", 0.5], ["A4", 0.5], ["A4", 0.15], ["F4", 1.85], ["F4", 0.15], ["E4", 1.85], ["F4", 0.5], ["A4", 2.0], ["-", 0.5], ["F5", 1.0], ["E5", 1.0], ["E5", 0.15], ["D5", 3.85]],
  },
  {
    id: "flute02", name: "Village Dusk", emoji: "🌾", mood: "Sun sets on the fields", category: "Flute", price: 150000, bpm: 60, voice: "flute", drone: "C3+G3",
    colors: ["#C9A27E", "#7A5530"],
    notes: [["C5", 1], ["C5", 0.5], ["C#5", 0.5], ["D#5", 2], ["D#5", 2], ["F5", 0.5], ["G5", 2.0], ["-", 0.5], ["G5", 1], ["G#5", 0.5], ["A#5", 0.5], ["C#6", 2], ["D#6", 2], ["C#6", 0.5], ["C6", 2.0], ["-", 0.5], ["C#6", 0.15], ["C6", 1.85], ["A#5", 1], ["C6", 1], ["F6", 0.15], ["D#6", 1.85], ["C#6", 0.5], ["C6", 2.0], ["-", 0.5], ["D#5", 1.0], ["C#5", 1.0], ["C#5", 0.15], ["C5", 3.85]],
  },
  {
    id: "flute03", name: "River Goodbye", emoji: "🏞️", mood: "The boat leaves the ghat", category: "Flute", price: 150000, bpm: 64, voice: "flute", drone: "D3+A3",
    colors: ["#6FB3C8", "#25677A"],
    notes: [["D5", 1], ["F5", 0.5], ["A5", 0.5], ["A5", 0.15], ["G5", 1.85], ["F5", 2], ["E5", 0.5], ["D5", 2.0], ["-", 0.5], ["D5", 1], ["C5", 1], ["C5", 0.5], ["C5", 0.5], ["A#4", 1], ["A4", 2], ["A4", 2.0], ["-", 0.5], ["A#4", 0.15], ["A4", 1.35], ["A4", 0.5], ["A4", 0.15], ["G4", 1.85], ["G4", 0.5], ["G4", 0.5], ["E4", 1], ["F4", 0.5], ["G4", 0.5], ["A4", 2.0], ["-", 0.5], ["F5", 1.0], ["E5", 1.0], ["E5", 0.15], ["D5", 3.85]],
  },
  {
    id: "flute04", name: "Ma's Lullaby", emoji: "🤱", mood: "A song from childhood", category: "Flute", price: 150000, bpm: 58, voice: "flute", drone: "C3+G3",
    colors: ["#E2A3C7", "#9B4C7A"],
    notes: [["D5", 0.15], ["C5", 1.85], ["C5", 1], ["D#5", 1], ["G5", 0.15], ["F5", 1.85], ["G5", 2.0], ["-", 0.5], ["G5", 1], ["B5", 1], ["C6", 0.5], ["B5", 0.5], ["G#5", 1], ["G#5", 0.15], ["G5", 1.85], ["G5", 2.0], ["-", 0.5], ["G#5", 0.15], ["G5", 1.85], ["G#5", 0.5], ["G#5", 0.5], ["C6", 1], ["D#6", 0.15], ["D6", 1.85], ["C6", 2.0], ["-", 0.5], ["D#5", 1.0], ["D5", 1.0], ["D5", 0.15], ["C5", 3.85]],
  },
  {
    id: "flute05", name: "Monsoon Night", emoji: "🌧️", mood: "Rain on a tin roof", category: "Flute", price: 150000, bpm: 60, voice: "flute", drone: "E3+B3",
    colors: ["#7F9CC7", "#3F5B8A"],
    notes: [["F#5", 1], ["B5", 1], ["E6", 0.5], ["B5", 0.5], ["G5", 1], ["E5", 2], ["E5", 2.0], ["-", 0.5], ["F#5", 0.15], ["E5", 2.85], ["C#5", 1], ["F#5", 0.15], ["E5", 1.85], ["E5", 2.0], ["-", 0.5], ["F#5", 0.15], ["E5", 1.85], ["C#5", 1], ["B4", 1], ["B4", 2], ["B4", 2.0], ["-", 0.5], ["G5", 1.0], ["F#5", 1.0], ["F#5", 0.15], ["E5", 3.85]],
  },
  {
    id: "flute06", name: "Lonely Boatman", emoji: "🛶", mood: "Alone on the river", category: "Flute", price: 150000, bpm: 62, voice: "flute", drone: "D3+A3",
    colors: ["#6FA8C8", "#2A5E80"],
    notes: [["A4", 0.15], ["G4", 1.85], ["A4", 0.5], ["A#4", 0.5], ["A4", 1], ["G4", 0.15], ["F4", 1.85], ["G4", 0.5], ["A4", 2.0], ["-", 0.5], ["A4", 1.5], ["A#4", 0.5], ["C5", 1], ["D5", 1], ["F5", 0.15], ["D#5", 1.85], ["D5", 2.0], ["-", 0.5], ["D5", 1], ["A#4", 0.5], ["G4", 0.5], ["A#4", 2], ["C5", 2], ["D5", 2.0], ["-", 0.5], ["F5", 1.0], ["D#5", 1.0], ["D#5", 0.15], ["D5", 3.85]],
  },
  {
    id: "flute07", name: "Empty Courtyard", emoji: "🏡", mood: "Nobody comes home", category: "Flute", price: 150000, bpm: 58, voice: "flute", drone: "B2+F#3",
    colors: ["#B8A98F", "#6E6048"],
    notes: [["C#5", 3], ["D5", 1], ["D5", 0.15], ["C#5", 1.85], ["B4", 2.0], ["-", 0.5], ["B4", 3], ["D5", 1], ["G5", 0.15], ["F#5", 1.85], ["F#5", 2.0], ["-", 0.5], ["G5", 0.15], ["F#5", 2.85], ["E5", 1], ["D5", 0.15], ["C#5", 1.85], ["B4", 2.0], ["-", 0.5], ["D5", 1.0], ["C#5", 1.0], ["C#5", 0.15], ["B4", 3.85]],
  },
  {
    id: "flute08", name: "Memories of Home", emoji: "🏠", mood: "The old house", category: "Flute", price: 150000, bpm: 64, voice: "flute", drone: "E3+B3",
    colors: ["#D6A36F", "#8A5626"],
    notes: [["F#5", 1.5], ["F#5", 0.5], ["G5", 2], ["A5", 0.5], ["B5", 0.5], ["B5", 1], ["B5", 2.0], ["-", 0.5], ["C6", 0.15], ["B5", 1.85], ["C6", 0.5], ["D#6", 0.5], ["B5", 1], ["A5", 0.15], ["G5", 1.85], ["F#5", 0.5], ["E5", 2.0], ["-", 0.5], ["E5", 1.5], ["G5", 0.5], ["C6", 0.15], ["B5", 1.85], ["A5", 0.5], ["G5", 0.5], ["F#5", 1], ["E5", 2.0], ["-", 0.5], ["G5", 1.0], ["F#5", 1.0], ["F#5", 0.15], ["E5", 3.85]],
  },
  {
    id: "flute09", name: "Biraha", emoji: "💔", mood: "The pain of parting", category: "Flute", price: 150000, bpm: 58, voice: "flute", drone: "D3+A3",
    colors: ["#E07A8E", "#8E2F44"],
    notes: [["G4", 1], ["A4", 0.5], ["C5", 0.5], ["A#4", 0.15], ["A4", 1.85], ["A4", 0.15], ["G4", 1.85], ["A4", 2.0], ["-", 0.5], ["A4", 2], ["F4", 1], ["G4", 1], ["A4", 2], ["A4", 2.0], ["-", 0.5], ["A#4", 0.15], ["A4", 1.35], ["A4", 0.5], ["A#4", 0.15], ["A4", 1.85], ["F4", 0.5], ["D#4", 0.5], ["D#4", 1], ["F4", 0.5], ["G4", 0.5], ["A4", 2.0], ["-", 0.5], ["F5", 1.0], ["D#5", 1.0], ["D#5", 0.15], ["D5", 3.85]],
  },
  {
    id: "flute10", name: "Evening Lamp", emoji: "🪔", mood: "Sandhya, alone", category: "Flute", price: 150000, bpm: 60, voice: "flute", drone: "C3+G3",
    colors: ["#E8B35A", "#9A6416"],
    notes: [["C5", 1.5], ["D5", 0.5], ["D#5", 1], ["D#5", 1], ["G5", 0.15], ["D#5", 1.85], ["G5", 2.0], ["-", 0.5], ["A5", 0.15], ["G5", 1.85], ["A5", 0.5], ["D6", 0.5], ["C6", 1], ["C6", 0.15], ["A5", 1.85], ["C6", 2.0], ["-", 0.5], ["D6", 0.15], ["C6", 1.85], ["A5", 0.5], ["G5", 0.5], ["A5", 1], ["C6", 2], ["C6", 2.0], ["-", 0.5], ["D#5", 1.0], ["D5", 1.0], ["D5", 0.15], ["C5", 3.85]],
  },
  {
    id: "flute11", name: "Fading Footsteps", emoji: "👣", mood: "Walking away slowly", category: "Flute", price: 150000, bpm: 62, voice: "flute", drone: "E3+B3",
    colors: ["#9AA5B4", "#566273"],
    notes: [["A4", 2], ["B4", 1], ["A4", 1], ["A4", 0.15], ["G4", 1.85], ["A4", 0.5], ["B4", 2.0], ["-", 0.5], ["C5", 0.15], ["B4", 1.35], ["G4", 0.5], ["F#4", 1], ["G4", 1], ["C5", 0.15], ["B4", 1.85], ["B4", 2.0], ["-", 0.5], ["C5", 0.15], ["B4", 1.35], ["G4", 0.5], ["F#4", 1], ["A4", 1], ["B4", 2], ["B4", 2.0], ["-", 0.5], ["G5", 1.0], ["F#5", 1.0], ["F#5", 0.15], ["E5", 3.85]],
  },
  {
    id: "flute12", name: "Wounded Heart", emoji: "🩹", mood: "It still hurts", category: "Flute", price: 150000, bpm: 60, voice: "flute", drone: "D3+A3",
    colors: ["#D98AA0", "#8A3550"],
    notes: [["F5", 0.15], ["E5", 1.85], ["F5", 1], ["E5", 1], ["C#5", 2], ["D5", 2.0], ["-", 0.5], ["D5", 2], ["F5", 1], ["E5", 1], ["D5", 0.15], ["C#5", 1.85], ["D5", 2.0], ["-", 0.5], ["D5", 1], ["F5", 0.5], ["G5", 0.5], ["G5", 0.15], ["F5", 1.85], ["E5", 2], ["D5", 2.0], ["-", 0.5], ["F5", 1.0], ["E5", 1.0], ["E5", 0.15], ["D5", 3.85]],
  },
  {
    id: "flute13", name: "Moonlit Riverbank", emoji: "🌙", mood: "Silver water, silent night", category: "Flute", price: 150000, bpm: 56, voice: "flute", drone: "B2+F#3",
    colors: ["#8C9EDB", "#3B4C93"],
    notes: [["D4", 1], ["F#4", 0.5], ["G#4", 0.5], ["G#4", 0.15], ["F#4", 1.85], ["D4", 2], ["F#4", 2.0], ["-", 0.5], ["F#4", 1], ["C#4", 0.5], ["C#4", 0.5], ["D4", 0.15], ["C#4", 1.85], ["C#4", 2], ["D4", 0.5], ["F#4", 2.0], ["-", 0.5], ["F#4", 2], ["G#4", 1], ["C#5", 1], ["D5", 0.15], ["C#5", 1.85], ["B4", 2.0], ["-", 0.5], ["D5", 1.0], ["C#5", 1.0], ["C#5", 0.15], ["B4", 3.85]],
  },
  {
    id: "flute14", name: "Unsent Words", emoji: "📜", mood: "Things never said", category: "Flute", price: 150000, bpm: 64, voice: "flute", drone: "C3+G3",
    colors: ["#C7B38A", "#7A6638"],
    notes: [["F4", 3], ["G#4", 1], ["A#4", 2], ["C5", 2.0], ["-", 0.5], ["C5", 1.5], ["A#4", 0.5], ["A#4", 2], ["G#4", 0.5], ["F4", 0.5], ["D#4", 1], ["F4", 0.5], ["G4", 2.0], ["-", 0.5], ["G#4", 0.15], ["G4", 1.35], ["G#4", 0.5], ["C#5", 0.15], ["C5", 1.85], ["G#4", 0.5], ["G4", 0.5], ["F4", 1], ["G4", 2.0], ["-", 0.5], ["D#5", 1.0], ["C#5", 1.0], ["C#5", 0.15], ["C5", 3.85]],
  },
  {
    id: "flute15", name: "Last Train", emoji: "🚂", mood: "The platform empties", category: "Flute", price: 150000, bpm: 66, voice: "flute", drone: "D3+A3",
    colors: ["#8FA3B8", "#45596E"],
    notes: [["D5", 2], ["F5", 1], ["E5", 1], ["E5", 0.15], ["D5", 1.85], ["D5", 2.0], ["-", 0.5], ["D5", 1], ["C5", 1], ["A4", 0.5], ["G4", 0.5], ["G4", 1], ["F4", 2], ["G4", 0.5], ["A4", 2.0], ["-", 0.5], ["A4", 1], ["G4", 1], ["G4", 0.5], ["G4", 0.5], ["G4", 1], ["G4", 0.15], ["F4", 1.85], ["G4", 0.5], ["A4", 2.0], ["-", 0.5], ["F5", 1.0], ["E5", 1.0], ["E5", 0.15], ["D5", 3.85]],
  },
  {
    id: "flute16", name: "Withered Flower", emoji: "🥀", mood: "Beauty that faded", category: "Flute", price: 150000, bpm: 58, voice: "flute", drone: "E3+B3",
    colors: ["#C98AA8", "#7A3A5E"],
    notes: [["F#5", 0.15], ["E5", 2.85], ["G5", 1], ["G5", 0.15], ["F#5", 1.85], ["E5", 2.0], ["-", 0.5], ["E5", 1], ["D#5", 0.5], ["D#5", 0.5], ["E5", 0.15], ["D#5", 1.85], ["C5", 0.15], ["B4", 1.85], ["B4", 2.0], ["-", 0.5], ["B4", 2], ["C5", 1], ["A4", 1], ["A4", 0.15], ["G4", 1.85], ["A4", 0.5], ["B4", 2.0], ["-", 0.5], ["G5", 1.0], ["F#5", 1.0], ["F#5", 0.15], ["E5", 3.85]],
  },
  {
    id: "flute17", name: "Silent Tears", emoji: "💧", mood: "Crying without sound", category: "Flute", price: 150000, bpm: 58, voice: "flute", drone: "D3+A3",
    colors: ["#8CC4E0", "#2F6E91"],
    notes: [["E5", 2], ["F5", 1], ["F5", 1], ["F5", 2], ["A5", 2.0], ["-", 0.5], ["B5", 0.15], ["A5", 1.35], ["E5", 0.5], ["B4", 1], ["E5", 1], ["B5", 0.15], ["A5", 1.85], ["A5", 2.0], ["-", 0.5], ["B5", 0.15], ["A5", 1.85], ["E5", 1], ["A5", 1], ["B5", 2], ["A5", 2.0], ["-", 0.5], ["F5", 1.0], ["E5", 1.0], ["E5", 0.15], ["D5", 3.85]],
  },
  {
    id: "flute18", name: "Far From Home", emoji: "🧳", mood: "Miles away from Ma", category: "Flute", price: 150000, bpm: 62, voice: "flute", drone: "C3+G3",
    colors: ["#A9C79A", "#4F7A3F"],
    notes: [["F4", 1.5], ["G4", 0.5], ["A#4", 1], ["G4", 1], ["F4", 0.15], ["D#4", 1.85], ["F4", 0.5], ["G4", 2.0], ["-", 0.5], ["G4", 1.5], ["G4", 0.5], ["G4", 1], ["F4", 1], ["G4", 0.15], ["F4", 1.85], ["G4", 2.0], ["-", 0.5], ["G4", 1], ["G#4", 1], ["C5", 0.5], ["G#4", 0.5], ["F4", 1], ["D#4", 2], ["F4", 0.5], ["G4", 2.0], ["-", 0.5], ["D#5", 1.0], ["D5", 1.0], ["D5", 0.15], ["C5", 3.85]],
  },
  {
    id: "flute19", name: "Endless Wait", emoji: "⏳", mood: "Still waiting at the door", category: "Flute", price: 150000, bpm: 56, voice: "flute", drone: "D3+A3",
    colors: ["#B9A3D6", "#5E4A85"],
    notes: [["D#5", 0.15], ["D5", 1.35], ["F5", 0.5], ["G5", 2], ["D#5", 0.5], ["D5", 0.5], ["A#4", 1], ["A4", 2.0], ["-", 0.5], ["A4", 1], ["A#4", 0.5], ["D5", 0.5], ["D5", 0.15], ["C5", 1.85], ["A#4", 2], ["A4", 2.0], ["-", 0.5], ["A4", 2], ["F4", 0.5], ["D#4", 0.5], ["F4", 1], ["G4", 2], ["A4", 2.0], ["-", 0.5], ["F5", 1.0], ["D#5", 1.0], ["D#5", 0.15], ["D5", 3.85]],
  },
  {
    id: "flute20", name: "Lost Melody", emoji: "🪈", mood: "A tune nobody remembers", category: "Flute", price: 150000, bpm: 60, voice: "flute", drone: "B2+F#3",
    colors: ["#7FC2B4", "#2F7A6C"],
    notes: [["B4", 2], ["C#5", 1], ["C#5", 1], ["E5", 0.15], ["D5", 1.85], ["C#5", 0.5], ["B4", 2.0], ["-", 0.5], ["C#5", 0.15], ["B4", 2.85], ["A4", 1], ["D5", 0.15], ["C#5", 1.85], ["B4", 2.0], ["-", 0.5], ["C#5", 0.15], ["B4", 1.85], ["G4", 0.5], ["E4", 0.5], ["F#4", 1], ["A4", 2], ["B4", 2.0], ["-", 0.5], ["D5", 1.0], ["C#5", 1.0], ["C#5", 0.15], ["B4", 3.85]],
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
/** how long a song plays (seconds) */
export const songSeconds = (s: ProfileSong) =>
  s.url ? Math.round(s.seconds || 0) : Math.round((s.notes.reduce((a, n) => a + n[1], 0) * 60) / s.bpm);

let stopCurrent: (() => void) | null = null;

/** Plays a song (stops the one playing). Returns how long it lasts (ms). */
export function playProfileSong(song: ProfileSong): number {
  if (typeof window === "undefined") return 0;
  stopProfileSong();
  if (song.url) {
    // 🎤 an uploaded music file
    const audio = new Audio(song.url);
    audio.volume = 0.9;
    audio.play().catch(() => {});
    stopCurrent = () => {
      audio.pause();
      audio.src = "";
    };
    return (song.seconds || 30) * 1000;
  }
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
        const v = song.voice;
        if (v === "flute") {
          // 🪈 bansuri: soft breathy start, a light 2nd harmonic, vibrato that grows on long notes
          const peakF = 0.5 / Math.sqrt(note.split("+").length);
          const g = ac.createGain();
          g.connect(master);
          for (const [mul, amp] of [[1, 1], [2, 0.12]] as const) {
            const o = ac.createOscillator();
            o.type = "sine";
            o.frequency.value = f * mul;
            const lfo = ac.createOscillator();
            lfo.frequency.value = 5.2;
            const depth = ac.createGain();
            depth.gain.setValueAtTime(0, t);
            depth.gain.linearRampToValueAtTime(f * mul * 0.007, t + Math.min(0.45, dur * 0.6));
            lfo.connect(depth);
            depth.connect(o.frequency);
            const og = ac.createGain();
            og.gain.value = amp;
            o.connect(og);
            og.connect(g);
            o.start(t);
            lfo.start(t);
            o.stop(t + dur + 0.12);
            lfo.stop(t + dur + 0.12);
            nodes.push(o, lfo);
          }
          g.gain.setValueAtTime(0, t);
          g.gain.linearRampToValueAtTime(peakF, t + Math.min(0.08, dur * 0.4));
          g.gain.setValueAtTime(peakF * 0.9, t + Math.max(0.09, dur - 0.07));
          g.gain.linearRampToValueAtTime(0, t + dur + 0.1);
          continue;
        }
        const osc = ac.createOscillator();
        const g = ac.createGain();
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
  // 🎻 drone: a soft low Sa–Pa under the whole tune
  if (song.drone) {
    const start = ac.currentTime + 0.05;
    for (const dn of song.drone.split("+")) {
      const f = freqOf(dn);
      if (!f) continue;
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.type = "triangle";
      o.frequency.value = f;
      o.connect(g);
      g.connect(master);
      g.gain.setValueAtTime(0, start);
      g.gain.linearRampToValueAtTime(0.07, start + 1.2);
      g.gain.setValueAtTime(0.07, Math.max(start + 1.3, t - 1.5));
      g.gain.linearRampToValueAtTime(0, t + 0.3);
      o.start(start);
      o.stop(t + 0.4);
      nodes.push(o);
    }
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
