"use client";

import { useEffect } from "react";

/*
 * 🖱 Sideways rows with a mouse (miglife 2026-11-26: "how can i move between them —
 * most of screen no scrollbar"). On a computer the mouse wheel only scrolls up and
 * down, so rows that scroll sideways (Season Pass levels, tabs, stickers …) could not
 * be moved. Now, over such a row, the wheel moves it sideways — until the row reaches
 * its end, then the page scrolls as usual. Touch screens are not affected.
 */
function sidewaysScroller(start: EventTarget | null): HTMLElement | null {
  let el = start instanceof Element ? (start as HTMLElement) : null;
  while (el && el !== document.body) {
    if (el.scrollWidth > el.clientWidth + 2) {
      const ox = getComputedStyle(el).overflowX;
      if (ox === "auto" || ox === "scroll") {
        // a box that also scrolls up/down keeps the normal wheel
        const oy = getComputedStyle(el).overflowY;
        if (!((oy === "auto" || oy === "scroll") && el.scrollHeight > el.clientHeight + 2)) return el;
      }
    }
    el = el.parentElement;
  }
  return null;
}

export default function WheelSideways() {
  useEffect(() => {
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return; // zoom, or a trackpad already going sideways
      const row = sidewaysScroller(e.target);
      if (!row) return;
      const max = row.scrollWidth - row.clientWidth;
      const dy = e.deltaMode === 1 ? e.deltaY * 32 : e.deltaY;
      if ((dy < 0 && row.scrollLeft <= 0) || (dy > 0 && row.scrollLeft >= max - 1)) return; // at the end → page scrolls
      e.preventDefault();
      row.scrollLeft += dy;
    };
    window.addEventListener("wheel", onWheel, { passive: false });
    return () => window.removeEventListener("wheel", onWheel);
  }, []);
  return null;
}
