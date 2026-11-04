"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, doc, getDoc, getDocs, limit, orderBy, query, where } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useCurrentUser } from "../../lib/useCurrentUser";
import { useFriends } from "../../lib/privateChat";
import { cachedPhotoOf, useSenderColors } from "../../lib/senderColors";
import { PageTitle } from "./LightCards";
import { TranslateChip, useFeedTranslation } from "./FeedTranslate";
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
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [ind, setInd] = useState<{ left: number; width: number } | null>(null);
  useLayoutEffect(() => {
    const el = tabRefs.current[tab];
    if (el) setInd({ left: el.offsetLeft, width: el.offsetWidth });
  }, [tab]);
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

  const meColor = colorOf(username) || "#2563EB";
  return (
    <div className="feed-lav relative -mb-8 min-h-[calc(100dvh-60px)] overflow-hidden">
      <span aria-hidden className="pointer-events-none absolute -right-44 -top-28 h-[420px] w-[420px] rounded-full bg-[radial-gradient(rgba(167,139,250,.40),transparent_65%)]" />
      <span aria-hidden className="pointer-events-none fixed -bottom-36 -left-40 h-[380px] w-[380px] rounded-full bg-[radial-gradient(rgba(96,165,250,.40),transparent_65%)]" />
      <section className="relative mx-auto max-w-2xl pb-10">
        {author ? (
          <div className="px-3 sm:px-6">
            <PageTitle title={`${author}'s Feed`} subtitle="Every post by this writer" icon="📰" backHref={`/profile/${encodeURIComponent(author)}`} />
          </div>
        ) : (
          <div className="flex items-center justify-between px-4 pb-1 pt-3.5">
            <h1 className="text-[26px] font-black tracking-tight text-[#1E1B4B]">Feed</h1>
            {user && (
              <Link href={`/profile/${encodeURIComponent(username)}`} aria-label="My profile">
                <Avatar name={username} color={meColor} size={34} ring />
              </Link>
            )}
          </div>
        )}

        {!author && (
          <div className="relative mx-3.5 mb-1 mt-2 flex rounded-2xl border border-[#6366F1]/15 bg-white/55 p-1">
            {/* 🫧 one gradient pill that slides under the chosen tab */}
            <span
              aria-hidden
              className="pointer-events-none absolute bottom-1 top-1 rounded-xl bg-gradient-to-br from-[#38BDF8] via-[#6366F1] to-[#A855F7] shadow-[0_6px_14px_-6px_rgba(99,102,241,.7)] transition-[left,width] duration-300 ease-out"
              style={ind ? { left: ind.left, width: ind.width } : { opacity: 0 }}
            />
            {TABS.map(([k, label]) => (
              <button
                key={k}
                ref={(el) => {
                  tabRefs.current[k] = el;
                }}
                type="button"
                onClick={() => (k === tab ? setReload((n) => n + 1) : setTab(k))}
                className={`relative z-10 flex-1 rounded-xl py-2 text-[13px] font-extrabold transition-colors ${
                  tab === k ? "text-white" : "text-[#6B6F9A]"
                }`}
              >
                {k === "popular" && tab === k ? "🔥 " : ""}
                {label}
              </button>
            ))}
          </div>
        )}

        {/* ✍️ "What's on your mind?" — opens the writer */}
        {!author && (
          <Link
            href={user ? "/feed/write" : "/login"}
            className="group mx-3.5 my-2.5 flex items-center gap-2.5 rounded-[20px] border border-[#6366F1]/15 bg-white/75 py-2.5 pl-3 pr-2.5 shadow-[inset_0_2px_0_#fff,0_3px_0_rgba(99,102,241,.24),0_6px_0_rgba(99,102,241,.15),0_10px_16px_-8px_rgba(99,102,241,.35)] transition duration-200 hover:-translate-y-px hover:shadow-[inset_0_2px_0_#fff,0_3px_0_rgba(99,102,241,.3),0_7px_0_rgba(99,102,241,.2),0_12px_20px_-8px_rgba(99,102,241,.45)] active:translate-y-[2px] active:scale-[.99]"
          >
            {user ? <Avatar name={username} color={meColor} size={40} ring /> : <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-lg">✍️</span>}
            <span className="min-w-0 flex-1 truncate text-[14.5px] text-[#7A7FA6]">{user ? `What's on your mind, ${username}?` : "Log in to write a post"}</span>
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#F1EFFF] text-[17px] transition group-hover:scale-110">🖼</span>
          </Link>
        )}

        {error && <p className="mx-3.5 mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        {posts === null ? (
          <div className="space-y-3 px-3.5">
            {[0, 1].map((i) => (
              <div key={i} className="feed-shimmer h-[300px] rounded-[22px]" />
            ))}
          </div>
        ) : posts.length === 0 ? (
          <div className="mt-10 text-center text-[#6B6F9A]">
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
            {user && !author && <p className="mt-1 text-sm">Be the first — tap “What's on your mind?”.</p>}
          </div>
        ) : (
          <div className="space-y-3 px-3.5">
            {posts.map((p) => (
              <FeedCard key={p.id} p={p} color={colorOf(p.author)} liked={liked.has(p.id)} onLike={() => like(p)} onShare={() => share(p)} />
            ))}
          </div>
        )}
      </section>

      {toast && (
        <div className="fixed bottom-24 left-1/2 z-40 -translate-x-1/2 rounded-full bg-[#1E1B4B]/90 px-4 py-2 text-[13px] font-semibold text-white">{toast}</div>
      )}
    </div>
  );
}

