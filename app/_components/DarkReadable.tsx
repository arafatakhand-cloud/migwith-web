"use client";

import { useEffect } from "react";

/*
 * ⚫ Dark theme safety net (miglife 2026-11-24: "লেখা বুঝা যায় না … সব যায়গায় ঠিক করো").
 *
 * Many pages paint their own light cards with inline styles (white gradients, pale
 * chips, grey boxes) that the theme CSS cannot reach, so in Dark they stayed white /
 * grey, or turned half dark, and their text could not be read.
 *
 * While the page is in Dark, this looks at what is really on the screen:
 *  - a light background (white, pale, light grey, or a mostly-light gradient) becomes
 *    the flat black card colour;
 *  - text that is too dark for the dark background under it is lifted to a light
 *    shade of its own colour (purple stays purple, just lighter).
 * New content (lists loading, popups) is checked as it appears. Going back to Light
 * puts every original colour back. Photos, videos, icons and gradient-text are left alone.
 * An element (and everything in it) can opt out with data-nodark.
 */

type RGBA = [number, number, number, number];
type Saved = { props: [string, string, string][] };

const CARD = "#121212";
const FIELD = "#1C1C1E";
const SKIP_TAGS = new Set(["IMG", "VIDEO", "CANVAS", "SVG", "PICTURE", "IFRAME", "SCRIPT", "STYLE", "NOSCRIPT", "AUDIO", "path", "svg", "g"]);
const FIELD_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

const saved = new WeakMap<Element, Saved>();
const touched = new Set<HTMLElement>();
const colorCache = new Map<string, RGBA | null>();
let ctx: CanvasRenderingContext2D | null = null;

function parseColor(s: string): RGBA | null {
  if (!s || s === "transparent") return [0, 0, 0, 0];
  const hit = colorCache.get(s);
  if (hit !== undefined) return hit;
  let out: RGBA | null = null;
  const m = s.match(/^rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/);
  if (m) {
    const a = m[4] === undefined ? 1 : m[4].endsWith("%") ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
    out = [+m[1], +m[2], +m[3], a];
  } else {
    // oklch(), color-mix(), color(srgb …) …: let the browser paint one pixel and read it back
    try {
      if (!ctx) {
        const c = document.createElement("canvas");
        c.width = c.height = 1;
        ctx = c.getContext("2d", { willReadFrequently: true });
      }
      if (ctx) {
        ctx.clearRect(0, 0, 1, 1);
        ctx.fillStyle = "rgba(0,0,0,0)";
        ctx.fillStyle = s;
        ctx.fillRect(0, 0, 1, 1);
        const d = ctx.getImageData(0, 0, 1, 1).data;
        out = [d[0], d[1], d[2], d[3] / 255];
      }
    } catch {
      out = null;
    }
  }
  if (colorCache.size > 2000) colorCache.clear();
  colorCache.set(s, out);
  return out;
}

