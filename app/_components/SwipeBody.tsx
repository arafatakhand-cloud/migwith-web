"use client";

import { useLayoutEffect, useRef } from "react";
import { usePathname } from "next/navigation";

// 👉 Swipe between the tabs like the app's pager: the page follows the finger
// with the next tab right beside it, then the next one takes its place.
// The tab beside it is a copy of how that page looked when you last left it
// (kept in memory while the tab is open); the real page replaces the copy as
// soon as it opens, in the same spot, so nothing jumps or goes blank.
// The heavy work (copying a page, building the tabs beside it) is done while
// the phone is idle, never during a swipe, so the drag itself stays smooth.

/** Set by TopBar just before it opens the next tab when there is no copy of
 *  it yet: 1 = the new page slides in from the right (a left swipe), -1 = from the left. */
export const swipeEnter = { dir: 0, at: 0 };

export const SWIPE_BODY = "[data-swipe-body]";

/** A finger is dragging a page: no idle copying meanwhile. */
export const swipeState = { dragging: false };

// Like the app pager's settle: quick to start, long soft stop.
const EASE = "cubic-bezier(.22,.9,.3,1)";

const key = (path: string) => {
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
};

const idle = (fn: () => void) => {
  const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
  if (w.requestIdleCallback) w.requestIdleCallback(fn, { timeout: 1200 });
  else window.setTimeout(fn, 200);
};

/** Back to normal: no transform left behind (it would break fixed bars). */
export function clearSwipeStyle(el: HTMLElement) {
  el.style.transition = "";
  el.style.transform = "";
  el.style.willChange = "";
}

// ---- copies of the pages as last seen ----
const copies = new Map<string, { box: HTMLElement; at: number }>();

