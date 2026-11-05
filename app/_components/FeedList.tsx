"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, doc, getDoc, getDocs, limit, orderBy, query, where } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useCurrentUser } from "../../lib/useCurrentUser";
import { useFriends } from "../../lib/privateChat";
import { cachedPhotoOf, useSenderColors } from "../../lib/senderColors";
import { useBadgeImages } from "../../lib/badgeImages";
import { StoryRow } from "./StoryRow";
import { roleBadgesForDoc } from "../../lib/rooms";
import { uploadChatImage } from "../../lib/imageUpload";
import { uploadBlogVideo } from "../../lib/videoUpload";
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

type Tab = "popular" | "new" | "friends" | "mine" | "saved";

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
  ["saved", "🔖 Saved"],
];

export function FeedList({ author = "", embedded = false }: { author?: string; embedded?: boolean }) {
  const { user, username } = useCurrentUser();
  const friends = useFriends(username);
  const [tab, setTab] = useState<Tab>("popular");
  // 📷 show all posts, or only the ones with a photo
  const [media, setMedia] = useState<"all" | "photos">("all");
  // 🏷 one category, or "all"
  const [cat, setCat] = useState("all");
  const router = useRouter();
  // ❤️ which of these posts I liked (read once per list), and a short message
  const [liked, setLiked] = useState<Set<string>>(new Set());
  // 🔖 the posts I saved (from the server, so the Saved tab can list them)
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!user) return;
    blogCall("saves")
      .then((r) => setSavedIds(new Set((Array.isArray(r.postIds) ? r.postIds : []) as string[])))
      .catch(() => {});
  }, [user]);
  // 🔖 save / unsave a post (optimistic; put back if the server says no)
  const toggleSave = (p: BlogPost) => {
    if (!user) return;
    const on = !savedIds.has(p.id);
    const flip = (cur: Set<string>) => {
      const next = new Set(cur);
      if (on) next.add(p.id);
      else next.delete(p.id);
      return next;
    };
    setSavedIds(flip);
    blogCall("save", { postId: p.id, saved: on }).catch(() => {
      setSavedIds((cur) => {
        const next = new Set(cur);
        if (on) next.delete(p.id);
        else next.add(p.id);
        return next;
      });
      setToast("Couldn't save. Try again.");
    });
  };
  const [toast, setToast] = useState("");
  // 👥 the post whose reactions I am looking at (null = closed)
  const [reactorsOf, setReactorsOf] = useState<BlogPost | null>(null);
  // ↗ the post I am sharing to my wall (null = closed)
  const [sharing, setSharing] = useState<BlogPost | null>(null);
  const [posts, setPosts] = useState<BlogPost[] | null>(null);
  // ✔ authors whose users document says verified (read-only; miGlife sets it)
  const [verifiedAuthors, setVerifiedAuthors] = useState<Set<string>>(new Set());
  // 🏅 each author's role badge emoji (users.role etc.), shown as the app's picture
  const [authorBadge, setAuthorBadge] = useState<Record<string, string>>({});
  const badgeImages = useBadgeImages(!!user);
  useEffect(() => {
    const names = [...new Set((posts || []).map((p) => p.author))];
    if (!names.length) return;
    let alive = true;
    (async () => {
      const found = new Set<string>();
      const badges: Record<string, string> = {};
      for (let i = 0; i < names.length; i += 10) {
        try {
          const snap = await getDocs(query(collection(db, "users"), where("username", "in", names.slice(i, i + 10))));
          snap.docs.forEach((d) => {
            const name = String(d.data().username || "");
            if (d.data().verified === true) found.add(name);
            const b = roleBadgesForDoc(d.data())[0];
            if (b) badges[name] = b;
          });
        } catch {
          // quiet: the badge is a nicety
        }
      }
      if (alive) {
        setVerifiedAuthors(found);
        setAuthorBadge(badges);
      }
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
  // like the app's create-post box: one optional video, a mood line, a topic menu
  const [cvideo, setCvideo] = useState("");
  const [cvideoBusy, setCvideoBusy] = useState(false);
  const [cmoodOpen, setCmoodOpen] = useState(false);
  const [ccatOpen, setCcatOpen] = useState(false);
  const cvideoRef = useRef<HTMLInputElement>(null);
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
  // ↶ Undo: a post waits 5 seconds before it is sent, and can be taken back in that time
  const [undoable, setUndoable] = useState(false);
  const undoRef = useRef<{ id: number; restore: () => void } | null>(null);
  const sendPost = async (p: { text: string; photos: string[]; video: string; category: string }) => {
    // no title box: the title is the first line of the text
    const first = p.text.trim().split("\n")[0].slice(0, 60);
    const title = first.length >= 3 ? first : first ? `${first}...` : "📷 Photo";
    const [cover = "", ...rest] = p.photos;
    const body = [p.text.trim(), ...rest.map((u) => `![](${u})`)].filter(Boolean).join("\n\n") || "📷";
    setCbusy(true);
    try {
      await blogCall("create", { title, body, cover, category: p.category, video: p.video });
      setToast("Posted ✓");
      setReload((n) => n + 1);
      window.setTimeout(() => setToast(""), 2200);
    } catch (e) {
      // the post did not go: bring the text back so nothing is lost
      setCtext(p.text);
      setCphotos(p.photos);
      setCvideo(p.video);
      setCcat(p.category);
      setComposing(true);
      setCerr(blogError(e));
    } finally {
      setCbusy(false);
    }
  };
  const publishInline = () => {
    setCerr("");
    if (!ctext.trim() && cphotos.length === 0 && !cvideo) return setCerr("Write something or add a photo.");
    const payload = { text: ctext, photos: cphotos, video: cvideo, category: ccat };
    setCtext("");
    setCphotos([]);
    setCvideo("");
    setComposing(false);
    setUndoable(true);
    const id = window.setTimeout(() => {
      undoRef.current = null;
      setUndoable(false);
      void sendPost(payload);
    }, 5000);
    undoRef.current = {
      id,
      restore: () => {
        window.clearTimeout(id);
        undoRef.current = null;
        setUndoable(false);
        setCtext(payload.text);
        setCphotos(payload.photos);
        setCvideo(payload.video);
        setCcat(payload.category);
        setComposing(true);
        setToast("Post taken back");
        window.setTimeout(() => setToast(""), 2000);
      },
    };
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
      if (tab === "saved") {
        if (!user) return [];
        const ids = [...savedIds].slice(0, 50);
        const docs = await Promise.all(ids.map((id) => getDoc(doc(col, id))));
        return docs.filter((d) => d.exists()).map((d) => toBlogPost(d.id, d.data() as Record<string, unknown>)).sort((a, b) => b.createdMs - a.createdMs);
      }
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
          <div className="sticky top-0 z-30 mx-3.5 mb-1 mt-2 flex rounded-2xl border border-[#6366F1]/15 bg-white/70 p-1 backdrop-blur-md">
            {/* 🫧 one gradient pill that slides under the chosen tab */}
            <span
              aria-hidden
              className="pointer-events-none absolute bottom-1 top-1 rounded-xl bg-gradient-to-br from-[#FF8A5B] via-[#E4577A] to-[#9B6BFF] shadow-[0_6px_14px_-6px_rgba(228,87,122,.7)] transition-[left,width] duration-300 ease-out"
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

        {!author && <StoryRow myUid={user?.uid} myName={username} friends={friends} colorOf={colorOf} />}

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
            {BLOG_CATEGORIES.map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setCat(cat === k ? "all" : k)}
                className={`shrink-0 rounded-full px-3.5 py-1.5 text-[12.5px] font-extrabold transition ${
                  cat === k ? "bg-[#1D4ED8] text-white" : "bg-white text-[#4F46E5] shadow-[0_1px_0_#C9D8EA]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {/* ✍️ "What's on your mind?" — opens the writer */}
        {!author && user && composing && (
          <div className="mx-3.5 my-2.5 rounded-[22px] border border-[#6366F1]/15 bg-white/92 p-3.5 shadow-[inset_0_2px_0_#fff,0_3px_0_#C9D8EA,0_6px_0_#B7C9E0]">
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
            <input
              ref={cvideoRef}
              type="file"
              accept="video/mp4,video/webm,video/quicktime"
              hidden
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f || !user) return;
                setCerr("");
                setCvideoBusy(true);
                try {
                  setCvideo(await uploadBlogVideo(user.uid, f));
                } catch (err) {
                  setCerr(err instanceof Error ? err.message : blogError(err));
                } finally {
                  setCvideoBusy(false);
                }
              }}
            />
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
            {(cvideo || cvideoBusy) && (
              <div className="mt-2 flex items-center justify-between rounded-xl bg-[#F4F6FD] px-3 py-2 text-[13px] font-bold text-[#1D4ED8]">
                <span>{cvideoBusy ? "🎬 Uploading video…" : "🎬 Video attached"}</span>
                {!cvideoBusy && (
                  <button type="button" onClick={() => setCvideo("")} aria-label="Remove video" className="text-[#8494B2]">
                    ✕
                  </button>
                )}
              </div>
            )}
            {cerr && <p className="mt-2 rounded-lg bg-red-50 px-2.5 py-1.5 text-[12.5px] text-red-700">{cerr}</p>}
            <div className="mt-2.5 border-t border-[#EEF2F8] pt-1.5">
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  disabled={cbusy || cphotos.length >= 10}
                  onClick={() => cfileRef.current?.click()}
                  className="flex items-center gap-1.5 rounded-xl px-2.5 py-2 text-[13px] font-bold text-[#334155] hover:bg-[#F4F6FD] disabled:opacity-40"
                >
                  <span className="text-[17px]">🖼</span>Photo
                </button>
                <button
                  type="button"
                  disabled={cbusy || cvideoBusy || !!cvideo}
                  onClick={() => cvideoRef.current?.click()}
                  className="flex items-center gap-1.5 rounded-xl px-2.5 py-2 text-[13px] font-bold text-[#334155] hover:bg-[#F4F6FD] disabled:opacity-40"
                >
                  <span className="text-[17px]">🎬</span>Video
                </button>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      setCmoodOpen((v) => !v);
                      setCcatOpen(false);
                    }}
                    className="flex items-center gap-1.5 rounded-xl px-2.5 py-2 text-[13px] font-bold text-[#334155] hover:bg-[#F4F6FD]"
                  >
                    <span className="text-[17px]">😊</span>Mood
                  </button>
                  {cmoodOpen && (
                    <div className="absolute bottom-full right-0 z-20 mb-2 w-44 rounded-2xl border border-[#E5EAF5] bg-white p-1.5 shadow-xl">
                      {[["😊", "খুশি"], ["😍", "ভালোবাসা"], ["😢", "মন খারাপ"], ["🤩", "উত্তেজিত"], ["😴", "ক্লান্ত"], ["🙏", "কৃতজ্ঞ"]].map(([e, l]) => (
                        <button
                          key={l}
                          type="button"
                          onClick={() => {
                            setCtext((t) => (t.trim() ? `${t.trimEnd()}\n${e} ${l}` : `${e} ${l}`));
                            setCmoodOpen(false);
                          }}
                          className="block w-full rounded-xl px-3 py-2 text-left text-[13.5px] font-semibold text-[#1E1B4B] hover:bg-[#F4F6FD]"
                        >
                          {e}&nbsp; {l}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      setCcatOpen((v) => !v);
                      setCmoodOpen(false);
                    }}
                    className="flex items-center gap-1.5 rounded-xl px-2.5 py-2 text-[13px] font-bold text-[#334155] hover:bg-[#F4F6FD]"
                  >
                    <span className="text-[17px]">🏷</span>
                    {BLOG_CATEGORIES.find(([k]) => k === ccat)?.[1] ?? "Topic"}
                  </button>
                  {ccatOpen && (
                    <div className="absolute bottom-full right-0 z-20 mb-2 w-44 rounded-2xl border border-[#E5EAF5] bg-white p-1.5 shadow-xl">
                      {BLOG_CATEGORIES.map(([k, label]) => (
                        <button
                          key={k}
                          type="button"
                          onClick={() => {
                            setCcat(k);
                            setCcatOpen(false);
                          }}
                          className={`block w-full rounded-xl px-3 py-2 text-left text-[13.5px] font-semibold ${ccat === k ? "bg-[#EEF4FF] text-[#1D4ED8]" : "text-[#1E1B4B] hover:bg-[#F4F6FD]"}`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={publishInline}
              disabled={cbusy || cvideoBusy || (!ctext.trim() && cphotos.length === 0 && !cvideo)}
              className={`mt-2 h-11 w-full rounded-2xl text-[15px] font-extrabold transition ${
                cbusy || cvideoBusy || (!ctext.trim() && cphotos.length === 0 && !cvideo)
                  ? "bg-[#E5EAF5] text-[#8A97A8]"
                  : "bg-gradient-to-r from-[#2F6FD6] to-[#8B5CFF] text-white shadow-[0_8px_18px_-8px_rgba(139,92,255,.8)]"
              }`}
            >
              {cbusy ? "Posting…" : "Post"}
            </button>
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
              {/* 🗓 this week's recap, from my own posts (last 7 days) */}
              {(() => {
                const since = Date.now() - 7 * 86400000;
                const wk = posts.filter((p) => p.createdMs >= since);
                const r = wk.reduce((n, p) => n + p.likes, 0);
                const v = wk.reduce((n, p) => n + p.views, 0);
                return (
                  <div className="mt-2 rounded-2xl bg-gradient-to-br from-[#38BDF8] via-[#6366F1] to-[#A855F7] px-3.5 py-2.5 text-white">
                    <div className="text-[11px] font-extrabold uppercase tracking-wider opacity-85">This week</div>
                    <div className="text-[14px] font-bold">
                      {wk.length} {wk.length === 1 ? "post" : "posts"} · {blogShort(r)} reactions · {blogShort(v)} views
                    </div>
                  </div>
                );
              })()}
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
            {posts.filter((p) => (media !== "photos" || !!(p.cover || p.firstImage)) && (cat === "all" || p.category === cat)).map((p) => (
              <FeedCard key={p.id} p={p} why={friends.includes(p.author) ? "👥 Friend" : p.likes >= 10 ? "🔥 Trending" : tab === "new" ? "🆕 New" : ""} verified={verifiedAuthors.has(p.author)} roleBadge={authorBadge[p.author] || ""} roleImg={badgeImages[authorBadge[p.author] || ""] || ""} color={colorOf(p.author)} liked={liked.has(p.id)} reaction={reactOf[p.id] || (liked.has(p.id) ? "👍" : "")} onReact={(e) => react(p, e)} onLike={() => like(p)} onShare={() => setSharing(p)} onReactors={() => setReactorsOf(p)} saved={savedIds.has(p.id)} onSave={() => toggleSave(p)} />
            ))}
            {media === "photos" && !posts.some((p) => p.cover || p.firstImage) && (
              <p className="py-6 text-center text-sm text-[#6B6F9A]">No photo posts in this tab yet.</p>
            )}
          </div>
        )}
      </section>

      {reactorsOf && <ReactorsSheet post={reactorsOf} onClose={() => setReactorsOf(null)} />}

      {sharing && (
        <ShareSheet
          post={sharing}
          onClose={() => setSharing(null)}
          onLink={() => share(sharing)}
          onDone={(msg) => {
            setSharing(null);
            setToast(msg);
            setReload((n) => n + 1);
          }}
        />
      )}

      {undoable && (
        <div className="fixed bottom-24 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-full bg-[#1E1B4B]/95 py-2 pl-4 pr-2 text-[13px] font-semibold text-white shadow-lg">
          <span>Posting in 5 sec…</span>
          <button type="button" onClick={() => undoRef.current?.restore()} className="rounded-full bg-white px-3 py-1 font-extrabold text-[#1D4ED8]">
            Undo
          </button>
        </div>
      )}
      {toast && (
        <div className="fixed bottom-24 left-1/2 z-40 -translate-x-1/2 rounded-full bg-[#1E1B4B]/90 px-4 py-2 text-[13px] font-semibold text-white">{toast}</div>
      )}
    </div>
  );
}

// 👥 Who reacted: everyone who reacted to a post, with their reaction, newest first.
// Tabs filter by reaction (All, then each emoji that is used).
function ReactorsSheet({ post, onClose }: { post: BlogPost; onClose: () => void }) {
  const [list, setList] = useState<{ username: string; type: string }[] | null>(null);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState("all");
  useEffect(() => {
    blogCall("reactors", { postId: post.id })
      .then((r) => setList((r.reactors as { username: string; type: string }[]) || []))
      .catch((e) => setErr(blogError(e)));
  }, [post.id]);
  const kinds = useMemo(() => [...new Set((list || []).map((r) => r.type))], [list]);
  const shown = (list || []).filter((r) => tab === "all" || r.type === tab);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3" onClick={onClose}>
      <div className="flex max-h-[80vh] w-full max-w-md flex-col rounded-[24px] bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-[16px] font-black text-[#1E1B4B]">Reactions · {list ? list.length : "…"}</h3>
          <button type="button" onClick={onClose} className="text-[#8494B2]" aria-label="Close">✕</button>
        </div>
        {list && list.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {["all", ...kinds].map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setTab(k)}
                className={`rounded-full px-3 py-1.5 text-[13px] font-extrabold ${tab === k ? "bg-[#1D4ED8] text-white" : "bg-[#F1F4FB] text-[#4F46E5]"}`}
              >
                {k === "all" ? `All ${list.length}` : `${k} ${list.filter((r) => r.type === k).length}`}
              </button>
            ))}
          </div>
        )}
        <div className="mt-3 flex-1 overflow-y-auto">
          {err && <p className="text-[13px] text-[#B91C1C]">{err}</p>}
          {list === null && !err && <p className="text-[13px] text-[#6B6F9A]">Loading…</p>}
          {list && list.length === 0 && <p className="py-6 text-center text-[13px] text-[#6B6F9A]">No reactions yet.</p>}
          {shown.map((r, i) => (
            <div key={`${r.username}-${i}`} className="flex items-center gap-3 border-b border-[#EEF2FA] py-2.5 last:border-0">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#38BDF8] to-[#6366F1] text-[13px] font-bold text-white">
                {r.username.slice(0, 1).toUpperCase()}
              </span>
              <Link href={`/profile/${encodeURIComponent(r.username)}`} className="min-w-0 flex-1 truncate text-[14px] font-bold text-[#1E1B4B]">
                {r.username}
              </Link>
              <span className="text-[18px]">{r.type}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ↗ Share to my wall: a short note (optional) and the post it shares. The post
// appears on my wall and in the feed, with the original inside it.
function ShareSheet({ post, onClose, onDone, onLink }: { post: BlogPost; onClose: () => void; onDone: (msg: string) => void; onLink: () => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const origin = post.sharedId ? { id: post.sharedId, author: post.sharedAuthor, title: post.sharedTitle } : { id: post.id, author: post.author, title: post.title };
  const send = async () => {
    setBusy(true);
    setErr("");
    try {
      await blogCall("create", {
        title: `↗ ${origin.title}`.slice(0, 60),
        body: text.trim() || "↗ Shared a post",
        category: post.category,
        cover: "",
        sharedId: origin.id,
      });
      onDone("Shared to your wall ✓");
    } catch (e) {
      setErr(blogError(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3" onClick={onClose}>
      <div className="w-full max-w-md rounded-[24px] bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-[16px] font-black text-[#1E1B4B]">Share to your wall</h3>
          <button type="button" onClick={onClose} className="text-[#8494B2]" aria-label="Close">✕</button>
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={500}
          placeholder="Say something about this… (optional)"
          className="mt-3 h-20 w-full resize-none rounded-2xl border border-[#DDE8F7] bg-[#F7F9FF] p-3 text-[14px] outline-none focus:border-[#6366F1]"
        />
        <div className="mt-3 rounded-2xl border border-[#DDE8F7] bg-[#F7F9FF] p-3">
          <div className="text-[12px] font-bold text-[#6366F1]">↗ {origin.author}</div>
          <div className="mt-0.5 line-clamp-2 text-[13.5px] font-bold text-[#1E1B4B]">{origin.title}</div>
        </div>
        {err && <p className="mt-2 text-[12.5px] text-[#B91C1C]">{err}</p>}
        <div className="mt-3 flex gap-2">
          <button type="button" onClick={onLink} className="rounded-full border border-[#DDE8F7] px-4 py-2.5 text-[13px] font-bold text-[#4F46E5]">
            🔗 Copy link
          </button>
          <button
            type="button"
            onClick={send}
            disabled={busy}
            className="flex-1 rounded-full bg-gradient-to-r from-[#38BDF8] to-[#A855F7] py-2.5 text-[14px] font-extrabold text-white disabled:opacity-60"
          >
            {busy ? "Sharing…" : "Share to my wall"}
          </button>
        </div>
      </div>
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
function FeedCard({ p, color, liked, verified, why = "", roleBadge, roleImg, reaction, onReact, onLike, onShare, onReactors, saved, onSave }: { p: BlogPost; color: string; liked: boolean; verified: boolean; why?: string; roleBadge: string; roleImg: string; reaction: string; onReactors: () => void; onReact: (emoji: string) => void; onLike: () => void; onShare: () => void; saved: boolean; onSave: () => void }) {
  const [pick, setPick] = useState(false);
  // ✨ the picked reaction flies up once
  const [fly, setFly] = useState<{ e: string; k: number } | null>(null);
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
            {roleImg ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={roleImg} alt="" title="Role badge" className="h-4 w-4 shrink-0 rounded-full object-cover" />
            ) : roleBadge ? (
              <span className="shrink-0 text-[13px] leading-none" title="Role badge">{roleBadge}</span>
            ) : null}
          </div>
          <div className="text-[11.5px] text-[#7A7FA6]">
            {blogAgoBn(p.createdMs)} · 👁 {blogShort(p.views)}
            {why && <span className="ml-1.5 rounded-full bg-[#EEF4FF] px-1.5 py-px text-[10.5px] font-bold text-[#1D4ED8]">{why}</span>}
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
      {p.sharedId && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            router.push(`/feed/${p.sharedId}`);
          }}
          className="mt-2.5 block w-full rounded-2xl border border-[#DDE8F7] bg-[#F7F9FF] p-3 text-left"
        >
          <span className="block text-[12px] font-bold text-[#6366F1]">↗ {p.sharedAuthor}</span>
          <span className="mt-0.5 line-clamp-2 block text-[13.5px] font-bold text-[#1E1B4B]">{p.sharedTitle}</span>
        </button>
      )}
      {p.video && (
        <video src={p.video} controls playsInline preload="metadata" onClick={(e) => e.stopPropagation()} className="mt-2.5 max-h-[320px] w-full rounded-2xl bg-black" />
      )}
      {pic && !p.video && (
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
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onReactors();
          }}
          className="font-bold text-[#1458C8] underline-offset-2 hover:underline"
          aria-label="See who reacted"
        >
          👍 {blogShort(p.likes)}
        </button>
        <span className="ml-auto">{blogShort(p.comments)} Comments · {blogShort(p.views)} Views</span>
      </div>
      <div className="mt-2 border-t border-[#DDE8F7] pt-2.5 flex gap-2" onClick={(e) => e.stopPropagation()}>
        <div className="relative flex-1">
        {fly && (
          <span key={fly.k} className="feed-fly pointer-events-none absolute bottom-12 left-3 z-30 text-[24px]">
            {fly.e}
          </span>
        )}
        {pick && (
          // 😀 the six reactions: tap one (tap the same again to take it back)
          <div className="absolute bottom-11 left-0 z-20 flex gap-1 rounded-full bg-white px-2 py-1 shadow-[0_8px_20px_-6px_rgba(16,63,145,.35)] ring-1 ring-[#DDE8F7]">
            {["👍", "❤️", "😂", "😮", "😢", "😡"].map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => {
                  setPick(false);
                  setFly({ e, k: Date.now() });
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
        <button type="button" onClick={onSave} aria-pressed={saved} aria-label={saved ? "Unsave" : "Save"} className={`flex h-9 w-10 items-center justify-center rounded-xl text-[15px] ${saved ? "bg-[#FFF4D6]" : "bg-[#F3F2FF] opacity-60"}`}>
          🔖
        </button>
        <button type="button" onClick={onShare} className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#F3F2FF] text-[13px] font-extrabold text-[#4F46E5]">
          ↗ Share
        </button>
      </div>
    </article>
  );
}
