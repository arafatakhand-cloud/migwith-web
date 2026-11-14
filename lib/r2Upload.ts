"use client";

import { httpsCallable } from "firebase/functions";
import { functions } from "./firebase";

// ☁️ Cloudflare R2 uploads (photos, songs, voice, videos) — seeing / hearing them
// costs nothing there, unlike Firebase Storage. The server (r2UploadUrl) gives a
// 15-minute signed link for exactly this file (folder, type, size); the browser
// PUTs it there and keeps the public link.
// Returns null when R2 is not set up (or an older server, or a type only Firebase
// takes) — the caller then uploads to Firebase Storage exactly as before.
// kind: feed_video, feed_image, story_image, song, song_library, room_image,
//       room_audio, profile_picture, cover_picture

export type R2Kind =
  | "feed_video" | "feed_image" | "story_image" | "song" | "song_library"
  | "room_image" | "room_audio" | "room_video" | "profile_picture" | "cover_picture" | "story_video";

const r2UploadUrl = httpsCallable<Record<string, unknown>, { r2?: boolean; uploadUrl?: string; publicUrl?: string }>(
  functions,
  "r2UploadUrl"
);

export async function r2Upload(kind: R2Kind, body: Blob, type?: string, extra: Record<string, unknown> = {}): Promise<string | null> {
  const t = String(type || body.type || "").split(";")[0].trim().toLowerCase();
  if (!t || !body.size) return null;
  let res;
  try {
    res = (await r2UploadUrl({ kind, type: t, size: body.size, ...extra })).data;
  } catch (e: any) {
    if (e?.code === "functions/not-found") return null; // older server
    if (e?.code === "functions/invalid-argument" && String(e?.message || "").includes("type can't be used")) return null;
    throw e;
  }
  if (!res?.r2 || !res.uploadUrl || !res.publicUrl) return null;
  const put = await fetch(res.uploadUrl, { method: "PUT", headers: { "Content-Type": t }, body });
  if (!put.ok) throw new Error(`Upload failed (${put.status}). Please try again.`);
  return res.publicUrl;
}

/** Which R2 kind a Storage folder belongs to (null = it stays on Firebase, e.g. private chats). */
export function r2KindForFolder(folder: string): { kind: R2Kind; extra?: Record<string, unknown> } | null {
  if (folder.startsWith("room_images/blog_")) return { kind: "feed_image" };
  if (folder.startsWith("blog_stories/")) return { kind: "story_image" };
  if (folder.startsWith("room_images/")) return { kind: "room_image", extra: { room: folder.slice("room_images/".length) } };
  return null;
}
