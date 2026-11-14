"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { blogAgoBn, blogCall, blogError } from "../../lib/feed";
import { db } from "../../lib/firebase";
import { uploadChatImage } from "../../lib/imageUpload";
import { loadStories, STORIES_CHANGED, type Story } from "../../lib/stories";
import Link from "next/link";
import { loadSongLibrary, type LibrarySong, STORY_SONG_SECONDS, uploadStorySong } from "../../lib/songUpload";
import { useFeedVideoAllowed } from "../../lib/feedVideoPerm";
import { r2Upload } from "../../lib/r2Upload";
import { VideoEditor } from "./VideoEditor";
import { useBlockSets } from "../../lib/blocks";
import { openReport } from "./ReportDialog";

export type StorySong = { url: string; title: string; startSec: number };

// 📸 Stories (miglife, design S4 + a Facebook-like viewer):
//  • the row: small stacked cards showing each person's story picture / video frame /
//    words; a pink number = stories not seen yet; seen people go to the back, greyed
//  • the viewer: one bar per story at the top, hold to pause, tap left / right, swipe
//    to the next / previous person; ⌄ = everyone's rings, ⋯ = share / mute / report /
//    copy link (mine: edit / delete); a reply box, quick replies and reactions below
//    (a reply goes to their private chat with the story's picture)

type Audience = "everyone" | "friends" | "only_me";

// 😍 the story reactions (same as the server's list)
const STORY_REACTIONS = ["❤️", "😂", "😮", "😢", "😍", "🔥"];
const QUICK_REPLIES = ["Love it ❤️", "✨✨", "🔥"];
type StoryReactor = { name: string; emoji: string; atMs: number };
type Group = { author: string; items: Story[]; unseen: number };

const STORY_MS = 5000;
const storyLink = (id: string) => `${typeof window !== "undefined" ? window.location.origin : "https://web.miglife.app"}/feed?story=${encodeURIComponent(id)}`;

// the picture inside a card / the strip: photo, video frame, or the words on a colour
function StoryThumb({ s, className = "" }: { s: Story; className?: string }) {
  const pic = s.video ? "" : s.url || s.sharedPost?.image || "";
  if (pic) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={pic} alt="" loading="lazy" className={`h-full w-full object-cover ${className}`} />;
  }
  if (s.video && s.url) {
    return <video src={`${s.url}#t=0.5`} muted playsInline preload="metadata" className={`pointer-events-none h-full w-full object-cover ${className}`} />;
  }
  const words = s.text || s.sharedPost?.text || s.caption || "";
  return (
    <span className={`flex h-full w-full items-center justify-center bg-gradient-to-br from-[#38BDF8] via-[#6366F1] to-[#A855F7] p-1.5 text-center text-[10px] font-extrabold leading-tight text-white ${className}`}>
      <span className="line-clamp-4">{words}</span>
    </span>
  );
}

