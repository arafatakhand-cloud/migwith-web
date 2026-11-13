"use client";

import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { httpsCallable } from "firebase/functions";
import { functions, storage } from "./firebase";

// 🎬 Feed videos. ☁️ Cloudflare R2 first (watching costs nothing there): the server
// (videoUploadUrl) gives a 15-minute signed link for exactly this file (type + size),
// the browser PUTs the file there and the post keeps the public link. When the
// server has no R2 set up yet it says { r2: false } and the video goes to
// Firebase Storage blog_videos/<uid>/… as before (mp4 / webm / quicktime, ≤ 50 MB).

export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
const VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];
const videoUploadUrl = httpsCallable<{ type: string; size: number }, { r2?: boolean; uploadUrl?: string; publicUrl?: string }>(
  functions,
  "videoUploadUrl"
);

async function uploadToR2(file: File): Promise<string | null> {
  let res;
  try {
    res = (await videoUploadUrl({ type: file.type, size: file.size })).data;
  } catch (e: any) {
    if (e?.code === "functions/not-found") return null; // older server without R2
    throw e;
  }
  if (!res?.r2 || !res.uploadUrl || !res.publicUrl) return null;
  const put = await fetch(res.uploadUrl, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
  if (!put.ok) throw new Error(`Video upload failed (${put.status}). Please try again.`);
  return res.publicUrl;
}

/** Uploads one video for a feed post and returns its link. */
export async function uploadBlogVideo(uid: string, file: File): Promise<string> {
  if (!VIDEO_TYPES.includes(file.type)) throw new Error("Please choose an MP4, WebM or MOV video.");
  if (file.size > MAX_VIDEO_BYTES) throw new Error("That video is over 50 MB. Please send a shorter one.");
  const r2 = await uploadToR2(file);
  if (r2) return r2;
  const ext = file.type === "video/webm" ? "webm" : file.type === "video/quicktime" ? "mov" : "mp4";
  const r = ref(storage, `blog_videos/${uid}/${crypto.randomUUID()}.${ext}`);
  await uploadBytes(r, file, { contentType: file.type });
  return getDownloadURL(r);
}
