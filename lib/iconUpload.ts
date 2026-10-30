"use client";

import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { storage } from "./firebase";

// 🎁🏅 Gift / badge pictures (miglife: "uploaded pictures come out crooked, or
// sometimes don't show"). Every picture is now made the same way before it is
// uploaded:
//  • turned the right way up (a phone photo's EXIF rotation is applied),
//  • centred on a 512 × 512 square, keeping its shape and any transparency
//    (nothing is stretched or cut off),
//  • saved as a small PNG — a big camera photo used to load slowly or not at all,
//  • given a fresh link (?v=…) on every upload: the same file name kept the old
//    picture in phones' caches, so a new upload often didn't show.
// Animated GIFs are uploaded as they are (re-drawing them would stop the animation).

export const ICON_SIDE = 512;
const MAX_ICON_BYTES = 5 * 1024 * 1024;

/** The picture as a 512 × 512 PNG, the right way up. */
export async function prepareIcon(file: File): Promise<Blob> {
  if (file.type && !file.type.startsWith("image/")) throw new Error("Please choose a picture (PNG or JPG).");
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("This picture can't be read. Please use a PNG or JPG.");
  }
  const scale = Math.min(ICON_SIDE / bitmap.width, ICON_SIDE / bitmap.height);
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = ICON_SIDE;
  canvas.height = ICON_SIDE;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, Math.round((ICON_SIDE - w) / 2), Math.round((ICON_SIDE - h) / 2), w, h);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("This picture can't be read. Please use a PNG or JPG.");
  return blob;
}

/** Uploads a gift / badge picture to `path` and returns a fresh link to it. */
export async function uploadIcon(path: string, file: File): Promise<string> {
  const gif = file.type === "image/gif";
  const body: Blob = gif ? file : await prepareIcon(file);
  if (body.size > MAX_ICON_BYTES) throw new Error("That picture is too big (over 5 MB). Please choose a smaller one.");
  const r = ref(storage, path);
  await uploadBytes(r, body, { contentType: gif ? "image/gif" : "image/png", cacheControl: "public, max-age=31536000" });
  const url = await getDownloadURL(r);
  return `${url}${url.includes("?") ? "&" : "?"}v=${Date.now()}`;
}
