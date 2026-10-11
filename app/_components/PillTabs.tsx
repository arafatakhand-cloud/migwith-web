"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";

// ⚡ Pill tab strip (Modern + Classic), like the app's PillTabStrip: one row of
// icons, and only the open tab grows into a coloured pill with its name.
// Order = swipe order: Lobby → Rooms → (this page) → open rooms → open chat.
//  • A new tab opens: the pill glides onto its icon (0.3 s) while the old
//    name is still on the bar, rests there ~0.4 s, then the old name goes
//    and the new one opens out (~0.26 s), the strip keeping the pill centred.
//  • Icons and names take the pill's colours exactly where the pill covers
//    them (a second, clipped copy of the row drawn over it).
// Every page has its own top bar, so the last pill spot is remembered here and
// the glide starts from it on the next page.

export type PillGlyph = "menu" | "friends" | "chat" | "list";

export type PillTabItem = {
  key: string;
  glyph: PillGlyph;
  label: string;
  selected: boolean;
  href?: string;
  /** Something new in a tab you are not looking at: the icon glows red ⇄ green. */
  alert?: boolean;
  notranslate?: boolean;
};

export type PillColors = {
  pillTop: string;
  pillBottom: string;
  pillText: string;
  /** closed tabs' icon / name colour and the colour behind them */
  idleIcon: string;
  idleTile: string;
  /** icon colour inside the pill (undefined = white, for coloured pills) */
  activeIcon?: string;
};

const GLIDE_MS = 300;
const REST_MS = 400;
const OPEN_MS = 260;
const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
const BUBBLE_CYAN = "#7FDBFF";
const BUBBLE_BLUE = "#1E8FFF";
const BACK_BUBBLE_ON_BLUE = "#1B2B45";

// where the pill was last drawn (key + strip-relative rect), kept across pages
let lastPill: { selected: string | null; shown: string | null } = { selected: null, shown: null };

function Bubble({
  left,
  top,
  bw,
  bh,
  tailX,
  color,
  dots,
  outline,
}: {
  left: number;
  top: number;
  bw: number;
  bh: number;
  tailX: number;
  color: string;
  dots: string;
  outline?: string;
}) {
  const r = bw * 0.24;
  const tail = `M${tailX} ${top + bh * 0.8} L${tailX - bw * 0.06} ${top + bh * 1.32} L${tailX + bw * 0.3} ${top + bh * 0.84} Z`;
  const o = 1;
  return (
    <>
      {outline && (
        <>
          <rect x={left - o} y={top - o} width={bw + o * 2} height={bh + o * 2} rx={r + o} fill={outline} />
          <path d={tail} fill={outline} stroke={outline} strokeWidth={o * 2} strokeLinejoin="round" />
        </>
      )}
      <rect x={left} y={top} width={bw} height={bh} rx={r} fill={color} />
      <path d={tail} fill={color} />
      {[0.3, 0.5, 0.7].map((fx) => (
        <circle key={fx} cx={left + bw * fx} cy={top + bh * 0.5} r={bh * 0.1} fill={dots} />
      ))}
    </>
  );
}

