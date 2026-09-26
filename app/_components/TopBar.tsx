"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db } from "../../lib/firebase";
import { badgeText } from "../../lib/useBadges";
import { detachPushForLogout } from "../../lib/push";
import { useSession } from "./AppSession";
import { HeaderAuth } from "./AuthControls";
import { LanguageToggle } from "./LanguageToggle";

// App-style top bar: ☰ menu, 🏠 Home and 💬 Rooms tabs, 🔔 alerts.
// Signed out, it shows the logo and the Login button instead.

function Badge({ n }: { n: number }) {
  if (!n) return null;
  return (
    <span className="absolute -right-1.5 -top-1.5 min-w-[18px] rounded-full bg-rose-500 px-1 text-center text-[10px] font-bold leading-[18px] text-white">
      {badgeText(n)}
    </span>
  );
}

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

  // Close the menu when the page changes.
  useEffect(() => setOpen(false), [pathname]);

  if (loading) return <div className="h-[60px]" />;

  if (!user) {
    return (
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
        <Link href="/" className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-300/30 bg-gradient-to-br from-blue-500 to-cyan-400">
            <span className="text-lg font-black">M</span>
          </div>
          <span className="text-xl font-black tracking-wide">
            MIG<span className="text-cyan-300">with</span>
          </span>
        </Link>
        <HeaderAuth />
      </div>
    );
  }

  const onHome = pathname === "/";
  const onRooms = pathname.startsWith("/room");
  const tab = (active: boolean, activeColor: string) =>
    `relative flex h-11 w-12 items-center justify-center rounded-xl text-xl transition ${
      active ? `${activeColor} ring-1 ring-white/30 shadow-lg` : "text-white/80 hover:bg-white/10"
    }`;

  const links: [string, string, string, number][] = [
    ["/", "🏠", "Home", 0],
    ["/rooms", "💬", "Rooms", 0],
    ["/messages", "✉️", "Messages", badges.messages],
    ["/friends", "👥", "Friends", badges.requests],
    ["/alerts", "🔔", "Alerts", badges.alerts],
    ["/profile/me", "👤", "My Profile", 0],
    ["/wallet", "💰", "My Account", 0],
    ["/leaderboard", "🏆", "Leader Board", 0],
    ["/security", "🔐", "Security", 0],
  ];

  return (
    <>
      <div className="mx-auto flex max-w-7xl items-center gap-2 px-3 py-2.5 sm:px-6">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Menu"
          className="relative flex h-11 w-11 items-center justify-center rounded-xl text-2xl text-white/90 hover:bg-white/10"
        >
          ☰
          <Badge n={badges.messages + badges.requests} />
        </button>
        <Link href="/" aria-label="Home" className={tab(onHome, "bg-[#2E6B45]")}>
          🏠
        </Link>
        <Link href="/rooms" aria-label="Rooms" className={tab(onRooms, "bg-[#3A5BB0]")}>
          💬
        </Link>
        <span className="mx-1 h-8 w-px bg-white/15" />
        <div className="ml-auto flex items-center gap-2">
          <Link
            href="/alerts"
            aria-label="Alerts"
            className="relative flex h-10 w-10 items-center justify-center rounded-xl text-lg hover:bg-white/10"
          >
            🔔
            <Badge n={badges.alerts} />
          </Link>
          <LanguageToggle />
        </div>
      </div>

      {/* Side menu */}
      {open && (
        <div className="fixed inset-0 z-50" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-black/60" />
          <nav
            className="absolute inset-y-0 left-0 flex w-80 max-w-[85vw] flex-col overflow-y-auto rounded-r-3xl border-r border-white/10 bg-gradient-to-b from-[#12225a] to-[#0a1230] p-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Profile card */}
            <div className="relative rounded-3xl border border-white/15 bg-[#26345f]/80 p-4">
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="absolute right-3 top-3 rounded-lg px-1.5 text-white/50 hover:bg-white/10"
              >
                ✕
              </button>
              <div className="flex items-center gap-3">
                <div className="relative h-14 w-14 shrink-0">
                  <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-2xl bg-sky-400 text-2xl font-black">
                    {me?.photo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={me.photo} alt="" className="h-full w-full object-cover" />
                    ) : (
                      username.slice(0, 1).toUpperCase()
                    )}
                  </div>
                  <span
                    className={`absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full border-2 border-[#26345f] ${
                      me?.online === false ? "bg-white/40" : "bg-emerald-400"
                    }`}
                  />
                </div>
                <div className="min-w-0">
                  <p data-notranslate className="truncate text-lg font-black">
                    {username}
                  </p>
                  <p className="text-sm font-semibold text-cyan-300">
                    ⭐ Level {me?.level ?? "…"} · {me?.online === false ? "Away" : "Active"}
                  </p>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Link href="/leaderboard" className="rounded-2xl border border-blue-300/30 bg-[#2f3d6b] py-2 text-center">
                  <p className="text-lg font-black text-cyan-300">{me ? me.xp.toLocaleString() : "…"}</p>
                  <p className="text-xs text-cyan-200/80">XP</p>
                </Link>
                <Link href="/wallet" className="rounded-2xl border border-blue-300/30 bg-[#2f3d6b] py-2 text-center">
                  <p className="text-lg font-black text-emerald-300">
                    {me
                      ? me.coins >= 1_000_000
                        ? `${(me.coins / 1_000_000).toFixed(1)}M`
                        : me.coins >= 1000
                          ? `${(me.coins / 1000).toFixed(1)}K`
                          : me.coins
                      : "…"}
                  </p>
                  <p className="text-xs text-emerald-200/80">Coins</p>
                </Link>
              </div>
            </div>
            <ul className="mt-3 flex-1 space-y-1">
              {links.map(([href, icon, label, n]) => (
                <li key={href}>
                  <Link
                    href={href}
                    className={`flex items-center gap-4 rounded-xl px-2 py-2 text-base font-semibold transition ${
                      pathname === href ? "bg-white/10 text-white" : "text-white/90 hover:bg-white/5"
                    }`}
                  >
                    <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#2a3556] text-lg">{icon}</span>
                    <span className="flex-1">{label}</span>
                    {n > 0 && (
                      <span className="rounded-full bg-rose-500 px-2 text-[11px] font-bold leading-5">{badgeText(n)}</span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={async () => {
                await detachPushForLogout();
                await signOut(auth);
              }}
              className="-mx-4 -mb-4 mt-4 flex items-center gap-4 border-t border-rose-500/30 bg-[#2a1a2e] px-6 py-4 text-left text-lg font-bold text-rose-400 hover:bg-[#351f37]"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-rose-900/60 text-lg">⎋</span>
              <span className="flex-1">Logout</span>
              <span className="text-rose-400/70">›</span>
            </button>
          </nav>
        </div>
      )}
    </>
  );
}
