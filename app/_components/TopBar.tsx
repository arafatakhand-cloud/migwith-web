"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db } from "../../lib/firebase";
import { badgeText } from "../../lib/useBadges";
import { detachPushForLogout } from "../../lib/push";
import { PRESENCE_HEARTBEAT_MS, roomHref } from "../../lib/rooms";
import { leaveAllOpenRooms, touchOpenRooms, useOpenRooms } from "../../lib/openRooms";
import { useSession } from "./AppSession";
import { HeaderAuth } from "./AuthControls";
import { LanguageToggle } from "./LanguageToggle";

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
  ["/explore", "Explore"],
  ["/members", "Members"],
  ["/gifts", "Gift Shops"],
  ["/gift-contest", "Gift Contest"],
  ["/lucky", "Lucky User"],
  ["/style-studio", "Style Studio"],
  ["/merchant", "Merchant"],
  ["/leaderboard", "Leader Board"],
  ["/security", "Security PIN"],
  ["/settings", "Settings"],
  ["/friends", "Friends"],
  ["/messages", "Messages"],
  ["/chat/", "Chat"],
  ["/alerts", "Alerts"],
  ["/wallet", "My Account"],
  ["/profile", "Profile"],
];

export function TopBar() {
  const pathname = usePathname() || "/";
  const { user, username, loading, badges } = useSession();
  const [open, setOpen] = useState(false);
  const [me, setMe] = useState<{ level: number; xp: number; coins: number; photo: string; online: boolean } | null>(null);

  // Level, XP and coins for the menu card (only while the menu is open).
  const uid = user?.uid;
  useEffect(() => {
    if (!open || !uid) return;
    return onSnapshot(doc(db, "users", uid), (snap) => {
      const d = snap.data() || {};
      setMe({
        level: Number(d.level || 1),
        xp: Number(d.xp || 0),
        coins: Number(d.balance || 0),
        photo: String(d.photoUrl || d.profilePic || d.avatarUrl || d.imageUrl || "").trim(),
        online: String(d.presenceStatus || "ONLINE").toUpperCase() === "ONLINE",
      });
    });
  }, [open, uid]);

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
    let start: { x: number; y: number; t: number } | null = null;
    const onStart = (e: TouchEvent) => {
      const el = e.target as Element | null;
      // Leave sideways scrollers, text boxes and game tables alone.
      if (e.touches.length !== 1 || el?.closest("input, textarea, select, [data-noswipe], .overflow-x-auto")) {
        start = null;
        return;
      }
      start = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() };
    };
    const onEnd = (e: TouchEvent) => {
      if (!start) return;
      const dx = e.changedTouches[0].clientX - start.x;
      const dy = e.changedTouches[0].clientY - start.y;
      const quick = Date.now() - start.t < 700;
      start = null;
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
            MIG<span className="text-[#2F80ED]">with</span>
          </span>
        </Link>
        <HeaderAuth />
      </div>
    );
  }

  const onHome = pathname === "/";
  const onRooms = pathname === "/rooms";
  const pageName = currentRoom ? undefined : PAGE_NAMES.find(([p]) => pathname.startsWith(p))?.[1];
  const tab = (active: boolean) =>
    `relative flex h-9 w-10 shrink-0 items-center justify-center rounded-xl text-lg transition ${
      active ? "bg-[#2F80ED] text-white shadow-md" : "text-[#0B2A5B] hover:bg-[#E3F0FD]"
    }`;

  const links: [string, string, string, number][] = [
    ["/", "🏠", "Home", 0],
    ["/profile/me", "🪪", "My Profile", 0],
    ["/wallet", "💳", "My Account", 0],
    ["/friends", "👥", "Friends", badges.requests],
    ["/explore", "🧭", "Explore", 0],
    ["/rooms", "🎮", "Game List", 0],
    ["/settings", "⚙️", "Settings", 0],
  ];

  return (
    <>
      <div className="mx-auto flex max-w-7xl items-center gap-1.5 px-3 py-2 sm:gap-2 sm:px-6">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Menu"
          className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xl text-[#0B2A5B] hover:bg-[#E3F0FD]"
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
                  💬 <span className="truncate">{r.replace(/^👻\s*/, "")}</span>
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
      {open &&
        createPortal(
        <div className="fixed inset-0 z-50" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <nav
            className="absolute inset-y-0 left-0 flex w-80 max-w-[82vw] flex-col overflow-y-auto bg-gradient-to-b from-[#CFE6F9] to-[#B4DDF7] p-3 text-[#0B2A5B] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Profile card */}
            <div className="rounded-3xl border-2 border-[#D4AF37] bg-gradient-to-br from-[#2F6FD6] to-[#174EA6] p-4 text-white shadow-lg">
              <div className="flex items-center gap-3">
                <div className="relative h-14 w-14 shrink-0">
                  <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-2xl border-2 border-[#D4AF37] bg-[#0B2A5B] text-2xl font-black">
                    {me?.photo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={me.photo} alt="" className="h-full w-full object-cover" />
                    ) : (
                      username.slice(0, 1).toUpperCase()
                    )}
                  </div>
                  <span
                    className={`absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full border-2 border-[#174EA6] ${
                      me?.online === false ? "bg-white/50" : "bg-emerald-400"
                    }`}
                  />
                </div>
                <div className="min-w-0">
                  <p data-notranslate className="truncate text-xl font-black">
                    {username}
                  </p>
                  <p className="text-sm font-bold text-yellow-200">
                    ⭐ Level {me?.level ?? "…"} · {me?.online === false ? "Away" : "Active"}
                  </p>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Link href="/leaderboard" className="rounded-2xl border border-white/25 bg-white/10 py-2 text-center">
                  <p className="font-black">{me ? me.xp.toLocaleString() : "…"}</p>
                  <p className="text-[11px] text-white/80">XP</p>
                </Link>
                <Link href="/wallet" className="rounded-2xl border border-white/25 bg-white/10 py-2 text-center">
                  <p className="font-black text-cyan-200">
                    {me
                      ? me.coins >= 1_000_000
                        ? `${(me.coins / 1_000_000).toFixed(1)}M`
                        : me.coins >= 1000
                          ? `${(me.coins / 1000).toFixed(1)}K`
                          : me.coins
                      : "…"}
                  </p>
                  <p className="text-[11px] text-white/80">Coins</p>
                </Link>
              </div>
            </div>

            <ul className="mt-3 space-y-2">
              {links.map(([href, icon, label, n]) => {
                const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
                return (
                  <li key={href}>
                    <Link
                      href={href}
                      className={`flex items-center gap-3 rounded-2xl border px-2.5 py-2 text-sm font-semibold shadow-sm transition ${
                        active ? "border-[#174EA6] bg-[#DCEBFB]" : "border-transparent bg-white/90 hover:bg-white"
                      }`}
                    >
                      <span
                        className={`flex h-9 w-9 items-center justify-center rounded-xl text-base ${
                          active ? "bg-[#2F80ED]" : "bg-[#EAF2FC]"
                        }`}
                      >
                        {icon}
                      </span>
                      <span className="flex-1">{label}</span>
                      {n > 0 && (
                        <span className="rounded-full bg-rose-500 px-2 text-[11px] font-bold leading-5 text-white">
                          {badgeText(n)}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>

            <button
              type="button"
              onClick={async () => {
                await detachPushForLogout();
                if (uid) await leaveAllOpenRooms(uid);
                await signOut(auth);
              }}
              className="mt-3 flex items-center gap-3 rounded-2xl border-2 border-rose-400 bg-rose-50 px-2.5 py-2 text-left text-sm font-bold text-rose-600"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-100">↪</span>
              <span className="flex-1">Logout</span>
              <span>›</span>
            </button>
            <p className="mt-2 text-center text-[10px] text-[#35507E]">MIGwith Web</p>
          </nav>
        </div>,
          document.body
        )}
    </>
  );
}
