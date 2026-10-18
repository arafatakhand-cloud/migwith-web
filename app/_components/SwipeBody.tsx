"use client";

import { useLayoutEffect, useRef } from "react";
import { usePathname } from "next/navigation";

// 👉 Swipe between the tabs like the app's pager: the page follows the finger
// with the next tab right beside it, then the next one takes its place.
// The tab beside it is a copy of how that page looked when you last left it
// (kept in memory while the tab is open); the real page replaces the copy as
// soon as it opens, in the same spot, so nothing jumps or goes blank.

/** Set by TopBar just before it opens the next tab when there is no copy of
 *  it yet: 1 = the new page slides in from the right (a left swipe), -1 = from the left. */
export const swipeEnter = { dir: 0, at: 0 };

export const SWIPE_BODY = "[data-swipe-body]";

const key = (path: string) => {
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
};

/** Back to normal: no transform left behind (it would break fixed bars). */
export function clearSwipeStyle(el: HTMLElement) {
  el.style.transition = "";
  el.style.transform = "";
}

// ---- copies of the pages as last seen ----
const copies = new Map<string, HTMLElement>();

function keepCopy(el: HTMLElement, path: string) {
  // Remember where scrolled lists were (a chat at its newest line).
  const scrolled: HTMLElement[] = [];
  el.querySelectorAll<HTMLElement>("*").forEach((n) => {
    if (n.scrollTop > 0) {
      n.dataset.snapScroll = String(n.scrollTop);
      scrolled.push(n);
    }
  });
  const box = document.createElement("div");
  el.childNodes.forEach((c) => box.appendChild(c.cloneNode(true)));
  scrolled.forEach((n) => delete n.dataset.snapScroll);
  box.querySelectorAll("[id]").forEach((n) => n.removeAttribute("id"));
  const k = key(path);
  copies.delete(k);
  copies.set(k, box);
  if (copies.size > 10) copies.delete(copies.keys().next().value as string);
}

// ---- the tab beside the page while a finger drags it ----
const peek: { host: HTMLElement | null; path: string; side: number; hasCopy: boolean } = {
  host: null,
  path: "",
  side: 0,
  hasCopy: false,
};

export function removePeek() {
  peek.host?.remove();
  peek.host = null;
  peek.path = "";
  peek.side = 0;
  peek.hasCopy = false;
}

/** Show `path` beside the page: side 1 = on the right, -1 = on the left. */
export function showPeek(body: HTMLElement, path: string, side: number) {
  if (peek.host && peek.path === path && peek.side === side) return;
  removePeek();
  const parent = body.parentElement;
  if (!parent) return;
  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  host.inert = true;
  Object.assign(host.style, {
    position: "absolute",
    top: "0px",
    left: `${body.offsetLeft}px`,
    width: `${body.offsetWidth}px`,
    minHeight: `${body.offsetHeight}px`,
    pointerEvents: "none",
    transform: `translateX(${side * 100}%)`,
  });
  const copy = copies.get(key(path));
  if (copy) host.appendChild(copy.cloneNode(true));
  parent.appendChild(host);
  host.querySelectorAll<HTMLElement>("[data-snap-scroll]").forEach((n) => {
    n.scrollTop = Number(n.dataset.snapScroll) || 0;
  });
  Object.assign(peek, { host, path, side, hasCopy: !!copy });
}

export function peekHasCopy() {
  return peek.hasCopy;
}

/** Move the page and the tab beside it together. */
export function dragTo(body: HTMLElement, dx: number, animateMs = 0) {
  const t = animateMs ? `transform ${animateMs}ms cubic-bezier(.2,.8,.2,1)` : "none";
  body.style.transition = t;
  body.style.transform = `translateX(${dx}px)`;
  if (peek.host) {
    peek.host.style.transition = t;
    peek.host.style.transform = `translateX(calc(${peek.side * 100}% + ${dx}px))`;
  }
}

/** Let go past the line: the page leaves, the tab beside it takes its place. */
export function slideAway(body: HTMLElement, side: number, ms: number) {
  const t = `transform ${ms}ms cubic-bezier(.2,.8,.2,1)`;
  body.style.transition = t;
  body.style.transform = `translateX(${-side * 100}%)`;
  if (peek.host) {
    peek.host.style.transition = t;
    peek.host.style.transform = "translateX(0)";
  }
}

/** Not far enough: both back where they were. */
export function slideBack(body: HTMLElement, ms: number) {
  dragTo(body, 0, ms);
  const host = peek.host;
  window.setTimeout(() => {
    clearSwipeStyle(body);
    if (peek.host === host) removePeek();
  }, ms + 20);
}

export function SwipeBody({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const pathRef = useRef(pathname);
  pathRef.current = pathname;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Opened by a swipe with a copy beside it: the copy is exactly here, so
    // just take its place.
    if (peek.host) {
      removePeek();
      swipeEnter.dir = 0;
    }
    const keep = () => keepCopy(el, pathRef.current);
    const { dir, at } = swipeEnter;
    if (!dir || Date.now() - at > 1500) return keep;
    // No copy yet (first visit this time): slide in from the side.
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
      keep();
    };
  }, []);

  return (
    <div ref={ref} data-swipe-body className="min-w-0 flex-1">
      {children}
    </div>
  );
}
