"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, doc, getDoc, getDocs, limit, orderBy, query, where } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useCurrentUser } from "../../lib/useCurrentUser";
import { useFriends } from "../../lib/privateChat";
import { useSenderColors } from "../../lib/senderColors";
import { PageTitle } from "./LightCards";
import {
  blogAgo,
  blogCall,
  blogError,
  blogCategoryLabel,
  blogShort,
  toBlogPost,
  type BlogPost,
} from "../../lib/feed";

// 📰 Feed list (the "Thread" look, like Twitter/X): Popular · New · Friends · Mine (or one writer's
// posts with ?author=name, from their profile). Anyone can read; writing needs
// a login. Read once per tab (no live listener), pull the tab again to refresh.

type Tab = "popular" | "new" | "friends" | "mine";
const TABS: [Tab, string][] = [
  ["popular", "Popular"],
  ["new", "New"],
  ["friends", "Friends"],
  ["mine", "Mine"],
];

export function FeedList({ author = "", embedded = false }: { author?: string; embedded?: boolean }) {
  const { user, username } = useCurrentUser();
  const friends = useFriends(username);
  const [tab, setTab] = useState<Tab>("popular");
  const router = useRouter();
  // ❤️ which of these posts I liked (read once per list), and a short message
  const [liked, setLiked] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState("");
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

  // my likes for the posts on screen
  const ids = (posts || []).map((p) => p.id).join(",");
  useEffect(() => {
    if (!user || !ids) return setLiked(new Set());
    let alive = true;
    Promise.all(
      ids.split(",").map((id) =>
        getDoc(doc(db, "blog_posts", id, "likes", user.uid))
          .then((s) => (s.exists() ? id : ""))
          .catch(() => "")
      )
    ).then((r) => alive && setLiked(new Set(r.filter(Boolean))));
    return () => {
      alive = false;
    };
  }, [ids, user]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 2400);
    return () => clearTimeout(t);
  }, [toast]);

  const colorOf = useSenderColors(useMemo(() => Array.from(new Set([username, ...(posts || []).map((p) => p.author)].filter(Boolean))), [posts, username]));

  const like = async (p: BlogPost) => {
    if (!user) return router.push("/login");
    const was = liked.has(p.id);
    const flip = (on: boolean, n: number) => {
      setLiked((s) => {
        const x = new Set(s);
        if (on) x.add(p.id);
        else x.delete(p.id);
        return x;
      });
      setPosts((list) => (list || []).map((q) => (q.id === p.id ? { ...q, likes: n } : q)));
    };
    flip(!was, Math.max(0, p.likes + (was ? -1 : 1))); // at once; the server settles it
    try {
      const r = await blogCall("like", { postId: p.id });
      flip(r.liked === true, Number(r.likes ?? p.likes));
    } catch (e) {
      flip(was, p.likes);
      setToast(blogError(e));
    }
  };
  const share = async (p: BlogPost) => {
    const url = `${window.location.origin}/feed/${p.id}`;
    try {
      if (navigator.share) await navigator.share({ title: p.title, text: `📰 ${p.title} — by ${p.author} on miGlife`, url });
      else {
        await navigator.clipboard.writeText(url);
        setToast("Link copied ✓");
      }
    } catch {
      // closed the share sheet
    }
  };

  const meColor = colorOf(username) || "#F59F00";
  return (
    <>
      <section className="mx-auto max-w-2xl pb-28">
        {embedded || !author ? (
          <div className="flex items-center gap-2.5 px-4 pb-1 pt-3">
            {user ? <Avatar name={username} color={meColor} size={32} /> : <span className="text-2xl">📰</span>}
            <h1 className="text-[22px] font-black text-[#0F1D3A]">Feed</h1>
          </div>
        ) : (
          <div className="px-3 sm:px-6">
            <PageTitle
              title={`${author}'s Feed`}
              subtitle="Every post by this writer"
              icon="📰"
              backHref={`/profile/${encodeURIComponent(author)}`}
            />
          </div>
        )}

        {!author && (
          <div className="flex border-b border-[#0F1D3A]/10 px-1.5 pt-1">
            {TABS.map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => (k === tab ? setReload((n) => n + 1) : setTab(k))}
                className={`relative flex-1 pb-2.5 pt-2 text-[14.5px] font-bold transition ${tab === k ? "text-[#0F1D3A]" : "text-[#6B7FA6]"}`}
              >
                {label}
                {tab === k && <span className="absolute inset-x-[30%] bottom-0 h-[3.5px] rounded-full bg-[#2563EB]" />}
              </button>
            ))}
          </div>
        )}

        {/* ✍️ "What's happening?" — opens the writer */}
        {!author && (
          <Link
            href={user ? "/feed/write" : "/login"}
            className="flex items-center gap-3 border-b border-[#0F1D3A]/[0.08] bg-white/75 px-4 py-3"
          >
            {user ? <Avatar name={username} color={meColor} size={40} /> : <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#E6F0FC] text-lg">✍️</span>}
            <span className="min-w-0 flex-1 truncate text-[15px] text-[#5A6F93]">{user ? `কী হচ্ছে, ${username}?` : "Log in to write a post"}</span>
            <span className="rounded-full bg-[#2563EB] px-4 py-1.5 text-[13px] font-extrabold text-white">Post</span>
          </Link>
        )}

        {error && <p className="mx-3 mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        {posts === null ? (
          <div>
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex animate-pulse gap-2.5 border-b border-[#0F1D3A]/[0.08] px-4 py-3">
                <div className="h-10 w-10 shrink-0 rounded-full bg-white/70" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-1/3 rounded bg-white/70" />
                  <div className="h-4 w-2/3 rounded bg-white/70" />
                  <div className="h-24 rounded-2xl bg-white/60" />
                </div>
              </div>
            ))}
          </div>
        ) : posts.length === 0 ? (
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
            {user && <p className="mt-1 text-sm">Be the first — tap Post.</p>}
          </div>
        ) : (
          <div>
            {posts.map((p) => (
              <ThreadPost key={p.id} p={p} color={colorOf(p.author)} liked={liked.has(p.id)} onLike={() => like(p)} onShare={() => share(p)} />
            ))}
          </div>
        )}
      </section>

      <Link
        href={user ? "/feed/write" : "/login"}
        aria-label="Write a post"
        className="fixed bottom-6 right-5 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-b from-[#3B82F6] to-[#1D4ED8] text-[24px] shadow-[0_12px_24px_-8px_rgba(29,78,216,.8)] transition active:scale-95"
      >
        ✍️
      </Link>
      {toast && (
        <div className="fixed bottom-24 left-1/2 z-40 -translate-x-1/2 rounded-full bg-[#0F1D3A]/90 px-4 py-2 text-[13px] font-semibold text-white">{toast}</div>
      )}
    </>
  );
}