/** The app's tab icons (MigTabGlyphIcon), drawn on a 20×20 box. */
export function PillGlyphIcon({
  glyph,
  selected,
  tile,
  main = "currentColor",
  activeIcon,
  size = 20,
}: {
  glyph: PillGlyph;
  selected: boolean;
  tile: string;
  main?: string;
  activeIcon?: string;
  size?: number;
}) {
  const w = 20;
  const h = 20;
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden className="shrink-0">
      {glyph === "menu" &&
        [0.26, 0.5, 0.74].map((y) => (
          <line key={y} x1={w * 0.12} y1={h * y} x2={w * 0.88} y2={h * y} stroke={main} strokeWidth={h * 0.11} strokeLinecap="round" />
        ))}
      {glyph === "friends" && (
        <>
          <g opacity={selected ? 0.8 : 0.78}>
            <circle cx={w * 0.68} cy={h * 0.3} r={w * 0.14} fill={main} />
            <rect x={w * 0.46} y={h * 0.5} width={w * 0.46} height={h * 0.36} rx={w * 0.2} fill={main} />
          </g>
          <circle cx={w * 0.38} cy={h * 0.32} r={w * 0.21} fill={tile} />
          <rect x={w * 0.04} y={h * 0.5} width={w * 0.68} height={h * 0.46} rx={w * 0.26} fill={tile} />
          <circle cx={w * 0.38} cy={h * 0.32} r={w * 0.17} fill={main} />
          <rect x={w * 0.08} y={h * 0.54} width={w * 0.6} height={h * 0.38} rx={w * 0.22} fill={main} />
        </>
      )}
      {glyph === "chat" && (
        <>
          <Bubble
            left={w * 0.02}
            top={h * 0.08}
            bw={w * 0.62}
            bh={h * 0.42}
            tailX={w * 0.14}
            color={selected ? BACK_BUBBLE_ON_BLUE : main}
            dots="#FFFFFF"
          />
          <Bubble left={w * 0.38} top={h * 0.4} bw={w * 0.6} bh={h * 0.4} tailX={w * 0.52} color={BUBBLE_CYAN} dots="#FFFFFF" outline={tile} />
        </>
      )}
      {glyph === "list" && (
        <Bubble
          left={w * 0.06}
          top={h * 0.12}
          bw={w * 0.88}
          bh={h * 0.58}
          tailX={w * 0.22}
          color={main}
          dots={selected ? (activeIcon ? "#FFFFFF" : BUBBLE_BLUE) : tile}
        />
      )}
    </svg>
  );
}

type Rect = { x: number; w: number };

