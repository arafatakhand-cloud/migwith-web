"use client";

import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { storage } from "./firebase";
import { r2Upload } from "./r2Upload";
import { videoLengthLabel, videoSecondsOf } from "./sharePerms";

// 🎬 Feed videos. ☁️ Cloudflare R2 first (watching costs nothing there): the server
// (videoUploadUrl) gives a 15-minute signed link for exactly this file (type + size),
// the browser PUTs the file there and the post keeps the public link. When the
// server has no R2 set up yet it says { r2: false } and the video goes to
// Firebase Storage blog_videos/<uid>/… as before (mp4 / webm / quicktime, ≤ 50 MB).

export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
const VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];
/** Uploads one video for a feed post and returns its link. */
export async function uploadBlogVideo(uid: string, file: File, maxSeconds = 300): Promise<string> {
  if (!VIDEO_TYPES.includes(file.type)) throw new Error("Please choose an MP4, WebM or MOV video.");
  if (file.size > MAX_VIDEO_BYTES) throw new Error("That video is over 50 MB. Please send a shorter one (or post it from the app — it makes videos smaller).");
  // ⏱️ miglife's longest-video limit
  const secs = await videoSecondsOf(file);
  if (secs > maxSeconds + 1) {
    const m = Math.floor(secs / 60), r = Math.round(secs % 60);
    throw new Error(`⏱️ This video is ${m}:${String(r).padStart(2, "0")} long — videos can be at most ${videoLengthLabel(maxSeconds)}.`);
  }
  const r2 = await r2Upload("feed_video", file, file.type, secs ? { seconds: Math.round(secs) } : {});
  if (r2) return r2;
  const ext = file.type === "video/webm" ? "webm" : file.type === "video/quicktime" ? "mov" : "mp4";
  const r = ref(storage, `blog_videos/${uid}/${crypto.randomUUID()}.${ext}`);
  await uploadBytes(r, file, { contentType: file.type });
  return getDownloadURL(r);
}
