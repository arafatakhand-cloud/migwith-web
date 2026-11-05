"use client";

import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { storage } from "./firebase";
import { blogCall } from "./feed";

// 🎵 A story song: a short audio file the writer chooses (their own, or one they have the right to use).
// It goes to blog_music/<uid>/…; the story plays its first 30 seconds.

export const STORY_SONG_SECONDS = 30;
export const MAX_SONG_BYTES = 6 * 1024 * 1024;
const SONG_TYPES = ["audio/mpeg", "audio/mp4", "audio/aac", "audio/ogg", "audio/wav", "audio/x-m4a"];

/** Uploads one audio file for a story and returns its URL plus a title from the file name. */
export async function uploadStorySong(uid: string, file: File): Promise<{ url: string; title: string }> {
  if (!SONG_TYPES.includes(file.type)) throw new Error("Please choose an MP3, M4A, AAC, OGG or WAV song.");
  if (file.size > MAX_SONG_BYTES) throw new Error("That song is over 6 MB. Please choose a shorter one.");
  const ext = file.name.includes(".") ? file.name.split(".").pop()!.toLowerCase().replace(/[^a-z0-9]/g, "") : "mp3";
  const r = ref(storage, `blog_music/${uid}/${crypto.randomUUID()}.${ext || "mp3"}`);
  await uploadBytes(r, file, { contentType: file.type });
  const title = file.name.replace(/\.[^.]+$/, "").slice(0, 60) || "Song";
  return { url: await getDownloadURL(r), title };
}

// 🎼 The song library: songs miGlife added (licensed or royalty-free). Anyone can pick one.
export type LibrarySong = { id: string; title: string; artist: string; category: string; url: string };

export async function loadSongLibrary(): Promise<LibrarySong[]> {
  const r = await blogCall("songs");
  return (Array.isArray(r.songs) ? r.songs : []) as LibrarySong[];
}
