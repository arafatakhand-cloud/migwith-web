"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { blogAgoBn, blogCall, blogError, blogShort, type BlogPost } from "../../lib/feed";
import { openReport } from "./ReportDialog";

// 🖼 Feed photos (miglife, P1 + P2):
//  P1 · hold a photo → a sheet: Save · Download · Copy link · Share, then
//       Notify me about this Mig · Hide this Mig · Why am I seeing this? · Report photo
//  P2 · tap a photo → full screen: swipe between the Mig's photos ("1 / 3"),
//       pinch / double-tap to zoom, pull down to close; the writer, the words,
//       the counts and Like · Comment · Share · Save · ⋯ below

/** every photo of a Mig: the cover, then the pictures inside the writing */
export function photosOf(p: BlogPost): string[] {
  const inBody = (p.body || "")
    .split("\n")
    .map((l) => /^!\[\]\((.+)\)$/.exec(l.trim())?.[1] || "")
    .filter(Boolean);
  const all = [p.cover, ...inBody, p.firstImage].filter(Boolean);
  return [...new Set(all)].slice(0, 10);
}

const postLink = (id: string) => `${typeof window !== "undefined" ? window.location.origin : "https://web.miglife.app"}/feed/${id}`;

export function PhotoMenu({
  post,
  photo,
  saved,
  why,
  hidden,
  onSave,
  onShare,
  onHide,
  onClose,
  toast,
}: {
  post: BlogPost;
  photo: string;
  saved: boolean;
  why: string;
  hidden: boolean;
  onSave: () => void;
  onShare: () => void;
  onHide: () => void;
  onClose: () => void;
  toast: (t: string) => void;
}) {
  const [watch, setWatch] = useState<boolean | null>(null);
  const [showWhy, setShowWhy] = useState(false);
  useEffect(() => {
    blogCall("watchState", { postId: post.id })
      .then((r) => setWatch(r.on === true))
      .catch(() => setWatch(false));
  }, [post.id]);

  const download = async () => {
    onClose();
    try {
      const r = await fetch(photo);
      if (!r.ok) throw new Error();
      const blob = await r.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `miglife-${post.id}.${blob.type.includes("png") ? "png" : blob.type.includes("gif") ? "gif" : "jpg"}`;
      a.click();
      window.setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    } catch {
      window.open(photo, "_blank", "noopener");
    }
  };
  const copy = async () => {
    onClose();
    try {
      await navigator.clipboard.writeText(postLink(post.id));
      toast("Link copied ✓");
    } catch {
      toast("Could not copy.");
    }
  };
  const toggleWatch = async () => {
    const on = !watch;
    setWatch(on);
    try {
      await blogCall("watchPost", { postId: post.id, on });
      toast(on ? "🔔 You'll hear about new comments on this Mig." : "🔕 No more alerts for this Mig.");
    } catch (e) {
      setWatch(!on);
      toast(blogError(e));
    }
  };

  if (typeof document === "undefined") return null;
  const big = (icon: string, label: string, fn: () => void, on = false) => (
    <button type="button" onClick={fn} className={`flex flex-1 flex-col items-center gap-1 rounded-2xl py-2.5 text-[11.5px] font-extrabold ${on ? "bg-[#EDE9FE] text-[#6D28D9]" : "bg-[#F4F3FF] text-[#4C1D95]"}`}>
      <span className="text-[20px]">{icon}</span>
      {label}
    </button>
  );
  const row = (icon: string, title: string, sub: string, fn: () => void, danger = false) => (
    <button type="button" onClick={fn} className={`flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left hover:bg-[#F8FAFC] ${danger ? "text-[#DC2626]" : "text-[#111827]"}`}>
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] bg-[#F1F5F9] text-[16px]">{icon}</span>
      <span className="min-w-0">
        <span className="block text-[14px] font-semibold">{title}</span>
        {sub && <span className="block text-[11.5px] text-[#6B7280]">{sub}</span>}
      </span>
    </button>
  );
  return createPortal(
    <div className="fixed inset-0 z-[96] flex items-end justify-center bg-slate-900/45" onClick={onClose}>
      <div className="w-full max-w-md rounded-t-[22px] bg-white px-2.5 pb-[max(14px,env(safe-area-inset-bottom))] pt-2" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto mb-2.5 h-1 w-10 rounded-full bg-[#CBD5E1]" />
        <div className="mb-1.5 flex gap-2">
          {big("🔖", saved ? "Saved" : "Save", () => (onSave(), onClose(), toast(saved ? "Removed from Saved" : "🔖 Saved")), saved)}
          {big("⬇️", "Download", download)}
          {big("🔗", "Copy link", copy)}
          {!post.privacy && big("↗", "Share", () => (onClose(), onShare()))}
        </div>
        {row(watch ? "🔕" : "🔔", watch ? "Stop notifications for this Mig" : "Notify me about this Mig", "New comments on this post", toggleWatch)}
        {row("🙈", hidden ? "Show this Mig again" : "Hide this Mig", hidden ? "It comes back to your Feed" : "It won't show in your Feed", () => (onClose(), onHide()))}
        {row("💡", "Why am I seeing this?", showWhy ? why : "", () => setShowWhy((x) => !x))}
        {row("🚩", "Report photo", `Tell miGlife about ${post.author}'s photo`, () => (onClose(), openReport({ kind: "blog_post", targetUsername: post.author, messageId: post.id, preview: post.title })), true)}
      </div>
    </div>,
    document.body
  );
}

export function PhotoViewer({
  post,
  photos,
  start,
  reaction,
  saved,
  onLike,
  onComments,
  onShare,
  onSave,
  onMenu,
  onClose,
}: {
  post: BlogPost;
  photos: string[];
  start: number;
  reaction: string;
  saved: boolean;
  onLike: () => void;
  onComments: () => void;
  onShare: () => void;
  onSave: () => void;
  onMenu: (photo: string) => void;
  onClose: () => void;
}) {
  const [i, setI] = useState(Math.min(start, photos.length - 1));
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [pull, setPull] = useState(0);
  const touch = useRef<{ x: number; y: number; d: number; z: number; px: number; py: number } | null>(null);
  const lastTap = useRef(0);

  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [i]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") setI((x) => Math.min(photos.length - 1, x + 1));
      if (e.key === "ArrowLeft") setI((x) => Math.max(0, x - 1));
    };
    window.addEventListener("keydown", k);
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", k);
      document.body.style.overflow = old;
    };
  }, [photos.length, onClose]);

  const dist = (t: React.TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  const onStart = (e: React.TouchEvent) => {
    const t = e.touches;
    touch.current = { x: t[0].clientX, y: t[0].clientY, d: t.length > 1 ? dist(t) : 0, z: zoom, px: pan.x, py: pan.y };
  };
  const onMove = (e: React.TouchEvent) => {
    const s = touch.current;
    if (!s) return;
    const t = e.touches;
    if (t.length > 1 && s.d) return setZoom(Math.min(4, Math.max(1, (s.z * dist(t)) / s.d)));
    const dx = t[0].clientX - s.x, dy = t[0].clientY - s.y;
    if (zoom > 1) return setPan({ x: s.px + dx, y: s.py + dy });
    if (dy > 0 && Math.abs(dy) > Math.abs(dx)) setPull(dy);
  };
  const onEnd = (e: React.TouchEvent) => {
    const s = touch.current;
    touch.current = null;
    if (!s || zoom > 1) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - s.x, dy = t.clientY - s.y;
    if (pull > 120) return onClose();
    setPull(0);
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) setI((x) => Math.max(0, Math.min(photos.length - 1, x + (dx < 0 ? 1 : -1))));
  };
  const tap = () => {
    const now = Date.now();
    if (now - lastTap.current < 300) {
      lastTap.current = 0;
      setZoom((z) => (z > 1 ? 1 : 2.2));
      setPan({ x: 0, y: 0 });
    } else lastTap.current = now;
  };

  if (typeof document === "undefined") return null;
  const total = Object.values(post.reactions || {}).reduce((a, b) => a + b, 0) || post.likes;
  const tops = Object.entries(post.reactions || {})
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([e]) => e)
    .join("");
  const words = [post.title, post.excerpt].filter((x, k, a) => x && a.indexOf(x) === k).join(" · ");
  return createPortal(
    <div className="fixed inset-0 z-[90] flex flex-col bg-black text-white" style={{ opacity: pull ? Math.max(0.35, 1 - pull / 400) : 1 }}>
      <div className="flex items-center px-3 pt-[max(10px,env(safe-area-inset-top))]">
        <button type="button" onClick={onClose} aria-label="Close" className="px-2 py-1 text-[22px]">✕</button>
        {photos.length > 1 && <span className="ml-auto rounded-full bg-white/15 px-3 py-0.5 text-[13px] font-extrabold">{i + 1} / {photos.length}</span>}
      </div>
      <div
        className="relative flex min-h-0 flex-1 touch-none select-none items-center justify-center overflow-hidden"
        onTouchStart={onStart}
        onTouchMove={onMove}
        onTouchEnd={onEnd}
        onClick={tap}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photos[i]}
          alt=""
          draggable={false}
          className="max-h-full max-w-full object-contain transition-transform duration-75"
          style={{ transform: `translate(${pan.x}px, ${pan.y + pull}px) scale(${zoom})` }}
        />
        {photos.length > 1 && i > 0 && (
          <button type="button" onClick={(e) => (e.stopPropagation(), setI(i - 1))} aria-label="Previous photo" className="absolute left-2 top-1/2 hidden h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-white/15 text-[20px] sm:grid">‹</button>
        )}
        {photos.length > 1 && i < photos.length - 1 && (
          <button type="button" onClick={(e) => (e.stopPropagation(), setI(i + 1))} aria-label="Next photo" className="absolute right-2 top-1/2 hidden h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-white/15 text-[20px] sm:grid">›</button>
        )}
      </div>
      {photos.length > 1 && (
        <div className="flex justify-center gap-1.5 py-2">
          {photos.map((_, k) => (
            <span key={k} className={`h-1.5 rounded-full transition-all ${k === i ? "w-4 bg-white" : "w-1.5 bg-white/40"}`} />
          ))}
        </div>
      )}
      <div className="px-4 pb-2 text-[13px]">
        <p>
          <b className="text-[14px]">{post.author}</b> <span className="opacity-70">· {blogAgoBn(post.createdMs)}</span>
        </p>
        {words && <p className="mt-0.5 line-clamp-2 opacity-95">{words}</p>}
        <p className="mt-1 text-[12px] opacity-70">
          {total > 0 && `${tops || "👍"} ${blogShort(total)}`}
          {total > 0 && post.comments > 0 && " · "}
          {post.comments > 0 && `${blogShort(post.comments)} comments`}
        </p>
      </div>
      <div className="flex items-center justify-around border-t border-white/15 pb-[max(10px,env(safe-area-inset-bottom))] pt-2.5 text-[13px] font-bold">
        <button type="button" onClick={onLike} className="px-2 py-1">{reaction || "🤍"} Like</button>
        <button type="button" onClick={onComments} className="px-2 py-1">💬 {blogShort(post.comments)}</button>
        {!post.privacy && <button type="button" onClick={onShare} className="px-2 py-1">↗ Share</button>}
        <button type="button" onClick={onSave} className="px-2 py-1">{saved ? "✅ Saved" : "🔖 Save"}</button>
        <button type="button" onClick={() => onMenu(photos[i])} aria-label="More" className="px-2 py-1 text-[18px]">⋯</button>
      </div>
    </div>,
    document.body
  );
}
