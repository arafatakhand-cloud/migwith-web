"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCurrentUser } from "../../lib/useCurrentUser";
import { chatHref, useFriends, useUnreadBySender } from "../../lib/privateChat";
import { PageShell } from "../_components/PageShell";
import { PageTitle } from "../_components/LightCards";

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
      <PageShell light>
        <p className="py-20 text-center text-sm text-[#5B6B8C]">Loading…</p>
      </PageShell>
    );
  }

  return (
    <PageShell light>
      <section className="mx-auto max-w-2xl px-3 pb-8 sm:px-6">
        <PageTitle title="Messages" subtitle="Private chats" icon="✉️" />

        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search friends"
          className="w-full rounded-full border border-[#D5E3F5] bg-white px-4 py-2.5 text-sm text-[#0B2A5B] shadow-sm outline-none placeholder:text-[#8A9BBC] focus:border-[#2F80ED]"
        />

        <div className="mt-4 overflow-hidden rounded-2xl bg-white shadow-sm">
          {people.length === 0 && (
            <p className="px-4 py-10 text-center text-sm text-[#6B7A99]">
              {friends.length === 0
                ? "No friends yet. Add friends from the 👥 Friends page to chat here."
                : "No friends match your search."}
            </p>
          )}
          {people.map((p) => (
            <Link
              key={p}
              href={chatHref(p)}
              className="flex items-center gap-3 border-b border-[#E3ECF7] px-4 py-3 transition last:border-b-0 hover:bg-[#F4F9FF]"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#DCEBFB] font-black text-[#174EA6]">
                {p.slice(0, 1).toUpperCase()}
              </div>
              <span data-notranslate className="flex-1 truncate font-semibold text-[#0B2A5B]">{p}</span>
              {!friends.includes(p) && <span className="text-xs text-[#8A9BBC]">not a friend</span>}
              {(unread[p] || 0) > 0 && (
                <span className="rounded-full bg-rose-500 px-2 py-0.5 text-xs font-bold text-white">{unread[p]}</span>
              )}
            </Link>
          ))}
        </div>
      </section>
    </PageShell>
  );
}
