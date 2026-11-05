"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { blogAgoBn, blogCall, blogError } from "../../lib/feed";
import { uploadChatImage } from "../../lib/imageUpload";
import { loadStories, type Story } from "../../lib/stories";

// 📸 The story row above the feed: "Your story" adds one (photo, caption, who sees it).
// Tap a ring to watch (5 s each). The writer can edit the caption / audience or delete it.

type Audience = "everyone" | "friends" | "only_me";

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
  const [viewer, setViewer] = useState<Story[] | null>(null);
  const [draft, setDraft] = useState<string | null>(null); // a photo waiting for its caption
  const fileInput = useRef<HTMLInputElement>(null);

  const reload = () =>
    loadStories()
      .then(setStories)
      .catch(() => setStories([]));
  useEffect(() => {
    reload();
  }, []);

  // 👥 friends-only stories show to the writer and their friends
  const visible = useMemo(() => {
    const mine = new Set(friends);
    return (stories || []).filter((s) => {
      if (s.privacy === "only_me") return s.author === myName;
      if (s.privacy === "friends") return s.author === myName || mine.has(s.author);
      return true;
    });
  }, [stories, friends, myName]);

  const byAuthor = useMemo(() => {
    const m = new Map<string, Story[]>();
    visible.forEach((s) => m.set(s.author, [...(m.get(s.author) || []), s]));
    return [...m.entries()];
  }, [visible]);

  const [menu, setMenu] = useState(false);
  const [editing, setEditing] = useState<Story | null>(null);
  const [index, setIndex] = useState(0);

  // the viewer moves on by itself after 5 seconds, unless the writer's menu or editor is open
  useEffect(() => {
    if (!viewer || menu || editing) return;
    const t = window.setTimeout(() => {
      if (index + 1 < viewer.length) setIndex(index + 1);
      else setViewer(null);
    }, 5000);
    return () => window.clearTimeout(t);
  }, [viewer, index, menu, editing]);

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

  const publish = async (url: string, caption: string, privacy: Audience) => {
    setError("");
    try {
      await blogCall("story", { url, caption, privacy });
      await reload();
    } catch (e) {
      setError(blogError(e));
    }
  };

  const current = viewer ? viewer[Math.min(index, viewer.length - 1)] : null;
  const mine = !!current && !!myUid && current.authorUid === myUid;

  const removeCurrent = async () => {
    if (!current || !confirm("Delete this story? It will be gone for everyone.")) return;
    try {
      await blogCall("storyDelete", { storyId: current.id });
      setViewer(null);
      await reload();
    } catch (e) {
      setError(blogError(e));
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
        {byAuthor.map(([name, items]) => ring(name, name.slice(0, 1).toUpperCase(), () => { setIndex(0); setViewer(items); }))}
        {stories !== null && byAuthor.length === 0 && <span className="self-center text-[12px] text-[#6B6F9A]">No stories in the last 24 hours.</span>}
      </div>

      {draft && (
        <StoryDialog
          title="Add to your story"
          caption=""
          audience="everyone"
          confirmText="Share story"
          onClose={() => setDraft(null)}
          onConfirm={(caption, audience) => {
            const url = draft;
            setDraft(null);
            publish(url, caption, audience);
          }}
        />
      )}

      {viewer && current && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90" role="dialog" aria-label="Story">
          <img src={current.url} alt="" className="max-h-full max-w-full object-contain" />
          <button type="button" aria-label="Previous" onClick={() => setIndex((i) => Math.max(0, i - 1))} className="absolute bottom-0 left-0 top-0 w-1/3" />
          <button
            type="button"
            aria-label="Next"
            onClick={() => (viewer && index + 1 < viewer.length ? setIndex(index + 1) : setViewer(null))}
            className="absolute bottom-0 right-0 top-0 w-2/3"
          />
          <div className="absolute left-0 right-0 top-0 flex items-center gap-2 px-4 pt-4 text-white">
            <span className="font-extrabold">{current.author}</span>
            {current.privacy === "friends" && <span className="text-[12px] opacity-80">👥</span>}
            {current.privacy === "only_me" && <span className="text-[12px] opacity-80">🔒</span>}
            <span className="text-[12px] opacity-80">{blogAgoBn(current.createdMs)}</span>
            {mine && (
              <button type="button" onClick={() => setMenu(true)} aria-label="Story options" className="ml-auto rounded-full bg-white/20 px-3 py-1 font-black">
                ⋯
              </button>
            )}
            <button type="button" onClick={() => setViewer(null)} className={`${mine ? "" : "ml-auto"} rounded-full bg-white/20 px-3 py-1 font-bold`}>
              ✕
            </button>
          </div>
          {current.caption && (
            <p className="absolute bottom-10 left-6 right-6 rounded-xl bg-black/45 px-3 py-2 text-center text-[15px] font-bold text-white">{current.caption}</p>
          )}
          {menu && (
            <div className="absolute inset-x-6 bottom-24 z-10 rounded-2xl bg-white p-3 shadow-xl" onClick={(e) => e.stopPropagation()}>
              <button type="button" onClick={() => { setMenu(false); setEditing(current); }} className="block w-full rounded-xl px-3 py-3 text-left font-bold text-[#2563EB] hover:bg-[#F3F6FF]">
                ✏️ Edit caption and audience
              </button>
              <button type="button" onClick={() => { setMenu(false); removeCurrent(); }} className="block w-full rounded-xl px-3 py-3 text-left font-bold text-[#DC2626] hover:bg-[#FFF1F2]">
                🗑 Delete story
              </button>
              <button type="button" onClick={() => setMenu(false)} className="mt-1 block w-full rounded-xl px-3 py-2 text-center text-[#6B6F9A]">
                Close
              </button>
            </div>
          )}
        </div>
      )}

      {editing && (
        <StoryDialog
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
              setViewer(null);
              await reload();
            } catch (e) {
              setError(blogError(e));
            }
          }}
        />
      )}
    </>
  );
}

