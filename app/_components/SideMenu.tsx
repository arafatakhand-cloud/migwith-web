"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db } from "../../lib/firebase";
import { badgeText } from "../../lib/useBadges";
import { detachPushForLogout } from "../../lib/push";
import { leaveAllOpenRooms } from "../../lib/openRooms";
import { useSession } from "./AppSession";
import { useFounderPerms } from "../../lib/founder";
import { markOfflineForLogout } from "../../lib/heartbeat";
import { useIsClassic } from "../../lib/uiStyle";
import { brandMiglife } from "../../lib/brand";
import { clearRememberedAmounts } from "../../lib/amountMemory";

// The app's menu: profile card (level, XP, coins), the page links and Logout.
// Phones open it from ☰; laptops show it as a sidebar (DesktopSidebar).

type Me = { level: number; xp: number; coins: number; photo: string; online: boolean; presence: string };

export function MenuPanel() {
  const pathname = usePathname() || "/";
  const { user, username, badges } = useSession();
  const uid = user?.uid;
  const [me, setMe] = useState<Me | null>(null);
  const founder = useFounderPerms();
  const classic = useIsClassic();

  useEffect(() => {
    if (!uid) return;
    return onSnapshot(doc(db, "users", uid), (snap) => {
      const d = snap.data() || {};
      setMe({
        level: Number(d.level || 1),
        xp: Number(d.xp || 0),
        coins: Number(d.balance || 0),
        photo: String(d.photoUrl || d.profilePic || d.avatarUrl || d.imageUrl || "").trim(),
        online: String(d.presenceStatus || "ONLINE").toUpperCase() === "ONLINE",
        presence: String(d.presenceStatus || "ONLINE").toUpperCase(),
      });
    });
  }, [uid]);

  const links: [string, string, string, number][] = [
    ["/", "⌂", "Lobby", 0],
    ["/profile/me", "🪪", "My Space", 0],
    ["/wallet", "▣", "Wallet", 0],
    ["/friends", "👥", "Friends", badges.requests],
    ["/explore", "◉", "Discover", 0],
    // The founder tools, like the app's "miglife secret" (founders only).
    ...(founder.isAnyFounder ? ([["/secret", "▤", "miglife secret", 0]] as [string, string, string, number][]) : []),
    ["/games", "🎮", "Play Zone", 0],
    ["/settings", "⚙", "Settings", 0],
  ];

  const logout = async () => {
    await detachPushForLogout();
    if (uid) await leaveAllOpenRooms(uid);
    await markOfflineForLogout(uid);
    clearRememberedAmounts(); // logout resets the chosen game amounts
    await signOut(auth);
  };
  const coinsText = me
    ? me.coins >= 1_000_000
      ? `${(me.coins / 1_000_000).toFixed(1)}M`
      : me.coins >= 1000
        ? `${(me.coins / 1000).toFixed(1)}K`
        : String(me.coins)
    : "…";

  // 📟 CLASSIC menu: orange header with a square photo, name, presence + level,
  // a blue XP | Coins strip, then plain white rows with an orange icon tile,
  // thin dividers and a blue bar on the open page.
  if (classic) {
    const presence = me?.presence || "ONLINE";
    const presenceLabel = { ONLINE: "Online", BUSY: "Busy", AWAY: "Away" }[presence] || "Offline";
    const presenceColor = { ONLINE: "#3CC24A", BUSY: "#E53935", AWAY: "#FFB300" }[presence] || "#9AA3AE";
    return (
      <div className="-m-3 min-h-full bg-white pb-2 text-[#16315F]">
        <Link href="/profile/me" className="flex items-center gap-3 bg-gradient-to-b from-[#FF9D2E] to-[#F07A00] p-3">
          <span className="flex h-[58px] w-[58px] shrink-0 items-center justify-center overflow-hidden rounded border-2 border-white bg-[#FFE0B8] text-[26px] font-bold text-[#F07A00]">
            {me?.photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={me.photo} alt="" className="h-full w-full rounded-sm object-cover p-0.5" />
            ) : (
              username.slice(0, 1).toUpperCase() || "U"
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span data-notranslate className="block truncate text-[19px] font-bold text-white">
              {username || "User"}
            </span>
            <span className="mt-1 flex items-center gap-[5px] text-[13px] font-semibold text-white/95">
              <span className="h-2.5 w-2.5 rounded-full border border-white" style={{ background: presenceColor }} />
              {presenceLabel} · Level {me?.level ?? "…"}
            </span>
          </span>
          <span className="text-[26px] text-white">›</span>
        </Link>
        <div className="flex bg-gradient-to-b from-[#5A8FD6] to-[#2F6ABD] py-[7px] text-white">
          <Link href="/level" className="flex-1 text-center">
            <span className="block text-sm font-extrabold">{me ? me.xp.toLocaleString() : "…"}</span>
            <span className="block text-[11px] text-white/85">⭐ XP</span>
          </Link>
          <span className="w-px bg-white/35" />
          <Link href="/wallet" className="flex-1 text-center">
            <span className="block text-sm font-extrabold">{coinsText}</span>
            <span className="block text-[11px] text-white/85">🪙 Coins</span>
          </Link>
        </div>
        <div className="h-[2px] bg-[#F07A00]" />
        {links.map(([href, icon, label]) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          const n = href === "/friends" ? badges.messages : 0;
          return (
            <Link
              key={href}
              href={href}
              className={`relative flex items-center after:absolute after:bottom-0 after:left-[50px] after:right-0 after:h-px after:bg-[#DDE3EA] ${
                active ? "bg-[#E3EEFB]" : "hover:bg-[#F6F8FB]"
              }`}
            >
              <span className={`w-1 self-stretch ${active ? "bg-[#2F6ABD]" : ""}`} />
              <span className="flex flex-1 items-center py-[11px] pl-2.5 pr-3">
                <span
                  className={`flex h-[26px] w-[26px] items-center justify-center rounded bg-gradient-to-b text-sm text-white ${
                    active ? "from-[#5A8FD6] to-[#2F6ABD]" : "from-[#FF9D2E] to-[#F07A00]"
                  }`}
                >
                  {icon}
                </span>
                <span className={`ml-3 flex-1 text-[15px] ${active ? "font-bold text-[#2F6ABD]" : "font-medium"}`}>
                  {brandMiglife(label)}
                </span>
                {n > 0 && <span className="mr-1.5 text-[13px] font-bold text-[#F07A00]">✉ {n > 99 ? "99+" : n}</span>}
                <span className="text-xl text-[#A9B4C2]">›</span>
              </span>
            </Link>
          );
        })}
        {/* 🚪 Logout: deliberately quiet — small grey text at the very bottom, no
            colour, no card (a bright red button invites taps), like the app */}
        <button type="button" onClick={logout} className="mt-[18px] w-full py-1.5 text-center text-xs text-[#9AA5B4]">
          Log out
        </button>
        <p className="mt-1 text-center text-[10px] text-[#8A97A8]">miGlife Web</p>
      </div>
    );
  }

  return (
    <>
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
        <Link href="/level" className="rounded-2xl border border-white/25 bg-white/10 py-2 text-center">
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

    {/* 🚪 Logout: deliberately quiet — small grey text at the very bottom (like the app) */}
    <button type="button" onClick={logout} className="mt-[18px] w-full py-1.5 text-center text-xs text-[#9AA5B4]">
      Log out
    </button>
    <p className="mt-1 text-center text-[10px] text-[#35507E]">MIGlife Web</p>
    </>
  );
}

/* Laptop / desktop: the menu stays open on the left. */
export function DesktopSidebar() {
  const { user } = useSession();
  if (!user) return null;
  return (
    <aside className="sticky top-[53px] hidden h-[calc(100vh-53px)] w-72 shrink-0 overflow-y-auto border-r border-[#BFD7F2] bg-gradient-to-b from-[#CFE6F9] to-[#B4DDF7] p-3 text-[#0B2A5B] lg:flex lg:flex-col">
      <MenuPanel />
    </aside>
  );
}
