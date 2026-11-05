"use client";

import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { storage } from "./firebase";

// 🎬 Feed videos go to blog_videos/<uid>/… (the Storage rules allow only the
// writer's own folder, mp4 / webm / quicktime, at most 50 MB).

export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
const VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];

/** Uploads one video for a feed post and returns its download URL. */
export async function uploadBlogVideo(uid: string, file: File): Promise<string> {
  if (!VIDEO_TYPES.includes(file.type)) throw new Error("Please choose an MP4, WebM or MOV video.");
  if (file.size > MAX_VIDEO_BYTES) throw new Error("That video is over 50 MB. Please send a shorter one.");
  const ext = file.type === "video/webm" ? "webm" : file.type === "video/quicktime" ? "mov" : "mp4";
  const r = ref(storage, `blog_videos/${uid}/${crypto.randomUUID()}.${ext}`);
  await uploadBytes(r, file, { contentType: file.type });
  return getDownloadURL(r);
}
