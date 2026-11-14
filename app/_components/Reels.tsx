"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { collection, getDocs, limit, query, where } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { blogAgoBn, blogCall, blogError, blogShort, toBlogPost, type BlogPost } from "../../lib/feed";
import { ViewersSheet } from "./ViewersSheet";

// 🎬 Reels (miglife, design R1): every public Feed video, full screen, one at a
// time. Scroll / swipe up = next, down = back. Tap = pause / play, double tap = ❤️.
// Right side: the writer (+ follow), ❤️, 💬 (opens the post), ↗ share, 👁 views
// (the writer: who saw it). Bottom: name, Follow, the words. Thin line = progress.

const plain = (s: string) => s.replace(/<[^>]+>/g, " ").replace(/[*_#>`~]/g, "").replace(/\s+/g, " ").trim();

export function Reels({
  startId,
  myUid,
  myName,
  followed,
  onFollow,
  colorOf,
  onClose,
  onComments,
  onProfile,
}: {
  startId: string;
  myUid?: string;
  myName: string;
  followed: string[];
  onFollow: (name: string) => void;
  colorOf: (name: string) => string;
  onClose: () => void;
  onComments: (postId: string) => void;
  onProfile: (name: string) => void;
}) {
  const [reels, setReels] = useState<BlogPost[] | null>(null);
  const [react, setReact] = useState<Record<string, string>>({});
  const [adj, setAdj] = useState<Record<string, number>>({});
  const [active, setActive] = useState(0);
  const [viewersOf, setViewersOf] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let gone = false;
    getDocs(query(collection(db, "blog_posts"), where("video", ">", ""), limit(300)))
      .then(async (snap) => {
        const list = snap.docs
          .map((d) => toBlogPost(d.id, d.data()))
          .filter((p) => p.video && !p.privacy)
          .sort((a, b) => b.createdMs - a.createdMs);
        if (gone) return;
        setReels(list);
        const at = Math.max(0, list.findIndex((p) => p.id === startId));
        setActive(at);
        requestAnimationFrame(() => box.current?.children[at]?.scrollIntoView({ block: "start" }));
        if (myUid && list.length) {
          for (let i = 0; i < list.length; i += 100) {
            const r = await blogCall("myReactions", { postIds: list.slice(i, i + 100).map((p) => p.id), privateIds: [] }).catch(() => null);
            if (r && !gone) setReact((m) => ({ ...m, ...((r.reactions as Record<string, string>) || {}) }));
          }
        }
      })
      .catch(() => !gone && setReels([]));
    return () => {
      gone = true;
    };
  }, [startId, myUid]);

  // which reel fills the screen
  useEffect(() => {
    const el = box.current;
    if (!el || !reels?.length) return;
    const io = new IntersectionObserver(
      (es) => es.forEach((e) => e.isIntersecting && e.intersectionRatio > 0.6 && setActive(Number((e.target as HTMLElement).dataset.i))),
      { root: el, threshold: [0.6] }
    );
    Array.from(el.children).forEach((c) => io.observe(c));
    return () => io.disconnect();
  }, [reels]);

  // 👁 counted once per person (the server keeps who)
  const activeId = reels?.[active]?.id || "";
  useEffect(() => {
    if (activeId && myUid) blogCall("view", { postId: activeId }).catch(() => {});
  }, [activeId, myUid]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", k);
      document.body.style.overflow = old;
    };
  }, [onClose]);

  const like = async (p: BlogPost, onlyAdd = false) => {
    if (!myUid) return setToast("Log in to like.");
    const was = react[p.id] || "";
    if (onlyAdd && was) return;
    const send = was || "❤️";
    setReact((m) => ({ ...m, [p.id]: was ? "" : "❤️" }));
    setAdj((m) => ({ ...m, [p.id]: (m[p.id] || 0) + (was ? -1 : 1) }));
    try {
      await blogCall("react", { postId: p.id, reaction: send });
    } catch (e) {
      setReact((m) => ({ ...m, [p.id]: was }));
      setAdj((m) => ({ ...m, [p.id]: (m[p.id] || 0) + (was ? 1 : -1) }));
      setToast(blogError(e));
    }
  };
  const share = async (p: BlogPost) => {
    const url = `${window.location.origin}/feed/${p.id}`;
    try {
      if (navigator.share) await navigator.share({ title: p.title, text: `🎬 ${p.title} — by ${p.author} on miGlife`, url });
      else {
        await navigator.clipboard.writeText(url);
        setToast("Link copied ✓");
      }
    } catch {
      // closed the share sheet
    }
  };
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(""), 2200);
    return () => window.clearTimeout(t);
  }, [toast]);

  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[80] bg-black text-white" role="dialog" aria-label="Reels">
      {reels === null && <p className="absolute inset-0 grid place-items-center opacity-70">Loading videos…</p>}
      {reels && reels.length === 0 && <p className="absolute inset-0 grid place-items-center opacity-70">No videos yet.</p>}
      <div ref={box} className="no-scrollbar h-full snap-y snap-mandatory overflow-y-scroll">
        {(reels || []).map((p, i) => (
          <Reel
            key={p.id}
            i={i}
            p={p}
            active={i === active}
            near={Math.abs(i - active) <= 1}
            mine={!!myUid && p.authorUid === myUid}
            react={react[p.id] || ""}
            likes={Math.max(0, p.likes + (adj[p.id] || 0))}
            following={!myUid || p.authorUid === myUid ? null : followed.includes(p.author)}
            color={colorOf(p.author) || "#2563EB"}
            onLike={(onlyAdd) => like(p, onlyAdd)}
            onComments={() => onComments(p.id)}
            onShare={() => share(p)}
            onViews={() => myUid && p.authorUid === myUid && setViewersOf(p.id)}
            onProfile={() => onProfile(p.author)}
            onFollow={() => onFollow(p.author)}
          />
        ))}
      </div>
      <div className="pointer-events-none absolute left-0 right-0 top-0 flex items-center gap-1 px-3 pt-3">
        <button type="button" onClick={onClose} aria-label="Back" className="pointer-events-auto rounded-full px-3 text-[30px] font-bold leading-none [text-shadow:0_2px_6px_rgba(0,0,0,.6)]">
          ‹
        </button>
        <span className="text-[18px] font-extrabold [text-shadow:0_2px_6px_rgba(0,0,0,.6)]">🎬 Reels</span>
        <span className="ml-auto hidden text-[12px] opacity-70 sm:block">↑ ↓ scroll · Esc closes</span>
      </div>
      {toast && <p className="absolute bottom-24 left-1/2 -translate-x-1/2 rounded-full bg-black/70 px-4 py-2 text-[13px]">{toast}</p>}
      {viewersOf && <ViewersSheet postId={viewersOf} onClose={() => setViewersOf(null)} />}
    </div>,
    document.body
  );
}

