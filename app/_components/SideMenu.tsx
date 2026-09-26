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

// The app's menu: profile card (level, XP, coins), the page links and Logout.
// Phones open it from ☰; laptops show it as a sidebar (DesktopSidebar).

type Me = { level: number; xp: number; coins: number; photo: string; online: boolean };

export function MenuPanel() {
  const pathname = usePathname() || "/";
  const { user, username, badges } = useSession();
  const uid = user?.uid;
  const [me, setMe] = useState<Me | null>(null);

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
      });
    });
  }, [uid]);

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
