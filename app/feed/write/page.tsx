"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../../lib/firebase";
import { useRequireLogin } from "../../../lib/useRequireLogin";
import { useCurrentUser } from "../../../lib/useCurrentUser";
import { uploadChatImage } from "../../../lib/imageUpload";
import { PageShell } from "../../_components/PageShell";
import { BLOG_CATEGORIES, blogCall, blogError } from "../../../lib/feed";

// ✍️ New post (or ?edit=<id>): a soft lavender sheet that slides up — who you
// are + the category ("💬 Life ▾" opens the category picker), a big title, the
// story, the cover and photos, and a floating bar (🖼 photos · 🌄 cover · B ·
// 😀 · @ · Publish). A new post is kept on this phone as you type ("✓ Saved")
// and comes back if the page is closed by mistake. 5 posts a day (server).

const EMOJIS = ["😀", "😂", "😍", "🥰", "😎", "😢", "😡", "👍", "🙏", "🔥", "❤️", "🎉", "☕", "🌧️", "🎮", "🎵", "⚽", "✨"];
// the category picker's colours
const CAT_COLORS: Record<string, [string, string]> = {
  life: ["#EEF4FF", "#1D4ED8"],
  games: ["#F3EDFF", "#6D28D9"],
  music: ["#FDF2F8", "#BE185D"],
  fun: ["#FFFBEB", "#B45309"],
  news: ["#ECFEFF", "#0E7490"],
  love: ["#FFF1F2", "#BE123C"],
  tips: ["#F0FDF4", "#15803D"],
  other: ["#F8FAFC", "#475569"],
};
const IMG_LINE = /^!\[\]\((https:\/\/[^)\s]+)\)$/;
type Draft = { title: string; text: string; cover: string; photos: string[]; category: string };

export default function BlogWritePage() {
  return (
    <Suspense>
      <BlogWrite />
    </Suspense>
  );
}