// the caption and the audience (everyone / friends), used to add and to edit a story
function StoryDialog({
  title,
  caption: caption0,
  audience: audience0,
  confirmText,
  onClose,
  onConfirm,
}: {
  title: string;
  caption: string;
  audience: Audience;
  confirmText: string;
  onClose: () => void;
  onConfirm: (caption: string, audience: Audience) => void;
}) {
  const [caption, setCaption] = useState(caption0);
  const [audience, setAudience] = useState<Audience>(audience0);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3" onClick={onClose}>
      <div className="w-full max-w-md rounded-[24px] bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-[16px] font-black text-[#1E1B4B]">{title}</h3>
          <button type="button" onClick={onClose} className="text-[#8494B2]" aria-label="Close">✕</button>
        </div>
        <textarea
          value={caption}
          onChange={(e) => setCaption(e.target.value.slice(0, 140))}
          placeholder="Write a caption… (optional)"
          className="mt-3 h-20 w-full resize-none rounded-2xl border border-[#DDE8F7] bg-[#F7F9FF] p-3 text-[14px] outline-none focus:border-[#6366F1]"
        />
        <div className="mt-3 flex gap-2">
          {([["everyone", "🌍 Everyone"], ["friends", "👥 Friends"], ["only_me", "🔒 Only me"]] as const).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setAudience(k)}
              className={`rounded-full px-3.5 py-1.5 text-[12.5px] font-extrabold ${audience === k ? "bg-[#6366F1] text-white" : "bg-[#EEF0FF] text-[#4F46E5]"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-full px-4 py-2 font-bold text-[#4F46E5]">Cancel</button>
          <button type="button" onClick={() => onConfirm(caption.trim(), audience)} className="rounded-full bg-gradient-to-r from-[#38BDF8] to-[#A855F7] px-5 py-2 font-extrabold text-white">
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