function Reel({
  i, p, active, near, mine, react, likes, following, color,
  onLike, onComments, onShare, onViews, onProfile, onFollow,
}: {
  i: number; p: BlogPost; active: boolean; near: boolean; mine: boolean; react: string; likes: number; following: boolean | null; color: string;
  onLike: (onlyAdd: boolean) => void; onComments: () => void; onShare: () => void; onViews: () => void; onProfile: () => void; onFollow: () => void;
}) {
  const vid = useRef<HTMLVideoElement>(null);
  const [paused, setPaused] = useState(false);
  const [prog, setProg] = useState(0);
  const [heart, setHeart] = useState(0);
  const [more, setMore] = useState(false);
  const lastTap = useRef(0);
  const tapTimer = useRef(0);

  useEffect(() => {
    const v = vid.current;
    if (!v) return;
    if (active && !paused) {
      v.play().catch(() => {
        // the browser wants sound off until the person has tapped
        v.muted = true;
        v.play().catch(() => {});
      });
    } else v.pause();
    if (!active) setPaused(false);
  }, [active, paused]);

  const tap = () => {
    const now = Date.now();
    if (now - lastTap.current < 280) {
      window.clearTimeout(tapTimer.current);
      lastTap.current = 0;
      onLike(true);
      setHeart(now);
      return;
    }
    lastTap.current = now;
    tapTimer.current = window.setTimeout(() => {
      const v = vid.current;
      if (v && v.muted) v.muted = false; // the first tap also turns the sound on
      setPaused((x) => !x);
    }, 280);
  };

  const words = [p.title.trim(), plain(p.body || "")].filter(Boolean).filter((x, j, a) => a.indexOf(x) === j).join(" · ");
  return (
    <section data-i={i} className="relative h-full w-full snap-start snap-always overflow-hidden bg-black">
      {near ? (
        <video
          ref={vid}
          src={p.video}
          poster={p.thumb || undefined}
          loop
          playsInline
          preload={active ? "auto" : "metadata"}
          onTimeUpdate={(e) => setProg(e.currentTarget.duration ? e.currentTarget.currentTime / e.currentTarget.duration : 0)}
          className="absolute inset-0 h-full w-full object-contain"
        />
      ) : (
        p.thumb && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.thumb} alt="" className="absolute inset-0 h-full w-full object-contain" />
        )
      )}
      <button type="button" aria-label={paused ? "Play" : "Pause"} onClick={tap} className="absolute inset-0" />
      {paused && active && <span className="pointer-events-none absolute left-1/2 top-1/2 grid h-[68px] w-[68px] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-black/40 text-[28px]">▶</span>}
      {heart > 0 && (
        <span key={heart} className="story-burst pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[96px]" onAnimationEnd={() => setHeart(0)}>
          ❤️
        </span>
      )}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[42%] bg-gradient-to-b from-transparent to-black/75" />

      {/* right side */}
      <div className="absolute bottom-[110px] right-2.5 flex flex-col items-center gap-4">
        <div className="relative mb-1">
          <button type="button" onClick={onProfile} className="grid h-[46px] w-[46px] place-items-center rounded-full border-2 border-white text-[18px] font-black" style={{ background: color }}>
            {p.author.slice(0, 1).toUpperCase()}
          </button>
          {following === false && (
            <button type="button" onClick={onFollow} aria-label="Follow" className="absolute -bottom-2.5 left-1/2 grid h-5 w-5 -translate-x-1/2 place-items-center rounded-full bg-[#DB2777] text-[14px] font-black">
              +
            </button>
          )}
        </div>
        {(
          [
            [react || "🤍", blogShort(likes), () => onLike(false)],
            ["💬", blogShort(p.comments), onComments],
            ...(p.privacy ? [] : [["↗", "Share", onShare] as const]),
            ["👁", blogShort(p.views), onViews],
          ] as const
        ).map(([icon, label, fn]) => (
          <button key={String(label) + icon} type="button" onClick={fn} className="flex flex-col items-center gap-0.5 rounded-xl p-1 text-[12px] font-bold">
            <span className="text-[28px] leading-none [filter:drop-shadow(0_2px_4px_rgba(0,0,0,.5))]">{icon}</span>
            {label}
          </button>
        ))}
        {mine && <span className="-mt-3 text-[10px] opacity-70">tap 👁</span>}
      </div>

      {/* bottom left */}
      <div className="absolute bottom-7 left-4 right-[84px]">
        <div className="flex items-center gap-2">
          <button type="button" onClick={onProfile} className="text-[15px] font-extrabold">{p.author}</button>
          {following !== null && (
            <button type="button" onClick={onFollow} className="rounded-lg border-[1.5px] border-white px-2.5 py-0.5 text-[12px] font-bold">
              {following ? "Following" : "Follow"}
            </button>
          )}
        </div>
        {words && (
          <button type="button" onClick={() => setMore((m) => !m)} className={`mt-1.5 block text-left text-[14px] leading-[19px] ${more ? "line-clamp-[8]" : "line-clamp-2"}`}>
            {words}
          </button>
        )}
        <p className="mt-1 text-[12px] opacity-70">{blogAgoBn(p.createdMs)}</p>
      </div>

      <div className="absolute inset-x-0 bottom-0 h-[3px] bg-white/25">
        <div className="h-full bg-white" style={{ width: `${Math.min(100, prog * 100)}%` }} />
      </div>
    </section>
  );
}
