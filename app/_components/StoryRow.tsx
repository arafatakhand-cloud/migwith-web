"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { blogAgoBn, blogCall, blogError } from "../../lib/feed";
import { uploadChatImage } from "../../lib/imageUpload";
import { loadStories, type Story } from "../../lib/stories";

// 📸 The story row above the feed: "Your story" to add one, then one ring per
// person who has a story in the last 24 hours. Tap a ring to watch (5 s each).

export function StoryRow({ myUid, myName, colorOf }: { myUid?: string; myName: string; colorOf: (name: string) => string }) {
  const [stories, setStories] = useState<Story[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [viewer, setViewer] = useState<{ items: Story[]; i: number } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const reload = () =>
    loadStories()
      .then(setStories)
      .catch(() => setStories([]));
  useEffect(() => {
    reload();
  }, []);

  // one ring per author, in the order of their newest story
  const byAuthor = useMemo(() => {
    const m = new Map<string, Story[]>();
    (stories || []).forEach((s) => m.set(s.author, [...(m.get(s.author) || []), s]));
    return [...m.entries()];
  }, [stories]);

  // the viewer moves on by itself after 5 seconds
  useEffect(() => {
    if (!viewer) return;
    const t = window.setTimeout(() => next(), 5000);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewer]);
  const next = () =>
    setViewer((v) => (v && v.i + 1 < v.items.length ? { items: v.items, i: v.i + 1 } : null));
  const prev = () => setViewer((v) => (v && v.i > 0 ? { items: v.items, i: v.i - 1 } : v));

  const onFile = async (files: FileList | null) => {
    const f = files?.[0];
    if (!f || !myUid) return;
    setError("");
    setBusy(true);
    try {
      const url = await uploadChatImage(`blog_stories/${myUid}`, f);
      await blogCall("story", { url });
      await reload();
    } catch (e) {
      setError(blogError(e));
    } finally {
      setBusy(false);
    }
  };

  const ring = (name: string, extra: React.ReactNode, onClick: () => void) => (
    <button key={name} type="button" onClick={onClick} className="flex w-[68px] shrink-0 flex-col items-center gap-1 text-center">
      <span className="flex h-[62px] w-[62px] items-center justify-center rounded-full bg-[conic-gradient(#38BDF8,#6366F1,#A855F7,#EC4899,#38BDF8)] p-[2.5px]">
        <span className="flex h-full w-full items-center justify-center rounded-full border-2 border-white text-[18px] font-black text-white" style={{ background: colorOf(name) || "#6366F1" }}>
          {extra}
        </span>
      </span>
      <span className="w-full truncate text-[11.5px] font-bold text-[#1E1B4B]">{name}</span>
    </button>
  );

  return (
    <>
      {error && <p className="mx-3.5 mb-1 text-[12.5px] text-[#B91C1C]">{error}</p>}
      <div className="no-scrollbar mx-3.5 mb-2 flex gap-3 overflow-x-auto pb-1">
        {myUid && (
          <>
            <input ref={fileInput} type="file" accept="image/*" hidden onChange={(e) => (onFile(e.target.files), (e.target.value = ""))} />
            <button type="button" onClick={() => fileInput.current?.click()} disabled={busy} className="flex w-[68px] shrink-0 flex-col items-center gap-1 text-center disabled:opacity-60">
              <span className="flex h-[62px] w-[62px] items-center justify-center rounded-full border-2 border-dashed border-[#6366F1] bg-white text-[24px] font-black text-[#6366F1]">{busy ? "…" : "+"}</span>
              <span className="w-full truncate text-[11.5px] font-bold text-[#1E1B4B]">Your story</span>
            </button>
          </>
        )}
        {byAuthor.map(([name, items]) => ring(name, name.slice(0, 1).toUpperCase(), () => setViewer({ items, i: 0 })))}
        {stories !== null && byAuthor.length === 0 && (
          <span className="self-center text-[12px] text-[#6B6F9A]">No stories in the last 24 hours.</span>
        )}
      </div>

      {viewer && (() => {
        const s = viewer.items[viewer.i];
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90" role="dialog" aria-label="Story">
            <img src={s.url} alt="" className="max-h-full max-w-full object-contain" />
            <div className="absolute left-0 right-0 top-0 flex items-center gap-2 px-4 pt-4 text-white">
              <span className="font-extrabold">{s.author}</span>
              <span className="text-[12px] opacity-80">{blogAgoBn(s.createdMs)}</span>
              <button type="button" onClick={() => setViewer(null)} className="ml-auto rounded-full bg-white/20 px-3 py-1 font-bold">✕</button>
            </div>
            <button type="button" aria-label="Previous" onClick={prev} className="absolute bottom-0 left-0 top-0 w-1/3" />
            <button type="button" aria-label="Next" onClick={next} className="absolute bottom-0 right-0 top-0 w-2/3" />
          </div>
        );
      })()}
    </>
  );
}
