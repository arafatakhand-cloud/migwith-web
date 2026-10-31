"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { collection, getDocs, limit, orderBy, query, where } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useCurrentUser } from "../../lib/useCurrentUser";
import { useFriends } from "../../lib/privateChat";
import { useSenderColors } from "../../lib/senderColors";
import { PageTitle } from "./LightCards";
import {
  BLOG_CATEGORIES,
  blogAgo,
  blogCategoryLabel,
  blogCoverFallback,
  blogShort,
  toBlogPost,
  type BlogPost,
} from "../../lib/feed";

// 📰 Feed list: 🔥 Popular · 🆕 New · 👥 Friends · ✍️ Mine (or one writer's
// posts with ?author=name, from their profile). Anyone can read; writing needs
// a login. Read once per tab (no live listener), pull the tab again to refresh.

type Tab = "popular" | "new" | "friends" | "mine";
const TABS: [Tab, string][] = [
  ["popular", "🔥 Popular"],
  ["new", "🆕 New"],
  ["friends", "👥 Friends"],
  ["mine", "✍️ Mine"],
];

export function FeedList({ author = "", embedded = false }: { author?: string; embedded?: boolean }) {
  const { user, username } = useCurrentUser();
  const friends = useFriends(username);
  const [tab, setTab] = useState<Tab>("popular");
  const [cat, setCat] = useState("");
  const [posts, setPosts] = useState<BlogPost[] | null>(null);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const friendsKey = friends.join(",");

  useEffect(() => {
    let alive = true;
    setPosts(null);
    setError("");
    const col = collection(db, "blog_posts");
    const load = async (): Promise<BlogPost[]> => {
      const map = (s: Awaited<ReturnType<typeof getDocs>>) => s.docs.map((d) => toBlogPost(d.id, d.data() as Record<string, unknown>));
      if (author) return map(await getDocs(query(col, where("author", "==", author), limit(100)))).sort((a, b) => b.createdMs - a.createdMs);
      if (tab === "popular") return map(await getDocs(query(col, orderBy("hot", "desc"), limit(40))));
      if (tab === "new") return map(await getDocs(query(col, orderBy("createdMs", "desc"), limit(40))));
      if (tab === "mine") {
        if (!user) return [];
        return map(await getDocs(query(col, where("authorUid", "==", user.uid), limit(100)))).sort((a, b) => b.createdMs - a.createdMs);
      }
      // friends: 10 names per query (Firestore "in" limit)
      const names = friendsKey ? friendsKey.split(",") : [];
      const out: BlogPost[] = [];
      for (let i = 0; i < names.length && i < 100; i += 10) {
        out.push(...map(await getDocs(query(col, where("author", "in", names.slice(i, i + 10)), limit(30)))));
      }
      return out.sort((a, b) => b.createdMs - a.createdMs).slice(0, 60);
    };
    load()
      .then((p) => alive && setPosts(p))
      .catch(() => alive && (setError("Couldn't load the Feed. Please try again."), setPosts([])));
    return () => {
      alive = false;
    };
  }, [tab, author, user, friendsKey, reload]);

  const shown = useMemo(() => (posts || []).filter((p) => !cat || p.category === cat), [posts, cat]);
  const colorOf = useSenderColors(useMemo(() => Array.from(new Set((posts || []).map((p) => p.author))), [posts]));

  return (
    <>
      <section className="mx-auto max-w-2xl px-3 pb-28 sm:px-6">
        {embedded ? (
          <div className="flex items-center gap-2 px-1 pb-1 pt-3">
            <span className="text-2xl">📰</span>
            <div>
              <h1 className="text-[20px] font-extrabold leading-tight text-[#0F1D3A]">Feed</h1>
              <p className="text-[12px] text-[#5A6F93]">Stories, tips and news from miGlife people</p>
            </div>
          </div>
        ) : (
        <PageTitle
          title={author ? `${author}'s Feed` : "Feed"}
          subtitle={author ? "Every post by this writer" : "Stories, tips and news from miGlife people"}
          icon="📰"
          backHref={author ? `/profile/${encodeURIComponent(author)}` : undefined}
        />
        )}

        {!author && (
          <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1 pt-1">
            {TABS.map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => (k === tab ? setReload((n) => n + 1) : setTab(k))}
                className={`shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition ${
                  tab === k ? "bg-[#2563EB] text-white shadow-[0_4px_10px_-4px_rgba(37,99,235,.8)]" : "bg-white/70 text-[#4A5F85]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        <div className="no-scrollbar -mx-1 mt-1.5 flex gap-1.5 overflow-x-auto px-1 pb-1">
          {[["", "All"], ...BLOG_CATEGORIES].map(([k, label]) => (
            <button
              key={k || "all"}
              type="button"
              onClick={() => setCat(k)}
              className={`shrink-0 rounded-full border px-2.5 py-1 text-[12px] font-semibold ${
                cat === k ? "border-[#2563EB] bg-[#2563EB]/10 text-[#1D4ED8]" : "border-transparent bg-white/50 text-[#5A6F93]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {error && <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        {posts === null ? (
          <div className="mt-3 space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-[230px] animate-pulse rounded-2xl bg-white/60" />
            ))}
          </div>
        ) : shown.length === 0 ? (
          <div className="mt-10 text-center text-[#5A6F93]">
            <div className="text-4xl">📰</div>
            <p className="mt-2 font-semibold">
              {tab === "mine" && !author
                ? user
                  ? "You haven't written a post yet."
                  : "Log in to see your posts."
                : tab === "friends" && !author
                  ? user
                    ? "Your friends haven't written anything yet."
                    : "Log in to see your friends' posts."
                  : "No posts here yet."}
            </p>
            {user && <p className="mt-1 text-sm">Be the first — tap ✍️ Write.</p>}
          </div>
        ) : (
          <div className="mt-2 space-y-3">
            {shown.map((p) => (
              <BlogCard key={p.id} p={p} color={colorOf(p.author)} />
            ))}
          </div>
        )}
      </section>

      <Link
        href={user ? "/feed/write" : "/login"}
        className="fixed bottom-6 right-5 z-30 flex h-[50px] items-center gap-2 rounded-full bg-gradient-to-b from-[#3B82F6] to-[#1D4ED8] px-5 font-bold text-white shadow-[0_10px_22px_-8px_rgba(29,78,216,.8)] transition active:scale-95"
      >
        ✍️ Write
      </Link>
    </>
  );
}