function Avatar({ name, color, size, ring = false }: { name: string; color: string; size: number; ring?: boolean }) {
  // 📷 the person's profile photo when they have one, else their first letter
  const photo = cachedPhotoOf(name);
  const face = photo ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={photo}
      alt=""
      className="shrink-0 rounded-full bg-white object-cover"
      style={{ width: size, height: size, border: ring ? "2.5px solid #EEF0FF" : undefined }}
    />
  ) : (
    <span
      className="flex shrink-0 items-center justify-center rounded-full font-black text-white"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.42,
        background: `linear-gradient(135deg, ${color}B3, ${color})`,
        border: ring ? "2.5px solid #EEF0FF" : undefined,
      }}
    >
      {name.slice(0, 1).toUpperCase() || "?"}
    </span>
  );
  if (!ring) return face;
  return <span className="flex shrink-0 rounded-full bg-[conic-gradient(#38BDF8,#6366F1,#A855F7,#EC4899,#38BDF8)] p-[2.5px]">{face}</span>;
}

/** One post as a soft white card: photo-ring, name · time · 👁, category chip,
 *  title, text, the photo, then ❤️ · 💬 · ↗ Share buttons (❤️ likes right here). */
function FeedCard({ p, color, liked, onLike, onShare }: { p: BlogPost; color: string; liked: boolean; onLike: () => void; onShare: () => void }) {
  const router = useRouter();
  // ❤️ each new like: the heart pops and a few hearts float up
  const [burst, setBurst] = useState(0);
  const likeTap = () => {
    if (!liked) setBurst((n) => n + 1);
    onLike();
  };
  const pic = p.cover || p.firstImage;
  const c = color || "#2563EB";
  const tr = useFeedTranslation(p.id);
  const open = () => router.push(`/feed/${p.id}`);
  return (
    <article
      onClick={open}
      className="cursor-pointer rounded-[22px] border border-[#6366F1]/12 bg-white/85 p-3 shadow-[inset_0_2px_0_#fff,0_2px_0_rgba(99,102,241,.24),0_4px_0_rgba(99,102,241,.14)] transition active:scale-[.995]"
    >
      <div className="flex items-center gap-2.5">
        <Link href={`/profile/${encodeURIComponent(p.author)}`} onClick={(e) => e.stopPropagation()}>
          <Avatar name={p.author} color={c} size={40} ring />
        </Link>
        <div className="min-w-0">
          <div data-notranslate className="truncate text-[14px] font-extrabold" style={{ color: c }}>
            {p.author}
          </div>
          <div className="text-[11.5px] text-[#7A7FA6]">
            {blogAgo(p.createdMs)} · 👁 {blogShort(p.views)}
          </div>
        </div>
        <span className="ml-auto shrink-0 rounded-full bg-[#EEF4FF] px-2.5 py-1 text-[11px] font-extrabold text-[#1D4ED8]">{blogCategoryLabel(p.category)}</span>
      </div>
      <div className="mx-0.5 mt-2.5 flex items-start gap-2">
        <h2 className="min-w-0 flex-1 text-[16.5px] font-black leading-snug text-[#1E1B4B]">{tr?.title || p.title}</h2>
        <TranslateChip postId={p.id} title={p.title} text={p.excerpt} />
      </div>
      {(tr?.text || p.excerpt) && <p className="mx-0.5 mt-0.5 line-clamp-3 text-[13.5px] leading-relaxed text-[#4B4F7D]">{tr?.text || p.excerpt}</p>}
      {pic && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={pic} alt="" loading="lazy" className="mt-2.5 max-h-[320px] w-full rounded-2xl object-cover" />
      )}
      <div className="mt-2.5 flex gap-2" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          onClick={likeTap}
          className={`relative flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl text-[13px] font-extrabold transition active:scale-95 ${
            liked ? "bg-[#FFE8F1] text-[#DB2777]" : "bg-[#F3F2FF] text-[#4F46E5]"
          }`}
        >
          {burst > 0 &&
            ["❤️", "💖", "✨", "💕"].map((h, i) => (
              <span
                key={`${burst}-${i}`}
                aria-hidden
                className="feed-burst"
                style={{ ["--x" as string]: `${(i - 1.5) * 26}px` }}
              >
                {h}
              </span>
            ))}
          <span key={burst} className={`flex items-center gap-1.5 ${burst > 0 ? "feed-pop" : ""}`}>
            {liked ? "❤️" : "🤍"} {blogShort(p.likes)}
          </span>
        </button>
        <button type="button" onClick={open} className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#F3F2FF] text-[13px] font-extrabold text-[#4F46E5]">
          💬 {blogShort(p.comments)}
        </button>
        <button type="button" onClick={onShare} className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#F3F2FF] text-[13px] font-extrabold text-[#4F46E5]">
          ↗ Share
        </button>
      </div>
    </article>
  );
}
