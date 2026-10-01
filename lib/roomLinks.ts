// 🔗 LINKS IN ROOM CHAT, like the app's RoomLinks.kt (rooms only — private
// chat is unchanged): any link is blue + underlined and can be tapped; a
// normal link asks "You are leaving miglife" first; a YouTube link gets a
// thumbnail card and plays inside the room in a popup.

const ROOM_URL_RE =
  /\b((?:https?:\/\/|www\.)[^\s<>"]+|(?:[a-z0-9-]+\.)+(?:com|net|org|app|io|me|bd|in|pk|co|tv|gg|xyz|info|link|ly|be|uk|us|dev|site|online|store|shop)(?:\/[^\s<>"]*)?)/gi;

export type RoomLink = { start: number; end: number; url: string };

/** Every link found in the text, with its scheme added. */
export function findRoomLinks(text: string): RoomLink[] {
  const out: RoomLink[] = [];
  for (const m of text.matchAll(ROOM_URL_RE)) {
    let raw = m[0];
    // a sentence's own punctuation is not part of the link
    while (raw && ".,!?;:)]}'\"".includes(raw[raw.length - 1])) raw = raw.slice(0, -1);
    const start = m.index ?? 0;
    // the part after "@" in an email address is not a link
    if (raw.length < 4 || raw.split("/")[0].includes("@") || /[@\w.-]/.test(text[start - 1] || "")) continue;
    out.push({ start, end: start + raw.length, url: /^https?:\/\//i.test(raw) ? raw : `https://${raw}` });
  }
  return out;
}

const YT_ID_RE =
  /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/|v\/)|youtu\.be\/|m\.youtube\.com\/watch\?(?:.*&)?v=)([A-Za-z0-9_-]{11})/i;

export function youTubeIdOf(url: string): string | null {
  return YT_ID_RE.exec(url)?.[1] ?? null;
}

/** The first YouTube link in a message. */
export function firstYouTubeLink(text: string): { url: string; id: string } | null {
  for (const l of findRoomLinks(text)) {
    const id = youTubeIdOf(l.url);
    if (id) return { url: l.url, id };
  }
  return null;
}