function BlogWrite() {
  const ready = useRequireLogin();
  const router = useRouter();
  const editId = useSearchParams().get("edit") || "";
  const { user, username } = useCurrentUser();
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [cover, setCover] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [category, setCategory] = useState("life");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [emoji, setEmoji] = useState(false);
  const [picker, setPicker] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  const coverInput = useRef<HTMLInputElement>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const draftKey = user ? `migwith.feedDraft.${user.uid}` : "";

  // editing: load the post (its photo lines become the photo list);
  // a new post: bring back the draft kept on this phone
  useEffect(() => {
    if (!user) return;
    if (editId) {
      getDoc(doc(db, "blog_posts", editId)).then((s) => {
        if (!s.exists() || s.get("authorUid") !== user.uid) return router.replace("/feed");
        const lines = String(s.get("body") || "").split("\n");
        setTitle(String(s.get("title") || ""));
        setPhotos(lines.map((l) => l.trim().match(IMG_LINE)?.[1] || "").filter(Boolean));
        setText(lines.filter((l) => !IMG_LINE.test(l.trim())).join("\n").trim());
        setCover(String(s.get("cover") || ""));
        setCategory(String(s.get("category") || "other"));
        setLoaded(true);
      });
      return;
    }
    try {
      const d = JSON.parse(localStorage.getItem(`migwith.feedDraft.${user.uid}`) || "null") as Draft | null;
      if (d) {
        setTitle(d.title || "");
        setText(d.text || "");
        setCover(d.cover || "");
        setPhotos(Array.isArray(d.photos) ? d.photos : []);
        setCategory(d.category || "life");
      }
    } catch {
      // no draft
    }
    setLoaded(true);
  }, [editId, user, router]);

  // ✓ Saved: keep a new post on this phone while typing
  useEffect(() => {
    if (!loaded || editId || !draftKey) return;
    setSaved(false);
    const t = setTimeout(() => {
      try {
        const empty = !title.trim() && !text.trim() && !cover && photos.length === 0;
        if (empty) localStorage.removeItem(draftKey);
        else localStorage.setItem(draftKey, JSON.stringify({ title, text, cover, photos, category } satisfies Draft));
        setSaved(!empty);
      } catch {
        // storage blocked
      }
    }, 600);
    return () => clearTimeout(t);
  }, [title, text, cover, photos, category, loaded, editId, draftKey]);

  // the story box grows with the text
  useEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(120, el.scrollHeight)}px`;
  }, [text]);

  const insert = (before: string, after = "") => {
    const el = area.current;
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? text.length;
    setText(text.slice(0, start) + before + text.slice(start, end) + after + text.slice(end));
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      const pos = start + before.length + (end - start);
      el.setSelectionRange(pos, pos);
    });
  };

  const upload = async (file: File | undefined, kind: "cover" | "photo") => {
    if (!file || !user) return;
    if (kind === "photo" && photos.length >= 10) return setError("At most 10 photos in one post.");
    setError("");
    setBusy(kind === "cover" ? "Uploading…" : "Uploading…");
    try {
      const url = await uploadChatImage(`room_images/blog_${user.uid}`, file);
      if (kind === "cover") setCover(url);
      else setPhotos((p) => [...p, url]);
    } catch (e) {
      setError(blogError(e));
    } finally {
      setBusy("");
    }
  };

  const canPublish = title.trim().length >= 3 && (text.trim().length > 0 || photos.length > 0) && !busy;
  const publish = async () => {
    setError("");
    if (title.trim().length < 3) return setError("Please write a title (at least 3 letters).");
    if (!text.trim() && photos.length === 0) return setError("Please write something.");
    setBusy(editId ? "Saving…" : "Publishing…");
    try {
      const body = [text.trim(), ...photos.map((u) => `![](${u})`)].filter(Boolean).join("\n\n");
      const data = { title: title.trim(), body, cover, category };
      if (editId) {
        await blogCall("edit", { postId: editId, ...data });
        router.replace(`/feed/${editId}`);
      } else {
        const r = await blogCall("create", data);
        try {
          localStorage.removeItem(draftKey);
        } catch {
          // storage blocked
        }
        router.replace(`/feed/${String(r.postId || "")}`);
      }
    } catch (e) {
      setError(blogError(e));
      setBusy("");
    }
  };
  const close = () => (window.history.length > 1 ? router.back() : router.push("/feed"));

  if (!ready) return null;
  const cat = BLOG_CATEGORIES.find(([k]) => k === category) || BLOG_CATEGORIES[0];
  return (
    <PageShell light>
      <input ref={coverInput} type="file" accept="image/*" hidden onChange={(e) => (upload(e.target.files?.[0], "cover"), (e.target.value = ""))} />
      <input ref={photoInput} type="file" accept="image/*" hidden onChange={(e) => (upload(e.target.files?.[0], "photo"), (e.target.value = ""))} />

      {/* dimmed backdrop + the sheet */}
      <div className="fixed inset-0 z-40 bg-[#0F1D3A]/30 backdrop-blur-[3px]" onClick={close} />
      <section className="np-sheet fixed inset-x-0 bottom-0 top-[64px] z-50 mx-auto flex max-w-2xl flex-col overflow-hidden rounded-t-[30px] text-[#1E1B4B] shadow-[0_-10px_40px_-10px_rgba(10,20,50,.45)]">
        <span aria-hidden className="pointer-events-none absolute -right-40 -top-48 h-[420px] w-[420px] rounded-full bg-[radial-gradient(rgba(167,139,250,.45),transparent_65%)]" />
        <span aria-hidden className="pointer-events-none absolute -bottom-40 -left-36 h-[380px] w-[380px] rounded-full bg-[radial-gradient(rgba(96,165,250,.45),transparent_65%)]" />
        <span aria-hidden className="absolute left-1/2 top-[9px] h-[5px] w-10 -translate-x-1/2 rounded-full bg-[#505A8C]/25" />

        <div className="relative z-[1] flex items-center justify-between px-4 pt-[22px]">
          <button type="button" onClick={close} aria-label="Close" className="np-chip flex h-[34px] w-[34px] items-center justify-center rounded-full text-[14px]">
            ✕
          </button>
          <b className="text-[15px]">{editId ? "Edit post" : "New post"}</b>
          <span className={`w-[64px] text-right text-[12px] font-bold text-[#16A34A] transition-opacity ${saved ? "opacity-100" : "opacity-0"}`}>✓ Saved</span>
        </div>

        <div className="relative z-[1] min-h-0 flex-1 overflow-y-auto px-[18px] pb-28">
          <div className="flex items-center gap-2.5 pt-[18px]">
            <span className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#4DABF7] to-[#1D4ED8] text-[17px] font-black text-white shadow-[0_4px_10px_-4px_rgba(29,78,216,.6)]">
              {username.slice(0, 1).toUpperCase() || "?"}
            </span>
            <div className="min-w-0">
              <b data-notranslate className="block truncate text-[15px]">
                {username}
              </b>
              <span className="text-[11.5px] text-[#6B6F9A]">Posting to everyone 🌍</span>
            </div>
            <button type="button" onClick={() => setPicker(true)} className="np-chip ml-auto shrink-0 rounded-[14px] px-3 py-2 text-[13px] font-extrabold text-[#4F46E5]">
              {cat[1]} ▾
            </button>
          </div>

          {cover && (
            <div className="relative mt-4 h-[160px] overflow-hidden rounded-[20px] border border-[#6366F1]/20 shadow-[0_12px_26px_-16px_rgba(30,40,90,.6)]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={cover} alt="" className="h-full w-full object-cover" />
              <span className="absolute left-2.5 top-2.5 rounded-full bg-black/45 px-2.5 py-1 text-[11px] font-extrabold tracking-wider text-white">COVER</span>
              <button type="button" onClick={() => setCover("")} aria-label="Remove cover" className="absolute right-2.5 top-2.5 flex h-7 w-7 items-center justify-center rounded-full bg-black/50 text-[13px] text-white">
                ✕
              </button>
            </div>
          )}

          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
            placeholder="Give it a title…"
            className="mt-[18px] w-full bg-transparent text-[25px] font-black tracking-tight text-[#1E1B4B] outline-none placeholder:text-[#1E1B4B]/30"
          />
          <textarea
            ref={area}
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={19000}
            placeholder="What's on your mind? Share a story, a tip or a moment…"
            className="mt-2 w-full resize-none bg-transparent text-[15px] leading-[1.6] text-[#3F4373] outline-none placeholder:text-[#3F4373]/45"
          />

          {photos.length > 0 && (
            <div className={`mt-3 ${photos.length === 1 ? "" : "no-scrollbar -mx-[18px] flex gap-2.5 overflow-x-auto px-[18px]"}`}>
              {photos.map((u, i) => (
                <div
                  key={u + i}
                  className={`relative shrink-0 overflow-hidden rounded-[20px] border border-[#6366F1]/20 shadow-[0_12px_26px_-16px_rgba(30,40,90,.6)] ${
                    photos.length === 1 ? "h-[160px] w-full" : "h-[140px] w-[140px]"
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={u} alt="" className="h-full w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => setPhotos((p) => p.filter((_, j) => j !== i))}
                    aria-label="Remove photo"
                    className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/50 text-[13px] text-white"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          {error && <p className="mt-3 rounded-xl bg-red-50/90 px-3 py-2 text-[13px] text-red-700">{error}</p>}
          {!editId && <p className="mt-3 text-center text-[11.5px] text-[#6B6F9A]/80">You can write 5 posts a day.</p>}
        </div>

        {/* floating bar */}
        <div className="absolute inset-x-3 bottom-4 z-[2]">
          {emoji && (
            <div className="np-bar mb-2 grid grid-cols-9 gap-1 rounded-[18px] p-2">
              {EMOJIS.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => {
                    insert(e);
                    setEmoji(false);
                  }}
                  className="rounded-lg py-1 text-xl hover:bg-white"
                >
                  {e}
                </button>
              ))}
            </div>
          )}
          <div className="np-bar flex h-[62px] items-center gap-0.5 rounded-[22px] px-2">
            <Tool label="Add photo" onClick={() => photoInput.current?.click()}>
              🖼
            </Tool>
            <Tool label="Cover photo" onClick={() => coverInput.current?.click()}>
              🌄
            </Tool>
            <Tool label="Bold" onClick={() => insert("**", "**")}>
              <b>B</b>
            </Tool>
            <Tool label="Emoji" onClick={() => setEmoji(!emoji)}>
              😀
            </Tool>
            <Tool label="Mention" onClick={() => insert("@")}>
              <b>@</b>
            </Tool>
            <button
              type="button"
              onClick={publish}
              disabled={!canPublish}
              className="ml-auto flex h-[46px] items-center gap-1.5 rounded-2xl bg-gradient-to-br from-[#38BDF8] via-[#6366F1] to-[#A855F7] px-5 text-[15px] font-black text-white shadow-[0_10px_20px_-8px_rgba(99,102,241,.7)] transition active:scale-95 disabled:from-[#C7CCE6] disabled:via-[#C7CCE6] disabled:to-[#C7CCE6] disabled:shadow-none"
            >
              {busy || (editId ? "Save ➤" : "Publish ➤")}
            </button>
          </div>
        </div>

        {/* category picker */}
        {picker && (
          <>
            <div className="absolute inset-0 z-[3] bg-[#0F1D3A]/35" onClick={() => setPicker(false)} />
            <div className="np-pop absolute inset-x-0 bottom-0 z-[4] rounded-t-[28px] bg-white px-4 pb-6 pt-3.5 shadow-[0_-12px_40px_-8px_rgba(10,20,50,.5)]">
              <span aria-hidden className="mx-auto block h-[5px] w-10 rounded-full bg-[#D3DCEA]" />
              <h3 className="mx-1 mb-3 mt-3 text-[16px] font-black">Choose a category</h3>
              <div className="grid grid-cols-2 gap-2.5">
                {BLOG_CATEGORIES.map(([k, label]) => {
                  const [bg, fg] = CAT_COLORS[k] || CAT_COLORS.other;
                  const on = k === category;
                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() => {
                        setCategory(k);
                        setPicker(false);
                      }}
                      className={`flex h-[60px] items-center gap-2.5 rounded-[18px] border-[1.5px] px-3.5 text-left text-[14.5px] font-extrabold ${
                        on ? "border-[#2563EB] shadow-[0_0_0_4px_rgba(37,99,235,.12)]" : "border-transparent"
                      }`}
                      style={{ background: bg, color: fg }}
                    >
                      <span className="text-[22px]">{label.split(" ")[0]}</span>
                      {label.split(" ").slice(1).join(" ")}
                      {on && <span className="ml-auto flex h-[22px] w-[22px] items-center justify-center rounded-full bg-[#2563EB] text-[12px] text-white">✓</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </section>
    </PageShell>
  );
}

function Tool({ children, label, onClick }: { children: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} className="flex h-[42px] w-[42px] items-center justify-center rounded-[14px] text-[17px] text-[#4F46E5] transition hover:bg-white/70 active:scale-90">
      {children}
    </button>
  );
}