function keepCopy(el: HTMLElement, path: string) {
  if (!el.isConnected && !el.firstChild) return;
  // Remember where scrolled lists were (a chat at its newest line).
  const scrolled: HTMLElement[] = [];
  el.querySelectorAll<HTMLElement>('[class*="overflow-y-auto"], [class*="overflow-auto"], [class*="overflow-y-scroll"]').forEach((n) => {
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
  copies.set(k, { box, at: Date.now() });
  if (copies.size > 10) copies.delete(copies.keys().next().value as string);
}

// ---- the tabs beside the page (built ahead, shown while a finger drags) ----
// Each one is a frame fixed to the screen under the top bar (like a page of
// the app's pager): it always shows that tab from its top, however far this
// page is scrolled, and it stays on screen while the real page opens under
// it, then fades — so nothing jumps.
type Side = 1 | -1;
type Beside = { host: HTMLElement; path: string; hasCopy: boolean };
const beside = new Map<Side, Beside>();
let shown: Side | 0 = 0;

const barBottom = () => {
  const bar = document.querySelector<HTMLElement>("header[data-topbar]");
  return bar ? Math.max(0, Math.round(bar.getBoundingClientRect().bottom)) : 0;
};

function place(host: HTMLElement, body: HTMLElement) {
  const top = barBottom();
  host.style.top = `${top}px`;
  host.style.height = `${Math.max(0, window.innerHeight - top)}px`;
  // Same left edge and width as the page (its frame does not move with a drag).
  const inner = host.firstElementChild as HTMLElement | null;
  const frame = body.parentElement;
  if (inner && frame) {
    inner.style.marginLeft = `${Math.round(frame.getBoundingClientRect().left + body.offsetLeft)}px`;
    inner.style.width = `${Math.round(body.offsetWidth)}px`;
  }
}

function buildHost(body: HTMLElement, path: string, side: Side): Beside | null {
  const main = body.closest("main");
  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  // the Glass theme's page styles reach this copy too (they are written for
  // main[data-shell]); without it the copy showed other colours while sliding
  host.setAttribute("data-shell-copy", "");
  host.inert = true;
  const bg = main ? getComputedStyle(main) : null;
  Object.assign(host.style, {
    position: "fixed",
    left: "0px",
    width: "100%",
    overflow: "hidden",
    zIndex: "25",
    pointerEvents: "none",
    visibility: "hidden",
    contain: "layout paint style",
    backgroundColor: bg?.backgroundColor || "#fff",
    backgroundImage: bg?.backgroundImage || "none",
    transform: `translate3d(${side * 100}%,0,0)`,
  });
  const inner = document.createElement("div");
  const copy = copies.get(key(path));
  if (copy) inner.appendChild(copy.box.cloneNode(true));
  host.appendChild(inner);
  document.body.appendChild(host);
  place(host, body);
  host.querySelectorAll<HTMLElement>("[data-snap-scroll]").forEach((n) => {
    n.scrollTop = Number(n.dataset.snapScroll) || 0;
  });
  const entry = { host, path, hasCopy: !!copy };
  beside.set(side, entry);
  return entry;
}

/** Build the tabs on both sides ahead of time, while the phone is idle. */
export function prepareBeside(left?: string, right?: string) {
  idle(() => {
    if (swipeState.dragging || shown) return;
    const body = document.querySelector<HTMLElement>(SWIPE_BODY);
    if (!body) return;
    ([
      [-1, left],
      [1, right],
    ] as [Side, string | undefined][]).forEach(([side, path]) => {
      const have = beside.get(side);
      if (have && have.host.isConnected && have.path === path && have.hasCopy === copies.has(key(path || ""))) return;
      have?.host.remove();
      beside.delete(side);
      if (path && copies.has(key(path))) buildHost(body, path, side);
    });
  });
}

/** Hide the tabs beside the page (kept, ready for the next swipe). */
export function removePeek() {
  beside.forEach((b, side) => {
    b.host.style.transition = "none";
    b.host.style.visibility = "hidden";
    b.host.style.transform = `translate3d(${side * 100}%,0,0)`;
    b.host.style.willChange = "";
  });
  shown = 0;
}

/** Show `path` beside the page: side 1 = on the right, -1 = on the left. */
export function showPeek(body: HTMLElement, path: string, side: Side) {
  if (shown === side && beside.get(side)?.path === path) return;
  removePeek();
  let entry = beside.get(side);
  if (!entry || entry.path !== path || !entry.host.isConnected) {
    entry?.host.remove();
    entry = buildHost(body, path, side) || undefined;
  }
  if (!entry) return;
  place(entry.host, body);
  entry.host.style.visibility = "visible";
  entry.host.style.willChange = "transform";
  shown = side;
}

export function peekHasCopy() {
  return !!shown && !!beside.get(shown)?.hasCopy;
}

/** Move the page and the tab beside it together. */
export function dragTo(body: HTMLElement, dx: number, animateMs = 0) {
  const t = animateMs ? `transform ${animateMs}ms ${EASE}` : "none";
  body.style.transition = t;
  body.style.transform = `translate3d(${dx}px,0,0)`;
  const b = shown ? beside.get(shown) : undefined;
  if (b) {
    b.host.style.transition = t;
    b.host.style.transform = `translate3d(calc(${shown * 100}% + ${dx}px),0,0)`;
  }
}

/** Let go past the line: the page leaves, the tab beside it takes its place. */
export function slideAway(body: HTMLElement, side: Side, ms: number) {
  const t = `transform ${ms}ms ${EASE}`;
  body.style.transition = t;
  body.style.transform = `translate3d(${-side * 100}%,0,0)`;
  const b = shown ? beside.get(shown) : undefined;
  if (b) {
    b.host.style.transition = t;
    b.host.style.transform = "translate3d(0,0,0)";
  }
}

/** Not far enough: both back where they were. */
export function slideBack(body: HTMLElement, ms: number) {
  dragTo(body, 0, ms);
  window.setTimeout(() => {
    if (swipeState.dragging) return;
    clearSwipeStyle(body);
    removePeek();
  }, ms + 20);
}

/** The real page has opened under the copy: drop the others now, and let the
 *  copy stay a moment (the page settles: its list scrolls, its data shows),
 *  then fade it away. */
function handOver() {
  const keep = shown ? beside.get(shown) : undefined;
  beside.forEach((b) => b !== keep && b.host.remove());
  beside.clear();
  shown = 0;
  if (!keep) return false;
  if (!keep.hasCopy) {
    keep.host.remove();
    return false;
  }
  const host = keep.host;
  let f = requestAnimationFrame(() => {
    f = requestAnimationFrame(() => {
      window.setTimeout(() => {
        host.style.transition = "opacity 90ms ease-out";
        host.style.opacity = "0";
        window.setTimeout(() => host.remove(), 110);
      }, 180);
    });
  });
  void f;
  return true;
}

export function SwipeBody({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const pathRef = useRef(pathname);
  pathRef.current = pathname;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // A new page: the tabs beside the old one go (they were in its frame).
    // Opened by a swipe with a copy beside it: the copy is exactly here, so
    // the real page just takes its place.
    if (handOver()) swipeEnter.dir = 0;

    // A fresh copy of this page now and then, while idle.
    const snap = () => idle(() => !swipeState.dragging && el.isConnected && keepCopy(el, pathRef.current));
    const first = window.setTimeout(snap, 700);
    const every = window.setInterval(snap, 2500);
    const leave = () => {
      clearTimeout(first);
      clearInterval(every);
      // Copied a moment ago: keep that one (no work while a new page opens).
      const last = copies.get(key(pathRef.current));
      if (!last || Date.now() - last.at > 1500) keepCopy(el, pathRef.current);
    };

    const { dir, at } = swipeEnter;
    if (!dir || Date.now() - at > 1500) return leave;
    // No copy yet (first visit this time): slide in from the side.
    swipeEnter.dir = 0;
    el.style.transition = "none";
    el.style.transform = `translate3d(${dir * 100}%,0,0)`;
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        el.style.transition = `transform 280ms ${EASE}`;
        el.style.transform = "translate3d(0,0,0)";
      });
    });
    const done = () => clearSwipeStyle(el);
    el.addEventListener("transitionend", done, { once: true });
    const safety = window.setTimeout(done, 450);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(safety);
      el.removeEventListener("transitionend", done);
      leave();
    };
  }, []);

  return (
    <div ref={ref} data-swipe-body className="min-w-0 flex-1">
      {children}
    </div>
  );
}