function BlogCard({ p, color }: { p: BlogPost; color: string }) {
  const pic = p.cover || p.firstImage;
  return (
    <Link
      href={`/feed/${p.id}`}
      className="block overflow-hidden rounded-2xl bg-white/90 shadow-[0_4px_14px_-6px_rgba(30,60,120,.3)] transition active:scale-[.99]"
    >
      <div
        className="bg-cover bg-center"
        style={{ backgroundImage: pic ? `url("${pic}")` : blogCoverFallback(p.id), height: pic ? 150 : 84 }}
      />
      <div className="px-3 pb-3 pt-2.5">
        <div className="flex items-center gap-2 text-[12.5px] text-[#5A6F93]">
          <span
            className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full text-[12px] font-bold text-white"
            style={{ background: color || "#2563EB" }}
          >
            {p.author.slice(0, 1).toUpperCase()}
          </span>
          <span data-notranslate className="truncate font-bold" style={{ color: color || "#1D4ED8" }}>
            {p.author}
          </span>
          <span className="shrink-0">· {blogAgo(p.createdMs)} · {blogCategoryLabel(p.category)}</span>
        </div>
        <h2 className="mt-1.5 line-clamp-2 text-[16.5px] font-extrabold leading-snug text-[#0F1D3A]">{p.title}</h2>
        {p.excerpt && <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-[#4A5F85]">{p.excerpt}</p>}
        <div className="mt-2 flex gap-4 text-[12.5px] font-semibold text-[#6B7FA6]">
          <span>❤️ {blogShort(p.likes)}</span>
          <span>💬 {blogShort(p.comments)}</span>
          <span>👁 {blogShort(p.views)}</span>
        </div>
      </div>
    </Link>
  );
}
