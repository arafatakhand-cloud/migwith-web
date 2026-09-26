"use client";

import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { storage } from "./firebase";

// Photo messages: shrink the picture in the browser (like the app does
// before uploading), then upload it to Storage and return its URL.

export const MAX_IMAGE_UPLOAD_BYTES = 10 * 1024 * 1024; // matches the Storage rules
const MAX_SIDE = 1600;

// Same as the app's storageSafeSegment: ASCII letters/digits, "-" and "_".
export function storageSafeSegment(value: string): string {
  const cleaned = Array.from(value.trim())
    .map((c) => (/^[A-Za-z0-9_-]$/.test(c) ? c : "_"))
    .join("")
    .replace(/^_+|_+$/g, "");
  return cleaned ? cleaned.slice(0, 64) : "room";
}

async function compress(file: File): Promise<Blob | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return await new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/jpeg", 0.82));
  } catch {
    return null; // e.g. a format the browser can't decode — send the original
  }
}

function sizeLabel(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`;
}

/** Uploads a photo to `${folder}/<random>.jpg` and returns its download URL. */
export async function uploadChatImage(folder: string, file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Please choose a photo.");
  // GIFs keep their animation; everything else is re-encoded as JPEG.
  const small = file.type === "image/gif" ? null : await compress(file);
  const body: Blob = small && small.size < file.size ? small : file;
  if (body.size > MAX_IMAGE_UPLOAD_BYTES) {
    throw new Error(`That photo is ${sizeLabel(body.size)}. The limit is 10 MB — please send a smaller one.`);
  }
  const r = ref(storage, `${folder}/${crypto.randomUUID()}.jpg`);
  await uploadBytes(r, body, { contentType: body.type || "image/jpeg" });
  return getDownloadURL(r);
}
