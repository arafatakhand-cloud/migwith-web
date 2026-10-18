"use client";

import { useLayoutEffect, useRef } from "react";

// 👉 Swipe between the tabs like the app: the page follows the finger, slides
// out, and the next page slides in from the other side. TopBar moves this
// element while the finger is down; a page opened by a swipe slides in here.

/** Set by TopBar just before it opens the next tab: 1 = the new page comes in
 *  from the right (a left swipe), -1 = from the left. */
export const swipeEnter = { dir: 0, at: 0 };

export const SWIPE_BODY = "[data-swipe-body]";

/** Back to normal: no transform left behind (it would break fixed bars). */
export function clearSwipeStyle(el: HTMLElement) {
  el.style.transition = "";
  el.style.transform = "";
}

export function SwipeBody({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    const { dir, at } = swipeEnter;
    if (!el || !dir || Date.now() - at > 1500) return;
    swipeEnter.dir = 0;
    el.style.transition = "none";
    el.style.transform = `translateX(${dir * 100}%)`;
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        el.style.transition = "transform 220ms cubic-bezier(.2,.8,.2,1)";
        el.style.transform = "translateX(0)";
      });
    });
    const done = () => clearSwipeStyle(el);
    el.addEventListener("transitionend", done, { once: true });
    const safety = window.setTimeout(done, 450);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(safety);
      el.removeEventListener("transitionend", done);
    };
  }, []);
  return (
    <div ref={ref} data-swipe-body className="min-w-0 flex-1">
      {children}
    </div>
  );
}
