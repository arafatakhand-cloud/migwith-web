"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, doc, getDoc, getDocs, limit, orderBy, query, where, getCountFromServer } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useCurrentUser } from "../../lib/useCurrentUser";
import { setFollowing, useFollowing } from "../../lib/follow";
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
  toBlogPost,
  type BlogPost,
} from "../../lib/feed";

// 📰 Feed list (the "Thread" look, like Twitter/X): Popular · New · Friends · Mine (or one writer's
// posts with ?author=name, from their profile). Anyone can read; writing needs
// a login. Read once per tab (no live listener), pull the tab again to refresh.

type Tab = "popular" | "new" | "friends" | "following" | "mine" | "saved";

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
// which tab bar look the Feed uses ("pills" = T2, "underline" = T1, "icons" = T3)
const TAB_LOOK: "pills" | "underline" | "icons" = "pills";
const TAB_ICONS: Record<string, string> = { new: "✨", popular: "🔥", friends: "👥", following: "⭐", mine: "👤" };
const TABS: [Tab, string][] = [
  ["new", "New"],
  ["popular", "Popular"],
  ["friends", "Friends"],
  ["following", "Following"],
  ["mine", "Mine"],
];

// 🏷 the coloured role pill beside a name (like the app's Feed)
const ROLE_PILLS: Record<string, [string, string, string]> = {
  founder: ["Founder", "#FFF4D6", "#B7791F"],
  superadmin: ["Founder", "#FFF4D6", "#B7791F"],
  admin: ["Admin", "#E6F0FF", "#1D4ED8"],
  staff: ["Staff", "#E3F8EA", "#15803D"],
  merchant: ["Merchant", "#FFEBD9", "#C2410C"],
  mentor: ["Mentor", "#F1E8FF", "#7C3AED"],
  country_representative: ["Country Rep", "#E0F2FE", "#0369A1"],
  executive_board: ["Executive", "#FCE7F3", "#BE185D"],
  elite: ["Elite", "#FEF3C7", "#A16207"],
};
function rolePillOf(d: Record<string, unknown>): string {
  for (const f of ["membershipRole", "memberType", "role"]) {
    const v = String(d[f] || "").toLowerCase().replace(/[\s-]+/g, "_");
    if (ROLE_PILLS[v]) return v;
  }
  return "";
}

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
  const [authorRole, setAuthorRole] = useState<Record<string, string>>({});
  const badgeImages = useBadgeImages(!!user);
  useEffect(() => {
    const names = [...new Set((posts || []).map((p) => p.author))];
    if (!names.length) return;
    let alive = true;
    (async () => {
      const found = new Set<string>();
      const badges: Record<string, string> = {};
      const roles: Record<string, string> = {};
      for (let i = 0; i < names.length; i += 10) {
        try {
          const snap = await getDocs(query(collection(db, "users"), where("username", "in", names.slice(i, i + 10))));
          snap.docs.forEach((d) => {
            const name = String(d.data().username || "");
            if (d.data().verified === true) found.add(name);
            const b = roleBadgesForDoc(d.data())[0];
            if (b) badges[name] = b;
            const r = rolePillOf(d.data());
            if (r) roles[name] = r;
          });
        } catch {
          // quiet: the badge is a nicety
        }
      }
      if (alive) {
        setVerifiedAuthors(found);
        setAuthorBadge(badges);
        setAuthorRole(roles);
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
    // the white pill follows the chosen tab, also when the window is resized
    // (none for 🔖 Saved, which lives in the header)
    const place = () => {
      const el = tabRefs.current[tab];
      setInd(el ? { left: el.offsetLeft, width: el.offsetWidth } : null);
    };
    place();
    // T2 pills: bring the chosen pill into view sideways (never moves the page)
    const el = tabRefs.current[tab];
    const row = el?.parentElement;
    if (el && row && row.scrollWidth > row.clientWidth) row.scrollTo({ left: Math.max(0, el.offsetLeft - (row.clientWidth - el.offsetWidth) / 2), behavior: "smooth" });
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [tab]);
  const friendsKey = friends.join(",");
  const followed = useFollowing(user?.uid);
  // 💜 how many members follow me (for my wall on the Mine tab)
  const [myFollowers, setMyFollowers] = useState<number | null>(null);
  useEffect(() => {
    if (tab !== "mine" || !username) return;
    getCountFromServer(query(collection(db, "users"), where("following", "array-contains", username)))
      .then((c) => setMyFollowers(c.data().count))
      .catch(() => {});
  }, [tab, username]);
  const followedKey = followed.join(",");
  const toggleFollow = async (name: string) => {
    try {
      if (!user) return;
      await setFollowing(user.uid, name, !followed.includes(name));
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Could not change follow. Please try again.");
    }
  };

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
  // 🎬 miGlife's switch: when video is OFF the Video button is hidden
  const [videoOn, setVideoOn] = useState(true);
  useEffect(() => {
    blogCall("videoStatus")
      .then((r) => setVideoOn(r.videoEnabled !== false))
      .catch(() => setVideoOn(true));
  }, []);
  const [cmoodOpen, setCmoodOpen] = useState(false);
  // @ mention: while you type "@ab", suggest your friends whose name starts with it
  const mentionMatch = ctext.match(/@([A-Za-z0-9_.\-]{0,20})$/);
  const mentionSuggest = mentionMatch
    ? friends.filter((f) => f.toLowerCase().startsWith(mentionMatch[1].toLowerCase()) && f.toLowerCase() !== mentionMatch[1].toLowerCase()).slice(0, 6)
    : [];
  const pickMention = (name: string) => setCtext((t) => t.replace(/@[A-Za-z0-9_.\-]{0,20}$/, `@${name} `));
  const [ccatOpen, setCcatOpen] = useState(false);
  const cvideoRef = useRef<HTMLInputElement>(null);
  const cfileRef = useRef<HTMLInputElement>(null);
  const ctextRef = useRef<HTMLTextAreaElement>(null);
  // 🎨 the Text Art colour for a words-only post (a fresh random one each time the writer opens)
  const [cbg, setCbg] = useState(0);
  const cbgKeep = useRef<number | null>(null); // a post brought back keeps its colour
  useEffect(() => {
    if (!composing) return;
    setCbg(cbgKeep.current ?? PLAIN_BG); // plain white first; tap a colour to change
    cbgKeep.current = null;
  }, [composing]);
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
  const sendPost = async (p: { text: string; photos: string[]; video: string; category: string; bg: number }) => {
    // no title box: the title is the first line of the text
    const first = p.text.trim().split("\n")[0].slice(0, 60);
    const title = first.length >= 3 ? first : first ? `${first}...` : "📷 Photo";
    const [cover = "", ...rest] = p.photos;
    const body = [p.text.trim(), ...rest.map((u) => `![](${u})`)].filter(Boolean).join("\n\n") || "📷";
    setCbusy(true);
    try {
      // the colour only matters for a words-only post
      await blogCall("create", { title, body, cover, category: p.category, video: p.video, ...(cover || p.video ? {} : { bg: p.bg }) });
      setToast("Posted ✓");
      setReload((n) => n + 1);
      window.setTimeout(() => setToast(""), 2200);
    } catch (e) {
      // the post did not go: bring the text back so nothing is lost
      setCtext(p.text);
      setCphotos(p.photos);
      setCvideo(p.video);
      setCcat(p.category);
      cbgKeep.current = p.bg;
      setComposing(true);
      setCerr(blogError(e));
    } finally {
      setCbusy(false);
    }
  };
  const publishInline = () => {
    setCerr("");
    if (!ctext.trim() && cphotos.length === 0 && !cvideo) return setCerr("Write something or add a photo.");
    const payload = { text: ctext, photos: cphotos, video: cvideo, category: ccat, bg: cbg };
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
        cbgKeep.current = payload.bg;
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
      if (tab === "following") {
        const names = followedKey ? followedKey.split(",") : [];
        const out: BlogPost[] = [];
        for (let i = 0; i < names.length && i < 100; i += 10) {
          out.push(...map(await getDocs(query(col, where("author", "in", names.slice(i, i + 10)), limit(30)))));
        }
        return out.sort((a, b) => b.createdMs - a.createdMs).slice(0, 60);
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
  }, [tab, author, user, friendsKey, followedKey, reload]);

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
  // 👤 Mine = only my own wall and my posts (no stories, tabs or writer box)
  const mineOnly = !author && !!user && tab === "mine";
  return (
    <div className="relative -mb-8 min-h-[calc(100dvh-60px)] overflow-hidden bg-[#F4F4F8]">
      <section className="relative mx-auto max-w-2xl pb-10">
        {author ? (
          <div className="px-3 sm:px-6">
            <PageTitle title={`${author}'s Feed`} subtitle="Every post by this writer" icon="📰" backHref={`/profile/${encodeURIComponent(author)}`} />
          </div>
        ) : (
          // 🎨 design A: gradient header band
          <div className="mb-1 flex items-center justify-between px-5 pb-2 pt-4">
            {mineOnly ? (
              <button
                type="button"
                onClick={() => setTab("new")}
                aria-label="Back to the Feed"
                className="flex items-center gap-2.5 text-[#1E1B4B] transition active:scale-95"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#FFFFFF] text-[18px] font-black shadow-[0_6px_14px_-8px_rgba(60,64,140,.55)]">←</span>
                <span className="text-[22px] font-black tracking-tight">My posts</span>
              </button>
            ) : (
              <h1 className="bg-gradient-to-r from-[#F59E0B] via-[#EC4899] to-[#8B5CF6] bg-clip-text pr-1 font-serif text-[30px] font-black italic tracking-tight text-transparent">miGlife</h1>
            )}
            {user && !mineOnly && (
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setTab(tab === "saved" ? "popular" : "saved")}
                  aria-label="Saved posts"
                  title="Saved posts"
                  className={`flex h-9 items-center gap-1 rounded-full px-3 text-[12.5px] font-extrabold transition ${tab === "saved" ? "bg-[#111827] text-white" : "bg-[#FFFFFF] text-[#3B4266] shadow-[0_4px_12px_-6px_rgba(60,64,140,.4)]"}`}
                >
                  🔖 Saved
                </button>
                {/* 👤 my picture → my own posts (the Mine tab) */}
                <button type="button" onClick={() => setTab("mine")} aria-label="My posts" title="My posts" className="rounded-full transition active:scale-95">
                  <Avatar name={username} color={meColor} size={34} ring />
                </button>
              </div>
            )}
          </div>
        )}

        {!author && !mineOnly && TAB_LOOK === "pills" && (
          // T2 · Gradient pill: a white pill for each tab; the chosen one turns miGlife-colour
          <div className="no-scrollbar sticky top-0 z-30 mb-2 flex gap-2 overflow-x-auto bg-[#F4F4F8] px-3.5 pb-2 pt-1">
            {TABS.map(([k, label]) => (
              <button
                key={k}
                ref={(el) => {
                  tabRefs.current[k] = el;
                }}
                type="button"
                onClick={() => (k === tab ? setReload((n) => n + 1) : setTab(k))}
                className={`shrink-0 whitespace-nowrap rounded-full px-4 py-2.5 text-[13.5px] font-extrabold transition active:scale-95 ${
                  tab === k
                    ? "bg-gradient-to-r from-[#F59E0B] via-[#EC4899] to-[#8B5CF6] text-white shadow-[0_8px_16px_-8px_rgba(236,72,153,.9)]"
                    : "bg-[#FFFFFF] text-[#6B6F9A] shadow-[0_4px_12px_-8px_rgba(60,64,140,.5)]"
                }`}
              >
                {k === "popular" ? "🔥 " : ""}
                {label}
              </button>
            ))}
          </div>
        )}
        {!author && !mineOnly && TAB_LOOK === "underline" && (
          // T1 · Underline: just the words; a miGlife-colour line slides under the chosen one
          <div className="sticky top-0 z-30 mb-2 bg-[#F4F4F8]/90 px-2 pt-1 backdrop-blur-md">
            <div className="relative flex border-b border-[#E3E5F0]">
              <span
                aria-hidden
                className="pointer-events-none absolute -bottom-px h-[3px] rounded-full bg-gradient-to-r from-[#F59E0B] via-[#EC4899] to-[#8B5CF6] transition-[left,width] duration-300 ease-out"
                style={ind ? { left: ind.left + 8, width: Math.max(0, ind.width - 16) } : { opacity: 0 }}
              />
              {TABS.map(([k, label]) => (
                <button
                  key={k}
                  ref={(el) => {
                    tabRefs.current[k] = el;
                  }}
                  type="button"
                  onClick={() => (k === tab ? setReload((n) => n + 1) : setTab(k))}
                  className={`relative flex-1 whitespace-nowrap px-1 pb-3 pt-2 text-[14px] font-extrabold transition-colors ${tab === k ? "text-[#1E1B4B]" : "text-[#8A8FB0]"}`}
                >
                  {k === "popular" && tab === k ? "🔥 " : ""}
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}
        {!author && !mineOnly && TAB_LOOK === "icons" && (
          // T3 · Icon tabs: a white card, an icon over each name; the chosen one glows
          <div className="sticky top-0 z-30 mx-3.5 mb-3 mt-1 grid grid-cols-5 rounded-[22px] bg-[#FFFFFF]/95 p-1.5 shadow-[0_12px_26px_-18px_rgba(60,64,140,.6)] backdrop-blur-md">
            <span
              aria-hidden
              className="pointer-events-none absolute bottom-1.5 top-1.5 rounded-[16px] bg-gradient-to-br from-[#FFF1E6] to-[#FCE7F3] transition-[left,width] duration-300 ease-out"
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
                className="relative z-10 flex flex-col items-center gap-0.5 rounded-2xl py-1.5"
              >
                <span className={`text-[19px] leading-none transition ${tab === k ? "scale-110" : "opacity-80 grayscale-[.3]"}`}>{TAB_ICONS[k]}</span>
                <span className={`whitespace-nowrap text-[11px] font-extrabold ${tab === k ? "text-[#DB2777]" : "text-[#8A8FB0]"}`}>{label}</span>
              </button>
            ))}
          </div>
        )}

        {/* 📸 stories, under the tabs */}
        {!author && !mineOnly && <StoryRow myUid={user?.uid} myName={username} friends={friends} colorOf={colorOf} />}

        {false && !author && (
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
        {!author && user && composing && (() => {
          // ✍️ C1 · Text Art writer: with no photo or video, you write right on the
          // colour your post will have in the Feed, and pick that colour below
          const art = cphotos.length === 0 && !cvideo && !cvideoBusy;
          const [bgFill, ink] = cbg === PLAIN_BG ? ["#F6F7FC", "#1E1B4B"] : TEXT_ART[cbg] || TEXT_ART[0];
          const empty = !ctext.trim() && cphotos.length === 0 && !cvideo;
          const len = ctext.trim().length;
          const artSize = len <= 60 ? "text-[23px]" : len <= 140 ? "text-[19px]" : "text-[16px]";
          return (
            <div className="mx-3.5 mb-4 mt-1 rounded-[26px] bg-[#FFFFFF] p-3.5 shadow-[0_14px_30px_-18px_rgba(60,64,140,.6)]">
              <div className="flex items-center gap-2.5">
                <Avatar name={username} color={meColor} size={42} ring />
                <div className="min-w-0 flex-1">
                  <div className="text-[15px] font-black text-[#1E1B4B]">{username}</div>
                  <div className="flex items-center gap-1 text-[12px] font-semibold text-[#8A8FB0]">
                    🌍 Everyone ·
                    <button
                      type="button"
                      onClick={() => {
                        setCcatOpen((v) => !v);
                        setCmoodOpen(false);
                      }}
                      className="font-extrabold text-[#6366F1]"
                    >
                      {BLOG_CATEGORIES.find(([k]) => k === ccat)?.[1] ?? "Topic"} ▾
                    </button>
                  </div>
                </div>
                <button type="button" onClick={() => setComposing(false)} aria-label="Close" className="flex h-9 w-9 items-center justify-center rounded-full bg-[#F1F2F8] text-[14px] font-black text-[#6B6F9A]">
                  ✕
                </button>
              </div>
              {ccatOpen && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#0B1F3A]/40 p-4" onClick={() => setCcatOpen(false)}>
                  <div onClick={(e) => e.stopPropagation()} className="w-full max-w-[290px] rounded-3xl border border-[#E5EAF5] bg-[#FFFFFF] p-3 shadow-2xl">
                    <div className="mb-1.5 px-1 text-[11px] font-extrabold uppercase tracking-wider text-[#8B5CFF]">Pick a topic</div>
                    <div className="grid grid-cols-2 gap-1.5">
                      {BLOG_CATEGORIES.map(([k, label]) => (
                        <button
                          key={k}
                          type="button"
                          onClick={() => {
                            setCcat(k);
                            setCcatOpen(false);
                          }}
                          className={`rounded-full px-3 py-1.5 text-left text-[12.5px] font-bold transition hover:scale-[1.03] ${ccat === k ? "bg-gradient-to-r from-[#F59E0B] via-[#EC4899] to-[#8B5CF6] text-white shadow" : "bg-[#F4F6FD] text-[#1E1B4B] hover:bg-[#EEF4FF]"}`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
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
              {mentionSuggest.length > 0 && (
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {mentionSuggest.map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => pickMention(f)}
                      className="flex items-center gap-1.5 rounded-full bg-gradient-to-r from-[#EEF4FF] to-[#F3E8FF] px-3 py-1.5 text-[13px] font-extrabold text-[#2563EB] shadow-sm ring-1 ring-[#DCE6FF] transition hover:scale-[1.03]"
                    >
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br from-[#38BDF8] to-[#A855F7] text-[10px] text-white">@</span>
                      {f}
                    </button>
                  ))}
                </div>
              )}
              {art ? (
                // 🎨 write right on the colour
                <div className="mt-3 flex min-h-[170px] items-center justify-center rounded-[22px] px-5 py-6 transition-[background] duration-300" style={{ background: bgFill }}>
                  <textarea
                    ref={ctextRef}
                    autoFocus
                    value={ctext}
                    onChange={(e) => setCtext(e.target.value)}
                    onFocus={(e) => {
                      const el = e.currentTarget;
                      window.setTimeout(() => el.scrollIntoView({ block: "center", behavior: "smooth" }), 300);
                    }}
                    placeholder={`What's on your mind, ${username}?`}
                    rows={Math.min(8, Math.max(2, ctext.split("\n").length + Math.floor(len / 26)))}
                    className={`w-full resize-none bg-transparent text-center font-extrabold leading-snug outline-none ${artSize} ${ink === "#FFFFFF" ? "placeholder:text-white/70" : "placeholder:text-black/40"}`}
                    style={{ color: ink, textShadow: ink === "#FFFFFF" ? "0 2px 10px rgba(0,0,0,.25)" : "none" }}
                  />
                </div>
              ) : (
                <textarea
                  ref={ctextRef}
                  autoFocus
                  value={ctext}
                  onChange={(e) => setCtext(e.target.value)}
                  placeholder="Say something about this…"
                  rows={3}
                  className="mt-3 w-full resize-none rounded-2xl bg-[#F6F7FC] px-3.5 py-3 text-[15px] text-[#1E1B4B] outline-none placeholder:text-[#9AA3BD]"
                />
              )}
              {art && (
                <div className="no-scrollbar mt-3 flex items-center gap-2.5 overflow-x-auto px-0.5 py-1">
                  <button
                    type="button"
                    onClick={() => setCbg(PLAIN_BG)}
                    aria-label="Plain white"
                    title="Plain white"
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#D5D8E8] bg-[#FFFFFF] text-[11px] font-black text-[#6B6F9A] transition active:scale-90 ${cbg === PLAIN_BG ? "scale-110 ring-2 ring-[#6366F1] ring-offset-2" : ""}`}
                  >
                    Aa
                  </button>
                  {TEXT_ART.map(([g], i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setCbg(i)}
                      aria-label={`Colour ${i + 1}`}
                      className={`h-7 w-7 shrink-0 rounded-full transition active:scale-90 ${cbg === i ? "scale-110 ring-2 ring-[#6366F1] ring-offset-2" : ""}`}
                      style={{ background: g }}
                    />
                  ))}
                </div>
              )}
              {cphotos.length > 0 && (
                <div className="mt-2.5 flex gap-1.5 overflow-x-auto">
                  {cphotos.map((u) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={u} src={u} alt="" className="h-20 w-20 shrink-0 rounded-2xl object-cover" />
                  ))}
                </div>
              )}
              {(cvideo || cvideoBusy) && (
                <div className="mt-2.5 flex items-center justify-between rounded-xl bg-[#F4F6FD] px-3 py-2 text-[13px] font-bold text-[#1D4ED8]">
                  <span>{cvideoBusy ? "🎬 Uploading video…" : "🎬 Video attached"}</span>
                  {!cvideoBusy && (
                    <button type="button" onClick={() => setCvideo("")} aria-label="Remove video" className="text-[#8494B2]">
                      ✕
                    </button>
                  )}
                </div>
              )}
              {cerr && <p className="mt-2 rounded-lg bg-red-50 px-2.5 py-1.5 text-[12.5px] text-red-700">{cerr}</p>}
              {cmoodOpen && (
                <div className="mt-2.5 rounded-2xl bg-[#F7F8FF] p-2.5">
                  <div className="mb-2 flex items-center justify-between px-0.5">
                    <span className="text-[11.5px] font-extrabold uppercase tracking-wider text-[#8B5CFF]">How are you feeling?</span>
                    <button type="button" onClick={() => setCmoodOpen(false)} className="text-[12px] font-bold text-[#8494B2]">
                      Close
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {[["😊", "Happy", "from-[#FDE68A] to-[#FBBF24]"], ["😍", "Loved", "from-[#FBCFE8] to-[#F472B6]"], ["😢", "Sad", "from-[#BFDBFE] to-[#60A5FA]"], ["🤩", "Excited", "from-[#FDE68A] to-[#A78BFA]"], ["😴", "Tired", "from-[#E2E8F0] to-[#94A3B8]"], ["🙏", "Thankful", "from-[#BBF7D0] to-[#34D399]"]].map(([e, l, g]) => (
                      <button
                        key={l}
                        type="button"
                        onClick={() => {
                          setCtext((t) => (t.trim() ? `${t.trimEnd()}\n${e} ${l}` : `${e} ${l}`));
                          setCmoodOpen(false);
                        }}
                        className={`flex flex-col items-center gap-0.5 rounded-xl bg-gradient-to-br ${g} px-1 py-2.5 text-[12px] font-bold text-[#1E1B4B] shadow-sm transition hover:scale-[1.04] active:scale-95`}
                      >
                        <span className="text-[22px] leading-none">{e}</span>
                        {l}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {/* tools on the left, Post on the right */}
              <div className="mt-3 flex items-center gap-1">
                <button type="button" disabled={cbusy || cphotos.length >= 10} onClick={() => cfileRef.current?.click()} aria-label="Add photos" title="Photo" className="flex h-10 w-10 items-center justify-center rounded-[13px] text-[21px] transition hover:bg-[#ECFDF5] active:scale-90 disabled:opacity-40">
                  🖼️
                </button>
                {videoOn && (
                  <button type="button" disabled={cbusy || cvideoBusy || !!cvideo} onClick={() => cvideoRef.current?.click()} aria-label="Add a video" title="Video" className="flex h-10 w-10 items-center justify-center rounded-[13px] text-[21px] transition hover:bg-[#FEF2F2] active:scale-90 disabled:opacity-40">
                    🎬
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setCmoodOpen((v) => !v);
                    setCcatOpen(false);
                  }}
                  aria-label="Mood"
                  title="Mood"
                  className={`flex h-10 w-10 items-center justify-center rounded-[13px] text-[21px] transition hover:bg-[#FFFBEB] active:scale-90 ${cmoodOpen ? "bg-[#FFFBEB]" : ""}`}
                >
                  😊
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCtext((t) => (t && !/\s$/.test(t) ? `${t} @` : `${t}@`));
                    window.setTimeout(() => ctextRef.current?.focus(), 0);
                  }}
                  aria-label="Mention a friend"
                  title="Mention"
                  className="flex h-10 w-10 items-center justify-center rounded-[13px] text-[18px] font-black text-[#6366F1] transition hover:bg-[#EEF0FF] active:scale-90"
                >
                  @
                </button>
                <button
                  type="button"
                  onClick={publishInline}
                  disabled={cbusy || cvideoBusy || empty}
                  className={`ml-auto h-11 rounded-2xl px-6 text-[15px] font-black transition active:scale-95 ${
                    cbusy || cvideoBusy || empty
                      ? "bg-[#E9EBF4] text-[#A0A6C2]"
                      : "bg-gradient-to-r from-[#F59E0B] via-[#EC4899] to-[#8B5CF6] text-white shadow-[0_10px_20px_-10px_rgba(236,72,153,.9)]"
                  }`}
                >
                  {cbusy ? "Posting…" : "Post ➤"}
                </button>
              </div>
            </div>
          );
        })()}
        {!author && (!user || !composing) && !(user && tab === "mine") && (
          user ? (
            <button
              type="button"
              onClick={() => setComposing(true)}
              className="group mx-3.5 mb-4 mt-1 flex w-[calc(100%-1.75rem)] items-center gap-2.5 rounded-[22px] bg-[#FFFFFF] py-2.5 pl-3 pr-2.5 text-left shadow-[0_10px_28px_-16px_rgba(60,64,140,.35)] transition duration-200 active:scale-[.99]"
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

        {/* 🧱 My wall (Mine tab): one tidy card — picture, name, my numbers, New post */}
        {!author && tab === "mine" && user && posts && !composing && (() => {
          const since = Date.now() - 7 * 86400000;
          const wk = posts.filter((p) => p.createdMs >= since);
          const likes = posts.reduce((n, p) => n + p.likes, 0);
          const views = posts.reduce((n, p) => n + p.views, 0);
          return (
            <section className="mx-3.5 mb-5 mt-1 overflow-hidden rounded-[28px] bg-[#FFFFFF] shadow-[0_18px_34px_-20px_rgba(60,64,140,.55)]">
              <div className="relative flex items-center gap-3 bg-gradient-to-br from-[#38BDF8] via-[#6366F1] to-[#A855F7] px-4 py-4 text-white">
                <span aria-hidden className="pointer-events-none absolute -right-10 -top-12 h-36 w-36 rounded-full bg-white/15" />
                <span className="shrink-0 rounded-full bg-white/90 p-[3px]">
                  <Avatar name={username} color={meColor} size={58} />
                </span>
                <div className="relative min-w-0 flex-1">
                  <div className="truncate text-[19px] font-black leading-tight drop-shadow">{username}</div>
                  <div className="mt-1 inline-flex max-w-full truncate whitespace-nowrap rounded-full bg-white/20 px-2.5 py-0.5 text-[11.5px] font-bold backdrop-blur-sm">
                    📅 This week: {wk.length} {wk.length === 1 ? "post" : "posts"}
                  </div>
                </div>
                <Link href={`/profile/${encodeURIComponent(username)}`} className="relative shrink-0 rounded-full bg-white/20 px-3 py-1.5 text-[12px] font-extrabold backdrop-blur-sm transition active:scale-95">
                  ✏️ Profile
                </Link>
              </div>
              <div className="grid grid-cols-5 divide-x divide-[#ECEDF5] py-3 text-center">
                {([
                  [blogShort(posts.length), "Posts"],
                  [myFollowers === null ? "…" : blogShort(myFollowers), "Followers"],
                  [blogShort(followed.length), "Following"],
                  [blogShort(likes), "Likes"],
                  [blogShort(views), "Views"],
                ] as const).map(([n, label]) => (
                  <div key={label} className="min-w-0 px-0.5">
                    <div className="text-[17px] font-black text-[#1E1B4B]">{n}</div>
                    <div className="truncate text-[10.5px] font-semibold text-[#8A8FB0]">{label}</div>
                  </div>
                ))}
              </div>
              <div className="px-4 pb-4">
                <button
                  type="button"
                  onClick={() => setComposing(true)}
                  className="flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#38BDF8] via-[#6366F1] to-[#A855F7] text-[14px] font-extrabold text-white shadow-[0_10px_20px_-10px_rgba(99,102,241,.8)] transition active:scale-[.98]"
                >
                  ✍️ New post
                </button>
              </div>
            </section>
          );
        })()}
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
                  : tab === "following" && !author
                    ? user
                      ? "Follow members to see their posts here."
                      : "Log in to see the people you follow."
                    : "No posts here yet."}
            </p>
            {user && !author && tab !== "mine" && <p className="mt-1 text-sm">Be the first — tap “What's on your mind?”.</p>}
          </div>
        ) : (
          <div className="space-y-5 px-3.5">
            {posts.filter((p) => (media !== "photos" || !!(p.cover || p.firstImage)) && (cat === "all" || p.category === cat)).map((p) => (
              <FeedCard key={p.id} p={p} following={followed.includes(p.author)} canFollow={!!user && p.author !== username} onFollow={() => toggleFollow(p.author)} why={p.likes >= 10 ? "🔥 Trending" : tab === "new" ? "🆕 New" : ""} verified={verifiedAuthors.has(p.author)} roleBadge={authorBadge[p.author] || ""} rolePill={authorRole[p.author] || ""} roleImg={badgeImages[authorBadge[p.author] || ""] || ""} color={colorOf(p.author)} liked={liked.has(p.id)} reaction={reactOf[p.id] || (liked.has(p.id) ? "👍" : "")} onReact={(e) => react(p, e)} onLike={() => like(p)} onShare={() => setSharing(p)} onReactors={() => setReactorsOf(p)} saved={savedIds.has(p.id)} onSave={() => toggleSave(p)} />
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
// 🎨 D4-B + D4-D: every post is one big rounded card.
//  · a photo / video post fills the card; a text-only post becomes "Text Art"
//    (big words on a colour background picked from the post id)
//  · a glass bar on top: picture, name ✔, role · time, Follow
//  · the words and glass buttons (❤️ · 💬 · ↗ · 🔖) float on the bottom
const TEXT_ART: [string, string][] = [
  ["linear-gradient(135deg,#312E81,#7C3AED 55%,#DB2777)", "#FFFFFF"],
  ["linear-gradient(135deg,#0F172A,#1D4ED8 45%,#22D3EE)", "#FFFFFF"],
  ["linear-gradient(135deg,#FDE68A,#FDBA74)", "#7C2D12"],
  ["linear-gradient(135deg,#064E3B,#059669 50%,#A7F3D0)", "#FFFFFF"],
  ["linear-gradient(135deg,#BE185D,#F472B6 55%,#FBCFE8)", "#FFFFFF"],
  ["linear-gradient(135deg,#1E1B4B,#4338CA 50%,#A5B4FC)", "#FFFFFF"],
  ["linear-gradient(135deg,#FECACA,#FCA5A5 40%,#F472B6)", "#4C0519"],
  ["linear-gradient(135deg,#0C4A6E,#0EA5E9 55%,#BAE6FD)", "#FFFFFF"],
];
// ⬜ 8 = plain white (no colour): dark words on a clean white card
const PLAIN_BG = 8;
function textArtOf(id: string, bg = -1): [string, string] {
  if (bg === PLAIN_BG) return ["#FFFFFF", "#1E1B4B"];
  if (bg >= 0 && bg < TEXT_ART.length) return TEXT_ART[bg];
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return TEXT_ART[h % TEXT_ART.length];
}

function FeedCard({ p, color, liked, verified, why = "", roleBadge, rolePill = "", roleImg, reaction, onReact, onLike, onShare, onReactors, saved, onSave, following = false, canFollow = false, onFollow = () => {} }: { p: BlogPost; color: string; liked: boolean; verified: boolean; why?: string; roleBadge: string; rolePill?: string; roleImg: string; reaction: string; onReactors: () => void; onReact: (emoji: string) => void; onLike: () => void; onShare: () => void; saved: boolean; onSave: () => void; following?: boolean; canFollow?: boolean; onFollow?: () => void }) {
  const [pick, setPick] = useState(false);
  // ✨ the picked reaction flies up once
  const [fly, setFly] = useState<{ e: string; k: number } | null>(null);
  const holdRef = useRef<number | null>(null);
  const router = useRouter();
  // ❤️ each new like: the heart pops; a double tap on the card shows a big heart
  const [burst, setBurst] = useState(0);
  const [bigHeart, setBigHeart] = useState(0);
  const lastTap = useRef(0);
  const likeTap = () => {
    if (!liked) setBurst((n) => n + 1);
    onLike();
  };
  const pic = p.cover || p.firstImage;
  const media = !!(p.video || pic);
  const c = color || "#2563EB";
  const tr = useFeedTranslation(p.id);
  const open = () => router.push(`/feed/${p.id}`);
  const [viewing, setViewing] = useState(false);
  const text = tr?.text || p.excerpt;
  const [artBg, artInk] = textArtOf(p.id, p.bg);
  // short words get big letters; a long text gets normal ones
  const artSize = text.length <= 60 ? "text-[26px]" : text.length <= 140 ? "text-[21px]" : "text-[16px]";
  const role = rolePill && ROLE_PILLS[rolePill] ? ROLE_PILLS[rolePill][0] : "";
  // one tap opens the post; a quick second tap likes it with a big heart
  const tapCard = () => {
    const now = Date.now();
    if (now - lastTap.current < 320) {
      lastTap.current = 0;
      if (!liked) {
        setBurst((n) => n + 1);
        onLike();
      }
      setBigHeart((n) => n + 1);
      return;
    }
    lastTap.current = now;
    window.setTimeout(() => {
      if (lastTap.current === now) open();
    }, 330);
  };
  // ⬜ a plain white post: dark words and soft grey buttons instead of white glass
  const plain = !media && p.bg === PLAIN_BG;
  // ⚡ no live blur on each card (about 200 blurs on a long Feed made phones lag):
  // a see-through tint looks almost the same and costs nothing
  const glass = plain ? "bg-[#1E1B4B]/[0.06]" : "bg-white/[0.22]";
  return (
    <article
      className="relative overflow-hidden rounded-[28px] shadow-[0_22px_36px_-18px_rgba(40,50,120,.55)]"
      style={media ? { background: "#0F172A" } : plain ? { background: "#FFFFFF", boxShadow: "0 16px 32px -20px rgba(60,64,140,.5)" } : { background: artBg }}
    >
      {/* the picture / video, or the Text Art words */}
      <div onClick={tapCard} className="relative cursor-pointer select-none">
        {p.video ? (
          <video src={p.video} controls playsInline preload="metadata" onClick={(e) => e.stopPropagation()} className="block max-h-[560px] min-h-[360px] w-full bg-black object-cover" />
        ) : pic ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={pic} alt="" loading="lazy" className="block max-h-[560px] min-h-[380px] w-full object-cover" />
        ) : (
          <div className="flex min-h-[340px] items-center justify-center px-7 pb-24 pt-20 text-center">
            <p className={`whitespace-pre-line break-words font-extrabold leading-snug ${artSize} ${text.length > 140 ? "line-clamp-[9]" : ""}`} style={{ color: artInk, textShadow: artInk === "#FFFFFF" ? "0 2px 12px rgba(0,0,0,.25)" : "none" }}>
              <RichText text={text || "📷"} />
            </p>
          </div>
        )}
        {bigHeart > 0 && (
          <span key={bigHeart} aria-hidden className="feed-bigheart pointer-events-none absolute left-1/2 top-1/2 text-[96px]">
            ❤️
          </span>
        )}
        {/* soft dark fade so the white words and buttons can be read */}
        {media && <span aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-[62%] bg-gradient-to-t from-black/75 via-black/30 to-transparent" />}
        {!plain && <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/30 to-transparent" />}
      </div>

      {/* 🫧 glass bar on top: who wrote it */}
      <div className={`absolute left-3 right-3 top-3 flex items-center gap-2 rounded-full py-1.5 pl-1.5 pr-1.5 ${plain ? "text-[#1E1B4B]" : "text-white"} ${glass}`}>
        <Link href={`/profile/${encodeURIComponent(p.author)}`} onClick={(e) => e.stopPropagation()} className="shrink-0 rounded-full border-2 border-white/90">
          <Avatar name={p.author} color={c} size={34} />
        </Link>
        <div className="min-w-0 flex-1 leading-tight">
          <div className="flex min-w-0 items-center gap-1">
            <span data-notranslate className="truncate text-[14px] font-extrabold drop-shadow">
              {p.author}
            </span>
            {verified && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src="/icons/miglife-verified.svg" alt="Verified" title="Verified" className="h-[15px] w-[15px] shrink-0" />
            )}
            {!role &&
              (roleImg ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={roleImg} alt="" title="Role badge" className="h-4 w-4 shrink-0 rounded-full object-cover" />
              ) : roleBadge ? (
                <span className="shrink-0 text-[12px] leading-none">{roleBadge}</span>
              ) : null)}
          </div>
          <div className={`truncate text-[11px] font-semibold ${plain ? "text-[#7C82A6]" : "text-white/85"}`}>
            {role ? `${role} · ` : ""}
            {blogAgoBn(p.createdMs)}
            {why && <span className="sr-only"> {why}</span>}
          </div>
        </div>
        {canFollow && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onFollow();
            }}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-[12px] font-extrabold transition active:scale-95 ${following ? (plain ? "bg-[#EEF0F7] text-[#3B4266]" : "bg-white/25 text-white") : plain ? "bg-gradient-to-r from-[#6366F1] to-[#A855F7] text-white" : "bg-[#FFFFFF] text-[#4F46E5]"}`}
          >
            {following ? "Following" : "+ Follow"}
          </button>
        )}
      </div>

      {/* the words (photo posts) and the glass buttons, floating on the bottom */}
      <div className={`absolute inset-x-0 bottom-0 px-4 pb-3.5 ${plain ? "text-[#1E1B4B]" : "text-white"}`} onClick={(e) => e.stopPropagation()}>
        {media && text && (
          <p onClick={open} className="mb-2.5 line-clamp-3 cursor-pointer text-[14.5px] font-semibold leading-snug drop-shadow">
            <RichText text={text} />
          </p>
        )}
        {p.sharedId && (
          <button type="button" onClick={() => router.push(`/feed/${p.sharedId}`)} className={`mb-2.5 block w-full rounded-2xl p-2.5 text-left ${glass}`}>
            <span className="block text-[11.5px] font-bold text-white/85">↗ {p.sharedAuthor}</span>
            <span className="mt-0.5 line-clamp-2 block text-[13px] font-bold">{p.sharedTitle}</span>
          </button>
        )}
        <div className="flex items-center gap-2">
          <div className="relative">
            {fly && (
              <span key={fly.k} className="feed-fly pointer-events-none absolute bottom-12 left-3 z-30 text-[24px]">
                {fly.e}
              </span>
            )}
            {pick && (
              // 😀 the six reactions: tap one (tap the same again to take it back)
              <div className="absolute bottom-12 left-0 z-20 flex gap-1 rounded-full bg-[#FFFFFF] px-2 py-1 shadow-[0_8px_20px_-6px_rgba(16,63,145,.45)]">
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
              aria-label={liked ? "Unlike" : "Like"}
              className={`relative flex h-10 items-center gap-1.5 rounded-full px-3.5 text-[13.5px] font-extrabold transition active:scale-95 ${liked ? (plain ? "bg-[#FFE4EC] text-[#E11D48]" : "bg-[#FFFFFF] text-[#E11D48]") : glass}`}
            >
              {burst > 0 &&
                ["❤️", "💖", "✨", "💕"].map((h, i) => (
                  <span key={`${burst}-${i}`} aria-hidden className="feed-burst" style={{ ["--x" as string]: `${(i - 1.5) * 26}px` }}>
                    {h}
                  </span>
                ))}
              <span key={burst} className={`flex items-center gap-1.5 ${burst > 0 ? "feed-pop" : ""}`}>
                {liked ? reaction || "❤️" : "🤍"}
              </span>
            </button>
          </div>
          {p.likes > 0 && (
            <button type="button" onClick={onReactors} aria-label="See who reacted" className="-ml-1 text-[13px] font-extrabold drop-shadow">
              {blogShort(p.likes)}
            </button>
          )}
          <button type="button" onClick={open} aria-label="Comments" className={`flex h-10 items-center gap-1.5 rounded-full px-3.5 text-[13.5px] font-extrabold transition active:scale-95 ${glass}`}>
            💬 {blogShort(p.comments)}
          </button>
          <button type="button" onClick={onShare} aria-label="Share" className={`flex h-10 w-10 items-center justify-center rounded-full text-[15px] font-black transition active:scale-95 ${glass}`}>
            ↗
          </button>
          <span className={`ml-auto text-[11.5px] font-bold ${plain ? "text-[#8A8FB0]" : "text-white/80 drop-shadow"}`}>👁 {blogShort(p.views)}</span>
          <button type="button" onClick={onSave} aria-pressed={saved} aria-label={saved ? "Unsave" : "Save"} className={`flex h-10 w-10 items-center justify-center rounded-full text-[15px] transition active:scale-95 ${saved ? (plain ? "bg-[#FFF4D6]" : "bg-[#FFFFFF]") : glass}`}>
            🔖
          </button>
        </div>
      </div>

      {media && pic && !p.video && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setViewing(true);
          }}
          aria-label="See the full picture"
          className={`absolute right-3 top-[62px] flex h-8 w-8 items-center justify-center rounded-full text-[13px] text-white ${glass}`}
        >
          ⤢
        </button>
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
    </article>
  );
}