export function StoryRow({
  myUid,
  myName,
  friends,
  colorOf,
}: {
  myUid?: string;
  myName: string;
  friends: string[];
  colorOf: (name: string) => string;
}) {
  const [stories, setStories] = useState<Story[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [draft, setDraft] = useState<string | null>(null); // a photo waiting for its caption
  const [textDraft, setTextDraft] = useState(false); // a story being written
  const fileInput = useRef<HTMLInputElement>(null);

  const reload = () =>
    loadStories()
      .then(setStories)
      .catch(() => setStories([]));
  useEffect(() => {
    reload();
    // 📰 a Mig was shared to my story from the Feed's share sheet
    const again = () => reload();
    window.addEventListener(STORIES_CHANGED, again);
    return () => window.removeEventListener(STORIES_CHANGED, again);
  }, []);

  // 👁 the stories I've seen (story_seen/{me}, kept by the server) and 🔕 the people I muted
  const [seen, setSeen] = useState<Record<string, number>>({});
  const [mutes, setMutes] = useState<string[]>([]);
  useEffect(() => {
    if (!myUid) return;
    const a = onSnapshot(
      doc(db, "story_seen", myUid),
      (s) => setSeen((old) => ({ ...old, ...((s.get("seen") as Record<string, number>) || {}) })),
      () => {}
    );
    const b = onSnapshot(
      doc(db, "story_mutes", myUid),
      (s) => setMutes(((s.get("names") as string[]) || []).map((x) => String(x).toLowerCase())),
      () => {}
    );
    return () => (a(), b());
  }, [myUid]);
  const blockSets = useBlockSets(myUid);

  // 👥 who may see what, then one group per person: me first, then unseen, then seen
  const groups = useMemo<Group[]>(() => {
    const mine = new Set(friends);
    const ok = (stories || []).filter((s) => {
      const low = s.author.toLowerCase();
      if (blockSets.hidden.has(low)) return false;
      if (s.author !== myName && mutes.includes(low)) return false;
      if (s.privacy === "only_me") return s.author === myName;
      if (s.privacy === "friends") return s.author === myName || mine.has(s.author);
      return true;
    });
    const m = new Map<string, Story[]>();
    ok.forEach((s) => m.set(s.author, [...(m.get(s.author) || []), s]));
    const list = [...m.entries()].map(([author, items]) => {
      const sorted = [...items].sort((a, b) => a.createdMs - b.createdMs);
      return { author, items: sorted, unseen: author === myName ? 0 : sorted.filter((s) => !seen[s.id]).length };
    });
    const newest = (g: Group) => Math.max(...g.items.map((s) => s.createdMs));
    return list.sort((a, b) => {
      if (a.author === myName) return -1;
      if (b.author === myName) return 1;
      if (!!a.unseen !== !!b.unseen) return a.unseen ? -1 : 1;
      return newest(b) - newest(a);
    });
  }, [stories, friends, myName, blockSets, mutes, seen]);

  // the viewer: which person, which of their stories
  const [open, setOpen] = useState<{ g: number; i: number } | null>(null);
  const openGroup = (g: number) => {
    const grp = groups[g];
    if (!grp) return;
    const first = grp.items.findIndex((s) => !seen[s.id]);
    setOpen({ g, i: first < 0 || grp.author === myName ? 0 : first });
  };
  // 🔗 /feed?story=ID (a shared link) opens that story
  const linked = useRef(false);
  useEffect(() => {
    if (linked.current || !groups.length || typeof window === "undefined") return;
    const id = new URLSearchParams(window.location.search).get("story");
    if (!id) return;
    linked.current = true;
    const g = groups.findIndex((x) => x.items.some((s) => s.id === id));
    if (g >= 0) setOpen({ g, i: groups[g].items.findIndex((s) => s.id === id) });
    else setToast("That story is gone.");
  }, [groups]);

  const onFile = async (files: FileList | null) => {
    const f = files?.[0];
    if (!f || !myUid) return;
    setError("");
    setBusy(true);
    try {
      setDraft(await uploadChatImage(`blog_stories/${myUid}`, f));
    } catch (e) {
      setError(blogError(e));
    } finally {
      setBusy(false);
    }
  };

  const publish = async (data: { url?: string; caption?: string; text?: string; song?: StorySong | null }, privacy: Audience) => {
    setError("");
    try {
      await blogCall("story", { ...data, privacy });
      await reload();
    } catch (e) {
      setError(blogError(e));
    }
  };

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(""), 2400);
    return () => window.clearTimeout(t);
  }, [toast]);

  return (
    <>
      {error && <p className="mx-3.5 mb-1 text-[12.5px] text-[#B91C1C]">{error}</p>}
      <div className="no-scrollbar mx-3.5 mb-2 flex gap-2.5 overflow-x-auto pb-1 pt-1">
        {myUid && (
          <>
            <input ref={fileInput} type="file" accept="image/*" hidden onChange={(e) => (onFile(e.target.files), (e.target.value = ""))} />
            <button type="button" onClick={() => setTextDraft(true)} disabled={busy} className="flex w-[70px] shrink-0 flex-col items-center gap-1 text-center disabled:opacity-60">
              <span className="flex h-[96px] w-[62px] items-center justify-center rounded-xl border-[1.5px] border-dashed border-[#A5B4FC] bg-white text-[24px] font-black text-[#6366F1]">
                {busy ? "…" : "+"}
              </span>
              <span className="w-full truncate text-[11px] font-bold text-[#1E1B4B]">Your story</span>
            </button>
          </>
        )}
        {groups.map((grp, gi) => {
          const cover = grp.items[grp.items.length - 1];
          const allSeen = grp.author !== myName && grp.unseen === 0;
          const many = grp.items.length > 1;
          const back = many ? grp.items[grp.items.length - 2] : null;
          return (
            <button key={grp.author} type="button" onClick={() => openGroup(gi)} className="story-item flex w-[70px] shrink-0 flex-col items-center gap-1 text-center">
              <span className={`relative ml-1.5 block h-[96px] w-[62px] ${allSeen ? "opacity-70" : ""}`}>
                {back && (
                  <span className="absolute inset-0 -translate-x-1.5 translate-y-1 -rotate-6 overflow-hidden rounded-xl opacity-55">
                    <StoryThumb s={back} />
                  </span>
                )}
                <span
                  className={`absolute inset-0 overflow-hidden rounded-xl border-2 shadow-[0_3px_8px_rgba(0,0,0,.18)] ${allSeen ? "border-[#CBD5E1]" : "border-transparent"}`}
                  style={allSeen ? undefined : { background: "linear-gradient(white,white) padding-box, linear-gradient(135deg,#38BDF8,#6366F1,#A855F7,#EC4899) border-box" }}
                >
                  <StoryThumb s={cover} />
                  {cover.video && <span className="absolute bottom-1 right-1 rounded bg-black/60 px-1 text-[8.5px] font-extrabold text-white">▶</span>}
                </span>
                {many && grp.unseen > 0 && (
                  <span className="absolute -right-1 -top-1 z-10 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-[#DB2777] px-1 text-[10px] font-black text-white shadow">{grp.unseen}</span>
                )}
              </span>
              <span className={`w-full truncate text-[11px] font-bold ${allSeen ? "text-[#94A3B8]" : "text-[#1E1B4B]"}`}>{grp.author === myName ? "You" : grp.author}</span>
            </button>
          );
        })}
        {stories !== null && groups.length === 0 && <span className="self-center text-[12px] text-[#6B6F9A]">No stories in the last 24 hours.</span>}
      </div>
      {toast && <p className="fixed bottom-24 left-1/2 z-[60] -translate-x-1/2 rounded-full bg-black/75 px-4 py-2 text-[13px] text-white">{toast}</p>}

      {draft && (
        <StoryDialog
          uid={myUid}
          title="Add to your story"
          caption=""
          audience="everyone"
          confirmText="Share story"
          maxLen={140}
          placeholder="Write a caption… (optional)"
          hasMedia
          onClose={() => setDraft(null)}
          onConfirm={(caption, audience, song) => {
            const url = draft;
            setDraft(null);
            publish({ url, caption, song }, audience);
          }}
        />
      )}

      {textDraft && (
        <StoryDialog
          uid={myUid}
          title="New story"
          caption=""
          audience="everyone"
          confirmText="Share story"
          maxLen={280}
          placeholder="What's on your mind?"
          allowPhoto
          allowVideo
          onClose={() => setTextDraft(false)}
          onConfirm={(text, audience, song, photoUrl) => {
            setTextDraft(false);
            // a photo in a text story: the photo is the story, the text is its caption
            if (photoUrl) publish({ url: photoUrl, caption: text, song }, audience);
            else publish({ text, song }, audience);
          }}
        />
      )}

      {open && groups[open.g] && (
        <StoryViewer
          groups={groups}
          start={open}
          myUid={myUid}
          myName={myName}
          colorOf={colorOf}
          isSeen={(id) => !!seen[id]}
          onSeen={(id, exp) => setSeen((m) => (m[id] ? m : { ...m, [id]: exp }))}
          onClose={() => setOpen(null)}
          onChanged={async () => {
            setOpen(null);
            await reload();
          }}
          onMute={async (name) => {
            if (!myUid) return;
            const next = Array.from(new Set([...mutes, name.toLowerCase()]));
            try {
              await setDoc(doc(db, "story_mutes", myUid), { names: next, updatedAt: serverTimestamp() });
              setOpen(null);
              setToast(`🔕 ${name}'s stories are muted.`);
            } catch (e) {
              setToast(blogError(e));
            }
          }}
          toast={setToast}
        />
      )}
    </>
  );
}