export function PillTabStrip({ items, colors, className = "" }: { items: PillTabItem[]; colors: PillColors; className?: string }) {
  const selectedKey = items.find((i) => i.selected)?.key ?? null;
  // the tab whose NAME is open (lags behind the selected tab, like the app)
  const [shownKey, setShownKey] = useState<string | null>(() => {
    const prev = lastPill.shown;
    return prev && prev !== selectedKey && items.some((i) => i.key === prev) ? prev : selectedKey;
  });
  const [pill, setPill] = useState<Rect | null>(null);
  const [animate, setAnimate] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const row = useRef<HTMLDivElement>(null);
  const tabEls = useRef(new Map<string, HTMLElement>());
  const [rowW, setRowW] = useState(0);

  const measure = (key: string | null): Rect | null => {
    if (!key) return null;
    const el = tabEls.current.get(key);
    if (!el) return null;
    return { x: el.offsetLeft, w: el.offsetWidth };
  };

  // keep the pill in the middle of the strip (as far as the ends allow)
  const centre = (r: Rect | null, smooth: boolean) => {
    const sc = scroller.current;
    if (!sc || !r) return;
    const want = Math.max(0, Math.min(sc.scrollWidth - sc.clientWidth, r.x + r.w / 2 - sc.clientWidth / 2));
    if (Math.abs(sc.scrollLeft - want) > 1) sc.scrollTo({ left: want, behavior: smooth ? "smooth" : "auto" });
  };

  // First draw: the pill sits where it was on the last page (the old tab),
  // then glides to the new one.
  useLayoutEffect(() => {
    const start = measure(lastPill.selected && items.some((i) => i.key === lastPill.selected) ? lastPill.selected : selectedKey);
    setPill(start);
    centre(start, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedKey) return;
    let gone = false;
    const timers: number[] = [];
    let raf = 0;
    // 1) glide onto the new tab's icon (its name is still closed)
    const glideTo = measure(selectedKey);
    const needsOpen = shownKey !== selectedKey;
    const moved = !!glideTo && !!pill && (Math.abs(glideTo.x - pill.x) > 1.5 || Math.abs(glideTo.w - pill.w) > 1.5);
    requestAnimationFrame(() => {
      if (gone) return;
      setAnimate(true);
      setPill(glideTo);
      centre(glideTo, true);
    });
    const follow = () => {
      // 3) the name opens; the pill follows the tab while it grows
      const t0 = performance.now();
      setAnimate(false);
      const step = () => {
        if (gone) return;
        const r = measure(selectedKey);
        setPill(r);
        centre(r, false);
        if (performance.now() - t0 < OPEN_MS + 80) raf = requestAnimationFrame(step);
        else setAnimate(true);
      };
      raf = requestAnimationFrame(step);
    };
    if (needsOpen) {
      // 2) rest on the icon; the old name is still on the bar
      timers.push(
        window.setTimeout(() => {
          if (gone) return;
          setShownKey(selectedKey);
          follow();
        }, (moved ? GLIDE_MS : 0) + REST_MS)
      );
    }
    lastPill = { selected: selectedKey, shown: selectedKey };
    return () => {
      gone = true;
      timers.forEach(clearTimeout);
      cancelAnimationFrame(raf);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKey]);

  // tabs added / removed or the window resized: put the pill back on its tab
  const itemKeys = items.map((i) => `${i.key}:${i.label}`).join("|");
  useEffect(() => {
    const el = row.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setRowW(el.scrollWidth);
      if (shownKey === selectedKey) setPill(measure(selectedKey));
    });
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemKeys, shownKey, selectedKey]);

  const move = animate ? `${GLIDE_MS}ms ${EASE}` : "0ms";
  const pillStyle: CSSProperties = pill
    ? {
        transform: `translateX(${pill.x}px)`,
        width: pill.w,
        transition: `transform ${move}, width ${move}`,
        background: `linear-gradient(${colors.pillTop}, ${colors.pillBottom})`,
      }
    : { opacity: 0 };
  // the clipped copy shows only where the pill is (same timing as the pill)
  const total = Math.max(rowW, row.current?.scrollWidth || 0);
  const clipStyle: CSSProperties = pill
    ? {
        clipPath: `inset(0px ${Math.max(0, total - pill.x - pill.w)}px 0px ${pill.x}px round 17px)`,
        transition: `clip-path ${move}`,
      }
    : { clipPath: "inset(0 100% 0 0)" };

  const renderRow = (overlay: boolean) =>
    items.map((item) => {
      const expanded = item.key === shownKey && !!item.label;
      const blink = !overlay && !!item.alert && !item.selected;
      const iconColor = overlay ? colors.activeIcon || "#FFFFFF" : colors.idleIcon;
      const inner = (
        <>
          <span className={blink ? "pill-alert-blink flex" : "flex"} style={blink ? undefined : { color: iconColor }}>
            <PillGlyphIcon
              glyph={item.glyph}
              selected={overlay}
              tile={overlay ? colors.pillBottom : colors.idleTile}
              activeIcon={colors.activeIcon}
            />
          </span>
          <span
            className="block overflow-hidden whitespace-nowrap"
            style={{
              maxWidth: expanded ? 146 : 0,
              opacity: expanded ? 1 : 0,
              transition: expanded ? `max-width ${OPEN_MS}ms ${EASE}, opacity ${OPEN_MS}ms ${EASE}` : "none",
            }}
          >
            <span
              data-notranslate={item.notranslate || undefined}
              className="block max-w-[140px] truncate pl-1.5 text-[13px] font-bold"
              style={{ color: overlay ? colors.pillText : colors.idleIcon }}
            >
              {item.label}
            </span>
          </span>
        </>
      );
      const cls = "flex h-[34px] shrink-0 items-center px-2.5";
      if (overlay) {
        return (
          <span key={item.key} className={cls} aria-hidden>
            {inner}
          </span>
        );
      }
      const ref = (el: HTMLElement | null) => {
        if (el) tabEls.current.set(item.key, el);
        else tabEls.current.delete(item.key);
      };
      return item.href && !item.selected ? (
        <Link key={item.key} ref={ref} href={item.href} aria-label={item.label} className={cls}>
          {inner}
        </Link>
      ) : (
        <span key={item.key} ref={ref} aria-label={item.label} className={cls}>
          {inner}
        </span>
      );
    });

  return (
    <div ref={scroller} className={`no-scrollbar min-w-0 overflow-x-auto ${className}`}>
      <div ref={row} className="relative flex w-max items-center gap-0.5 p-1">
        <span className="pointer-events-none absolute left-0 top-[calc(50%-17px)] h-[34px] rounded-full" style={pillStyle} />
        {renderRow(false)}
        <div className="pointer-events-none absolute inset-0 flex items-center gap-0.5 p-1" style={clipStyle}>
          {renderRow(true)}
        </div>
      </div>
    </div>
  );
}
