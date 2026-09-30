"use client";

import { useEffect, useMemo, useRef, useState } from "react";

// Profile photo crop, like the app's ProfilePhotoCrop.kt: after picking a photo
// a full-screen editor opens — drag to move, pinch / scroll / slider to zoom,
// ⟳ to turn it — and the round frame shows exactly what becomes the profile
// picture. "Use photo" cuts that square out as a 512×512 JPEG.

const OUT = 512;
const MAX_SIDE = 2048;

// Loads the file upright (EXIF rotation applied) and at most 2048 px.
async function loadUpright(file: File): Promise<HTMLCanvasElement> {
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions);
  const s = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * s);
  c.height = Math.round(bmp.height * s);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close?.();
  return c;
}

function rotate90(src: HTMLCanvasElement): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = src.height;
  c.height = src.width;
  const g = c.getContext("2d")!;
  g.translate(c.width, 0);
  g.rotate(Math.PI / 2);
  g.drawImage(src, 0, 0);
  return c;
}

export function PhotoCropDialog({
  file,
  onCancel,
  onCropped,
  frameAspect = 1,
  round = true,
  outWidth = OUT,
  hint = "Drag to move · pinch or scroll to zoom · the circle is your profile picture",
}: {
  file: File;
  onCancel: () => void;
  onCropped: (jpeg: Blob) => void;
  /** Frame width ÷ height: 1 for the profile picture, 3.2 for the cover. */
  frameAspect?: number;
  /** Round frame (profile picture) or a rectangle (cover). */
  round?: boolean;
  /** Width of the saved JPEG; its height follows frameAspect. */
  outWidth?: number;
  hint?: string;
}) {
  const [img, setImg] = useState<HTMLCanvasElement | null>(null);
  const [failed, setFailed] = useState(false);
  const [zoom, setZoom] = useState(1); // 1 = the photo just covers the circle
  const [offset, setOffset] = useState({ x: 0, y: 0 }); // screen px
  const [box, setBox] = useState({ w: 1, h: 1 });
  const [saving, setSaving] = useState(false);
  const areaRef = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinchStart = useRef<{ dist: number; zoom: number } | null>(null);

  useEffect(() => {
    let alive = true;
    loadUpright(file)
      .then((c) => alive && setImg(c))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [file]);

  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // The frame: as big as fits (86 %), in the wanted shape.
  const frameW = Math.min(box.w, box.h * frameAspect) * 0.86;
  const frameH = frameW / frameAspect;
  // Scale at which the photo just covers the frame.
  const baseScale = img ? Math.max(frameW / img.width, frameH / img.height) : 1;

  const clamp = (o: { x: number; y: number }, z: number) => {
    if (!img) return o;
    const s = baseScale * z;
    const maxX = Math.max(0, img.width * s - frameW) / 2;
    const maxY = Math.max(0, img.height * s - frameH) / 2;
    return { x: Math.min(maxX, Math.max(-maxX, o.x)), y: Math.min(maxY, Math.max(-maxY, o.y)) };
  };

  const setZoomClamped = (z: number) => {
    const nz = Math.min(6, Math.max(1, z));
    setZoom(nz);
    setOffset((o) => clamp(o, nz));
  };

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinchStart.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), zoom };
    }
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size >= 2 && pinchStart.current) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      setZoomClamped((pinchStart.current.zoom * d) / Math.max(1, pinchStart.current.dist));
    } else {
      const dx = e.clientX - prev.x;
      const dy = e.clientY - prev.y;
      setOffset((o) => clamp({ x: o.x + dx, y: o.y + dy }, zoom));
    }
  };
  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinchStart.current = null;
  };

  const useIt = () => {
    if (!img || saving) return;
    setSaving(true);
    // Same numbers as the screen: which part of the photo is inside the frame.
    const scale = baseScale * zoom;
    const srcW = Math.max(1, Math.min(img.width, frameW / scale));
    const srcH = Math.max(1, Math.min(img.height, frameH / scale));
    const cx = img.width / 2 - offset.x / scale;
    const cy = img.height / 2 - offset.y / scale;
    const left = Math.min(img.width - srcW, Math.max(0, cx - srcW / 2));
    const top = Math.min(img.height - srcH, Math.max(0, cy - srcH / 2));
    const out = document.createElement("canvas");
    out.width = outWidth;
    out.height = Math.round(outWidth / frameAspect);
    const g = out.getContext("2d")!;
    g.imageSmoothingQuality = "high";
    g.drawImage(img, left, top, srcW, srcH, 0, 0, out.width, out.height);
    out.toBlob(
      (b) => {
        if (b) onCropped(b);
        else setSaving(false);
      },
      "image/jpeg",
      0.9
    );
  };

  // The picture shown in the editor (made once per image / rotation).
  const imgUrl = useMemo(() => (img ? img.toDataURL("image/jpeg", 0.92) : ""), [img]);
  const shownW = img ? img.width * baseScale * zoom : 0;
  const shownH = img ? img.height * baseScale * zoom : 0;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-[#0B0F1A] text-white">
      <p className="pt-5 text-center text-lg font-bold">Move and zoom</p>
      <p className="px-4 pb-3 pt-1 text-center text-xs text-white/60">{hint}</p>

      <div
        ref={areaRef}
        className="relative min-h-0 flex-1 touch-none select-none overflow-hidden"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={(e) => setZoomClamped(zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08))}
      >
        {failed ? (
          <p className="absolute inset-0 flex items-center justify-center">Could not open this photo.</p>
        ) : !img ? (
          <p className="absolute inset-0 flex items-center justify-center text-white/70">Loading…</p>
        ) : (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imgUrl}
              alt=""
              draggable={false}
              className="pointer-events-none absolute left-0 top-0 max-w-none"
              style={{
                width: shownW,
                height: shownH,
                transform: `translate(${(box.w - shownW) / 2 + offset.x}px, ${(box.h - shownH) / 2 + offset.y}px)`,
              }}
            />
            {/* Dark cover with a window (round, or the cover's rectangle) + white ring. */}
            <div
              className={`pointer-events-none absolute border-2 border-white ${round ? "rounded-full" : "rounded-lg"}`}
              style={{
                width: frameW,
                height: frameH,
                left: (box.w - frameW) / 2,
                top: (box.h - frameH) / 2,
                boxShadow: "0 0 0 9999px rgba(0,0,0,.62)",
              }}
            />
          </>
        )}
      </div>

      {img && (
        <div className="flex items-center gap-3 px-6 pt-3">
          <span className="text-sm">➖</span>
          <input
            type="range"
            min={1}
            max={6}
            step={0.01}
            value={zoom}
            onChange={(e) => setZoomClamped(Number(e.target.value))}
            className="flex-1 accent-[#2EC27E]"
            aria-label="Zoom"
          />
          <span className="text-sm">➕</span>
        </div>
      )}

      <div className="flex items-center gap-2.5 px-4 py-4">
        <button
          type="button"
          onClick={() => !saving && onCancel()}
          className="h-[46px] flex-1 rounded-[14px] bg-white/10 text-[15px] font-bold"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={!img || saving}
          onClick={() => {
            if (!img) return;
            setImg(rotate90(img));
            setZoom(1);
            setOffset({ x: 0, y: 0 });
          }}
          className="h-[46px] w-14 rounded-[14px] bg-white/10 text-lg font-bold disabled:opacity-40"
          aria-label="Rotate"
        >
          ⟳
        </button>
        <button
          type="button"
          disabled={!img || saving}
          onClick={useIt}
          className="h-[46px] flex-1 rounded-[14px] bg-[#2EC27E] text-[15px] font-bold disabled:opacity-60"
        >
          {saving ? "Saving…" : "Use photo"}
        </button>
      </div>
    </div>
  );
}
