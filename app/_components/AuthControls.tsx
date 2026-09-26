"use client";

import Link from "next/link";
import { signOut } from "firebase/auth";
import { auth } from "../../lib/firebase";
import { useSession } from "./AppSession";

/* Header: Login button, or the signed-in MIG ID + Logout */
export function HeaderAuth() {
  // On phones Rooms / Messages / Friends / Me live in the bottom bar instead.
  const {
    user,
    username,
    loading,
    badges: { messages: unreadTotal, requests, alerts },
  } = useSession();

  if (loading) {
    return <div className="h-10 w-24" />;
  }

  if (!user) {
    return (
      <Link
        href="/login"
        className="rounded-xl border border-white/15 bg-white/5 px-5 py-2.5 text-sm font-semibold backdrop-blur transition hover:bg-white/10"
      >
        Login
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-0.5 sm:gap-2">
      <Link
        href="/rooms"
        className="hidden sm:block rounded-xl px-2 py-2 text-sm text-white/70 transition hover:text-white"
      >
        💬<span className="ml-1 hidden sm:inline">Rooms</span>
      </Link>
      <Link
        href="/messages"
        className="hidden sm:block relative rounded-xl px-2 py-2 text-sm text-white/70 transition hover:text-white"
      >
        ✉️<span className="ml-1 hidden sm:inline">Messages</span>
        {unreadTotal > 0 && (
          <span className="absolute -right-1 -top-0.5 min-w-[18px] rounded-full bg-pink-500 px-1 text-center text-[10px] font-bold leading-[18px] text-white">
            {unreadTotal > 99 ? "99+" : unreadTotal}
          </span>
        )}
      </Link>
      <Link
        href="/friends"
        className="hidden sm:block relative rounded-xl px-2 py-2 text-sm text-white/70 transition hover:text-white"
      >
        👥<span className="ml-1 hidden sm:inline">Friends</span>
        {requests > 0 && (
          <span className="absolute -right-1 -top-0.5 min-w-[18px] rounded-full bg-pink-500 px-1 text-center text-[10px] font-bold leading-[18px] text-white">
            {requests > 99 ? "99+" : requests}
          </span>
        )}
      </Link>
      <Link
        href="/alerts"
        className="relative rounded-xl px-2 py-2 text-sm text-white/70 transition hover:text-white"
      >
        🔔<span className="ml-1 hidden lg:inline">Alerts</span>
        {alerts > 0 && (
          <span className="absolute -right-1 -top-0.5 min-w-[18px] rounded-full bg-pink-500 px-1 text-center text-[10px] font-bold leading-[18px] text-white">
            {alerts > 99 ? "99+" : alerts}
          </span>
        )}
      </Link>
      <Link
        href="/profile/me"
        className="hidden sm:block rounded-xl px-2 py-2 text-sm text-white/70 transition hover:text-white"
      >
        👤<span className="ml-1 hidden font-semibold text-cyan-300 md:inline">{username}</span>
      </Link>

      <button
        type="button"
        onClick={() => signOut(auth)}
        className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm font-semibold backdrop-blur transition hover:bg-white/10 sm:px-5 sm:py-2.5"
      >
        Logout
      </button>
    </div>
  );
}

/* Hero: Create/Login buttons, or a welcome message when signed in */
export function HeroActions() {
  const { user, username, loading } = useSession();

  if (loading) {
    return <div className="mt-10 h-[60px]" />;
  }

  if (user) {
    return (
      <div className="mt-10 flex w-full flex-col items-center gap-4">
        <div className="rounded-2xl border border-cyan-300/20 bg-cyan-300/5 px-8 py-4 text-lg font-bold text-white">
          Welcome, <span className="text-cyan-300">{username}</span> 👋
        </div>

        <Link
          href="/rooms"
          className="group flex w-full max-w-xs items-center justify-center rounded-2xl bg-gradient-to-r from-blue-500 to-cyan-400 px-8 py-4 font-bold text-white shadow-xl shadow-blue-500/25 transition duration-300 hover:scale-[1.02]"
        >
          💬 Enter Chat Rooms
          <span className="ml-2 transition group-hover:translate-x-1">→</span>
        </Link>
        <Link
          href="/wallet"
          className="flex w-full max-w-xs items-center justify-center rounded-2xl border border-amber-300/30 bg-amber-300/10 px-8 py-3 font-bold text-amber-200 transition hover:bg-amber-300/20"
        >
          💰 My Account · Coins
        </Link>
        <Link
          href="/leaderboard"
          className="flex w-full max-w-xs items-center justify-center rounded-2xl border border-white/15 bg-white/5 px-8 py-3 font-bold text-white/80 transition hover:bg-white/10"
        >
          🏆 Leader Board
        </Link>
      </div>
    );
  }

  return (
    <div className="mt-10 flex w-full flex-col items-center justify-center gap-4 sm:flex-row">

      {/* Create MIG ID */}
      <Link
        href="/register"
        className="group flex w-full max-w-xs items-center justify-center rounded-2xl bg-gradient-to-r from-blue-500 to-cyan-400 px-8 py-4 font-bold text-white shadow-xl shadow-blue-500/25 transition duration-300 hover:scale-[1.02] hover:shadow-cyan-400/20"
      >
        Create MIG ID

        <span className="ml-2 transition group-hover:translate-x-1">
          →
        </span>
      </Link>

      {/* Login */}
      <Link
        href="/login"
        className="flex w-full max-w-xs items-center justify-center rounded-2xl border border-white/15 bg-white/5 px-8 py-4 font-bold text-white/90 backdrop-blur transition hover:bg-white/10"
      >
        Login to MIGwith
      </Link>
    </div>
  );
}
