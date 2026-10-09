"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { badgeText } from "../../lib/useBadges";
import { PRESENCE_HEARTBEAT_MS, roomDisplayName, roomHref } from "../../lib/rooms";
import { touchOpenRooms, useOpenRooms } from "../../lib/openRooms";
import { useSession } from "./AppSession";
import { HeaderAuth } from "./AuthControls";
import { MenuPanel } from "./SideMenu";
import { LanguageToggle } from "./LanguageToggle";
import { useIsClassic } from "../../lib/uiStyle";
import { isOnSwipeContent, swipeReplyClaim } from "./SwipeToReply";

// The app's top bar: ☰ menu, 👥 Home and 💬 Rooms tabs, and a blue pill naming
// the page you are on (Explore, Members, Settings …). Signed out: logo + Login.

function Badge({ n }: { n: number }) {
  if (!n) return null;
  return (
    <span className="absolute -right-1.5 -top-1.5 min-w-[18px] rounded-full bg-rose-500 px-1 text-center text-[10px] font-bold leading-[18px] text-white">
      {badgeText(n)}
    </span>
  );
}

// Page name shown in the pill, by path.
const PAGE_NAMES: [string, string][] = [
  ["/explore", "Discover"],
  ["/live-scores", "Live Scores"],
  ["/members", "Community"],
  ["/gifts", "Gift Gallery"],
  ["/gift-contest", "Gift Contest"],
  ["/lucky", "Lucky User"],
  ["/style-studio", "Style Studio"],
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

  // Keep the rooms you are in but not looking at fresh (the open room page does its own).
  useEffect(() => {
    if (!uid) return;
    const t = setInterval(() => touchOpenRooms(uid, currentRoom), PRESENCE_HEARTBEAT_MS * 3);
    return () => clearInterval(t);
  }, [uid, currentRoom]);

  // Swipe left / right to move between Home, Rooms and the open rooms, like the app.
  const router = useRouter();
  const order = ["/", "/rooms", ...openRooms.map((r) => roomHref(r))];
  const here = currentRoom ? roomHref(currentRoom) : pathname;
  const orderRef = useRef({ order, here });
  orderRef.current = { order, here };
  useEffect(() => {
    if (!uid) return;
    let start: { x: number; y: number; t: number; reply: boolean } | null = null;
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
      };
    };
    const onEnd = (e: TouchEvent) => {
      if (!start) return;
      const dx = e.changedTouches[0].clientX - start.x;
      const dy = e.changedTouches[0].clientY - start.y;
      const quick = Date.now() - start.t < 700;
      const onMessage = start.reply;
      const start0 = start.t;
      start = null;
      // A right drag the message took for reply isn't a room slide; a quick flick it left alone is.
      if (onMessage && dx > 0 && swipeReplyClaim.at >= start0) return;
      if (!quick || Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 1.8) return;
      const { order, here } = orderRef.current;
      const i = order.indexOf(here);
      if (i < 0) return; // only on the tab pages
      const next = order[dx < 0 ? i + 1 : i - 1];
      if (next) router.push(next);
    };
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchend", onEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchend", onEnd);
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

  // Keep the current room's tab in view.
  const activeTabRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    activeTabRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [currentRoom, openRooms.length]);

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

  // 📟 CLASSIC style (Settings › Appearance › App style): orange header with the
  // mig·life logo, a blue strip of flat tabs (the open one is a white "folder"
  // tab) and an orange line under it.
  if (classic) {
    const classicTab = (label: string, selected: boolean, key: string, href?: string, ref?: React.Ref<HTMLSpanElement>, blink = false) => {
      const cls = `block max-w-[130px] shrink-0 truncate rounded-t-md px-2.5 text-[11.5px] font-bold ${
        selected ? "bg-white py-[7px] text-[#2F6ABD]" : "bg-[#9AB8E4] py-[5px] text-[#16315F]"
      }${blink && !selected ? " classic-tab-blink" : ""}`;
      return href && !selected ? (
        <Link key={key} href={href} className={cls} data-notranslate={key.startsWith("r:") || key.startsWith("c:") ? true : undefined}>
          {label}
        </Link>
      ) : (
        <span key={key} ref={ref} className={cls} data-notranslate={key.startsWith("r:") || key.startsWith("c:") ? true : undefined}>
          {label}
        </span>
      );
    };
    const title = currentRoom || chatWith || onHome || onRooms ? null : pageName ?? null;
    return (
      <>
        <div
          className="flex h-[42px] items-center border-b border-[#C45F00] bg-gradient-to-b from-[#FF9D2E] to-[#F07A00] px-2"
          style={{ boxShadow: "inset 0 1px 0 rgba(255,255,255,0.35)" }}
        >
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Menu"
            className="relative flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[7px] border border-white/40 bg-white/20 text-base font-bold text-white lg:hidden"
          >
            ☰
            <Badge n={badges.messages + badges.requests} />
          </button>
          <Link href="/" className="ml-[9px] flex items-center" data-notranslate>
            <span className="text-[19px] font-black text-white">mig</span>
            <span className="ml-0.5 rounded-full bg-white px-[5px] text-xs font-black text-[#F07A00]">life</span>
          </Link>
          <div className="ml-auto flex shrink-0 items-center gap-1.5">
            <Link href="/alerts" aria-label="Alerts" className="relative flex h-8 w-8 items-center justify-center text-base">
              🔔
              <Badge n={badges.alerts} />
            </Link>
            <LanguageToggle />
          </div>
        </div>
        {/* On Home the profile strip sits here, between the orange header and the blue tabs (the Dashboard fills it). */}
        {onHome && <div id="classic-home-strip" />}
        <div className="no-scrollbar flex items-end gap-[3px] overflow-x-auto bg-gradient-to-b from-[#5A8FD6] to-[#2F6ABD] px-1 pt-1">
          {/* New alerts: the Contacts tab blinks orange (Home shows the alerts) */}
          {classicTab("Contacts", onHome, "home", "/", undefined, badges.alerts > 0)}
          {classicTab("Rooms", onRooms, "rooms", "/rooms")}
          {title && classicTab(title, true, "page")}
          {openRooms.map((r) =>
            classicTab(roomDisplayName(r), r === currentRoom, `r:${r}`, roomHref(r), r === currentRoom ? activeTabRef : undefined)
          )}
          {chatWith && classicTab(chatWith, true, `c:${chatWith}`)}
        </div>
        <div className="h-[2px] bg-[#F07A00]" />
        {menu}
      </>
    );
  }

  const tab = (active: boolean) =>
    `relative flex h-9 w-10 shrink-0 items-center justify-center rounded-xl text-lg transition ${
      active ? "bg-[#2F80ED] text-white shadow-md" : "text-[#0B2A5B] hover:bg-[#E3F0FD]"
    }`;

  return (
    <>
      <div className="flex items-center gap-1.5 px-3 py-2 sm:gap-2 sm:px-6 lg:px-4">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Menu"
          className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xl text-[#0B2A5B] hover:bg-[#E3F0FD] lg:hidden"
        >
          ☰
          <Badge n={badges.messages + badges.requests} />
        </button>
        <Link href="/" aria-label="Home" className={tab(onHome)}>
          👥
          <Badge n={badges.messages} />
        </Link>
        <Link href="/rooms" aria-label="Rooms" className={tab(onRooms)}>
          💬
        </Link>
        {openRooms.length > 0 && (
          <div className="no-scrollbar flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
            {openRooms.map((r) =>
              r === currentRoom ? (
                <span
                  key={r}
                  ref={activeTabRef}
                  data-notranslate
                  className="flex max-w-[9.5rem] shrink-0 items-center gap-1 rounded-xl bg-[#2F80ED] px-2.5 py-1.5 text-xs font-bold text-white shadow-md"
                >
                  💬 <span className="truncate">{roomDisplayName(r)}</span>
                </span>
              ) : (
                <Link
                  key={r}
                  href={roomHref(r)}
                  title={r}
                  aria-label={r}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-lg text-[#0B2A5B] hover:bg-[#E3F0FD]"
                >
                  🗨️
                </Link>
              )
            )}
          </div>
        )}
        {pageName && (
          <span className="flex min-w-0 shrink items-center gap-1 truncate rounded-xl bg-[#2F80ED] px-3 py-1.5 text-xs font-bold text-white shadow-md">
            💬 {pageName}
          </span>
        )}
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          <Link
            href="/alerts"
            aria-label="Alerts"
            className="relative flex h-9 w-9 items-center justify-center rounded-xl text-lg hover:bg-[#E3F0FD]"
          >
            🔔
            <Badge n={badges.alerts} />
          </Link>
          <LanguageToggle />
        </div>
      </div>

      {/* Side menu — in <body>, so nothing in the header can box it in */}
      {menu}
    </>
  );
}
