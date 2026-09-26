"use client";

import Link from "next/link";
import { signOut } from "firebase/auth";
import { auth } from "../../lib/firebase";
import { useCurrentUser } from "../../lib/useCurrentUser";

/* Header: Login button, or the signed-in MIG ID + Logout */
export function HeaderAuth() {
  const { user, username, loading } = useCurrentUser();

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
    <div className="flex items-center gap-3">
      <span className="hidden text-sm text-white/70 sm:inline">
        <span className="font-semibold text-cyan-300">{username}</span>
      </span>

      <button
        type="button"
        onClick={() => signOut(auth)}
        className="rounded-xl border border-white/15 bg-white/5 px-5 py-2.5 text-sm font-semibold backdrop-blur transition hover:bg-white/10"
      >
        Logout
      </button>
    </div>
  );
}

/* Hero: Create/Login buttons, or a welcome message when signed in */
export function HeroActions() {
  const { user, username, loading } = useCurrentUser();

  if (loading) {
    return <div className="mt-10 h-[60px]" />;
  }

  if (user) {
    return (
      <div className="mt-10 flex w-full flex-col items-center gap-4">
        <div className="rounded-2xl border border-cyan-300/20 bg-cyan-300/5 px-8 py-4 text-lg font-bold text-white">
          Welcome, <span className="text-cyan-300">{username}</span> 👋
        </div>

        <p className="text-sm text-white/45">
          You&apos;re logged in to MIGwith.
        </p>
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
