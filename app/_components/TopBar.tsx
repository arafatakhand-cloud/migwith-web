"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { PRESENCE_HEARTBEAT_MS, roomHref, roomListName } from "../../lib/rooms";
import { touchOpenRooms, useOpenRooms } from "../../lib/openRooms";
import { useGlowingRoomTabs } from "../../lib/roomTabGlow";
import { useSession } from "./AppSession";
import { HeaderAuth } from "./AuthControls";
import { MenuPanel } from "./SideMenu";
import { useIsClassic } from "../../lib/uiStyle";
import { isOnSwipeContent, swipeReplyClaim } from "./SwipeToReply";
import { SWIPE_BODY, clearSwipeStyle, dragTo, peekHasCopy, removePeek, showPeek, slideAway, slideBack, swipeEnter } from "./SwipeBody";
import { PillGlyphIcon, PillTabStrip, type PillColors, type PillTabItem } from "./PillTabs";

// The app's top bar: ☰ menu and the pill tab strip (Lobby, Rooms, the page you
// are on, the open rooms, an open chat) — only the open tab shows its name.
// Signed out: logo + Login.

// Page name shown in the pill, by path.
const PAGE_NAMES: [string, string][] = [
  ["/explore", "Discover"],
  ["/members", "Community"],
  ["/gifts", "Gift Gallery"],
  ["/gift-contest", "Gift Contest"],
  ["/lucky", "Lucky User"],
  ["/style-studio", "Style Studio"],
  ["/supporter-colours", "Supporters Badge"],
  ["/merchant", "miGlife Partner"],
  ["/mentor", "Mentor"],
  ["/leaderboard", "Rankings"],
  ["/security", "Security PIN"],
  ["/settings", "Settings"],
  ["/friends", "Friends"],
  ["/messages", "Messages"],
  ["/chat/", "Chat"],
  ["/alerts", "Alerts"],
  ["/wallet", "Wallet"],
  ["/profile/edit", "Edit Profile"],
  ["/profile", "Profile"],
];

