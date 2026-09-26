"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { badgeText } from "../../lib/useBadges";
import { useSession } from "./AppSession";

/* Phone-only bottom bar, like the app's main tabs. */
export function BottomNav() {
  const pathname = usePathname() || "/";
  const { user, badges } = useSession();
  if (!user) return null;

  const tabs = [
    { href: "/", icon: "🏠", label: "Home", active: pathname === "/" },
    { href: "/rooms", icon: "💬", label: "Rooms", active: pathname.startsWith("/room") },
    {
      href: "/messages",
      icon: "✉️",
      label: "Chats",
      active: pathname.startsWith("/messages") || pathname.startsWith("/chat"),
      badge: badges.messages,
    },
    { href: "/friends", icon: "👥", label: "Friends", active: pathname.startsWith("/friends"), badge: badges.requests },
    {
      href: "/profile/me",
      icon: "👤",
      label: "Me",
      active: pathname.startsWith("/profile") || pathname.startsWith("/wallet"),
    },
  ];

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-[#050b1c]/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl sm:hidden">
      <div className="grid grid-cols-5">
        {tabs.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className={`relative flex flex-col items-center gap-0.5 py-2 text-[11px] font-semibold ${
              t.active ? "text-cyan-300" : "text-white/50"
            }`}
          >
            <span className={`text-xl leading-6 ${t.active ? "" : "opacity-70 grayscale-[40%]"}`}>{t.icon}</span>
            {t.label}
            {!!t.badge && (
              <span className="absolute left-1/2 top-1 ml-2 min-w-[18px] rounded-full bg-pink-500 px-1 text-center text-[10px] font-bold leading-[18px] text-white">
                {badgeText(t.badge)}
              </span>
            )}
            {t.active && <span className="absolute top-0 h-0.5 w-8 rounded-full bg-cyan-300" />}
          </Link>
        ))}
      </div>
    </nav>
  );
}
