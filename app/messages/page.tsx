"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCurrentUser } from "../../lib/useCurrentUser";
import { chatHref, useFriends, useUnreadBySender } from "../../lib/privateChat";
import { PageShell } from "../_components/PageShell";

export default function MessagesPage() {
  const router = useRouter();
  const { user, username, loading } = useCurrentUser();
  const friends = useFriends(username);
  const unread = useUnreadBySender(username);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  // Friends first (unread on top), then anyone else who has written to me.
  const people = Array.from(new Set([...friends, ...Object.keys(unread)]))
    .filter((p) => p.toLowerCase().includes(search.trim().toLowerCase()))
    .sort((a, b) => (unread[b] || 0) - (unread[a] || 0) || a.toLowerCase().localeCompare(b.toLowerCase()));

  if (loading || !user) {
    return (
      <PageShell>
        <p className="py-20 text-center text-sm text-white/40">Loading…</p>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <section className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <h1 className="text-3xl font-black tracking-tight">Messages</h1>
        <p className="mt-1 text-sm text-white/45">Private chats with your MIGwith friends.</p>

        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search friends"
          className="mt-6 w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none placeholder:text-white/25 focus:border-cyan-300/50"
        />

        <div className="mt-4 space-y-2">
          {people.length === 0 && (
            <p className="py-10 text-center text-sm text-white/35">
              {friends.length === 0
                ? "No friends yet. Add friends in the MIGwith app to chat here."
                : "No friends match your search."}
            </p>
          )}
          {people.map((p) => (
            <Link
              key={p}
              href={chatHref(p)}
              className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 transition hover:border-cyan-300/30 hover:bg-white/[0.07]"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-cyan-400 font-black">
                {p.slice(0, 1).toUpperCase()}
              </div>
              <span className="flex-1 truncate font-semibold">{p}</span>
              {!friends.includes(p) && <span className="text-xs text-white/30">not a friend</span>}
              {(unread[p] || 0) > 0 && (
                <span className="rounded-full bg-pink-500 px-2 py-0.5 text-xs font-bold">{unread[p]}</span>
              )}
            </Link>
          ))}
        </div>
      </section>
    </PageShell>
  );
}