// ============================================================================
// 📸 The viewer (full screen)
// ============================================================================
function StoryViewer({
  groups, start, myUid, myName, colorOf, isSeen, onSeen, onClose, onChanged, onMute, toast,
}: {
  isSeen: (id: string) => boolean;
  groups: Group[];
  start: { g: number; i: number };
  myUid?: string;
  myName: string;
  colorOf: (name: string) => string;
  onSeen: (id: string, expiresAt: number) => void;
  onClose: () => void;
  onChanged: () => void;
  onMute: (name: string) => void;
  toast: (t: string) => void;
}) {
  const [g, setG] = useState(start.g);
  const [i, setI] = useState(start.i);
  const grp = groups[Math.min(g, groups.length - 1)];
  const current = grp?.items[Math.min(i, grp.items.length - 1)];
  const mine = !!current && !!myUid && current.authorUid === myUid;

  const [held, setHeld] = useState(false);
  const [typing, setTyping] = useState(false);
  const [menu, setMenu] = useState(false);
  const [strip, setStrip] = useState(false);
  const [editing, setEditing] = useState<Story | null>(null);
  const [reactors, setReactors] = useState<StoryReactor[] | null>(null);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [myReacts, setMyReacts] = useState<Record<string, string>>({});
  const [burst, setBurst] = useState<{ emoji: string; key: number } | null>(null);
  const paused = held || typing || menu || strip || !!editing || !!reactors;

  // progress of the current story (0…1), driven by a clock (videos: by the video)
  const [prog, setProg] = useState(0);
  const vid = useRef<HTMLVideoElement>(null);

  const next = () => {
    if (!grp) return onClose();
    if (i + 1 < grp.items.length) setI(i + 1);
    else if (g + 1 < groups.length) (setG(g + 1), setI(firstUnseenOr0(groups[g + 1])));
    else onClose();
  };
  const prev = () => {
    if (i > 0) setI(i - 1);
    else if (g > 0) (setG(g - 1), setI(0));
  };
  const nextPerson = () => (g + 1 < groups.length ? (setG(g + 1), setI(firstUnseenOr0(groups[g + 1]))) : onClose());
  const prevPerson = () => g > 0 && (setG(g - 1), setI(0));
  function firstUnseenOr0(x: Group) {
    if (x.author === myName) return 0;
    const f = x.items.findIndex((s) => !isSeen(s.id));
    return f < 0 ? 0 : f;
  }

  useEffect(() => setProg(0), [current?.id]);
  // ⏱ photos / words: 5 seconds; videos follow the video
  useEffect(() => {
    if (!current || current.video || paused) return;
    let last = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const dt = t - last;
      last = t;
      setProg((p) => {
        const n = p + dt / STORY_MS;
        if (n >= 1) {
          window.setTimeout(next, 0);
          return 1;
        }
        return n;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id, paused]);
  useEffect(() => {
    const v = vid.current;
    if (!v) return;
    if (paused) v.pause();
    else v.play().catch(() => {
      v.muted = true;
      v.play().catch(() => {});
    });
  }, [paused, current?.id]);

  // 👁 tell the server I saw it (once per person; the writer sees who)
  useEffect(() => {
    if (!current) return;
    onSeen(current.id, current.expiresAt);
    if (!mine && myUid) blogCall("storyView", { storyId: current.id }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id]);

  // 😍 my reactions on this person's stories
  const ids = (grp?.items || []).map((s) => s.id).join(",");
  useEffect(() => {
    if (!ids || !myUid) return;
    blogCall("myStoryReacts", { storyIds: ids.split(",") })
      .then((r) => setMyReacts((m) => ({ ...m, ...((r.reactions as Record<string, string>) || {}) })))
      .catch(() => {});
  }, [ids, myUid]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (typing) return;
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  });

  const press = useRef<{ t: number; x: number; y: number } | null>(null);
  const holdTimer = useRef(0);
  if (!grp || !current) return null;

  const react = async (emoji: string) => {
    if (mine) return;
    const was = myReacts[current.id] || "";
    const n = was === emoji ? "" : emoji;
    setMyReacts((m) => ({ ...m, [current.id]: n }));
    if (n) setBurst({ emoji: n, key: Date.now() });
    try {
      await blogCall("storyReact", { storyId: current.id, emoji: n });
    } catch (e) {
      setMyReacts((m) => ({ ...m, [current.id]: was }));
      toast(blogError(e));
    }
  };
  const sendReply = async (text: string) => {
    const t = text.trim();
    if (!t || sending) return;
    setSending(true);
    try {
      await blogCall("storyReply", { storyId: current.id, text: t });
      setReply("");
      setTyping(false);
      toast(`↩️ Sent to ${current.author}`);
    } catch (e) {
      toast(blogError(e));
    } finally {
      setSending(false);
    }
  };
  const openReactors = async () => {
    setReactors([]);
    try {
      const r = await blogCall("storyViewers", { storyId: current.id });
      setReactors((r.viewers as StoryReactor[]) || []);
    } catch (e) {
      setReactors(null);
      toast(blogError(e));
    }
  };
  const share = async () => {
    setMenu(false);
    const url = storyLink(current.id);
    try {
      if (navigator.share) await navigator.share({ title: `${current.author}'s story`, text: `📸 ${current.author}'s story on miGlife`, url });
      else (await navigator.clipboard.writeText(url), toast("Link copied ✓"));
    } catch {
      // closed
    }
  };
  const copy = async () => {
    setMenu(false);
    try {
      await navigator.clipboard.writeText(storyLink(current.id));
      toast("Link copied ✓ (it works for 24 hours)");
    } catch {
      toast("Could not copy.");
    }
  };
  const remove = async () => {
    setMenu(false);
    if (!confirm("Delete this story? It will be gone for everyone.")) return;
    try {
      await blogCall("storyDelete", { storyId: current.id });
      onChanged();
    } catch (e) {
      toast(blogError(e));
    }
  };

  // hold = pause · a short tap: left third = back, the rest = next · swipe = another person
  const down = (e: React.PointerEvent) => {
    press.current = { t: Date.now(), x: e.clientX, y: e.clientY };
    holdTimer.current = window.setTimeout(() => setHeld(true), 220);
  };
  const up = (e: React.PointerEvent) => {
    window.clearTimeout(holdTimer.current);
    const p = press.current;
    press.current = null;
    const wasHeld = held;
    setHeld(false);
    if (!p || wasHeld) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) return dx < 0 ? nextPerson() : prevPerson();
    if (dy > 90) return onClose();
    const w = (e.currentTarget as HTMLElement).clientWidth;
    if (e.clientX - (e.currentTarget as HTMLElement).getBoundingClientRect().left < w / 3) prev();
    else next();
  };

  const face = colorOf(current.author) || "#2563EB";
  return (
    <div className="fixed inset-0 z-50 flex justify-center bg-black" role="dialog" aria-label="Story">
      <div className="relative h-full w-full max-w-[480px] overflow-hidden bg-black text-white">
        {current.song && (
          <audio
            key={current.id}
            src={current.song.url}
            autoPlay
            onLoadedMetadata={(e) => {
              e.currentTarget.currentTime = current.song?.startSec ?? 0;
            }}
            onTimeUpdate={(e) => {
              if (e.currentTarget.currentTime - (current.song?.startSec ?? 0) >= STORY_SONG_SECONDS) e.currentTarget.pause();
            }}
          />
        )}

        {/* the story itself */}
        <div className="absolute inset-0 flex items-center justify-center" onPointerDown={down} onPointerUp={up} onPointerCancel={() => (window.clearTimeout(holdTimer.current), setHeld(false))}>
          {current.sharedPost ? (
            <div className="flex h-full w-full flex-col items-center justify-center gap-5 bg-gradient-to-br from-[#14B88F] via-[#2C9BEA] to-[#6366F1] p-7">
              <Link
                href={`/feed/${current.sharedPost.id}`}
                onClick={onClose}
                onPointerDown={(e) => e.stopPropagation()}
                onPointerUp={(e) => e.stopPropagation()}
                className="relative z-10 block w-full max-w-[300px] -rotate-3 overflow-hidden rounded-[22px] bg-white text-left shadow-[0_24px_50px_-18px_rgba(0,0,0,.55)]"
              >
                <div className="flex items-center gap-2 px-3.5 pb-2 pt-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-[#38BDF8] to-[#6366F1] text-[14px] font-black text-white">
                    {current.sharedPost.author.slice(0, 1).toUpperCase() || "?"}
                  </span>
                  <span className="truncate text-[14px] font-extrabold text-[#0F2F2A]">{current.sharedPost.author}</span>
                </div>
                {current.sharedPost.image && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={current.sharedPost.image} alt="" className="h-44 w-full object-cover" />
                )}
                {current.sharedPost.text && <p className="line-clamp-4 px-3.5 py-2.5 text-[14px] font-semibold leading-5 text-[#1E293B]">{current.sharedPost.text}</p>}
              </Link>
              <span className="story-glass relative z-10 rounded-full px-4 py-2 text-[13px] font-extrabold text-white">👆 Tap the card to see the Mig</span>
            </div>
          ) : current.url && current.video ? (
            <video
              ref={vid}
              key={current.id}
              src={current.url}
              autoPlay
              playsInline
              muted={!!current.song}
              onTimeUpdate={(e) => {
                const d = e.currentTarget.duration;
                if (Number.isFinite(d) && d > 0) setProg(e.currentTarget.currentTime / d);
              }}
              onEnded={next}
              className="max-h-full max-w-full object-contain"
            />
          ) : current.url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={current.url} alt="" draggable={false} className="max-h-full max-w-full select-none object-contain" />
          ) : (
            <div className="flex h-full w-full select-none items-center justify-center bg-gradient-to-br from-[#38BDF8] via-[#6366F1] to-[#A855F7] p-7 text-center text-[24px] font-extrabold leading-snug text-white">
              {current.text}
            </div>
          )}
        </div>

        {/* one bar per story */}
        <div className="pointer-events-none absolute left-2.5 right-2.5 top-2.5 flex gap-1">
          {grp.items.map((s, k) => (
            <span key={s.id} className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/35">
              <span className="block h-full bg-white" style={{ width: k < i ? "100%" : k > i ? "0%" : `${Math.min(100, prog * 100)}%` }} />
            </span>
          ))}
        </div>

        {/* who · when · ⌄ · ⋯ · ✕ */}
        <div className="absolute left-0 right-0 top-5 flex items-center gap-2 px-3 [text-shadow:0_1px_3px_rgba(0,0,0,.6)]">
          <Link href={`/profile/${encodeURIComponent(current.author)}`} onClick={onClose} className="flex min-w-0 items-center gap-2">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border-2 border-white text-[13px] font-black" style={{ background: face }}>
              {current.author.slice(0, 1).toUpperCase()}
            </span>
            <span className="truncate text-[14px] font-extrabold">{current.author}</span>
          </Link>
          <span className="shrink-0 text-[12px] opacity-80">{blogAgoBn(current.createdMs)}</span>
          {current.privacy === "friends" && <span className="text-[12px] opacity-80">👥</span>}
          {current.privacy === "only_me" && <span className="text-[12px] opacity-80">🔒</span>}
          <span className="ml-auto flex items-center gap-1">
            <button type="button" onClick={() => setStrip((x) => !x)} aria-label="Everyone's stories" className={`rounded-full px-2 py-0.5 text-[18px] font-black transition ${strip ? "rotate-180" : ""}`}>
              ⌄
            </button>
            <button type="button" onClick={() => setMenu(true)} aria-label="Story options" className="rounded-full px-2 py-0.5 text-[18px] font-black">
              ⋯
            </button>
            <button type="button" onClick={onClose} aria-label="Close" className="rounded-full px-2 py-0.5 text-[16px] font-bold">
              ✕
            </button>
          </span>
        </div>

        {/* ⌄ everyone's rings */}
        {strip && (
          <div className="no-scrollbar absolute left-0 right-0 top-[58px] z-20 flex gap-3 overflow-x-auto bg-[#111827]/95 px-3 py-3">
            {groups.map((x, k) => (
              <button key={x.author} type="button" onClick={() => (setG(k), setI(0), setStrip(false))} className="flex w-[58px] shrink-0 flex-col items-center gap-1">
                <span className={`h-[54px] w-[54px] rounded-full p-[2.5px] ${x.unseen > 0 ? "bg-[conic-gradient(#38BDF8,#6366F1,#A855F7,#EC4899,#38BDF8)]" : "bg-[#64748B]"} ${k === g ? "ring-2 ring-white" : ""}`}>
                  <span className="block h-full w-full overflow-hidden rounded-full border-2 border-[#111827]">
                    <StoryThumb s={x.items[x.items.length - 1]} />
                  </span>
                </span>
                <span className="w-full truncate text-[10.5px] font-bold">{x.author === myName ? "You" : x.author}</span>
              </button>
            ))}
          </div>
        )}

        {current.song && (
          <span className="story-glass pointer-events-none absolute bottom-[132px] left-1/2 max-w-[80%] -translate-x-1/2 truncate rounded-full px-3.5 py-1.5 text-center text-[12px] font-bold text-white">
            🎵 {current.song.title}
          </span>
        )}
        {(current.url || current.sharedPost) && current.caption && (
          <p className="story-glass pointer-events-none absolute bottom-[172px] left-6 right-6 rounded-2xl px-4 py-2.5 text-center text-[15px] font-bold text-white">{current.caption}</p>
        )}

        {/* below: mine = who saw it; theirs = quick replies, a message, reactions */}
        {mine ? (
          <button
            type="button"
            onClick={openReactors}
            className="absolute bottom-5 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-full bg-white/90 px-4 py-2 text-[13px] font-extrabold text-[#16264A] shadow-lg"
          >
            <span>👁 {current.viewCount || 0}</span>
            {current.reactCount > 0 && (
              <>
                <span className="text-[#5B6B8C]">·</span>
                <span className="text-[17px] tracking-[-2px]">
                  {Object.entries(current.reactions)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 3)
                    .map(([e]) => e)
                    .join("")}
                </span>
                <span>{current.reactCount}</span>
              </>
            )}
            <span className="text-[#5B6B8C]">· See who</span>
          </button>
        ) : (
          <>
            <div className="absolute bottom-[74px] left-3 right-3 z-10 flex justify-center gap-2">
              {QUICK_REPLIES.map((q) => (
                <button key={q} type="button" disabled={sending} onClick={() => sendReply(q)} className="story-glass rounded-full px-3.5 py-1.5 text-[13px] font-bold text-white disabled:opacity-60">
                  {q}
                </button>
              ))}
            </div>
            <div className="absolute bottom-0 left-0 right-0 z-10 flex items-center gap-2 bg-black/80 px-3 py-3">
              <input
                value={reply}
                onChange={(e) => setReply(e.target.value.slice(0, 500))}
                onFocus={() => setTyping(true)}
                onBlur={() => !reply && setTyping(false)}
                onKeyDown={(e) => e.key === "Enter" && sendReply(reply)}
                placeholder="Send message…"
                className="min-w-0 flex-1 rounded-full border border-white/40 bg-transparent px-4 py-2 text-[14px] text-white outline-none placeholder:text-white/60"
              />
              {reply.trim() ? (
                <button type="button" disabled={sending} onClick={() => sendReply(reply)} className="rounded-full bg-white px-4 py-2 text-[13px] font-extrabold text-black disabled:opacity-60">
                  Send
                </button>
              ) : (
                <div className="no-scrollbar flex max-w-[55%] gap-0.5 overflow-x-auto">
                  {STORY_REACTIONS.map((r) => (
                    <button
                      key={r}
                      type="button"
                      aria-label={`React ${r}`}
                      onClick={() => react(r)}
                      className={`grid h-10 w-10 shrink-0 place-items-center rounded-full text-[23px] transition active:scale-125 ${myReacts[current.id] === r ? "scale-110 bg-white/90" : ""}`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {burst && (
          <span key={burst.key} className="story-burst pointer-events-none absolute bottom-28 left-1/2 z-20 -translate-x-1/2 text-[72px]" onAnimationEnd={() => setBurst(null)}>
            {burst.emoji}
          </span>
        )}
        {held && <span className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/40 px-3 py-1 text-[12px] font-bold">⏸ Paused</span>}

        {/* 👁 who saw it (the writer) */}
        {reactors && (
          <div className="absolute inset-x-0 bottom-0 z-30 max-h-[60%] overflow-y-auto rounded-t-3xl bg-white p-4 text-[#16264A]">
            <div className="mb-2 flex items-center">
              <p className="text-[16px] font-extrabold">👁 Seen by · {reactors.length}</p>
              <button type="button" onClick={() => setReactors(null)} className="ml-auto rounded-full bg-[#F1F4F9] px-3 py-1 font-bold">✕</button>
            </div>
            {reactors.length === 0 ? (
              <p className="py-6 text-center text-sm text-[#6B7A99]">No one has seen it yet.</p>
            ) : (
              reactors.map((r) => (
                <div key={r.name} className="flex items-center gap-3 border-b border-[#F0F2F6] py-2.5 last:border-0">
                  <span className="grid h-9 w-9 place-items-center rounded-full font-black text-white" style={{ background: colorOf(r.name) }}>
                    {r.name.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-bold">{r.name}</span>
                    {r.atMs > 0 && <span className="block text-[11.5px] font-normal text-[#6B7A99]">{blogAgoBn(r.atMs)}</span>}
                  </span>
                  <span className="text-[22px]">{r.emoji}</span>
                </div>
              ))
            )}
          </div>
        )}

        {/* ⋯ the menu */}
        {menu && (
          <div className="absolute inset-0 z-40 flex items-end bg-black/40" onClick={() => setMenu(false)}>
            <div className="m-2.5 w-full rounded-2xl bg-white p-1.5 text-[14px] text-[#111827] shadow-xl" onClick={(e) => e.stopPropagation()}>
              {mine ? (
                <>
                  {(current.url || current.sharedPost) && (
                    <MenuRow icon="✏️" title="Edit caption and audience" onClick={() => (setMenu(false), setEditing(current))} />
                  )}
                  <MenuRow icon="👁" title="Seen by" onClick={() => (setMenu(false), openReactors())} />
                  {current.privacy !== "only_me" && <MenuRow icon="🔗" title="Copy link" sub="Works for 24 hours" onClick={copy} />}
                  <MenuRow icon="🗑" title="Delete story" danger onClick={remove} />
                </>
              ) : (
                <>
                  {current.privacy === "everyone" && <MenuRow icon="↗" title="Share this story" onClick={share} />}
                  <MenuRow icon="🔕" title={`Mute ${current.author}'s stories`} sub="Stop seeing their stories" onClick={() => (setMenu(false), onMute(current.author))} />
                  <MenuRow icon="🚩" title="Report" sub={`Tell miGlife about ${current.author}`} onClick={() => (setMenu(false), openReport({ kind: "user", targetUsername: current.author }))} />
                  {current.privacy === "everyone" && <MenuRow icon="🔗" title="Copy link" sub="Works for 24 hours" onClick={copy} />}
                </>
              )}
              <button type="button" onClick={() => setMenu(false)} className="mt-1 block w-full rounded-xl px-3 py-2.5 text-center text-[#6B6F9A]">
                Close
              </button>
            </div>
          </div>
        )}
      </div>

      {editing && (
        <StoryDialog
          uid={myUid}
          title="Edit story"
          caption={editing.caption}
          audience={editing.privacy}
          confirmText="Save"
          onClose={() => setEditing(null)}
          onConfirm={async (caption, audience) => {
            const id = editing.id;
            setEditing(null);
            try {
              await blogCall("storyUpdate", { storyId: id, caption, privacy: audience });
              onChanged();
            } catch (e) {
              toast(blogError(e));
            }
          }}
        />
      )}
    </div>
  );
}

function MenuRow({ icon, title, sub, danger = false, onClick }: { icon: string; title: string; sub?: string; danger?: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-[#F3F4F6] ${danger ? "text-[#DC2626]" : ""}`}>
      <span className="w-6 text-center text-[17px]">{icon}</span>
      <span className="min-w-0">
        <span className="block font-semibold">{title}</span>
        {sub && <span className="block text-[11.5px] text-[#6B7280]">{sub}</span>}
      </span>
    </button>
  );
}

// the caption and the audience (everyone / friends), used to add and to edit a story
export function StoryDialog({
  uid,
  title,
  caption: caption0,
  audience: audience0,
  confirmText,
  maxLen = 140,
  placeholder = "Write a caption… (optional)",
  onClose,
  onConfirm,
  allowPhoto = false,
  allowVideo = false,
  hasMedia = false,
}: {
  uid?: string;
  title: string;
  caption: string;
  audience: Audience;
  confirmText: string;
  maxLen?: number;
  placeholder?: string;
  onClose: () => void;
  onConfirm: (caption: string, audience: Audience, song?: StorySong | null, photoUrl?: string | null) => void;
  /** a text story may also get a photo, added right here */
  allowPhoto?: boolean;
  /** the photo is already chosen (the add-photo flow) */
  hasMedia?: boolean;
  /** 🎬 a video story may be added here too (people allowed Feed videos) */
  allowVideo?: boolean;
}) {
  const [caption, setCaption] = useState(caption0);
  const [audience, setAudience] = useState<Audience>(audience0);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const photoInput = useRef<HTMLInputElement>(null);
  // 🎬 a video story: picked → video editor → uploaded; its link goes where a photo's would
  const [isVideo, setIsVideo] = useState(false);
  const [videoEdit, setVideoEdit] = useState<File | null>(null);
  const videoInput = useRef<HTMLInputElement>(null);
  const feedVideo = useFeedVideoAllowed(allowVideo ? uid : null, null);
  // Share works only with text or a photo
  const canShare = hasMedia || !!photoUrl || caption.trim().length > 0;
  // 🎵 an optional song (plays for the first 30 seconds of the story)
  const [song, setSong] = useState<StorySong | null>(null);
  const [songBusy, setSongBusy] = useState(false);
  const [songErr, setSongErr] = useState("");
  const [library, setLibrary] = useState<LibrarySong[] | null>(null);
  const [showLib, setShowLib] = useState(false);
  const songInput = useRef<HTMLInputElement>(null);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#0B1F3A]/35 p-3 backdrop-blur-[2px]" onClick={onClose}>
      <div className="w-full max-w-md overflow-hidden rounded-[28px] bg-white shadow-[0_24px_60px_-20px_rgba(11,31,58,.45)]" onClick={(e) => e.stopPropagation()}>
        {/* 🌿 a thin mint → sky strip, the Feed's colours */}
        <div className="h-1.5 w-full bg-gradient-to-r from-[#14B88F] to-[#2C9BEA]" />
        <div className="p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-[17px] font-black tracking-tight text-[#0F2F2A]">{title}</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-8 w-8 items-center justify-center rounded-full bg-[#F1F5F9] text-[13px] font-bold text-[#64748B] hover:bg-[#E2E8F0]">✕</button>
        </div>
        <div className="relative mt-3">
          <textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value.slice(0, maxLen))}
            placeholder={placeholder}
            className="h-24 w-full resize-none rounded-2xl border border-[#D7EFE7] bg-gradient-to-b from-[#F6FFFC] to-[#EEF9FF] p-3 pb-6 text-[15px] leading-6 text-[#0F2F2A] outline-none transition placeholder:text-[#8AA79F] focus:border-[#14B88F] focus:ring-4 focus:ring-[#14B88F]/15"
          />
          <span className="pointer-events-none absolute bottom-2 right-3 text-[11px] font-bold tabular-nums text-[#8AA79F]">{caption.length}/{maxLen}</span>
        </div>
        {allowPhoto && (
          <div className="mt-3">
            <input
              ref={photoInput}
              type="file"
              accept="image/*"
              hidden
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f || !uid) return;
                setPhotoBusy(true);
                try {
                  setPhotoUrl(await uploadChatImage(`blog_stories/${uid}`, f));
                } catch (err) {
                  setSongErr(err instanceof Error ? err.message : "Could not add the photo.");
                } finally {
                  setPhotoBusy(false);
                }
              }}
            />
            <input
              ref={videoInput}
              type="file"
              accept="video/mp4,video/webm,video/quicktime"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f && uid) setVideoEdit(f);
              }}
            />
            {videoEdit && (
              <VideoEditor
                file={videoEdit}
                maxSec={feedVideo.maxSeconds}
                sendLabel="Done"
                onCancel={() => setVideoEdit(null)}
                onDone={async (f, secs) => {
                  setVideoEdit(null);
                  setPhotoBusy(true);
                  setSongErr("");
                  try {
                    if (f.size > 50 * 1024 * 1024) throw new Error("That video is over 50 MB. Please trim it shorter.");
                    const url = await r2Upload("story_video", f, f.type, { seconds: Math.round(secs) });
                    if (!url) throw new Error("Video stories are not ready yet.");
                    setPhotoUrl(url);
                    setIsVideo(true);
                  } catch (err) {
                    setSongErr(err instanceof Error ? err.message : "Could not add the video.");
                  } finally {
                    setPhotoBusy(false);
                  }
                }}
              />
            )}
            {photoUrl ? (
              <div className="relative overflow-hidden rounded-2xl">
                {isVideo ? (
                  <video src={photoUrl} muted autoPlay loop playsInline className="h-36 w-full bg-black object-cover" />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photoUrl} alt="Story photo" className="h-36 w-full object-cover" />
                )}
                <button
                  type="button"
                  onClick={() => (setPhotoUrl(null), setIsVideo(false))}
                  aria-label="Remove photo"
                  className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/55 text-[13px] font-bold text-white backdrop-blur"
                >
                  ✕
                </button>
              </div>
            ) : (
              <button
                type="button"
                disabled={photoBusy}
                onClick={() => photoInput.current?.click()}
                className="flex w-full items-center justify-center gap-2 rounded-2xl border-[1.5px] border-dashed border-[#14B88F]/60 bg-[#F3FFFA] py-3 text-[13px] font-extrabold text-[#0E7A62] transition hover:bg-[#E8FBF4] disabled:opacity-50"
              >
                <span aria-hidden>📷</span>
                {photoBusy ? "Adding…" : "Add a photo"}
              </button>
            )}
            {!photoUrl && allowVideo && feedVideo.allowed && (
              <button
                type="button"
                disabled={photoBusy}
                onClick={() => videoInput.current?.click()}
                className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl border-[1.5px] border-dashed border-[#7C3AED]/60 bg-[#FAF5FF] py-3 text-[13px] font-extrabold text-[#7C3AED] transition hover:bg-[#F3E8FF] disabled:opacity-50"
              >
                <span aria-hidden>🎬</span>
                Add a video
              </button>
            )}
          </div>
        )}
        <div className="mt-3 grid grid-cols-3 gap-1 rounded-2xl bg-[#F1F6F4] p-1">
          {([["everyone", "🌍 Everyone"], ["friends", "👥 Friends"], ["only_me", "🔒 Only me"]] as const).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setAudience(k)}
              aria-pressed={audience === k}
              className={`rounded-xl py-2 text-[12.5px] font-extrabold transition ${audience === k ? "bg-white text-[#0E7A62] shadow-[0_2px_8px_-2px_rgba(14,122,98,.35)]" : "text-[#6B7B76] hover:text-[#0F2F2A]"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <input
          ref={songInput}
          type="file"
          accept="audio/*"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f || !uid) return;
            setSongErr("");
            setSongBusy(true);
            try {
              const up = await uploadStorySong(uid, f);
              setSong({ url: up.url, title: up.title, startSec: 0 });
            } catch (err) {
              setSongErr(err instanceof Error ? err.message : "Could not add the song.");
            } finally {
              setSongBusy(false);
            }
          }}
        />
        <div className="mt-3">
          {song ? (
            <div className="flex items-center gap-2 rounded-2xl bg-[#F4F6FD] px-3 py-2 text-[13px] font-bold text-[#1E1B4B]">
              <span>🎵</span>
              <span className="min-w-0 flex-1 truncate">{song.title}</span>
              <span className="text-[11px] text-[#6B6F9A]">first {STORY_SONG_SECONDS} sec</span>
              <button type="button" onClick={() => setSong(null)} aria-label="Remove song" className="text-[#8494B2]">✕</button>
            </div>
          ) : (
            <button
              type="button"
              disabled={songBusy}
              onClick={() => songInput.current?.click()}
              className="rounded-full bg-[#EEF0FF] px-3.5 py-1.5 text-[12.5px] font-extrabold text-[#4F46E5] disabled:opacity-50"
            >
              {songBusy ? "🎵 Adding song…" : "🎵 Add a song"}
            </button>
          )}
          {!song && (
            <button
              type="button"
              onClick={async () => {
                setShowLib((v) => !v);
                if (library === null) setLibrary(await loadSongLibrary().catch(() => []));
              }}
              className="ml-2 rounded-full bg-[#F1EFFF] px-3.5 py-1.5 text-[12.5px] font-extrabold text-[#4F46E5]"
            >
              🎼 Library
            </button>
          )}
          {showLib && !song && (
            <div className="mt-2 max-h-44 overflow-y-auto rounded-2xl border border-[#E5EAF5] bg-white p-1.5">
              {library === null && <p className="px-2 py-2 text-[12.5px] text-[#6B6F9A]">Loading…</p>}
              {library !== null && library.length === 0 && <p className="px-2 py-2 text-[12.5px] text-[#6B6F9A]">No songs in the library yet.</p>}
              {(library || []).map((x) => (
                <button
                  key={x.id}
                  type="button"
                  onClick={() => {
                    setSong({ url: x.url, title: x.artist ? `${x.title} · ${x.artist}` : x.title, startSec: 0 });
                    setShowLib(false);
                  }}
                  className="block w-full rounded-xl px-3 py-2 text-left hover:bg-[#F4F6FD]"
                >
                  <span className="block text-[13.5px] font-bold text-[#1E1B4B]">🎵 {x.title}</span>
                  <span className="block text-[11.5px] text-[#6B6F9A]">{[x.artist, x.category].filter(Boolean).join(" · ")}</span>
                </button>
              ))}
            </div>
          )}
          {songErr && <p className="mt-1 text-[12px] text-[#B91C1C]">{songErr}</p>}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-full px-4 py-2 font-bold text-[#4F46E5]">Cancel</button>
          <button
            type="button"
            disabled={!canShare || photoBusy}
            onClick={() => onConfirm(caption.trim(), audience, song, photoUrl)}
            className="rounded-full bg-gradient-to-r from-[#14B88F] to-[#2C9BEA] px-6 py-2.5 font-extrabold text-white shadow-[0_10px_20px_-10px_rgba(20,184,143,.8)] transition enabled:hover:brightness-105 disabled:cursor-not-allowed disabled:bg-none disabled:bg-[#D9E2E0] disabled:text-[#8AA79F] disabled:shadow-none"
          >
            {confirmText}
          </button>
        </div>
        </div>
      </div>
    </div>
  );
}
