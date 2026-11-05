"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, doc, getDoc, getDocs, limit, orderBy, query, where } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useCurrentUser } from "../../lib/useCurrentUser";
import { useFriends } from "../../lib/privateChat";
import { cachedPhotoOf, useSenderColors } from "../../lib/senderColors";
import { uploadChatImage } from "../../lib/imageUpload";
import { PageTitle } from "./LightCards";
import { TranslateChip, useFeedTranslation } from "./FeedTranslate";
import {
  blogAgoBn,
  blogCall,
  blogError,
  BLOG_CATEGORIES,
  blogCategoryLabel,
  blogShort,
  toBnDigits,
  toBlogPost,
  type BlogPost,
} from "../../lib/feed";

// 📰 Feed list (the "Thread" look, like Twitter/X): Popular · New · Friends · Mine (or one writer's
// posts with ?author=name, from their profile). Anyone can read; writing needs
// a login. Read once per tab (no live listener), pull the tab again to refresh.

type Tab = "popular" | "new" | "friends" | "mine";

// 🎨 each category's colour: the card's corner glows in it
const CAT_TINT: Record<string, string> = {
  life: "#8B5CFF", games: "#10B981", music: "#EC4899", fun: "#F59E0B",
  news: "#3B82F6", love: "#E11D48", tips: "#14B8A6", other: "#6366F1",
};

