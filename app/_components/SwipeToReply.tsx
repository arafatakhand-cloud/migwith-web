"use client";

import { useRef, useState } from "react";

// Drag a message to the right (finger or mouse) past the mark to reply to it,
// like the app. Up/down still scrolls the chat.
export function SwipeToReply({
  enabled,
  onReply,
  children,
}: {
  enabled: boolean;
  onReply: () => void;
  children: React.ReactNode;
}) {
  const [dx, setDx] = useState(0);
  // The latest distance, for pointerup (a quick swipe can end before React re-renders).
  const dxRef = useRef(0);
  const drag = useRef<{ x: number; y: number; id: number; sideways: boolean | null } | null>(null);
  if (!enabled) return <>{children}</>;
  const MARK = 64;
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
      className={`relative touch-pan-y ${dx > 0 ? "select-none" : ""}`}
      // Dragging selected text would start the browser's own drag-and-drop instead.
      onDragStart={(e) => e.preventDefault()}
      onPointerDown={(e) => {
        drag.current = { x: e.clientX, y: e.clientY, id: e.pointerId, sideways: null };
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d || d.id !== e.pointerId) return;
        const mx = e.clientX - d.x;
        const my = e.clientY - d.y;
        if (d.sideways === null && (Math.abs(mx) > 8 || Math.abs(my) > 8)) {
          d.sideways = mx > 0 && Math.abs(mx) > Math.abs(my);
          if (d.sideways) e.currentTarget.setPointerCapture(e.pointerId);
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
