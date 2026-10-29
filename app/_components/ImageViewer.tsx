"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

// 🖼 Full-screen photo viewer (like the app): a room photo opens over the
// chat, not in a new browser tab. ✕ or Esc closes it; a tap closes it when it
// is not zoomed in.
// 🔍 Zoom (miglife: "a shared picture can't be zoomed"), like the app: pinch
// with two fingers (or the mouse wheel), drag a zoomed picture around, and
// double-tap / double-click to zoom in and back out.

let current: string | null = null;
const subs = new Set<() => void>();
const set = (v: string | null) => {
  current = v;
  subs.forEach((f) => f());
};
const subscribe = (f: () => void) => {
  subs.add(f);
  return () => subs.delete(f);
};

export const openImageViewer = (url: string) => set(url);

const MAX_ZOOM = 5;
const DOUBLE_ZOOM = 2.5;

type Pt = { x: number; y: number };

/** The full-screen picture with pinch / wheel / double-tap zoom. */
export function ZoomImageViewer({ url, onClose, zIndex = 90 }: { url: string; onClose: () => void; zIndex?: number }) {
  const box = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ zoom: 1, x: 0, y: 0 });
  const viewRef = useRef(view);
  viewRef.current = view;
  const pointers = useRef(new Map<number, Pt>());
  const pinch = useRef<{ dist: number; zoom: number } | null>(null);
  const moved = useRef(false);
  const lastTap = useRef(0);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // a point on the screen, measured from the middle of the viewer
  const local = (p: Pt): Pt => {
    const r = box.current?.getBoundingClientRect();
    return r ? { x: p.x - (r.left + r.width / 2), y: p.y - (r.top + r.height / 2) } : { x: 0, y: 0 };
  };
  // keep the zoomed picture from sliding off the screen
  const clamp = (zoom: number, x: number, y: number) => {
    const r = box.current?.getBoundingClientRect();
    const mx = r ? (r.width * (zoom - 1)) / 2 : 0;
    const my = r ? (r.height * (zoom - 1)) / 2 : 0;
    return zoom <= 1.001 ? { zoom: 1, x: 0, y: 0 } : { zoom, x: Math.max(-mx, Math.min(mx, x)), y: Math.max(-my, Math.min(my, y)) };
  };
  // zoom to [z] keeping the point [q] (from the middle) still under the finger / mouse
  const zoomAt = (z: number, q: Pt) => {
    const v = viewRef.current;
    const nz = Math.max(1, Math.min(MAX_ZOOM, z));
    setView(clamp(nz, q.x - (q.x - v.x) * (nz / v.zoom), q.y - (q.y - v.y) * (nz / v.zoom)));
  };
  const toggleAt = (q: Pt) => {
    if (viewRef.current.zoom > 1.05) setView({ zoom: 1, x: 0, y: 0 });
    else zoomAt(DOUBLE_ZOOM, q);
  };
  const two = () => Array.from(pointers.current.values()).slice(0, 2);
  const dist = () => {
    const [a, b] = two();
    return Math.hypot(a.x - b.x, a.y - b.y) || 1;
  };
  const mid = (): Pt => {
    const [a, b] = two();
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  };

  return (
    <div
      ref={box}
      className="fixed inset-0 flex items-center justify-center overflow-hidden bg-black/90 p-3"
      style={{ zIndex, touchAction: "none", cursor: view.zoom > 1 ? "grab" : "zoom-in" }}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture?.(e.pointerId);
        pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        setDragging(true);
        if (pointers.current.size === 1) moved.current = false;
        if (pointers.current.size === 2) pinch.current = { dist: dist(), zoom: viewRef.current.zoom };
      }}
      onPointerMove={(e) => {
        const prev = pointers.current.get(e.pointerId);
        if (!prev) return;
        const now = { x: e.clientX, y: e.clientY };
        if (Math.hypot(now.x - prev.x, now.y - prev.y) > 2) moved.current = true;
        pointers.current.set(e.pointerId, now);
        if (pointers.current.size >= 2 && pinch.current) {
          // ✌️ pinch: zoom around the middle of the two fingers
          zoomAt((pinch.current.zoom * dist()) / pinch.current.dist, local(mid()));
        } else if (pointers.current.size === 1 && viewRef.current.zoom > 1) {
          // 👆 drag a zoomed picture around
          const v = viewRef.current;
          setView(clamp(v.zoom, v.x + now.x - prev.x, v.y + now.y - prev.y));
        }
      }}
      onPointerUp={(e) => {
        const wasPinch = pointers.current.size >= 2 || pinch.current !== null;
        pointers.current.delete(e.pointerId);
        if (pointers.current.size === 0) setDragging(false);
        if (pointers.current.size < 2) pinch.current = null;
        if (wasPinch || moved.current || pointers.current.size > 0) return;
        // a tap: twice quickly → zoom in / out; once → close (only when not zoomed)
        const t = Date.now();
        const q = local({ x: e.clientX, y: e.clientY });
        if (t - lastTap.current < 300) {
          lastTap.current = 0;
          toggleAt(q);
          return;
        }
        lastTap.current = t;
        const zoomedNow = viewRef.current.zoom > 1.05;
        setTimeout(() => {
          if (lastTap.current === t && !zoomedNow) onClose();
        }, 300);
      }}
      onPointerCancel={(e) => {
        pointers.current.delete(e.pointerId);
        if (pointers.current.size === 0) setDragging(false);
        pinch.current = null;
      }}
      onWheel={(e) => zoomAt(viewRef.current.zoom * Math.exp(-e.deltaY * 0.0022), local({ x: e.clientX, y: e.clientY }))}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt="Photo"
        draggable={false}
        className="max-h-full max-w-full select-none object-contain"
        style={{
          transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`,
          transition: dragging ? "none" : "transform .15s ease-out",
        }}
      />
      <button
        type="button"
        aria-label="Close"
        onPointerDown={(e) => e.stopPropagation()}
        onPointerUp={(e) => e.stopPropagation()}
        onClick={onClose}
        className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-xl text-white"
      >
        ✕
      </button>
    </div>
  );
}

export function ImageViewerHost() {
  const url = useSyncExternalStore(subscribe, () => current, () => null);
  useEffect(() => () => set(null), []);
  if (!url) return null;
  return <ZoomImageViewer key={url} url={url} onClose={() => set(null)} />;
}