// #hashtag (purple) and @mention (a profile link) inside a post's text
const TOKEN_SPLIT = /(#[^\s#@.,!?;:()"'“”।]+|@[^\s#@.,!?;:()"'“”।]+)/;
function RichText({ text, className }: { text: string; className?: string }) {
  return (
    <span className={className}>
      {text.split(TOKEN_SPLIT).map((part, i) => {
        if (part.length > 1 && part[0] === "#") return <span key={i} className="font-extrabold text-[#8B5CFF]">{part}</span>;
        if (part.length > 1 && part[0] === "@")
          return (
            <Link key={i} href={`/profile/${encodeURIComponent(part.slice(1))}`} onClick={(e) => e.stopPropagation()} className="font-extrabold text-[#2563EB] hover:underline">
              {part}
            </Link>
          );
        return <span key={i}>{part}</span>;
      })}
    </span>
  );
}
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
  // 📷 show all posts, or only the ones with a photo
  const [media, setMedia] = useState<"all" | "photos">("all");
  const router = useRouter();
  // ❤️ which of these posts I liked (read once per list), and a short message
  const [liked, setLiked] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState("");
  const [posts, setPosts] = useState<BlogPost[] | null>(null);
  // ✔ authors whose users document says verified (read-only; miGlife sets it)
  const [verifiedAuthors, setVerifiedAuthors] = useState<Set<string>>(new Set());
  useEffect(() => {
    const names = [...new Set((posts || []).map((p) => p.author))];
    if (!names.length) return;
    let alive = true;
    (async () => {
      const found = new Set<string>();
      for (let i = 0; i < names.length; i += 10) {
        try {
          const snap = await getDocs(query(collection(db, "users"), where("username", "in", names.slice(i, i + 10))));
          snap.docs.forEach((d) => {
            if (d.data().verified === true) found.add(String(d.data().username || ""));
          });
        } catch {
          // quiet: the badge is a nicety
        }
      }
      if (alive) setVerifiedAuthors(found);
    })();
    return () => {
      alive = false;
    };
  }, [posts]);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [ind, setInd] = useState<{ left: number; width: number } | null>(null);
  useLayoutEffect(() => {
    const el = tabRefs.current[tab];
    if (el) setInd({ left: el.offsetLeft, width: el.offsetWidth });
  }, [tab]);
  const friendsKey = friends.join(",");

  // 🔔 "৩টি নতুন post": every 90 s, while the page is open on Popular / New
  // ✍️ the composer opens right here in the feed (Facebook style), no new page
  const [composing, setComposing] = useState(false);
  const [ctext, setCtext] = useState("");
  const [cphotos, setCphotos] = useState<string[]>([]);
  const [ccat, setCcat] = useState("life");
  const [cbusy, setCbusy] = useState(false);
  const [cerr, setCerr] = useState("");
  const cfileRef = useRef<HTMLInputElement>(null);
  const cupload = async (files: FileList | null) => {
    if (!files?.length || !user) return;
    const room = 10 - cphotos.length;
    if (room <= 0) return setCerr("A post can have up to 10 photos.");
    setCerr("");
    setCbusy(true);
    try {
      for (const f of Array.from(files).slice(0, room)) {
        const url = await uploadChatImage(`room_images/blog_${user.uid}`, f);
        setCphotos((p) => [...p, url].slice(0, 10));
      }
    } catch (e) {
      setCerr(blogError(e));
    } finally {
      setCbusy(false);
    }
  };
  const publishInline = async () => {
    setCerr("");
    if (!ctext.trim() && cphotos.length === 0) return setCerr("Write something or add a photo.");
    // no title box: the title is the first line of the text
    const first = ctext.trim().split("\n")[0].slice(0, 60);
    const title = first.length >= 3 ? first : first ? `${first}...` : "📷 Photo";
    const [cover = "", ...rest] = cphotos;
    const body = [ctext.trim(), ...rest.map((u) => `![](${u})`)].filter(Boolean).join("\n\n") || "📷";
    setCbusy(true);
    try {
      await blogCall("create", { title, body, cover, category: ccat });
      setCtext("");
      setCphotos([]);
      setComposing(false);
      setToast("Posted ✓");
      setReload((n) => n + 1);
      window.setTimeout(() => setToast(""), 2200);
    } catch (e) {
      setCerr(blogError(e));
    } finally {
      setCbusy(false);
    }
  };

  const [fresh, setFresh] = useState(0);
  const newestKnown = useMemo(() => (posts && posts.length ? Math.max(...posts.map((p) => p.createdMs)) : 0), [posts]);
  useEffect(() => {
    if (author || !newestKnown || (tab !== "popular" && tab !== "new")) return;
    const col = collection(db, "blog_posts");
    const tick = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const snap = await getDocs(query(col, where("createdMs", ">", newestKnown), limit(20)));
        setFresh(snap.size);
      } catch {
        // quiet: the banner is only a nicety
      }
    };
    const id = window.setInterval(tick, 90_000);
    return () => window.clearInterval(id);
  }, [author, newestKnown, tab]);

  useEffect(() => {
    let alive = true;
    setPosts(null);
    setError("");
    setFresh(0);
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

  // 😀 my reaction per post (👍 when I liked it and the type is not known yet)
  const [reactOf, setReactOf] = useState<Record<string, string>>({});
  const REACTION_LIST = ["👍", "❤️", "😂", "😮", "😢", "😡"];
  // pick one of the six (tap the same one again to take it back)
  const react = async (p: BlogPost, emoji: string) => {
    if (!user) return router.push("/login");
    const before = reactOf[p.id] ?? (liked.has(p.id) ? "👍" : null);
    const next = before === emoji ? null : emoji;
    setReactOf((m) => ({ ...m, [p.id]: next ?? "" }));
    setLiked((s) => {
      const x = new Set(s);
      if (next) x.add(p.id);
      else x.delete(p.id);
      return x;
    });
    try {
      const r = await blogCall("react", { postId: p.id, reaction: next ?? "" });
      setReactOf((m) => ({ ...m, [p.id]: String(r.reaction || "") }));
      setPosts((list) => (list || []).map((q) => (q.id === p.id ? { ...q, likes: Number(r.likes ?? q.likes) } : q)));
    } catch (e) {
      setReactOf((m) => ({ ...m, [p.id]: before ?? "" }));
      setToast(blogError(e));
    }
  };
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

        {!author && (
          <div className="no-scrollbar mx-3.5 mb-1 flex gap-2 overflow-x-auto">
            {([["all", "All"], ["photos", "📷 Photos"]] as const).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setMedia(k)}
                className={`shrink-0 rounded-full px-3.5 py-1.5 text-[12.5px] font-extrabold transition ${
                  media === k ? "bg-[#1D4ED8] text-white" : "bg-white text-[#4F46E5] shadow-[0_1px_0_#C9D8EA]"
                }`}
              >
                {label}
              </button>
            ))}
            {/* 🎬 video posts need the backend (storage + rules) — coming soon */}
            <span className="shrink-0 rounded-full bg-white/60 px-3.5 py-1.5 text-[12.5px] font-bold text-[#9AA0C4]">🎬 Videos · soon</span>
          </div>
        )}

        {/* ✍️ "What's on your mind?" — opens the writer */}
        {!author && user && composing && (
          <div className="mx-3.5 my-2.5 rounded-[22px] border border-[#6366F1]/15 bg-white/92 p-3 shadow-[inset_0_2px_0_#fff,0_3px_0_#C9D8EA,0_6px_0_#B7C9E0]">
            <div className="flex items-center gap-2.5">
              <Avatar name={username} color={meColor} size={38} ring />
              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-extrabold text-[#1E1B4B]">{username}</div>
                <div className="text-[11px] text-[#7A7FA6]">Posting to everyone</div>
              </div>
              <button type="button" onClick={() => setComposing(false)} aria-label="Close" className="flex h-8 w-8 items-center justify-center rounded-full bg-[#EEF2F8] text-[14px] text-[#4B4F7D]">
                ✕
              </button>
            </div>
            <input ref={cfileRef} type="file" accept="image/*" multiple hidden onChange={(e) => (cupload(e.target.files), (e.target.value = ""))} />
            <textarea
              autoFocus
              value={ctext}
              onChange={(e) => setCtext(e.target.value)}
              placeholder={`What's on your mind, ${username}?`}
              rows={3}
              className="mt-1 w-full resize-none bg-transparent px-1 py-1 text-[15px] text-[#1E1B4B] outline-none placeholder:text-[#9AA3BD]"
            />
            {cphotos.length > 0 && (
              <div className="mt-2 flex gap-1.5 overflow-x-auto">
                {cphotos.map((u) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={u} src={u} alt="" className="h-16 w-16 shrink-0 rounded-xl object-cover" />
                ))}
              </div>
            )}
            <div className="mt-1 flex gap-1.5 overflow-x-auto">
              {BLOG_CATEGORIES.map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setCcat(k)}
                  className={`shrink-0 rounded-full px-2.5 py-1 text-[12px] font-bold ${
                    ccat === k ? "bg-gradient-to-r from-[#38BDF8] to-[#8B5CFF] text-white" : "bg-[#EEF4FF] text-[#1D4ED8]"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {cerr && <p className="mt-2 rounded-lg bg-red-50 px-2.5 py-1.5 text-[12.5px] text-red-700">{cerr}</p>}
            <div className="mt-2.5 flex items-center gap-2 border-t border-[#EEF2F8] pt-2.5">
              <button
                type="button"
                disabled={cbusy || cphotos.length >= 10}
                onClick={() => cfileRef.current?.click()}
                className="flex h-9 items-center gap-1.5 rounded-full bg-[#F1EFFF] px-3 text-[12.5px] font-bold text-[#4F46E5] disabled:opacity-50"
              >
                🖼 Add photo
              </button>
              <button
                type="button"
                onClick={publishInline}
                disabled={cbusy || (!ctext.trim() && cphotos.length === 0)}
                className={`ml-auto rounded-full px-5 py-2 text-[13px] font-extrabold transition ${
                  cbusy || (!ctext.trim() && cphotos.length === 0)
                    ? "bg-[#E5EAF5] text-[#8A97A8]"
                    : "bg-gradient-to-r from-[#2F6FD6] to-[#8B5CFF] text-white shadow-[0_6px_14px_-6px_rgba(139,92,255,.7)]"
                }`}
              >
                {cbusy ? "Posting…" : "Post"}
              </button>
            </div>
          </div>
        )}
        {!author && (!user || !composing) && (
          user ? (
            <button
              type="button"
              onClick={() => setComposing(true)}
              className="group mx-3.5 my-2.5 flex w-[calc(100%-1.75rem)] items-center gap-2.5 rounded-[20px] border border-[#6366F1]/15 bg-white/75 py-2.5 pl-3 pr-2.5 text-left shadow-[inset_0_2px_0_#fff,0_3px_0_rgba(99,102,241,.24),0_6px_0_rgba(99,102,241,.15),0_10px_16px_-8px_rgba(99,102,241,.35)] transition duration-200 hover:-translate-y-px active:translate-y-[2px] active:scale-[.99]"
            >
              <Avatar name={username} color={meColor} size={40} ring />
              <span className="min-w-0 flex-1 truncate text-[14.5px] text-[#7A7FA6]">{`What's on your mind, ${username}?`}</span>
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#F1EFFF] text-[17px] transition group-hover:scale-110">🖼</span>
            </button>
          ) : (
            <Link href="/login" className="mx-3.5 my-2.5 flex items-center gap-2.5 rounded-[20px] border border-[#6366F1]/15 bg-white/75 py-2.5 pl-3 pr-2.5">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-lg">✍️</span>
              <span className="min-w-0 flex-1 truncate text-[14.5px] text-[#7A7FA6]">Log in to write a post</span>
            </Link>
          )
        )}

        {/* 🧱 My wall (Mine tab): cover, my picture, my numbers, and the two buttons */}
        {!author && tab === "mine" && user && posts && (
          <section className="mx-3.5 mb-2 mt-2 overflow-hidden rounded-[22px] bg-white/95 shadow-[inset_0_2px_0_#fff,0_3px_0_#C9D8EA,0_6px_0_#B7C9E0]">
            <div className="h-[84px] bg-gradient-to-br from-[#38BDF8] via-[#6366F1] to-[#A855F7]" />
            <div className="px-4 pb-4">
              <div className="-mt-9 inline-block rounded-full bg-gradient-to-br from-[#2F6FD6] to-[#8B5CFF] p-[3px]">
                <div className="rounded-full bg-white p-0.5">
                  <Avatar name={username} color={meColor} size={68} />
                </div>
              </div>
              <div className="mt-1.5 text-[18px] font-black text-[#1E1B4B]">{username}</div>
              <div className="mt-2 grid grid-cols-3 rounded-2xl bg-[#F4F6FD] py-2 text-center">
                <div>
                  <b className="block text-[15px] text-[#1E1B4B]">{toBnDigits(posts.length)}</b>
                  <small className="text-[10.5px] text-[#7A7FA6]">Posts</small>
                </div>
                <div>
                  <b className="block text-[15px] text-[#1E1B4B]">{blogShort(posts.reduce((n, p) => n + p.likes, 0))}</b>
                  <small className="text-[10.5px] text-[#7A7FA6]">❤️ Likes</small>
                </div>
                <div>
                  <b className="block text-[15px] text-[#1E1B4B]">{blogShort(posts.reduce((n, p) => n + p.views, 0))}</b>
                  <small className="text-[10.5px] text-[#7A7FA6]">👁 Views</small>
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => setComposing(true)}
                  className="flex-1 rounded-xl bg-gradient-to-r from-[#2F6FD6] to-[#8B5CFF] py-2 text-[13px] font-extrabold text-white shadow-[0_6px_14px_-6px_rgba(139,92,255,.7)]"
                >
                  ✍️ New post
                </button>
                <Link href={`/profile/${encodeURIComponent(username)}`} className="flex-1 rounded-xl bg-[#F1EFFF] py-2 text-center text-[13px] font-extrabold text-[#4F46E5]">
                  ✏️ Profile
                </Link>
              </div>
            </div>
          </section>
        )}
        {error && <p className="mx-3.5 mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        {fresh > 0 && (
          <button
            type="button"
            onClick={() => {
              setFresh(0);
              setReload((n) => n + 1);
            }}
            className="feed-pop mx-3.5 mt-2 flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#38BDF8] via-[#6366F1] to-[#A855F7] py-2 text-[13px] font-extrabold text-white shadow-[0_6px_14px_-6px_rgba(99,102,241,.7)]"
          >
            ↑ {fresh >= 20 ? "20+" : fresh} new post{fresh === 1 ? "" : "s"} — tap to view
          </button>
        )}

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
            {user && !author && (tab === "popular" || tab === "new") && (
              <Link href="/feed/write" className="mt-4 inline-block rounded-full bg-gradient-to-r from-[#38BDF8] to-[#A855F7] px-5 py-2 text-[13px] font-extrabold text-white shadow-[0_6px_14px_-6px_rgba(99,102,241,.7)]">
                ✍️ Write the first post
              </Link>
            )}
          </div>
        ) : (
          <div className="space-y-3 px-3.5">
            {(media === "photos" ? posts.filter((p) => !!(p.cover || p.firstImage)) : posts).map((p) => (
              <FeedCard key={p.id} p={p} verified={verifiedAuthors.has(p.author)} color={colorOf(p.author)} liked={liked.has(p.id)} reaction={reactOf[p.id] || (liked.has(p.id) ? "👍" : "")} onReact={(e) => react(p, e)} onLike={() => like(p)} onShare={() => share(p)} />
            ))}
            {media === "photos" && !posts.some((p) => p.cover || p.firstImage) && (
              <p className="py-6 text-center text-sm text-[#6B6F9A]">No photo posts in this tab yet.</p>
            )}
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
function FeedCard({ p, color, liked, verified, reaction, onReact, onLike, onShare }: { p: BlogPost; color: string; liked: boolean; verified: boolean; reaction: string; onReact: (emoji: string) => void; onLike: () => void; onShare: () => void }) {
  const [pick, setPick] = useState(false);
  const holdRef = useRef<number | null>(null);
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
  const tint = CAT_TINT[p.category] || "#6366F1";
  const [viewing, setViewing] = useState(false);
  return (
    <article
      onClick={open}
      className="cursor-pointer rounded-[20px] border border-[#DDE8F7] bg-white p-3.5 shadow-[0_2px_8px_rgba(16,63,145,.07)] transition active:scale-[.995]"
    >
      <div className="flex items-center gap-2.5">
        <Link href={`/profile/${encodeURIComponent(p.author)}`} onClick={(e) => e.stopPropagation()} className="shrink-0 rounded-full border-2 border-[#D9A83E] p-[1px]">
          <Avatar name={p.author} color={c} size={40} />
        </Link>
        <div className="min-w-0">
          <div className="flex items-center gap-1">
            <div data-notranslate className="truncate text-[14px] font-extrabold" style={{ color: c }}>
              {p.author}
            </div>
            {verified && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src="/icons/miglife-verified.svg" alt="Verified" title="Verified" className="h-4 w-4 shrink-0" />
            )}
          </div>
          <div className="text-[11.5px] text-[#7A7FA6]">
            {blogAgoBn(p.createdMs)} · 👁 {blogShort(p.views)}
          </div>
        </div>
        <span className="ml-auto shrink-0 rounded-full bg-[#EEF4FF] px-2.5 py-1 text-[11px] font-extrabold text-[#1D4ED8]">{blogCategoryLabel(p.category)}</span>
      </div>
      <div className="mx-0.5 mt-2.5 flex items-start gap-2">
        <h2 className="min-w-0 flex-1 text-[16.5px] font-black leading-snug text-[#1E1B4B]">
          <RichText text={tr?.title || p.title} />
        </h2>
        <TranslateChip postId={p.id} title={p.title} text={p.excerpt} />
      </div>
      {(tr?.text || p.excerpt) && (
        <p className="mx-0.5 mt-0.5 line-clamp-3 text-[13.5px] leading-relaxed text-[#4B4F7D]">
          <RichText text={tr?.text || p.excerpt} />
        </p>
      )}
      {pic && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={pic}
          alt=""
          loading="lazy"
          onClick={(e) => {
            e.stopPropagation();
            setViewing(true);
          }}
          className="mt-2.5 max-h-[320px] w-full cursor-zoom-in rounded-2xl object-cover"
        />
      )}
      {viewing && pic && (
        // 🔍 full-screen picture: tap anywhere to close
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-3"
          onClick={(e) => {
            e.stopPropagation();
            setViewing(false);
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={pic} alt="" className="max-h-full max-w-full rounded-xl object-contain" />
          <span className="absolute right-4 top-4 rounded-full bg-white/15 px-3 py-1 text-sm font-bold text-white">✕</span>
        </div>
      )}
      <div className="mt-2.5 flex items-center text-[11.5px] text-[#718096]">
        <span className="font-bold text-[#1458C8]">👍 {blogShort(p.likes)}</span>
        <span className="ml-auto">{blogShort(p.comments)} Comments · {blogShort(p.views)} Views</span>
      </div>
      <div className="mt-2 border-t border-[#DDE8F7] pt-2.5 flex gap-2" onClick={(e) => e.stopPropagation()}>
        <div className="relative flex-1">
        {pick && (
          // 😀 the six reactions: tap one (tap the same again to take it back)
          <div className="absolute bottom-11 left-0 z-20 flex gap-1 rounded-full bg-white px-2 py-1 shadow-[0_8px_20px_-6px_rgba(16,63,145,.35)] ring-1 ring-[#DDE8F7]">
            {["👍", "❤️", "😂", "😮", "😢", "😡"].map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => {
                  setPick(false);
                  onReact(e);
                }}
                className={`flex h-8 w-8 items-center justify-center rounded-full text-[20px] transition hover:-translate-y-0.5 hover:scale-125 ${reaction === e ? "bg-[#E6F0FF]" : ""}`}
              >
                {e}
              </button>
            ))}
          </div>
        )}
        <button
          type="button"
          onClick={likeTap}
          onPointerDown={() => {
            // a long press (½ second) opens the reaction picker
            holdRef.current = window.setTimeout(() => setPick(true), 500);
          }}
          onPointerUp={() => {
            if (holdRef.current) window.clearTimeout(holdRef.current);
          }}
          onPointerLeave={() => {
            if (holdRef.current) window.clearTimeout(holdRef.current);
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            setPick(true);
          }}
          className={`relative flex h-9 w-full items-center justify-center gap-1.5 rounded-xl text-[13px] font-extrabold transition active:scale-95 ${
            liked ? "bg-[#E6F0FF] text-[#1D4ED8]" : "bg-[#F3F2FF] text-[#4F46E5]"
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
            {/* 👍 the miGlife thumbs icon, or the reaction I picked */}
            {liked && reaction && reaction !== "👍" ? (
              <span className="text-[17px] leading-none">{reaction}</span>
            ) : (
              <img src="/icons/miglife-like.svg" alt="" className="h-[18px] w-[18px]" />
            )}{" "}
            {blogShort(p.likes)}
          </span>
        </button>
        </div>
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
