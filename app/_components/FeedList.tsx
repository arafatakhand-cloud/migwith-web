"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, doc, documentId, getDoc, getDocs, limit, onSnapshot, orderBy, query, where, getCountFromServer, startAfter, type QueryDocumentSnapshot } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useCurrentUser } from "../../lib/useCurrentUser";
import { setFollowing, useFollowing } from "../../lib/follow";
import { useFriends } from "../../lib/privateChat";
import { cachedPhotoOf, useSenderColors } from "../../lib/senderColors";
import { useBadgeImages } from "../../lib/badgeImages";
import { StoryDialog, StoryRow } from "./StoryRow";
import { FeedSearch } from "./FeedSearch";
import { STORIES_CHANGED } from "../../lib/stories";
import { roleBadgesForDoc } from "../../lib/rooms";
import { uploadChatImage, uploadThumb } from "../../lib/imageUpload";
import { placeHere, searchPlaces, type Place } from "../../lib/places";
import { MigView } from "./MigView";
import { ReactorsSheet } from "./ReactorsSheet";
import { PollBox } from "./PollBox";
import { openReport } from "./ReportDialog";
import { PhotoCropDialog } from "./PhotoCropDialog";
import { uploadBlogVideo } from "../../lib/videoUpload";
import { PageTitle } from "./LightCards";
import { TranslateChip, TranslateLink, useFeedTranslateToggle, useFeedTranslation } from "./FeedTranslate";
import {
  blogAgoBn,
  blogPrivacyLabel,
  BLOG_PRIVACY,
  BLOG_MOODS,
  blogMood,
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
const TAB_LOOK: "pills" | "underline" | "icons" = "pills"; // design A: blue pill for the chosen tab
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
  country_representative: ["Country Rep", "#FBEEDB", "#9E6011"],
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
  const [tab, setTab] = useState<Tab>("new");
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
  // ⚡ 12 posts at first; the next 12 only when you scroll near the bottom
  // (Popular / New fetch the next page from the server; the other tabs show more of their list)
  const FEED_PAGE = 12;
  const [visible, setVisible] = useState(FEED_PAGE);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const lastSnap = useRef<QueryDocumentSnapshot | null>(null);
  // ✔ authors whose users document says verified (read-only; miGlife sets it)
  const [verifiedAuthors, setVerifiedAuthors] = useState<Set<string>>(new Set());
  // 🏅 each author's role badge emoji (users.role etc.), shown as the app's picture
  const [authorBadge, setAuthorBadge] = useState<Record<string, string>>({});
  const [authorRole, setAuthorRole] = useState<Record<string, string>>({});
  const badgeImages = useBadgeImages(!!user);
  useEffect(() => {
    // (my own name too: the ✔ on my wall card shows even before I post)
    const names = [...new Set([...(posts || []).map((p) => p.author), ...(username ? [username] : [])])];
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
  }, [posts, username]);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [ind, setInd] = useState<{ left: number; width: number } | null>(null);
  useLayoutEffect(() => {
    // the white pill follows the chosen tab, also when the window is resized
    // (none for 🔖 Saved, which opens from the Mine card)
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
  // 🖼 the picked files (by their uploaded link), so a photo can be edited later;
  // which photo is being changed / edited
  const cfilesRef = useRef<Record<string, File>>({});
  const [cswapAt, setCswapAt] = useState(-1);
  const [ceditAt, setCeditAt] = useState(-1);
  const cswapRef = useRef<HTMLInputElement>(null);
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
  // 😊 my mood for this post ("" = none): "mahin is 😊 happy"
  const [cmood, setCmood] = useState("");
  // 📊 a poll in the writer (null = none): the text is the question
  const [cpoll, setCpoll] = useState<{ options: string[]; days: 1 | 3 | 7; multi: boolean } | null>(null);
  // @ mention: while you type "@ab", suggest your friends whose name starts with it
  const mentionMatch = ctext.match(/@([A-Za-z0-9_.\-]{0,20})$/);
  const mentionSuggest = mentionMatch
    ? friends.filter((f) => f.toLowerCase().startsWith(mentionMatch[1].toLowerCase()) && f.toLowerCase() !== mentionMatch[1].toLowerCase()).slice(0, 6)
    : [];
  const pickMention = (name: string) => setCtext((t) => t.replace(/@[A-Za-z0-9_.\-]{0,20}$/, `@${name} `));
  const [ccatOpen, setCcatOpen] = useState(false);
  // 🔒 who can see the new post: '' = 🌍 Everyone, 'friends', 'me'
  const [cpriv, setCpriv] = useState<"" | "friends" | "me">("");
  const [cprivOpen, setCprivOpen] = useState(false);
  // 📍 where I am (optional) and its picker
  const [cplace, setCplace] = useState<Place | null>(null);
  const [cplaceOpen, setCplaceOpen] = useState(false);
  const [cplaceQ, setCplaceQ] = useState("");
  const [cplaceBusy, setCplaceBusy] = useState("");
  // ✏️ the post being edited here (null = a new post)
  const [cedit, setCedit] = useState<BlogPost | null>(null);
  // 📝 the unsent post is kept on this device and comes back when the writer opens
  const draftKey = user ? `migwith.feedInlineDraft.${user.uid}` : "";
  const [cdraftNote, setCdraftNote] = useState(false);
  const [closeAsk, setCloseAsk] = useState(false);
  const cvideoRef = useRef<HTMLInputElement>(null);
  const cfileRef = useRef<HTMLInputElement>(null);
  const ctextRef = useRef<HTMLTextAreaElement>(null);
  // 🎨 the Text Art colour for a words-only post (a fresh random one each time the writer opens)
  const [cbg, setCbg] = useState(0);
  const cbgKeep = useRef<number | null>(null); // a post brought back keeps its colour
  useEffect(() => {
    if (!composing) return setCdraftNote(false);
    if (cbgKeep.current !== null) {
      // a post brought back / being edited keeps its colour
      setCbg(cbgKeep.current);
      cbgKeep.current = null;
      return;
    }
    setCbg(PLAIN_BG); // plain white first; tap a colour to change
    // 📝 bring back the draft (only into an empty writer)
    if (cedit || !draftKey || ctext.trim() || cphotos.length || cvideo) return;
    try {
      const d = JSON.parse(localStorage.getItem(draftKey) || "null") as {
        text?: string; photos?: string[]; video?: string; cat?: string; bg?: number; priv?: "" | "friends" | "me"; place?: Place | null; mood?: string;
      } | null;
      if (!d || !(d.text || d.photos?.length || d.video)) return;
      setCtext(d.text || "");
      setCphotos(Array.isArray(d.photos) ? d.photos.slice(0, 10) : []);
      setCvideo(d.video || "");
      if (d.cat) setCcat(d.cat);
      if (typeof d.bg === "number") setCbg(d.bg);
      setCpriv(d.priv || "");
      setCplace(d.place && d.place.name ? d.place : null);
      setCmood(d.mood || "");
      setCdraftNote(true);
    } catch {
      // no draft
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [composing]);
  // 📝 keep the unsent post on this device while I write (not while editing a post)
  useEffect(() => {
    if (!composing || cedit || !draftKey) return;
    const t = window.setTimeout(() => {
      try {
        if (!ctext.trim() && !cphotos.length && !cvideo) localStorage.removeItem(draftKey);
        else localStorage.setItem(draftKey, JSON.stringify({ text: ctext, photos: cphotos, video: cvideo, cat: ccat, bg: cbg, priv: cpriv, place: cplace, mood: cmood }));
      } catch {
        // storage full / blocked
      }
    }, 500);
    return () => window.clearTimeout(t);
  }, [composing, cedit, draftKey, ctext, cphotos, cvideo, ccat, cbg, cpriv, cplace, cmood]);
  const clearWriter = () => {
    setCtext("");
    setCphotos([]);
    setCvideo("");
    setCplace(null);
    setCmood("");
    setCpoll(null);
    setCpriv("");
    setCerr("");
    setCdraftNote(false);
  };
  const dropDraft = () => {
    try {
      if (draftKey) localStorage.removeItem(draftKey);
    } catch {
      // blocked
    }
  };
  // ✕: an edit just closes; a new post with something in it asks keep / discard
  const closeWriter = () => {
    if (cedit) {
      clearWriter();
      setCedit(null);
      return setComposing(false);
    }
    if (ctext.trim() || cphotos.length || cvideo) return setCloseAsk(true);
    setComposing(false);
  };
  // ✏️ open one of my posts in this writer
  const startEdit = (p: BlogPost) => {
    const lines = p.body.split("\n");
    const img = /^!\[\]\(([^)\s]+)\)$/;
    const inBody = lines.map((l) => l.trim().match(img)?.[1] || "").filter(Boolean);
    setCtext(lines.filter((l) => !img.test(l.trim())).join("\n").trim());
    setCphotos([...(p.cover ? [p.cover] : []), ...inBody].slice(0, 10));
    setCvideo(p.video);
    setCcat(p.category);
    setCpriv(p.privacy);
    setCplace(p.place ? { name: p.place, sub: p.placeSub, icon: "📍" } : null);
    setCmood(p.mood);
    setCerr("");
    setCdraftNote(false);
    cbgKeep.current = p.bg >= 0 ? p.bg : PLAIN_BG;
    setCedit(p);
    setComposing(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  // the post page's ✏️ Edit and 📍 place link come here through this tab's memory
  const [placeView, setPlaceView] = useState("");
  useEffect(() => {
    if (!user || author) return;
    let want = "";
    let place = "";
    try {
      want = sessionStorage.getItem("migwith.feedEdit") || "";
      place = sessionStorage.getItem("migwith.feedPlace") || "";
      sessionStorage.removeItem("migwith.feedEdit");
      sessionStorage.removeItem("migwith.feedPlace");
    } catch {
      // blocked
    }
    if (place) setPlaceView(place);
    if (!want) return;
    (async () => {
      const pub = await getDoc(doc(db, "blog_posts", want)).catch(() => null);
      if (pub && pub.exists()) return toBlogPost(pub.id, pub.data() as Record<string, unknown>);
      const r = await blogCall("getPost", { postId: want }).catch(() => null);
      const x = (r?.post || null) as Record<string, unknown> | null;
      return x ? toBlogPost(want, x) : null;
    })().then((p) => p && p.authorUid === user.uid && startEdit(p));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, author]);
  const cupload = async (files: FileList | null) => {
    if (!files?.length || !user) return;
    const room = 10 - cphotos.length;
    if (room <= 0) return setCerr("A Mig can have up to 10 photos.");
    setCerr("");
    setCbusy(true);
    try {
      for (const f of Array.from(files).slice(0, room)) {
        const url = await uploadChatImage(`room_images/blog_${user.uid}`, f);
        cfilesRef.current[url] = f;
        setCphotos((p) => [...p, url].slice(0, 10));
      }
    } catch (e) {
      setCerr(blogError(e));
    } finally {
      setCbusy(false);
    }
  };
  // 🔄 put a new / edited picture in place of photo number i
  const creplace = async (i: number, f: File) => {
    if (!user || i < 0) return;
    setCerr("");
    setCbusy(true);
    try {
      const url = await uploadChatImage(`room_images/blog_${user.uid}`, f);
      cfilesRef.current[url] = f;
      setCphotos((p) => p.map((u, j) => (j === i ? url : u)));
    } catch (e) {
      setCerr(blogError(e));
    } finally {
      setCbusy(false);
    }
  };
  // ↶ Undo: a post waits 5 seconds before it is sent, and can be taken back in that time
  const [undoable, setUndoable] = useState(false);
  const undoRef = useRef<{ id: number; restore: () => void } | null>(null);
  const sendPost = async (p: { text: string; photos: string[]; video: string; category: string; bg: number; privacy: "" | "friends" | "me"; place: Place | null; mood: string; poll?: { options: string[]; days: number; multi: boolean } | null }) => {
    // no title box: the title is the first line of the text
    const first = p.text.trim().split("\n")[0].slice(0, 60);
    const title = first.length >= 3 ? first : first ? `${first}...` : "📷 Photo";
    const [cover = "", ...rest] = p.photos;
    const body = [p.text.trim(), ...rest.map((u) => `![](${u})`)].filter(Boolean).join("\n\n") || "📷";
    setCbusy(true);
    try {
      // the colour only matters for a words-only post
      // 🪶 a small copy of the cover for the Feed list (the viewer keeps the full photo)
      const coverFile = cover ? cfilesRef.current[cover] : undefined;
      const thumb = coverFile && user ? await uploadThumb(`room_images/blog_${user.uid}`, coverFile) : "";
      await blogCall("create", { title, body, cover, category: p.category, video: p.video, ...(thumb ? { thumb } : {}), ...(p.privacy ? { privacy: p.privacy } : {}), ...(p.place ? { place: p.place.name, placeSub: p.place.sub } : {}), ...(p.mood ? { mood: p.mood } : {}), ...(p.poll ? { poll: p.poll } : {}), ...(cover || p.video ? {} : { bg: p.bg }) });
      setToast("Migged ✓");
      setReload((n) => n + 1);
      window.setTimeout(() => setToast(""), 2200);
    } catch (e) {
      // the post did not go: bring the text back so nothing is lost
      setCtext(p.text);
      setCphotos(p.photos);
      setCvideo(p.video);
      setCcat(p.category);
      setCpriv(p.privacy);
      setCplace(p.place);
      setCmood(p.mood);
      setCpoll(p.poll ? { options: p.poll.options, days: (p.poll.days as 1 | 3 | 7) || 3, multi: p.poll.multi } : null);
      cbgKeep.current = p.bg;
      setComposing(true);
      setCerr(blogError(e));
    } finally {
      setCbusy(false);
    }
  };
  // ✏️ save the post I am editing
  const saveEdit = async () => {
    if (!cedit || cbusy) return;
    setCerr("");
    if (!ctext.trim() && cphotos.length === 0 && !cvideo) return setCerr("Write something or add a photo.");
    const first = ctext.trim().split("\n")[0].slice(0, 60);
    const title = first.length >= 3 ? first : first ? `${first}...` : "📷 Photo";
    const [cover = "", ...rest] = cphotos;
    const body = [ctext.trim(), ...rest.map((u) => `![](${u})`)].filter(Boolean).join("\n\n") || "📷";
    setCbusy(true);
    try {
      const coverFile = cover && cover !== cedit.cover ? cfilesRef.current[cover] : undefined;
      const thumb = coverFile && user ? await uploadThumb(`room_images/blog_${user.uid}`, coverFile) : "";
      await blogCall("edit", {
        postId: cedit.id, title, body, cover, category: ccat,
        place: cplace?.name || "", placeSub: cplace?.sub || "", mood: cmood,
        ...(thumb ? { thumb } : {}), ...(cover || cvideo ? {} : { bg: cbg }),
      });
      clearWriter();
      setCedit(null);
      setComposing(false);
      setToast("Saved ✓");
      setReload((n) => n + 1);
      window.setTimeout(() => setToast(""), 2200);
    } catch (e) {
      setCerr(blogError(e));
    } finally {
      setCbusy(false);
    }
  };
  const publishInline = () => {
    setCerr("");
    if (!ctext.trim() && cphotos.length === 0 && !cvideo) return setCerr("Write something or add a photo.");
    // 📊 a poll: the text is the question, and it needs 2 answers or more
    const pollOpts = cpoll ? cpoll.options.map((o) => o.trim()).filter(Boolean) : [];
    if (cpoll && !ctext.trim()) return setCerr("Write the poll question first.");
    if (cpoll && pollOpts.length < 2) return setCerr("A poll needs at least 2 answers.");
    const poll = cpoll ? { options: pollOpts, days: cpoll.days, multi: cpoll.multi } : null;
    const payload = { text: ctext, photos: cphotos, video: cvideo, category: ccat, bg: cbg, privacy: cpriv, place: cplace, mood: cmood, poll };
    clearWriter();
    dropDraft();
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
        setCpriv(payload.privacy);
        setCplace(payload.place);
        setCmood(payload.mood);
        setCpoll(payload.poll ? { options: payload.poll.options, days: payload.poll.days, multi: payload.poll.multi } : null);
        cbgKeep.current = payload.bg;
        setComposing(true);
        setToast("Mig taken back");
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
    // 💾 the last first page of Popular / New shows at once (then the fresh one replaces it)
    const cacheKey = !author && (tab === "popular" || tab === "new") ? `migwith.feedCache.${tab}` : "";
    let cached: BlogPost[] | null = null;
    try {
      const raw = cacheKey ? localStorage.getItem(cacheKey) : null;
      if (raw) cached = JSON.parse(raw) as BlogPost[];
    } catch {
      cached = null;
    }
    setPosts(cached && cached.length ? cached : null);
    setError("");
    setFresh(0);
    setVisible(FEED_PAGE);
    setHasMore(false);
    lastSnap.current = null;
    const col = collection(db, "blog_posts");
    const load = async (): Promise<BlogPost[]> => {
      const map = (s: Awaited<ReturnType<typeof getDocs>>) => s.docs.map((d) => toBlogPost(d.id, d.data() as Record<string, unknown>));
      if (author) return map(await getDocs(query(col, where("author", "==", author), limit(100)))).sort((a, b) => b.createdMs - a.createdMs);
      // 📍 every Everyone post written at one place
      if (placeView) return map(await getDocs(query(col, where("place", "==", placeView), limit(60)))).sort((a, b) => b.createdMs - a.createdMs);
      if (tab === "popular" || tab === "new") {
        const snap = await getDocs(query(col, orderBy(tab === "popular" ? "hot" : "createdMs", "desc"), limit(FEED_PAGE)));
        lastSnap.current = (snap.docs[snap.docs.length - 1] as QueryDocumentSnapshot) || null;
        if (alive) setHasMore(snap.size >= FEED_PAGE);
        const first = map(snap);
        try {
          localStorage.setItem(cacheKey, JSON.stringify(first));
        } catch {
          // storage full / blocked
        }
        return first;
      }
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
    // 🔒 the 👥 Friends / 🔒 Only me posts I may see come from the server and join the list
    const withPrivate = async (p: BlogPost[]): Promise<BlogPost[]> => {
      if (!user || placeView || !(author || tab === "new" || tab === "friends" || tab === "mine")) return p;
      try {
        const r = await blogCall("privateFeed", { scope: tab === "mine" && !author ? "mine" : "all", author: author || "" });
        let extra = (Array.isArray(r.posts) ? (r.posts as Record<string, unknown>[]) : []).map((x) => toBlogPost(String(x.id), x));
        if (tab === "friends" && !author) extra = extra.filter((x) => x.authorUid !== user.uid);
        // New: only the ones that belong among the posts loaded so far
        if (tab === "new" && !author && p.length >= FEED_PAGE) {
          const oldest = p[p.length - 1]?.createdMs || 0;
          extra = extra.filter((x) => x.createdMs >= oldest);
        }
        const have = new Set(p.map((x) => x.id));
        return [...p, ...extra.filter((x) => !have.has(x.id))].sort((a, b) => b.createdMs - a.createdMs);
      } catch {
        return p; // an older server: Everyone posts only
      }
    };
    load()
      .then(withPrivate)
      .then((p) => {
        if (!alive) return;
        setPosts(p);
        if (author || placeView || (tab !== "popular" && tab !== "new")) setHasMore(p.length > FEED_PAGE);
      })
      .catch(() => alive && (setError("Couldn't load the Feed. Please try again."), setPosts([])));
    return () => {
      alive = false;
    };
  }, [tab, author, user, friendsKey, followedKey, reload, placeView]);

  // 📄 the posts shown now (Popular / New: all loaded pages; other tabs: the first `visible`)
  const paged = !author && !placeView && (tab === "popular" || tab === "new");
  const shown = posts ? (paged ? posts : posts.slice(0, visible)) : null;
  const loadMore = async () => {
    if (loadingMore || !hasMore || !posts) return;
    if (!paged) {
      setVisible((v) => v + FEED_PAGE);
      setHasMore(posts.length > visible + FEED_PAGE);
      return;
    }
    const after = lastSnap.current;
    if (!after) return setHasMore(false);
    const openTab = tab;
    setLoadingMore(true);
    try {
      const snap = await getDocs(query(collection(db, "blog_posts"), orderBy(openTab === "popular" ? "hot" : "createdMs", "desc"), startAfter(after), limit(FEED_PAGE)));
      if (openTab !== tab) return;
      lastSnap.current = (snap.docs[snap.docs.length - 1] as QueryDocumentSnapshot) || after;
      setHasMore(snap.size >= FEED_PAGE);
      const more = snap.docs.map((d) => toBlogPost(d.id, d.data() as Record<string, unknown>));
      setPosts((cur) => {
        const have = new Set((cur || []).map((p) => p.id));
        return [...(cur || []), ...more.filter((p) => !have.has(p.id))];
      });
    } catch {
      setHasMore(false);
    } finally {
      setLoadingMore(false);
    }
  };
  // ⬇ near the bottom, the next 12 come by themselves
  const moreRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = moreRef.current;
    if (!el || !hasMore) return;
    const io = new IntersectionObserver((e) => e.some((x) => x.isIntersecting) && void loadMore(), { rootMargin: "600px 0px" });
    io.observe(el);
    return () => io.disconnect();
  });

  // 🔴 live counts: the posts on screen are watched (10 per listener, the
  // first 40), so likes / reactions / comments / views never go stale — the
  // list is loaded once, and it showed "😢 4" while the Mig itself had 6.
  const liveIds = (shown || []).filter((p) => !p.privacy).slice(0, 40).map((p) => p.id).join(",");
  useEffect(() => {
    if (!liveIds) return;
    const list = liveIds.split(",");
    const offs: (() => void)[] = [];
    for (let i = 0; i < list.length; i += 10) {
      offs.push(
        onSnapshot(
          query(collection(db, "blog_posts"), where(documentId(), "in", list.slice(i, i + 10))),
          (snap) => {
            const fresh = new Map(snap.docs.map((d) => [d.id, toBlogPost(d.id, d.data() as Record<string, unknown>)]));
            setPosts((cur) =>
              cur
                ? cur.map((p) => {
                    const f = fresh.get(p.id);
                    return f && (f.likes !== p.likes || f.comments !== p.comments || f.views !== p.views || JSON.stringify(f.reactions) !== JSON.stringify(p.reactions) || JSON.stringify(f.poll) !== JSON.stringify(p.poll))
                      ? { ...p, likes: f.likes, reactions: f.reactions, comments: f.comments, views: Math.max(f.views, p.views), poll: f.poll ?? p.poll }
                      : p;
                  })
                : cur
            );
          },
          () => {}
        )
      );
    }
    return () => offs.forEach((f) => f());
  }, [liveIds]);

  // my reactions for the posts on screen — one call (an older server: one read per post)
  const ids = (shown || []).map((p) => p.id).join(",");
  const privIds = (shown || []).filter((p) => p.privacy).map((p) => p.id).join(",");
  useEffect(() => {
    if (!user || !ids) return setLiked(new Set());
    let alive = true;
    const list = ids.split(",");
    blogCall("myReactions", { postIds: list, privateIds: privIds ? privIds.split(",") : [] })
      .then((r) => {
        if (!alive) return;
        const got = (r as { reactions?: Record<string, string> }).reactions || {};
        setLiked(new Set(Object.keys(got)));
        setReactOf((m) => ({ ...m, ...got }));
      })
      .catch(() =>
        Promise.all(
          list.map((id) =>
            getDoc(doc(db, "blog_posts", id, "likes", user.uid))
              .then((s) => (s.exists() ? id : ""))
              .catch(() => "")
          )
        ).then((r) => alive && setLiked(new Set(r.filter(Boolean))))
      );
    return () => {
      alive = false;
    };
  }, [ids, privIds, user]);
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
      if (navigator.share) await navigator.share({ title: p.title, text: `📰 ${p.title} — a Mig by ${p.author} on miGlife`, url });
      else {
        await navigator.clipboard.writeText(url);
        setToast("Link copied ✓");
      }
    } catch {
      // closed the share sheet
    }
  };

  // 🔒 change who can see one of my Migs, from its card
  const setMigPrivacy = async (p: BlogPost, k: "" | "friends" | "me") => {
    setPosts((cur) => (cur ? cur.map((x) => (x.id === p.id ? { ...x, privacy: k } : x)) : cur));
    try {
      await blogCall("setPrivacy", { postId: p.id, privacy: k || "everyone" });
      setToast(`Now: ${blogPrivacyLabel(k)}`);
    } catch (e) {
      setPosts((cur) => (cur ? cur.map((x) => (x.id === p.id ? { ...x, privacy: p.privacy } : x)) : cur));
      setToast(blogError(e));
    }
    window.setTimeout(() => setToast(""), 2200);
  };
  // 🗑 delete one of my Migs from its card
  const deleteMig = async (p: BlogPost) => {
    if (!confirm("Delete this Mig?")) return;
    setPosts((cur) => (cur ? cur.filter((x) => x.id !== p.id) : cur));
    try {
      await blogCall("delete", { postId: p.id });
      setToast("Mig deleted");
    } catch (e) {
      setToast(blogError(e));
      setReload((n) => n + 1);
    }
    window.setTimeout(() => setToast(""), 2200);
  };
  // 🫧 X2: a Mig opens in a sheet from the bottom (pull it down, ✕ or Back closes it)
  const [sheetId, setSheetId] = useState("");
  const [searching, setSearching] = useState(false); // 🔍 the search page
  const openSheet = (id: string) => {
    setSheetId(id);
    try {
      window.history.pushState({ migSheet: id }, "");
    } catch {
      // no history
    }
  };
  const closeSheet = () => {
    if (!sheetId) return;
    // the Back step we added goes too (popstate below clears the sheet)
    if ((window.history.state as { migSheet?: string } | null)?.migSheet) window.history.back();
    else setSheetId("");
  };
  useEffect(() => {
    const onPop = () => setSheetId("");
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  useEffect(() => {
    if (!sheetId) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [sheetId]);
  const meColor = colorOf(username) || "#2563EB";
  // 👤 Mine = only my own wall and my posts (no stories, tabs or writer box)
  const mineOnly = (!author && !!user && (tab === "mine" || tab === "saved")) || (!author && !!placeView);
  return (
    <div className="relative -mb-8 min-h-[calc(100dvh-60px)] overflow-hidden bg-[#F4F4F8]">
      <section className="relative mx-auto max-w-2xl pb-10">
        {author ? (
          <div className="px-3 sm:px-6">
            <PageTitle title={`${author}'s Feed`} subtitle="Every Mig by this writer" icon="📰" backHref={`/profile/${encodeURIComponent(author)}`} />
          </div>
        ) : (
          // 🎨 design A: gradient header band
          <div className="mb-1 flex items-center justify-between px-5 pb-2 pt-4">
            {mineOnly ? (
              <button
                type="button"
                onClick={() => (placeView ? setPlaceView("") : setTab(tab === "saved" ? "mine" : "new"))}
                aria-label="Back to the Feed"
                className="flex min-w-0 items-center gap-2.5 text-[#1E1B4B] transition active:scale-95"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#FFFFFF] text-[18px] font-black shadow-[0_6px_14px_-8px_rgba(60,64,140,.55)]">←</span>
                <span className="truncate text-[22px] font-black tracking-tight">{placeView ? `📍 ${placeView}` : tab === "saved" ? "🔖 Saved Migs" : "My Migs"}</span>
              </button>
            ) : (
              <h1 className="bg-gradient-to-r from-[#F59E0B] via-[#EC4899] to-[#8B5CF6] bg-clip-text pr-1 font-serif text-[30px] font-black italic tracking-tight text-transparent">miGlife</h1>
            )}
            {user && !mineOnly && (
              <div className="flex items-center gap-2.5">
                {/* 🔍 search Migs, people and places */}
                <button
                  type="button"
                  onClick={() => setSearching(true)}
                  aria-label="Search"
                  title="Search"
                  className="flex h-[38px] w-[38px] items-center justify-center rounded-full text-[21px] transition hover:bg-[#EEF0F8] active:scale-95"
                >
                  🔍
                </button>
                {/* 👤 my picture → my own posts (the Mine tab) */}
                <button type="button" onClick={() => setTab("mine")} aria-label="My Migs" title="My Migs" className="rounded-full transition active:scale-95">
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
                    ? "bg-[#2563EB] text-white shadow-[0_8px_16px_-8px_rgba(37,99,235,.9)]"
                    : "bg-[#FFFFFF] text-[#4B5072] shadow-[0_4px_12px_-8px_rgba(60,64,140,.5)]"
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
            <div className="mx-3.5 mb-4 mt-1 rounded-[26px] bg-[#FFFFFF] p-3.5 shadow-[0_8px_16px_-12px_rgba(60,64,140,.45)]">
              <div className="flex items-center gap-2.5">
                <Avatar name={username} color={meColor} size={42} ring />
                <div className="min-w-0 flex-1">
                  <div className="text-[15px] font-black leading-snug text-[#1E1B4B]">
                    {username}
                    {/* 😊 M1: "mahin is 😊 happy" — tap to change, ✕ to take it off */}
                    {blogMood(cmood) && (
                      <span className="font-semibold text-[#4B4F7A]">
                        {" "}
                        <button type="button" onClick={() => setCmoodOpen(true)}>
                          is {blogMood(cmood)![0]} <b className="font-black text-[#1E1B4B]">{blogMood(cmood)![1]}</b>
                        </button>
                        <button type="button" onClick={() => setCmood("")} aria-label="Remove mood" className="ml-1 text-[12px] font-black text-[#A0A6C2]">
                          ✕
                        </button>
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 text-[12px] font-semibold text-[#8A8FB0]">
                    <button
                      type="button"
                      disabled={!!cedit}
                      title={cedit ? "Change it from the Mig's ⋯ menu" : undefined}
                      onClick={() => {
                        setCprivOpen((v) => !v);
                        setCcatOpen(false);
                        setCmoodOpen(false);
                      }}
                      className="rounded-full bg-[#F1F2F8] px-2 py-0.5 font-extrabold text-[#4B4F7A]"
                    >
                      {blogPrivacyLabel(cpriv)} ▾
                    </button>
                    ·
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
                  {cplace && (
                    <span className="mt-1 inline-flex max-w-full items-center gap-1 rounded-full bg-gradient-to-r from-[#FFE4E6] to-[#FCE7F3] px-2.5 py-0.5 text-[12px] font-extrabold text-[#BE185D]">
                      <button type="button" onClick={() => setCplaceOpen(true)} className="truncate">
                        📍 {cplace.name}
                        {cplace.sub ? <span className="font-semibold text-[#BE185D]/70">, {cplace.sub.split(",")[0]}</span> : null}
                      </button>
                      <button type="button" onClick={() => setCplace(null)} aria-label="Remove place" className="pl-0.5 font-black">
                        ✕
                      </button>
                    </span>
                  )}
                </div>
                <button type="button" onClick={closeWriter} aria-label="Close" className="flex h-9 w-9 items-center justify-center rounded-full bg-[#F1F2F8] text-[14px] font-black text-[#6B6F9A]">
                  ✕
                </button>
              </div>
              {cedit && (
                <div className="mt-2.5 rounded-xl bg-[#EEF0FF] px-3 py-1.5 text-[12.5px] font-bold text-[#4F46E5]">✏️ Editing your Mig — change it and tap Save ✓</div>
              )}
              {cdraftNote && !cedit && (
                <div className="mt-2.5 flex items-center justify-between rounded-xl bg-[#FFF7E6] px-3 py-1.5 text-[12.5px] font-bold text-[#B45309]">
                  <span>📝 Your draft is back</span>
                  <button type="button" onClick={() => (clearWriter(), dropDraft())} className="font-extrabold text-[#DC2626]">
                    Discard
                  </button>
                </div>
              )}
              {closeAsk && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#0B1F3A]/40 p-4" onClick={() => setCloseAsk(false)}>
                  <div onClick={(e) => e.stopPropagation()} className="w-full max-w-[300px] rounded-3xl bg-[#FFFFFF] p-4 text-center shadow-2xl">
                    <div className="text-[28px]">📝</div>
                    <div className="mt-1 text-[16px] font-black text-[#1E1B4B]">Keep this as a draft?</div>
                    <div className="mt-1 text-[12.5px] font-semibold text-[#8A8FB0]">It comes back the next time you write.</div>
                    <button type="button" onClick={() => (setCloseAsk(false), setComposing(false))} className="mt-3 h-11 w-full rounded-2xl bg-gradient-to-r from-[#F59E0B] via-[#EC4899] to-[#8B5CF6] text-[14.5px] font-black text-white">
                      Keep draft
                    </button>
                    <button type="button" onClick={() => (setCloseAsk(false), clearWriter(), dropDraft(), setComposing(false))} className="mt-2 h-10 w-full rounded-2xl bg-[#FEF2F2] text-[14px] font-extrabold text-[#DC2626]">
                      Discard
                    </button>
                  </div>
                </div>
              )}
              {cplaceOpen && (
                <div className="fixed inset-0 z-[60] flex items-end justify-center bg-[#0B1F3A]/40 sm:items-center sm:p-4" onClick={() => setCplaceOpen(false)}>
                  <div onClick={(e) => e.stopPropagation()} className="flex max-h-[80dvh] w-full max-w-md flex-col rounded-t-[26px] bg-[#FFFFFF] p-4 shadow-2xl sm:rounded-[26px]">
                    <div className="mb-2.5 flex items-center justify-between">
                      <span className="text-[17px] font-black text-[#1E1B4B]">📍 Where are you?</span>
                      <button type="button" onClick={() => setCplaceOpen(false)} aria-label="Close" className="flex h-8 w-8 items-center justify-center rounded-full bg-[#F1F2F8] text-[13px] font-black text-[#6B6F9A]">✕</button>
                    </div>
                    <input
                      value={cplaceQ}
                      onChange={(e) => setCplaceQ(e.target.value.slice(0, 60))}
                      placeholder="🔍 Search a place, city or area…"
                      className="h-11 rounded-2xl bg-[#F4F6FD] px-3.5 text-[14px] text-[#1E1B4B] outline-none placeholder:text-[#9AA3BD]"
                    />
                    <button
                      type="button"
                      disabled={!!cplaceBusy}
                      onClick={async () => {
                        setCplaceBusy("Finding you…");
                        try {
                          setCplace(await placeHere());
                          setCplaceOpen(false);
                          setCplaceQ("");
                        } catch {
                          setCplaceBusy("Couldn't find your location — allow location, or pick a place below.");
                          return;
                        }
                        setCplaceBusy("");
                      }}
                      className="mt-2.5 flex items-center gap-2.5 rounded-2xl bg-gradient-to-r from-[#EEF4FF] to-[#F3E8FF] px-3.5 py-3 text-left text-[14px] font-extrabold text-[#4F46E5]"
                    >
                      <span className="text-[20px]">🎯</span>
                      <span className="min-w-0 flex-1">{cplaceBusy || "Use my current location"}</span>
                      <span className="text-[11px] font-bold text-[#8A8FB0]">GPS</span>
                    </button>
                    <div className="mt-2 min-h-0 flex-1 overflow-y-auto">
                      {cplaceQ.trim() && !searchPlaces(cplaceQ).some((x) => x.name.toLowerCase() === cplaceQ.trim().toLowerCase()) && (
                        <button
                          type="button"
                          onClick={() => (setCplace({ name: cplaceQ.trim(), sub: "", icon: "📍" }), setCplaceOpen(false), setCplaceQ(""))}
                          className="flex w-full items-center gap-3 border-b border-[#F0F1F7] px-1 py-2.5 text-left"
                        >
                          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#FFF1F2] text-[17px]">➕</span>
                          <span className="text-[14px] font-extrabold text-[#1E1B4B]">Use “{cplaceQ.trim()}”</span>
                        </button>
                      )}
                      {searchPlaces(cplaceQ).map((x) => (
                        <button
                          key={x.name + x.sub}
                          type="button"
                          onClick={() => (setCplace(x), setCplaceOpen(false), setCplaceQ(""))}
                          className="flex w-full items-center gap-3 border-b border-[#F0F1F7] px-1 py-2.5 text-left hover:bg-[#FAFAFE]"
                        >
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#FFF1F2] text-[17px]">{x.icon}</span>
                          <span className="min-w-0">
                            <span className="block truncate text-[14px] font-extrabold text-[#1E1B4B]">{x.name}</span>
                            <span className="block truncate text-[12px] font-semibold text-[#8A8FB0]">{x.sub}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
              {cprivOpen && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#0B1F3A]/40 p-4" onClick={() => setCprivOpen(false)}>
                  <div onClick={(e) => e.stopPropagation()} className="w-full max-w-[290px] rounded-3xl border border-[#E5EAF5] bg-[#FFFFFF] p-3 shadow-2xl">
                    <div className="mb-1.5 px-1 text-[11px] font-extrabold uppercase tracking-wider text-[#8B5CFF]">Who can see this?</div>
                    {BLOG_PRIVACY.map(([k, icon, label]) => (
                      <button
                        key={k || "all"}
                        type="button"
                        onClick={() => {
                          setCpriv(k);
                          setCprivOpen(false);
                        }}
                        className={`mb-1 flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition ${cpriv === k ? "bg-gradient-to-r from-[#EEF0FF] to-[#F5EDFF] ring-2 ring-[#6366F1]" : "hover:bg-[#F4F6FD]"}`}
                      >
                        <span className="text-[22px]">{icon}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[14px] font-black text-[#1E1B4B]">{label}</span>
                          <span className="block text-[11.5px] font-semibold text-[#8A8FB0]">{k === "" ? "Anyone on miGlife" : k === "friends" ? "Only your friends" : "Only you"}</span>
                        </span>
                        {cpriv === k && <span className="font-black text-[#6366F1]">✓</span>}
                      </button>
                    ))}
                  </div>
                </div>
              )}
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
                // 🖼 each photo: ✕ remove, ✏️ edit (crop · zoom · turn), 🔄 change; the first is the cover
                <div className="no-scrollbar mt-2.5 flex gap-2 overflow-x-auto pb-1">
                  {cphotos.map((u, i) => (
                    <div key={u + i} className="relative h-24 w-24 shrink-0 overflow-hidden rounded-2xl shadow-[0_6px_14px_-8px_rgba(30,40,90,.6)]">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={u} alt="" className="h-full w-full object-cover" />
                      {i === 0 && cphotos.length > 1 && (
                        <span className="absolute left-1.5 top-1.5 rounded-full bg-black/55 px-1.5 py-px text-[9.5px] font-black text-white">★ COVER</span>
                      )}
                      <button
                        type="button"
                        onClick={() => setCphotos((p) => p.filter((_, j) => j !== i))}
                        aria-label="Remove photo"
                        className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-[11px] font-black text-white"
                      >
                        ✕
                      </button>
                      <div className="absolute inset-x-0 bottom-0 flex justify-center gap-1.5 bg-gradient-to-t from-black/60 to-transparent pb-1.5 pt-4">
                        {cfilesRef.current[u] && (
                          <button type="button" disabled={cbusy} onClick={() => setCeditAt(i)} aria-label="Edit photo" title="Edit" className="flex h-6 w-6 items-center justify-center rounded-full bg-white/90 text-[11px] disabled:opacity-50">
                            ✏️
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={cbusy}
                          onClick={() => {
                            setCswapAt(i);
                            cswapRef.current?.click();
                          }}
                          aria-label="Change photo"
                          title="Change"
                          className="flex h-6 w-6 items-center justify-center rounded-full bg-white/90 text-[11px] disabled:opacity-50"
                        >
                          🔄
                        </button>
                      </div>
                    </div>
                  ))}
                  {cbusy && <div className="feed-shimmer h-24 w-24 shrink-0 rounded-2xl" />}
                </div>
              )}
              <input
                ref={cswapRef}
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) void creplace(cswapAt, f);
                }}
              />
              {ceditAt >= 0 && cfilesRef.current[cphotos[ceditAt]] && (
                <PhotoCropDialog
                  file={cfilesRef.current[cphotos[ceditAt]]}
                  frameAspect={4 / 5}
                  round={false}
                  outWidth={1080}
                  hint="Drag to move · pinch or scroll to zoom · the frame is how the photo shows"
                  onCancel={() => setCeditAt(-1)}
                  onCropped={(jpeg) => {
                    const at = ceditAt;
                    setCeditAt(-1);
                    void creplace(at, new File([jpeg], "photo.jpg", { type: "image/jpeg" }));
                  }}
                />
              )}
              {(cvideo || cvideoBusy) && (
                <div className="mt-2.5 flex items-center justify-between rounded-xl bg-[#F4F6FD] px-3 py-2 text-[13px] font-bold text-[#1D4ED8]">
                  <span>{cvideoBusy ? "🎬 Uploading video…" : "🎬 Video attached"}</span>
                  {!cvideoBusy && !cedit && (
                    <button type="button" onClick={() => setCvideo("")} aria-label="Remove video" className="text-[#8494B2]">
                      ✕
                    </button>
                  )}
                </div>
              )}
              {/* 📊 the poll: answers (2–4), how long, one or several answers */}
              {cpoll && (
                <div className="mt-2.5 rounded-2xl bg-[#F7F8FF] p-2.5">
                  <div className="mb-1 flex items-center justify-between px-0.5">
                    <span className="text-[11.5px] font-extrabold uppercase tracking-wider text-[#4F46E5]">📊 Poll · your text is the question</span>
                    <button type="button" onClick={() => setCpoll(null)} className="text-[12px] font-bold text-[#8494B2]">
                      ✕ Remove
                    </button>
                  </div>
                  {cpoll.options.map((o, i) => (
                    <div key={i} className="mt-1.5 flex items-center gap-1.5">
                      <input
                        value={o}
                        maxLength={60}
                        onChange={(e) => setCpoll({ ...cpoll, options: cpoll.options.map((x, j) => (j === i ? e.target.value : x)) })}
                        placeholder={`Answer ${i + 1}`}
                        className="min-w-0 flex-1 rounded-xl border-[1.5px] border-[#D9DFF0] bg-white px-3 py-2 text-[14px] text-[#1E1B4B] outline-none focus:border-[#6366F1]"
                      />
                      {cpoll.options.length > 2 && (
                        <button type="button" onClick={() => setCpoll({ ...cpoll, options: cpoll.options.filter((_, j) => j !== i) })} aria-label="Remove answer" className="px-1 text-[#8494B2]">
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                  {cpoll.options.length < 4 && (
                    <button type="button" onClick={() => setCpoll({ ...cpoll, options: [...cpoll.options, ""] })} className="mt-1.5 w-full rounded-xl border-[1.5px] border-dashed border-[#C7D2FE] py-2 text-[13px] font-bold text-[#6366F1]">
                      ＋ Add answer (max 4)
                    </button>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {([1, 3, 7] as const).map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setCpoll({ ...cpoll, days: d })}
                        className={`rounded-full px-3 py-1 text-[12px] font-extrabold ${cpoll.days === d ? "bg-[#1D4ED8] text-white" : "bg-white text-[#4F46E5] shadow-sm"}`}
                      >
                        {d} {d === 1 ? "day" : "days"}
                      </button>
                    ))}
                    <label className="ml-auto flex items-center gap-1.5 text-[12px] font-bold text-[#5B6585]">
                      <input type="checkbox" checked={cpoll.multi} onChange={(e) => setCpoll({ ...cpoll, multi: e.target.checked })} className="h-4 w-4" />
                      Several answers
                    </label>
                  </div>
                </div>
              )}
              {cerr && <p className="mt-2 rounded-lg bg-red-50 px-2.5 py-1.5 text-[12.5px] text-red-700">{cerr}</p>}
              {cmoodOpen && (
                <div className="mt-2.5 rounded-2xl bg-[#F7F8FF] p-2.5">
                  <div className="mb-2 flex items-center justify-between px-0.5">
                    <span className="text-[11.5px] font-extrabold uppercase tracking-wider text-[#8B5CFF]">😊 How are you?</span>
                    <button type="button" onClick={() => setCmoodOpen(false)} className="text-[12px] font-bold text-[#8494B2]">
                      Close
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {BLOG_MOODS.map(([k, e, word]) => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => {
                          setCmood(cmood === k ? "" : k);
                          setCmoodOpen(false);
                        }}
                        className={`flex items-center gap-1.5 rounded-xl px-2 py-2 text-left text-[12.5px] font-extrabold text-[#1E1B4B] transition active:scale-95 ${cmood === k ? "bg-gradient-to-r from-[#FEF3C7] to-[#FCE7F3] ring-2 ring-[#F59E0B]" : "bg-[#FFFFFF] shadow-sm hover:bg-[#FFFBEB]"}`}
                      >
                        <span className="text-[20px] leading-none">{e}</span>
                        <span className="truncate">{word}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {/* tools on the left, Post on the right */}
              <div className="mt-3 flex items-center gap-1">
                <button type="button" disabled={cbusy || cphotos.length >= 10 || !!cpoll} onClick={() => cfileRef.current?.click()} aria-label="Add photos" title="Photo" className="flex h-10 w-10 items-center justify-center rounded-[13px] text-[21px] transition hover:bg-[#ECFDF5] active:scale-90 disabled:opacity-40">
                  🖼️
                </button>
                {videoOn && !cedit && (
                  <button type="button" disabled={cbusy || cvideoBusy || !!cvideo || !!cpoll} onClick={() => cvideoRef.current?.click()} aria-label="Add a video" title="Video" className="flex h-10 w-10 items-center justify-center rounded-[13px] text-[21px] transition hover:bg-[#FEF2F2] active:scale-90 disabled:opacity-40">
                    🎬
                  </button>
                )}
                {/* 📊 Poll (a new Mig only; words, no photos / video) */}
                {!cedit && (
                  <button
                    type="button"
                    disabled={cbusy || cphotos.length > 0 || !!cvideo}
                    onClick={() => setCpoll((v) => (v ? null : { options: ["", ""], days: 3, multi: false }))}
                    aria-label="Add a poll"
                    title={cphotos.length > 0 || cvideo ? "A poll can't have photos or a video" : "Poll"}
                    className={`flex h-10 w-10 items-center justify-center rounded-[13px] text-[20px] transition hover:bg-[#EEF2FF] active:scale-90 disabled:opacity-40 ${cpoll ? "bg-[#EEF2FF]" : ""}`}
                  >
                    📊
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
                  onClick={() => setCplaceOpen(true)}
                  aria-label="Add a place"
                  title="Location"
                  className={`flex h-10 w-10 items-center justify-center rounded-[13px] text-[20px] transition hover:bg-[#FFF1F2] active:scale-90 ${cplace ? "bg-[#FFE4E6]" : ""}`}
                >
                  📍
                </button>
                <button
                  type="button"
                  onClick={cedit ? saveEdit : publishInline}
                  disabled={cbusy || cvideoBusy || empty}
                  className={`ml-auto h-11 rounded-2xl px-6 text-[15px] font-black transition active:scale-95 ${
                    cbusy || cvideoBusy || empty
                      ? "bg-[#E9EBF4] text-[#A0A6C2]"
                      : "bg-gradient-to-r from-[#F59E0B] via-[#EC4899] to-[#8B5CF6] text-white shadow-[0_10px_20px_-10px_rgba(236,72,153,.9)]"
                  }`}
                >
                  {cedit ? (cbusy ? "Saving…" : "Save ✓") : cbusy ? "Migging…" : "Mig it ➤"}
                </button>
              </div>
            </div>
          );
        })()}
        {!author && !placeView && (!user || !composing) && !(user && (tab === "mine" || tab === "saved")) && (
          user ? (
            <button
              type="button"
              onClick={() => setComposing(true)}
              className="group mx-3.5 mb-4 mt-1 flex w-[calc(100%-1.75rem)] items-center gap-2.5 rounded-[22px] bg-[#FFFFFF] py-2.5 pl-3 pr-2.5 text-left shadow-[0_10px_28px_-16px_rgba(60,64,140,.35)] transition duration-200 active:scale-[.99]"
            >
              <Avatar name={username} color={meColor} size={40} ring />
              <span className="min-w-0 flex-1 truncate text-[14.5px] text-[#7A7FA6]">{`What's on your mind, ${username}?`}</span>
            </button>
          ) : (
            <Link href="/login" className="mx-3.5 my-2.5 flex items-center gap-2.5 rounded-[20px] border border-[#6366F1]/15 bg-white/75 py-2.5 pl-3 pr-2.5">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-lg">✍️</span>
              <span className="min-w-0 flex-1 truncate text-[14.5px] text-[#7A7FA6]">Log in to write a Mig</span>
            </Link>
          )
        )}

        {/* 🧱 My wall (Mine tab): one tidy card — picture, name, my numbers, New post */}
        {!author && !placeView && tab === "mine" && user && posts && !composing && (() => {
          const since = Date.now() - 7 * 86400000;
          const wk = posts.filter((p) => p.createdMs >= since);
          const likes = posts.reduce((n, p) => n + p.likes, 0);
          const views = posts.reduce((n, p) => n + p.views, 0);
          return (
            <section className="mx-3.5 mb-5 mt-1 overflow-hidden rounded-[28px] bg-[#FFFFFF] shadow-[0_8px_16px_-12px_rgba(60,64,140,.4)]">
              <div className="relative flex items-center gap-3 bg-gradient-to-br from-[#38BDF8] via-[#6366F1] to-[#A855F7] px-4 py-4 text-white">
                <span aria-hidden className="pointer-events-none absolute -right-10 -top-12 h-36 w-36 rounded-full bg-white/15" />
                <span className="shrink-0 rounded-full bg-white/90 p-[3px]">
                  <Avatar name={username} color={meColor} size={58} />
                </span>
                <div className="relative min-w-0 flex-1">
                  <div className="truncate text-[19px] font-black leading-tight drop-shadow">
                    {username}
                    {/* ✔ the gold seal on my wall card too */}
                    {verifiedAuthors.has(username) && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src="/icons/miglife-verified.svg?v=3" alt="Verified" title="Verified" className="ml-1.5 inline-block h-[20px] w-[20px] align-[-3px]" style={{ filter: "drop-shadow(0 1px 2px rgba(120,60,0,.5))" }} />
                    )}
                  </div>
                  <div className="mt-1 inline-flex max-w-full truncate whitespace-nowrap rounded-full bg-white/20 px-2.5 py-0.5 text-[11.5px] font-bold backdrop-blur-sm">
                    📅 This week: {wk.length} {wk.length === 1 ? "Mig" : "Migs"}
                  </div>
                </div>
                <Link href={`/profile/${encodeURIComponent(username)}`} className="relative shrink-0 rounded-full bg-white/20 px-3 py-1.5 text-[12px] font-extrabold backdrop-blur-sm transition active:scale-95">
                  ✏️ Profile
                </Link>
              </div>
              <div className="grid grid-cols-5 divide-x divide-[#ECEDF5] py-3 text-center">
                {([
                  [blogShort(posts.length), "Migs"],
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
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setComposing(true)}
                    className="flex h-11 flex-1 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#38BDF8] via-[#6366F1] to-[#A855F7] text-[14px] font-extrabold text-white shadow-[0_10px_20px_-10px_rgba(99,102,241,.8)] transition active:scale-[.98]"
                  >
                    ✍️ New Mig
                  </button>
                  {/* 🔖 the Migs I saved */}
                  <button
                    type="button"
                    onClick={() => (setTab("saved"), window.scrollTo({ top: 0 }))}
                    className="flex h-11 items-center justify-center gap-1.5 rounded-2xl bg-[#FFF4D6] px-4 text-[14px] font-extrabold text-[#92400E] transition active:scale-[.98]"
                  >
                    🔖 Saved <span className="rounded-full bg-white/80 px-1.5 text-[12px]">{savedIds.size}</span>
                  </button>
                </div>
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
            ↑ {fresh >= 20 ? "20+" : fresh} new Mig{fresh === 1 ? "" : "s"} — tap to view
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
                  ? "You haven't written a Mig yet."
                  : "Log in to see your Migs."
                : tab === "friends" && !author
                  ? user
                    ? "Your friends haven't written anything yet."
                    : "Log in to see your friends' Migs."
                  : tab === "following" && !author
                    ? user
                      ? "Follow members to see their Migs here."
                      : "Log in to see the people you follow."
                    : tab === "saved" && !author
                      ? "No saved Migs yet."
                      : "No Migs here yet."}
            </p>
            {tab === "saved" && !author && <p className="mt-1 text-sm">Tap 🔖 on any Mig to keep it here.</p>}
            {user && !author && tab !== "mine" && tab !== "saved" && <p className="mt-1 text-sm">Be the first — tap “What's on your mind?”.</p>}
          </div>
        ) : (
          <div className="space-y-5 px-3.5">
            {(shown || []).filter((p) => (media !== "photos" || !!(p.cover || p.firstImage)) && (cat === "all" || p.category === cat)).map((p) => (
              <FeedCard key={p.id} p={p} following={followed.includes(p.author)} canFollow={!!user && p.author !== username} onFollow={() => toggleFollow(p.author)} why={p.likes >= 10 ? "🔥 Trending" : tab === "new" ? "🆕 New" : ""} verified={verifiedAuthors.has(p.author)} roleBadge={authorBadge[p.author] || ""} rolePill={authorRole[p.author] || ""} roleImg={badgeImages[authorBadge[p.author] || ""] || ""} color={colorOf(p.author)} liked={liked.has(p.id)} reaction={reactOf[p.id] || (liked.has(p.id) ? "👍" : "")} onReact={(e) => react(p, e)} onLike={() => like(p)} onShare={() => setSharing(p)} onReactors={() => setReactorsOf(p)} saved={savedIds.has(p.id)} onSave={() => toggleSave(p)} onPlace={() => (setPlaceView(p.place), window.scrollTo({ top: 0 }))} onOpen={() => openSheet(p.id)} onEdit={user && p.authorUid === user.uid ? () => startEdit(p) : undefined} onDelete={user && p.authorUid === user.uid ? () => deleteMig(p) : undefined} onPrivacy={user && p.authorUid === user.uid ? (k) => setMigPrivacy(p, k) : undefined} canReport={!!user && p.authorUid !== user.uid} signedIn={!!user} />
            ))}
            {media === "photos" && !posts.some((p) => p.cover || p.firstImage) && (
              <p className="py-6 text-center text-sm text-[#6B6F9A]">No photo Migs in this tab yet.</p>
            )}
            {hasMore && (
              <div ref={moreRef} className="flex justify-center py-3">
                <button type="button" onClick={() => void loadMore()} className="rounded-full bg-[#FFFFFF] px-4 py-2 text-[13px] font-bold text-[#6B6F9A] shadow-[0_4px_12px_-8px_rgba(60,64,140,.5)]">
                  {loadingMore ? "Loading more…" : "⬇ More Migs"}
                </button>
              </div>
            )}
          </div>
        )}

      </section>

      {reactorsOf && <ReactorsSheet postId={reactorsOf.id} onClose={() => setReactorsOf(null)} />}
      {sheetId && (
        <MigSheet onClose={closeSheet}>
          <MigView
            key={sheetId}
            id={sheetId}
            sheet
            onClose={closeSheet}
            onGone={() => setReload((n) => n + 1)}
            onEdit={(p) => {
              closeSheet();
              window.setTimeout(() => startEdit(p), 50);
            }}
            onPlace={(pl) => {
              closeSheet();
              setPlaceView(pl);
              window.scrollTo({ top: 0 });
            }}
          />
        </MigSheet>
      )}

      {searching && (
        <FeedSearch
          onClose={() => setSearching(false)}
          onOpen={(id) => {
            setSearching(false);
            openSheet(id);
          }}
        />
      )}

      {sharing && (
        <ShareSheet
          post={sharing}
          uid={user?.uid}
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
          <span>Migging in 5 sec…</span>
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

// ↗ Share to my wall: a short note (optional) and the post it shares. The post
// appears on my wall and in the feed, with the original inside it.
function ShareSheet({ post, uid, onClose, onDone, onLink }: { post: BlogPost; uid?: string; onClose: () => void; onDone: (msg: string) => void; onLink: () => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const origin = post.sharedId ? { id: post.sharedId, author: post.sharedAuthor, title: post.sharedTitle } : { id: post.id, author: post.author, title: post.title };
  // 📸 only 🌍 Everyone Migs can go to a story (everyone who sees the story can open it)
  const canStory = !post.privacy;
  const [toStory, setToStory] = useState(false);
  const sendToStory = async (caption: string, audience: string, song?: { url: string; title: string; startSec: number } | null) => {
    setToStory(false);
    setBusy(true);
    setErr("");
    try {
      await blogCall("story", { sharePostId: origin.id, caption, song: song || null, privacy: audience });
      window.dispatchEvent(new Event(STORIES_CHANGED));
      onDone("Added to your story ✓");
    } catch (e) {
      setErr(blogError(e));
    } finally {
      setBusy(false);
    }
  };
  if (toStory)
    return (
      <StoryDialog
        uid={uid}
        title="📸 Add to your story"
        caption=""
        audience="everyone"
        confirmText="Share story"
        maxLen={140}
        placeholder="Say something about this Mig… (optional)"
        hasMedia
        onClose={() => setToStory(false)}
        onConfirm={(caption, audience, song) => sendToStory(caption, audience, song)}
      />
    );
  const send = async () => {
    setBusy(true);
    setErr("");
    try {
      await blogCall("create", {
        title: `↗ ${origin.title}`.slice(0, 60),
        body: text.trim() || "↗ Shared a Mig",
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
        {canStory && (
          <button
            type="button"
            onClick={() => setToStory(true)}
            disabled={busy}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-full border-[1.5px] border-[#14B88F]/60 bg-[#F3FFFA] py-2.5 text-[14px] font-extrabold text-[#0E7A62] disabled:opacity-60"
          >
            📸 Add to my story
          </button>
        )}
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

function FeedCard({ p, color, liked, verified, why = "", roleBadge, rolePill = "", roleImg, reaction, onReact, onLike, onShare, onReactors, saved, onSave, following = false, canFollow = false, onFollow = () => {}, onPlace = () => {}, onOpen, onEdit, onDelete, onPrivacy, canReport = false, signedIn = false }: { p: BlogPost; color: string; liked: boolean; verified: boolean; why?: string; roleBadge: string; rolePill?: string; roleImg: string; reaction: string; onReactors: () => void; onReact: (emoji: string) => void; onLike: () => void; onShare: () => void; saved: boolean; onSave: () => void; following?: boolean; canFollow?: boolean; onFollow?: () => void; onPlace?: () => void; onOpen?: () => void; onEdit?: () => void; onDelete?: () => void; onPrivacy?: (k: "" | "friends" | "me") => void; canReport?: boolean; signedIn?: boolean }) {
  // ⋯ my own Mig: Edit / Delete right on the card
  const [menu, setMenu] = useState(false);
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
  const trToggle = useFeedTranslateToggle(p.id);
  const hasWords = !!(p.title.trim() || p.excerpt.trim() || p.body.trim());
  // X2: in the Feed a Mig opens in the bottom sheet; elsewhere on its own page
  const open = () => (onOpen ? onOpen() : router.push(`/feed/${p.id}`));
  const [viewing, setViewing] = useState(false);
  const text = tr?.text || p.excerpt;
  // X1: a long words-only Mig shows like normal writing on white, its end fading
  // out under a "Read more ⌄" pill that opens it right here
  const fullText =
    tr?.text ||
    p.body
      .split("\n")
      .filter((l) => !/^!\[\]\(/.test(l.trim()))
      .join("\n")
      .trim() ||
    p.excerpt;
  const long = !p.video && !(p.cover || p.firstImage) && (fullText.length > 170 || fullText.split("\n").length > 5);
  const [more, setMore] = useState(false);
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
  const plain = !media && (p.bg === PLAIN_BG || long);
  // 🤍 Clean Cards (look A): a white card — who wrote it on top, the picture /
  // Text Art in a rounded frame in the middle, the buttons in their own row below,
  // so names and buttons are always easy to read.
  const btn = "bg-[#F1F4F9] text-[#2E3B4E] hover:bg-[#E8EDF5]";
  const pollOnly = !!p.poll && !media;
  const topReacts = Object.entries(p.reactions || {})
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([e]) => e)
    .join("");
  return (
    <article className="relative overflow-hidden rounded-[24px] border border-[#EDF0F5] bg-white shadow-[0_6px_18px_-10px_rgba(11,42,91,.22)]">
      {/* who wrote it */}
      <div className="flex items-center gap-2.5 px-3.5 pb-2.5 pt-3 text-[#16264A]">
        <Link href={`/profile/${encodeURIComponent(p.author)}`} onClick={(e) => e.stopPropagation()} className="shrink-0 rounded-full">
          <Avatar name={p.author} color={c} size={40} />
        </Link>
        <div className="min-w-0 flex-1 leading-tight">
          <div className="flex min-w-0 items-center gap-1">
            <span data-notranslate className="truncate text-[14.5px] font-extrabold">
              {p.author}
              {verified && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src="/icons/miglife-verified.svg?v=3" alt="Verified" title="Verified" className="ml-1 inline-block h-[16px] w-[16px] align-[-3px]" />
              )}
              {blogMood(p.mood) && (
                <span className="font-semibold text-[#55658F]">
                  {" "}is {blogMood(p.mood)![0]} <b className="font-extrabold text-[#16264A]">{blogMood(p.mood)![1]}</b>
                </span>
              )}
            </span>
            {!role &&
              (roleImg ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={roleImg} alt="" title="Role badge" className="h-4 w-4 shrink-0 rounded-full object-cover" />
              ) : roleBadge ? (
                <span className="shrink-0 text-[12px] leading-none">{roleBadge}</span>
              ) : null)}
          </div>
          <div className="truncate text-[11.5px] font-semibold text-[#7C88A6]">
            {p.place && (
              <button type="button" onClick={(e) => (e.stopPropagation(), onPlace())} className="mr-1 font-extrabold text-[#55658F] underline-offset-2 hover:underline">
                📍 {p.place} ·
              </button>
            )}
            {role ? `${role} · ` : ""}
            {blogAgoBn(p.createdMs)}
            {p.privacy ? ` · ${blogPrivacyLabel(p.privacy)}` : ""}
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
            className={`shrink-0 rounded-full px-3 py-1.5 text-[12px] font-extrabold transition active:scale-95 ${following ? "bg-[#F1F4F9] text-[#55658F]" : "bg-[#EEF0FF] text-[#4F46E5]"}`}
          >
            {following ? "Following" : "+ Follow"}
          </button>
        )}
        {/* ⋯ my Mig: Edit · Privacy · Save · Delete — someone else's: Save · Report */}
        {(onEdit || canReport) && (
          <div className="relative shrink-0">
            <button
              type="button"
              aria-label="Mig options"
              onClick={(e) => (e.stopPropagation(), setMenu((v) => !v))}
              className="flex h-9 w-9 items-center justify-center rounded-full text-[18px] font-black leading-none text-[#6B7A99] hover:bg-[#F1F4F9]"
            >
              ⋯
            </button>
            {menu && (
              <>
                <span className="fixed inset-0 z-10" onClick={(e) => (e.stopPropagation(), setMenu(false))} />
                <div className="absolute right-0 top-11 z-20 w-48 overflow-hidden rounded-2xl bg-[#FFFFFF] py-1 text-[14px] font-bold text-[#1E1B4B] shadow-[0_12px_28px_-10px_rgba(30,27,75,.45)]">
                  {onEdit && (
                    <button type="button" onClick={(e) => (e.stopPropagation(), setMenu(false), onEdit())} className="block w-full px-4 py-2.5 text-left hover:bg-[#F4F6FD]">
                      ✏️ Edit
                    </button>
                  )}
                  {onPrivacy && !p.sharedId && (
                    <div className="border-y border-[#F0F1F7] py-1">
                      <div className="px-4 pb-0.5 pt-1 text-[10.5px] font-black uppercase tracking-wider text-[#8B5CFF]">Who can see it</div>
                      {BLOG_PRIVACY.map(([k, icon, label]) => (
                        <button
                          key={k || "all"}
                          type="button"
                          onClick={(e) => (e.stopPropagation(), setMenu(false), p.privacy !== k && onPrivacy(k))}
                          className={`flex w-full items-center justify-between px-4 py-2 text-left text-[13.5px] hover:bg-[#F4F6FD] ${p.privacy === k ? "text-[#6366F1]" : ""}`}
                        >
                          <span>
                            {icon} {label}
                          </span>
                          {p.privacy === k && <span>✓</span>}
                        </button>
                      ))}
                    </div>
                  )}
                  <button type="button" onClick={(e) => (e.stopPropagation(), setMenu(false), onSave())} className="block w-full px-4 py-2.5 text-left hover:bg-[#F4F6FD]">
                    {saved ? "🔖 Unsave" : "🔖 Save"}
                  </button>
                  {hasWords && (
                    <button type="button" onClick={(e) => (e.stopPropagation(), setMenu(false), trToggle.toggle())} className="block w-full px-4 py-2.5 text-left hover:bg-[#F4F6FD]">
                      {trToggle.on ? "🌐 See original" : trToggle.busy ? "🌐 Translating…" : "🌐 Translate"}
                    </button>
                  )}
                  {canReport && (
                    <button
                      type="button"
                      onClick={(e) => (e.stopPropagation(), setMenu(false), openReport({ kind: "blog_post", targetUsername: p.author, messageId: p.id, preview: p.title }))}
                      className="block w-full px-4 py-2.5 text-left hover:bg-[#F4F6FD]"
                    >
                      🚩 Report
                    </button>
                  )}
                  {onDelete && (
                    <button type="button" onClick={(e) => (e.stopPropagation(), setMenu(false), onDelete())} className="block w-full px-4 py-2.5 text-left text-[#DC2626] hover:bg-[#FEF2F2]">
                      🗑 Delete
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* the words of a photo / video Mig, above it */}
      {media && text && (
        <p onClick={open} className="cursor-pointer px-4 pb-2.5 text-[14.5px] leading-snug text-[#1E2A44]">
          <RichText text={text} />
        </p>
      )}

      {/* the picture / video, the Text Art, or the words */}
      <div onClick={tapCard} className={`relative cursor-pointer select-none ${media || (!plain && !pollOnly) ? "mx-2.5 overflow-hidden rounded-[18px]" : ""}`}>
        {p.video ? (
          <video src={p.video} controls playsInline preload="metadata" onClick={(e) => e.stopPropagation()} className="block max-h-[520px] min-h-[300px] w-full bg-black object-cover" />
        ) : pic ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={(p.cover && p.thumb) || pic} alt="" loading="lazy" decoding="async" className="block max-h-[520px] min-h-[260px] w-full object-cover" />
        ) : pollOnly ? (
          // 📊 a poll: the question, then the answers, right on the white card
          <div className="px-4 pb-1 text-left">
            {text && (
              <p className="mb-1 whitespace-pre-line break-words text-[16px] font-extrabold leading-snug text-[#16264A]">
                📊 <RichText text={text} />
              </p>
            )}
            <PollBox postId={p.id} poll={p.poll!} canEnd={!!onEdit} signedIn={signedIn} />
            {hasWords && <TranslateLink postId={p.id} />}
          </div>
        ) : plain ? (
          <div className="px-4 pb-1 text-left">
            <div className={`relative ${long && !more ? "max-h-[9.6em] overflow-hidden" : ""}`}>
              <p className={`whitespace-pre-line break-words leading-[1.5] text-[#16264A] ${long ? "text-[15px] font-medium" : "text-[18px] font-bold"}`}>
                <RichText text={long ? fullText : text} />
              </p>
              {long && !more && <span aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-b from-transparent to-white" />}
            </div>
            {long && (
              <button
                type="button"
                onClick={(e) => (e.stopPropagation(), setMore((v) => !v))}
                className="mt-1.5 rounded-full bg-[#EEF0FF] px-4 py-1.5 text-[12.5px] font-black text-[#4F46E5] transition active:scale-95"
              >
                {more ? "Show less ⌃" : "Read more ⌄"}
              </button>
            )}
            {hasWords && <TranslateLink postId={p.id} />}
          </div>
        ) : (
          <div className="flex min-h-[220px] flex-col items-center justify-center px-6 py-8 text-center" style={{ background: artBg }}>
            <p className={`whitespace-pre-line break-words font-extrabold leading-snug ${artSize} ${text.length > 140 ? "line-clamp-[9]" : ""}`} style={{ color: artInk, textShadow: artInk === "#FFFFFF" ? "0 2px 12px rgba(0,0,0,.25)" : "none" }}>
              <RichText text={text || "📷"} />
            </p>
            {hasWords && <TranslateLink postId={p.id} dark={artInk === "#FFFFFF"} />}
            {p.sharedId && (
              <button type="button" onClick={(e) => (e.stopPropagation(), router.push(`/feed/${p.sharedId}`))} className="mt-3 block w-[88%] rounded-2xl border border-white/50 bg-white/20 p-2.5 text-left" style={{ color: artInk }}>
                <span className="block text-[11.5px] font-bold opacity-85">↗ {p.sharedAuthor}</span>
                <span className="mt-0.5 line-clamp-2 block text-[13px] font-bold">{p.sharedTitle}</span>
              </button>
            )}
          </div>
        )}
        {bigHeart > 0 && (
          <span key={bigHeart} aria-hidden className="feed-bigheart pointer-events-none absolute left-1/2 top-1/2 text-[96px]">
            ❤️
          </span>
        )}
        {media && pic && !p.video && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setViewing(true);
            }}
            aria-label="See the full picture"
            className="absolute right-2.5 top-2.5 flex h-8 w-8 items-center justify-center rounded-full bg-black/35 text-[13px] text-white"
          >
            ⤢
          </button>
        )}
      </div>

      {/* a shared Mig (photo / plain) shows what it shares under it */}
      {p.sharedId && (media || plain || pollOnly) && (
        <button type="button" onClick={() => router.push(`/feed/${p.sharedId}`)} className="mx-3 mt-2.5 block w-[calc(100%-1.5rem)] rounded-2xl border border-[#E6EAF2] bg-[#F7F9FC] p-2.5 text-left">
          <span className="block text-[11.5px] font-bold text-[#7C88A6]">↗ {p.sharedAuthor}</span>
          <span className="mt-0.5 line-clamp-2 block text-[13px] font-bold text-[#16264A]">{p.sharedTitle}</span>
        </button>
      )}

      {/* the reactions people used, then the buttons — on the white card */}
      {p.likes > 0 && topReacts && (
        <button type="button" onClick={onReactors} className="block px-4 pt-2.5 text-left text-[12px] font-bold text-[#6B7A99]">
          {topReacts} {blogShort(p.likes)}
        </button>
      )}
      <div className="px-3 pb-3 pt-2 text-[#16264A]" onClick={(e) => e.stopPropagation()}>
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
              className={`relative flex h-10 items-center gap-1.5 rounded-full px-3.5 text-[13.5px] font-extrabold transition active:scale-95 ${liked ? "bg-[#FFE4EC] text-[#E11D48]" : btn}`}
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
            <button type="button" onClick={onReactors} aria-label="See who reacted" className="-ml-1 text-[13px] font-extrabold text-[#2E3B4E]">
              {blogShort(p.likes)}
            </button>
          )}
          <button type="button" onClick={open} aria-label="Comments" className={`flex h-10 items-center gap-1.5 rounded-full px-3.5 text-[13.5px] font-extrabold transition active:scale-95 ${btn}`}>
            💬 {blogShort(p.comments)}
          </button>
          {/* 🔒 a 👥 / 🔒 post can't be shared */}
          {!p.privacy && (
            <button type="button" onClick={onShare} aria-label="Share" className={`flex h-10 w-10 items-center justify-center rounded-full text-[15px] font-black transition active:scale-95 ${btn}`}>
              ↗
            </button>
          )}
          <span className={`ml-auto pr-1 text-[11.5px] font-bold text-[#8A8FB0]`}>👁 {blogShort(p.views)}</span>
          {/* 🔖 Save lives in the ⋯ menu now */}
        </div>
      </div>

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

// 🫧 the bottom sheet a Mig opens in (X2): slides up, pull the top down to close
function MigSheet({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const start = useRef<number | null>(null);
  const [drag, setDrag] = useState(0);
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-[#0B1F3A]/45 feed-sheet-fade" onClick={onClose}>
      <div
        ref={boxRef}
        onClick={(e) => e.stopPropagation()}
        onTouchStart={(e) => {
          start.current = (boxRef.current?.scrollTop || 0) <= 0 ? e.touches[0].clientY : null;
        }}
        onTouchMove={(e) => {
          if (start.current === null) return;
          const dy = e.touches[0].clientY - start.current;
          setDrag(dy > 0 ? dy : 0);
        }}
        onTouchEnd={() => {
          if (drag > 110) onClose();
          setDrag(0);
          start.current = null;
        }}
        className="feed-sheet-up relative h-[92dvh] w-full max-w-2xl overflow-y-auto overscroll-contain rounded-t-[26px] bg-[#F4F0FF] shadow-2xl"
        style={drag ? { transform: `translateY(${drag}px)`, transition: "none" } : undefined}
      >
        <div className="sticky top-0 z-40 flex justify-center bg-transparent pb-1 pt-2">
          <span className="h-1.5 w-11 rounded-full bg-white/80 shadow" />
        </div>
        <div className="-mt-[14px]">{children}</div>
      </div>
    </div>
  );
}
