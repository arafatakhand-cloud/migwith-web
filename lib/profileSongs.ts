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
  category: "Happy" | "Sad";
  price: number;
  bpm: number;
  voice: "trumpet" | "bell" | "soft" | "piano" | "chip" | "pluck";
  colors: [string, string];
  notes: SongNote[];
};

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