const lin = (v: number) => {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const lum = (c: RGBA) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
function hsl(c: RGBA): [number, number, number] {
  const r = c[0] / 255, g = c[1] / 255, b = c[2] / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, l = (mx + mn) / 2;
  if (d < 1e-4) return [0, 0, l];
  const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  const h = (mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4) * 60;
  return [h, s, l];
}
// light enough that it does not belong on a dark page
const isLight = (c: RGBA) => {
  const L = lum(c);
  return L > 0.5 || (L > 0.26 && hsl(c)[1] < 0.14);
};
const contrast = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

const COLOR_RE = /(?:rgba?|oklch|oklab|lab|lch|hsla?|color)\([^()]*(?:\([^()]*\)[^()]*)*\)|#[0-9a-fA-F]{3,8}\b/g;
function gradientStops(img: string): RGBA[] {
  return (img.match(COLOR_RE) || []).map(parseColor).filter((c): c is RGBA => !!c);
}

function set(el: HTMLElement, prop: string, value: string) {
  let s = saved.get(el);
  if (!s) {
    s = { props: [] };
    saved.set(el, s);
  }
  if (!s.props.some((p) => p[0] === prop)) s.props.push([prop, el.style.getPropertyValue(prop), el.style.getPropertyPriority(prop)]);
  el.style.setProperty(prop, value, "important");
  el.dataset.dkfix = "";
  touched.add(el);
}

function restore(el: HTMLElement) {
  const s = saved.get(el);
  if (!s) return;
  for (const [prop, value, prio] of s.props) {
    if (value) el.style.setProperty(prop, value, prio);
    else el.style.removeProperty(prop);
  }
  saved.delete(el);
  delete el.dataset.dkfix;
  touched.delete(el);
}

// what colour is really painted behind this element (after our own fixes)
function backdrop(el: HTMLElement | null): number {
  for (let n: HTMLElement | null = el; n && n !== document.documentElement; n = n.parentElement) {
    const cs = getComputedStyle(n);
    const img = cs.backgroundImage;
    if (img && img !== "none" && img.includes("gradient")) {
      const stops = gradientStops(img).filter((c) => c[3] > 0.4);
      if (stops.length) return stops.reduce((a, c) => a + lum(c), 0) / stops.length;
    }
    const bg = parseColor(cs.backgroundColor);
    if (bg && bg[3] > 0.55) return lum(bg);
  }
  return 0; // the black page
}

function hasOwnText(el: HTMLElement) {
  for (const n of el.childNodes) if (n.nodeType === 3 && n.textContent && n.textContent.trim()) return true;
  return FIELD_TAGS.has(el.tagName);
}

function fixOne(el: HTMLElement) {
  if (SKIP_TAGS.has(el.tagName) || el.closest("[data-nodark],svg")) return;
  const cs = getComputedStyle(el);
  if (cs.display === "none") return;
  const clipText = cs.backgroundClip === "text" || (cs as unknown as { webkitBackgroundClip?: string }).webkitBackgroundClip === "text";
  if (!clipText) {
    const img = cs.backgroundImage;
    if (img && img !== "none" && !img.includes("url(") && img.includes("gradient")) {
      const stops = gradientStops(img).filter((c) => c[3] > 0.45);
      const light = stops.filter(isLight).length;
      if (stops.length && light * 2 >= stops.length) {
        set(el, "background-image", "none");
        set(el, "background-color", CARD);
      }
    } else if (!img || img === "none") {
      const bg = parseColor(cs.backgroundColor);
      if (bg && bg[3] > 0.35 && isLight(bg)) set(el, "background-color", FIELD_TAGS.has(el.tagName) ? FIELD : CARD);
    }
    // pale borders glow on black: make them a thin dark line
    const bc = parseColor(cs.borderTopColor);
    if (bc && bc[3] > 0.3 && parseFloat(cs.borderTopWidth) > 0 && lum(bc) > 0.6 && hsl(bc)[1] < 0.5) set(el, "border-color", "#2A2A2A");
  }
  if (clipText || !hasOwnText(el)) return;
  const tc = parseColor(cs.color);
  if (!tc || tc[3] < 0.2) return;
  const under = backdrop(el);
  const tl = lum(tc);
  if (under > 0.3 || contrast(tl, under) >= 3.2) return;
  const [h, s] = hsl(tc);
  const lifted = s < 0.12 ? "#E5E5E5" : `hsl(${Math.round(h)} ${Math.round(Math.min(s, 0.85) * 100)}% 74%)`;
  set(el, "color", lifted);
  if (FIELD_TAGS.has(el.tagName)) set(el, "-webkit-text-fill-color", lifted);
}

function fixTree(root: Element) {
  if (!(root instanceof HTMLElement)) return;
  fixOne(root);
  root.querySelectorAll<HTMLElement>("*").forEach(fixOne);
}

const isDark = () => document.documentElement.dataset.theme === "dark_night";

export default function DarkReadable() {
  useEffect(() => {
    let pending = new Set<Element>();
    let raf = 0;
    const flush = () => {
      raf = 0;
      const list = [...pending];
      pending = new Set();
      if (!isDark()) return;
      for (const n of list) if (n.isConnected) fixTree(n);
    };
    const queue = (n: Element) => {
      pending.add(n);
      if (!raf) raf = requestAnimationFrame(flush);
    };
    const mo = new MutationObserver((muts) => {
      if (!isDark()) return;
      for (const m of muts) {
        if (m.type === "childList") {
          m.addedNodes.forEach((n) => n.nodeType === 1 && queue(n as Element));
          if (m.target.nodeType === 1) {
            // new text in an element we already checked: check that element again
            const t = m.target as HTMLElement;
            if (!t.dataset?.dkfix) queue(t);
          }
        } else if (m.type === "attributes" && m.target instanceof HTMLElement) {
          // a class change (a tab turned on / off): start from its own colours again
          const t = m.target;
          restore(t);
          t.querySelectorAll<HTMLElement>("[data-dkfix]").forEach(restore);
          queue(t);
        }
      }
    });
    const start = () => {
      touched.forEach(restore);
      if (isDark()) {
        fixTree(document.body);
        mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
      } else {
        mo.disconnect();
      }
    };
    // the theme can change at any time (Settings, or the phone's own dark mode on Auto)
    const themeMo = new MutationObserver(() => {
      mo.disconnect();
      requestAnimationFrame(start);
    });
    themeMo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    const t = window.setTimeout(start, 300);
    return () => {
      window.clearTimeout(t);
      if (raf) cancelAnimationFrame(raf);
      mo.disconnect();
      themeMo.disconnect();
    };
  }, []);
  return null;
}