function Avatar({ name, color, size }: { name: string; color: string; size: number }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full font-extrabold text-white shadow-[0_2px_6px_-2px_rgba(0,0,0,.25)]"
      style={{ width: size, height: size, fontSize: size * 0.42, background: `linear-gradient(135deg, ${color}CC, ${color})` }}
    >
      {name.slice(0, 1).toUpperCase() || "?"}
    </span>
  );
}

/** One post, Thread style: photo-circle on the left; name · time · category,
 *  title, text, the photo, then 💬 ❤️ 👁 ↗ (❤️ likes right here). */
function ThreadPost({ p, color, liked, onLike, onShare }: { p: BlogPost; color: string; liked: boolean; onLike: () => void; onShare: () => void }) {
  const router = useRouter();
  const pic = p.cover || p.firstImage;
  const c = color || "#2563EB";
  const open = () => router.push(`/feed/${p.id}`);
  return (
    <article
      onClick={open}
      className="flex cursor-pointer gap-2.5 border-b border-[#0F1D3A]/[0.08] bg-white/55 px-4 py-3 transition hover:bg-white/70 active:bg-white/80"
    >
      <Link href={`/profile/${encodeURIComponent(p.author)}`} onClick={(e) => e.stopPropagation()} className="h-fit">
        <Avatar name={p.author} color={c} size={40} />
      </Link>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1 text-[13.5px]">
          <span data-notranslate className="truncate font-extrabold" style={{ color: c }}>
            {p.author}
          </span>
          <span className="shrink-0 text-[#7D8CAB]">
            · {blogAgo(p.createdMs)} · {blogCategoryLabel(p.category)}
          </span>
        </div>
        <h2 className="mt-0.5 text-[15.5px] font-bold leading-snug text-[#0F1D3A]">{p.title}</h2>
        {p.excerpt && <p className="mt-0.5 line-clamp-3 text-[14px] leading-relaxed text-[#33476B]">{p.excerpt}</p>}
        {pic && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={pic} alt="" loading="lazy" className="mt-2 max-h-[300px] w-full rounded-2xl border border-black/[0.06] object-cover" />
        )}
        <div className="mt-1.5 flex items-center justify-between pr-2 text-[13px] font-semibold text-[#6B7FA6]" onClick={(e) => e.stopPropagation()}>
          <button type="button" onClick={open} className="flex items-center gap-1 py-1.5">
            💬 {blogShort(p.comments)}
          </button>
          <button type="button" onClick={onLike} className={`flex items-center gap-1 py-1.5 transition active:scale-125 ${liked ? "text-[#E2366F]" : ""}`}>
            {liked ? "❤️" : "🤍"} {blogShort(p.likes)}
          </button>
          <span className="flex items-center gap-1 py-1.5">👁 {blogShort(p.views)}</span>
          <button type="button" onClick={onShare} className="py-1.5 pl-2" aria-label="Share">
            ↗
          </button>
        </div>
      </div>
    </article>
  );
}
