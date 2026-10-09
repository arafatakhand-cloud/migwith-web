"use client";

import { useRef, useState } from "react";

// Drag a message to the right (finger or mouse) past the mark to reply to it,
// like the app. Up/down still scrolls the chat.

/**
 * Full-width lines (Classic style, game rooms): the line is as wide as the chat,
 * so a swipe on the EMPTY space next to a short line or a photo used to open
 * reply instead of sliding rooms. Reply starts only on the message itself (its
 * text / photo / voice, plus a little margin); empty space slides rooms.
 */
export function isOnSwipeContent(wrapper: Element, x: number, y: number): boolean {
  if (wrapper.getAttribute("data-swipe-full") !== "1") return true;
  const near = (r: DOMRect) => x >= r.left - 24 && x <= r.right + 24 && y >= r.top - 8 && y <= r.bottom + 8;
  for (const el of Array.from(wrapper.querySelectorAll("img, audio, video, a"))) {
    if (near(el.getBoundingClientRect())) return true;
  }
  // Only the TEXT itself counts (a range around elements would include the
  // full-width line box, which covers the empty space too).
  const walker = document.createTreeWalker(wrapper, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!n.nodeValue?.trim()) continue;
    range.selectNodeContents(n);
    for (const r of Array.from(range.getClientRects())) if (r.width > 0 && near(r)) return true;
  }
  return false;
}

/** When a message last took a swipe for reply (Date.now()); a right flick it
 *  did NOT take is left to the room slide. */
export const swipeReplyClaim = { at: 0 };

export function SwipeToReply({
  enabled,
  onReply,
  fullWidth = false,
  children,
}: {
  enabled: boolean;
  onReply: () => void;
  /** The line spans the whole chat width (Classic / game rooms): reply only from the message itself. */
  fullWidth?: boolean;
  children: React.ReactNode;
}) {
  const [dx, setDx] = useState(0);
  // The latest distance, for pointerup (a quick swipe can end before React re-renders).
  const dxRef = useRef(0);
  const drag = useRef<{ x: number; y: number; t: number; id: number; sideways: boolean | null } | null>(null);
  if (!enabled) return <>{children}</>;
  // A little further than before = fewer accidental replies (like the app).
  const MARK = 76;
  const end = () => {
    if (drag.current?.sideways && dxRef.current >= MARK) {
      onReply();
      navigator.vibrate?.(15);
    }
    drag.current = null;
    dxRef.current = 0;
    setDx(0);
  };
  return (
    <div
      data-swipe-reply
      data-swipe-full={fullWidth ? "1" : undefined}
      className={`relative touch-pan-y ${dx > 0 ? "select-none" : ""}`}
      // Dragging selected text would start the browser's own drag-and-drop instead.
      onDragStart={(e) => e.preventDefault()}
      onPointerDown={(e) => {
        // Empty space beside a short full-width line: let the room swipe have it.
        if (!isOnSwipeContent(e.currentTarget, e.clientX, e.clientY)) {
          drag.current = null;
          return;
        }
        drag.current = { x: e.clientX, y: e.clientY, t: e.timeStamp, id: e.pointerId, sideways: null };
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d || d.id !== e.pointerId) return;
        const mx = e.clientX - d.x;
        const my = e.clientY - d.y;
        if (d.sideways === null && (Math.abs(mx) > 8 || Math.abs(my) > 8)) {
          // 🧠 Only a DELIBERATE right drag opens reply. A quick flick (how people
          // change rooms), a mostly-vertical move (scrolling) or a left drag is
          // left alone for the room slide / the list.
          const deliberateRight = mx > 0 && Math.abs(mx) > 2 * Math.abs(my);
          d.sideways = deliberateRight && e.timeStamp - d.t >= 70;
          if (d.sideways) {
            swipeReplyClaim.at = Date.now();
            e.currentTarget.setPointerCapture(e.pointerId);
          }
        }
        if (d.sideways) {
          dxRef.current = Math.max(0, Math.min(mx, 110));
          setDx(dxRef.current);
        }
      }}
      onPointerUp={end}
      onPointerCancel={() => {
        drag.current = null;
        dxRef.current = 0;
        setDx(0);
      }}
    >
      {dx > 0 && (
        <span
          className="absolute left-1 top-1/2 -translate-y-1/2 text-lg text-[#2F80ED] transition-opacity"
          style={{ opacity: Math.min(1, dx / MARK) }}
        >
          ↩
        </span>
      )}
      <div style={{ transform: `translateX(${dx}px)`, transition: dx === 0 ? "transform 150ms" : undefined }}>{children}</div>
    </div>
  );
}
