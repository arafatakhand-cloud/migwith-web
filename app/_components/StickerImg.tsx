"use client";

import { useStickerMotion } from "../../lib/stickers";

// 🎨 One sticker picture, moving the way its pack says (✨ stk-* in globals.css).
export function StickerImg({ url, className = "", alt = "Sticker" }: { url: string; className?: string; alt?: string }) {
  const motion = useStickerMotion(url);
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt={alt} loading="lazy" draggable={false} className={`${className} ${motion ? `stk-${motion}` : ""}`} />
  );
}