export function TopBar() {
  const pathname = usePathname() || "/";
  const { user, loading, badges } = useSession();
  const [open, setOpen] = useState(false);
  const uid = user?.uid;
  const classic = useIsClassic();

  // Rooms you are in: one tab each, like the app.
  const openRooms = useOpenRooms(uid);
  const currentRoom = pathname.startsWith("/room/") ? decodeURIComponent(pathname.slice("/room/".length)) : null;
  // 🔦 open room tabs with something new in them glow red ⇄ green
  const glowingRooms = useGlowingRoomTabs(uid, openRooms, currentRoom);

  // Keep the rooms you are in but not looking at fresh (the open room page does its own).
  useEffect(() => {
    if (!uid) return;
    const t = setInterval(() => touchOpenRooms(uid, currentRoom), PRESENCE_HEARTBEAT_MS * 3);
    return () => clearInterval(t);
  }, [uid, currentRoom]);

  // Swipe left / right to move between the tabs, in the order they are shown:
  // Contacts, Rooms, this page's own tab (Alerts, Wallet …), the open rooms,
  // then an open private chat — like the app. (A page tab used to be left out,
  // so on Alerts etc. a swipe did nothing.)
  const router = useRouter();
  const swipeChat = pathname.startsWith("/chat/") ? pathname : null;
  const swipePage =
    !swipeChat && !pathname.startsWith("/room/") && pathname !== "/" && pathname !== "/rooms" && PAGE_NAMES.some(([p]) => pathname.startsWith(p))
      ? pathname
      : null;
  const order = [
    "/",
    "/rooms",
    ...(swipePage ? [swipePage] : []),
    ...openRooms.map((r) => roomHref(r)),
    ...(swipeChat ? [swipeChat] : []),
  ];
  const here = currentRoom ? roomHref(currentRoom) : pathname;
  const orderRef = useRef({ order, here });
  orderRef.current = { order, here };
  // The tabs next to this one load ahead, so a swipe opens them at once.
  const orderKey = order.join("|");
  useEffect(() => {
    const i = order.indexOf(here);
    if (i < 0) return;
    [order[i - 1], order[i + 1]].forEach((p) => p && router.prefetch(p));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderKey, here, router]);
  useEffect(() => {
    if (!uid) return;
    // The page follows the finger (like the app's pager); let go past a quarter
    // of the screen (or flick) and it slides out while the next tab slides in.
    let start: { x: number; y: number; t: number; reply: boolean; mode: "" | "drag" | "scroll" } | null = null;
    const body = () => document.querySelector<HTMLElement>(SWIPE_BODY);
    const neighbour = (dx: number) => {
      const { order, here } = orderRef.current;
      const i = order.indexOf(here);
      if (i < 0) return undefined;
      return order[dx < 0 ? i + 1 : i - 1];
    };
    const onStart = (e: TouchEvent) => {
      const el = e.target as Element | null;
      // Leave sideways scrollers, text boxes and game tables alone.
      if (e.touches.length !== 1 || el?.closest("input, textarea, select, [data-noswipe], .overflow-x-auto")) {
        start = null;
        return;
      }
      const x = e.touches[0].clientX;
      // The screen edges belong to iPhone's own back / forward swipe.
      if (x < 28 || x > window.innerWidth - 28) {
        start = null;
        return;
      }
      // A right-swipe on someone's message is swipe-to-reply (the room page handles it).
      const replyLine = el?.closest("[data-swipe-reply]");
      start = {
        x,
        y: e.touches[0].clientY,
        t: Date.now(),
        // On a full-width line only the message itself replies; empty space slides rooms.
        reply: !!replyLine && isOnSwipeContent(replyLine, x, e.touches[0].clientY),
        mode: "",
      };
    };
    const onMove = (e: TouchEvent) => {
      if (!start || start.mode === "scroll" || orderRef.current.order.indexOf(orderRef.current.here) < 0) return;
      const dx = e.touches[0].clientX - start.x;
      const dy = e.touches[0].clientY - start.y;
      if (!start.mode) {
        if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
        // On a message the right drag is swipe-to-reply: the page stays put.
        start.mode = Math.abs(dx) > Math.abs(dy) * 1.5 && !(start.reply && dx > 0) ? "drag" : "scroll";
        if (start.mode === "scroll") return;
      }
      const el = body();
      if (!el) return;
      if (e.cancelable) e.preventDefault();
      // The tab that way right beside the page (like the app's pager); no tab
      // that way: the page only gives a little, like the end of the pager.
      const next = neighbour(dx);
      if (next) showPeek(el, next, dx < 0 ? 1 : -1);
      else removePeek();
      dragTo(el, next ? dx : dx * 0.2);
    };
    const onEnd = (e: TouchEvent) => {
      if (!start) return;
      const dx = e.changedTouches[0].clientX - start.x;
      const dy = e.changedTouches[0].clientY - start.y;
      const quick = Date.now() - start.t < 700;
      const { reply: onMessage, t: start0, mode } = start;
      start = null;
      const el = body();
      const next = neighbour(dx);
      if (mode === "drag") {
        const go = !!next && (Math.abs(dx) > window.innerWidth * 0.25 || (quick && Math.abs(dx) > 60));
        if (!el) {
          if (go && next) router.push(next);
          return;
        }
        if (go && next) {
          const side = dx < 0 ? 1 : -1;
          const withCopy = peekHasCopy();
          slideAway(el, side, 200);
          // No copy of that tab yet: it slides in by itself once it opens.
          if (!withCopy) {
            swipeEnter.dir = side;
            swipeEnter.at = Date.now();
          }
          window.setTimeout(() => {
            router.push(next);
            // Same page kept (nothing new opened)? Put it back.
            window.setTimeout(() => {
              if (el.isConnected) {
                swipeEnter.dir = 0;
                removePeek();
                clearSwipeStyle(el);
              }
            }, 1500);
          }, withCopy ? 190 : 160);
        } else {
          slideBack(el, 200);
        }
        return;
      }
      // A right drag the message took for reply isn't a room slide; a quick flick it left alone is.
      if (onMessage && dx > 0 && swipeReplyClaim.at >= start0) return;
      if (!quick || Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 1.8) return;
      if (next) router.push(next);
    };
    // The phone took the touch (a call, the system bar …): page back in place.
    const onCancel = () => {
      const wasDrag = start?.mode === "drag";
      start = null;
      const el = body();
      if (wasDrag && el) slideBack(el, 150);
    };
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onEnd, { passive: true });
    window.addEventListener("touchcancel", onCancel, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onCancel);
    };
  }, [uid, router]);

  // The height above the on-screen keyboard (iPhone keeps 100dvh the same when
  // the keyboard opens), for chat pages that size themselves to the screen.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const root = document.documentElement;
    const set = () => {
      root.style.setProperty("--vvh", `${Math.round(vv.height)}px`);
      // Where the visible part starts: iPhone can slide the view down under the
      // keyboard even when the page itself can't scroll; the page follows it.
      root.style.setProperty("--vvtop", `${Math.max(0, Math.round(vv.offsetTop))}px`);
      // iPhone scrolls the page up under the keyboard; put it back so the top bar stays.
      // Only on the chat pages, which fit the screen; elsewhere let it scroll to the box.
      const chat = !!document.querySelector(".h-screen-minus-bar");
      const kbOpen = vv.height < window.innerHeight - 80;
      root.classList.toggle("kb-lock", chat && kbOpen);
      if (chat && kbOpen && (window.scrollY !== 0 || vv.offsetTop !== 0)) window.scrollTo(0, 0);
    };
    // iPhone moves the page in steps while the keyboard slides in, so check again a few times.
    let timers: number[] = [];
    const settle = () => {
      timers.forEach(clearTimeout);
      set();
      timers = [50, 150, 300, 500, 800].map((ms) => window.setTimeout(set, ms));
    };
    set();
    vv.addEventListener("resize", settle);
    vv.addEventListener("scroll", set);
    window.addEventListener("scroll", set, { passive: true });
    window.addEventListener("focusin", settle);
    window.addEventListener("focusout", settle);
    return () => {
      timers.forEach(clearTimeout);
      vv.removeEventListener("resize", settle);
      vv.removeEventListener("scroll", set);
      window.removeEventListener("scroll", set);
      window.removeEventListener("focusin", settle);
      window.removeEventListener("focusout", settle);
      root.classList.remove("kb-lock");
      root.style.removeProperty("--vvh");
      root.style.removeProperty("--vvtop");
    };
  }, []);

  // The real height of the top bar (the Classic one with its tabs is taller), so
  // chat pages that fit the screen leave exactly the rest for the message list.
  useEffect(() => {
    const header = document.querySelector<HTMLElement>("header[data-topbar]");
    if (!header) return;
    const root = document.documentElement;
    const set = () => root.style.setProperty("--topbar-h", `${Math.round(header.getBoundingClientRect().height)}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(header);
    return () => {
      ro.disconnect();
      root.style.removeProperty("--topbar-h");
    };
  }, []);

  // Close the menu when the page changes.
  useEffect(() => setOpen(false), [pathname]);

  if (loading) return <div className="h-[56px]" />;

  if (!user) {
    return (
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-2.5 sm:px-6">
        <Link href="/" className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#2F80ED] to-[#174EA6] text-white">
            <span className="text-lg font-black">M</span>
          </div>
          <span className="text-xl font-black tracking-wide text-[#0B2A5B]">
            MIG<span className="text-[#2F80ED]">life</span>
          </span>
        </Link>
        <HeaderAuth />
      </div>
    );
  }

  const onHome = pathname === "/";
  const onRooms = pathname === "/rooms";
  const pageName = currentRoom ? undefined : PAGE_NAMES.find(([p]) => pathname.startsWith(p))?.[1];
  const chatWith = pathname.startsWith("/chat/") ? decodeURIComponent(pathname.slice("/chat/".length)) : null;

  const menu =
    open &&
    createPortal(
      <div className="fixed inset-0 z-50 lg:hidden" onClick={() => setOpen(false)}>
        <div className="absolute inset-0 bg-black/40" />
        <nav
          className="absolute inset-y-0 left-0 flex w-80 max-w-[82vw] flex-col overflow-y-auto bg-gradient-to-b from-[#CFE6F9] to-[#B4DDF7] p-3 text-[#0B2A5B] shadow-2xl pb-safe pt-[max(0.75rem,env(safe-area-inset-top))]"
          onClick={(e) => e.stopPropagation()}
        >
          <MenuPanel />
        </nav>
      </div>,
      document.body
    );

  // ⚡ The tabs, in swipe order (the app's buildPillTabs). Room names are shown
  // without the icon in front of them.
  const title = currentRoom || chatWith || onHome || onRooms ? null : pageName ?? null;
  const pillTabs = (roomsLabel: string): PillTabItem[] => [
    { key: "home", glyph: "friends", label: "Lobby", selected: onHome, href: "/" },
    { key: "rooms", glyph: "chat", label: roomsLabel, selected: onRooms, href: "/rooms" },
    ...(title ? [{ key: "page", glyph: "list" as const, label: title, selected: true }] : []),
    ...openRooms.map((r) => ({
      key: `r_${r}`,
      glyph: "list" as const,
      label: roomListName(r),
      selected: r === currentRoom,
      href: roomHref(r),
      alert: glowingRooms.has(r),
      notranslate: true,
    })),
    ...(chatWith ? [{ key: `c_${chatWith}`, glyph: "list" as const, label: chatWith, selected: true, notranslate: true }] : []),
  ];
  // 🔔 something new (alerts / messages / requests): the ☰ glows red ⇄ green —
  // it is always on screen, unlike the Lobby tab that slides away.
  const hasUnread = badges.alerts + badges.messages + badges.requests > 0;

  // 📟 CLASSIC style (Settings › Appearance › App style): ONE orange header
  // with ☰ and the tab bar right inside it — the open tab a white pill with an
  // orange name, the others white icons straight on the orange (like the app).
  if (classic) {
    const colors: PillColors = {
      pillTop: "#FFFFFF",
      pillBottom: "#FFF3E3",
      pillText: "#E06C00",
      idleIcon: "#FFFFFF",
      idleTile: "#F07A00",
      activeIcon: "#E06C00",
    };
    return (
      <>
        <div
          className="flex h-[58px] items-center border-b border-[#C45F00] bg-gradient-to-b from-[#FF9D2E] to-[#F07A00] pl-2 pr-1"
          style={{ boxShadow: "inset 0 1px 0 rgba(255,255,255,0.35)" }}
        >
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Menu"
            className="relative mr-2 flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[10px] border border-white/40 bg-white/20 text-[19px] font-bold text-white lg:hidden"
          >
            <span className={hasUnread ? "pill-alert-blink" : undefined}>☰</span>
          </button>
          <PillTabStrip items={pillTabs("Rooms")} colors={colors} className="flex-1" />
        </div>
        {menu}
      </>
    );
  }

  // ✨ MODERN: a blue → violet bar (the Home profile card's colours), a round
  // ☰ button, and white icons with the open tab as a white pill, its name blue.
  const colors: PillColors = {
    pillTop: "#FFFFFF",
    pillBottom: "#EFF3FF",
    pillText: "#1565D8",
    idleIcon: "#FFFFFF",
    idleTile: "#3B7BF0",
    activeIcon: "#1565D8",
  };
  return (
    <>
      <div
        className="flex items-center px-2 py-1.5 sm:px-4"
        style={{ background: "linear-gradient(90deg, #1565D8, #3B7BF0, #7B5CF0)" }}
      >
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Menu"
          className={`mr-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/35 bg-white/[0.18] lg:hidden ${
            hasUnread ? "pill-alert-blink" : "text-white"
          }`}
        >
          <PillGlyphIcon glyph="menu" selected={false} tile="#FFFFFF" />
        </button>
        <PillTabStrip items={pillTabs("Chat Rooms")} colors={colors} className="flex-1" />
        {/* No 🔔 / বাংলা here, like the app (alerts: the ☰ glows; language: Settings). */}
      </div>

      {/* Side menu — in <body>, so nothing in the header can box it in */}
      {menu}
    </>
  );
}
