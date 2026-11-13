"use client";

import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { auth, storage } from "./firebase";
import { r2KindForFolder, r2Upload } from "./r2Upload";

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
  const contentType = body.type && body.type.startsWith("image/") ? body.type : "image/jpeg";
  // ☁️ R2 first for room / Feed / story photos (private chats stay on Firebase)
  const r2k = r2KindForFolder(folder);
  if (r2k) {
    const url = await r2Upload(r2k.kind, body, contentType, r2k.extra);
    if (url) return url;
  }
  const send = async () => {
    const r = ref(storage, `${folder}/${crypto.randomUUID()}.jpg`);
    await uploadBytes(r, body, { contentType });
    return getDownloadURL(r);
  };
  try {
    return await send();
  } catch (e: any) {
    // 🔑 On phones (above all iPhone Safari) the login token sometimes fails to
    // refresh in the background, so Storage sees "not signed in" and refuses
    // ("storage/unauthorized"). Refresh the token and try once more.
    if (e?.code === "storage/unauthorized" && auth.currentUser) {
      try {
        await auth.currentUser.getIdToken(true);
        return await send();
      } catch {
        // fall through to the simple message
      }
    }
    if (e?.code === "storage/unauthorized" || e?.code === "storage/unauthenticated") {
      throw new Error("Couldn't send the photo — please try again. If it keeps failing, log out and log in once.");
    }
    if (e?.code === "storage/retry-limit-exceeded" || e?.code === "storage/canceled") {
      throw new Error("Couldn't send the photo — check your internet and try again.");
    }
    throw e;
  }
}

/** 🪶 A small copy (≈720px) of a photo for the Feed list, so phones download
 *  ~60 KB instead of the full picture. Returns '' if it can't be made — the
 *  Feed then simply shows the full photo. */
export async function uploadThumb(folder: string, file: File, side = 720): Promise<string> {
  try {
    if (!file.type.startsWith("image/") || file.type === "image/gif") return "";
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, side / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob: Blob | null = await new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/jpeg", 0.74));
    if (!blob) return "";
    const r2k = r2KindForFolder(folder);
    if (r2k) {
      const url = await r2Upload(r2k.kind, blob, "image/jpeg", { ...(r2k.extra || {}), thumb: true });
      if (url) return url;
    }
    const r = ref(storage, `${folder}/thumb_${crypto.randomUUID()}.jpg`);
    await uploadBytes(r, blob, { contentType: "image/jpeg" });
    return await getDownloadURL(r);
  } catch {
    return "";
  }
}
