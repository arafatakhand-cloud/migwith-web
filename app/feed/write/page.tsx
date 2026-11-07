"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { EmoteEditor, type EmoteEditorHandle } from "../../_components/EmoteEditor";
import { useRouter, useSearchParams } from "next/navigation";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../../lib/firebase";
import { useRequireLogin } from "../../../lib/useRequireLogin";
import { useCurrentUser } from "../../../lib/useCurrentUser";
import { uploadChatImage } from "../../../lib/imageUpload";
import { uploadBlogVideo } from "../../../lib/videoUpload";
import { PageShell } from "../../_components/PageShell";
import { BLOG_CATEGORIES, blogCall, blogError } from "../../../lib/feed";
import { cachedPhotoOf, useSenderColors } from "../../../lib/senderColors";
import { useFriendRequests } from "../../../lib/friends";

// ✍️ New post (or ?edit=<id>), the "N3" look: a soft lavender sheet — who you
// are, the categories as coloured chips, the title + story in one white card,
// the photos as squares (the FIRST one is the cover, "★ COVER"), a big
// Publish button and a small tool bar (📷 · B · 😀 · @). A new post is kept on
// this phone as you type ("✓ Saved"). 5 posts a day (the server counts).

const EMOJIS = ["😀", "😂", "😍", "🥰", "😎", "😢", "😡", "👍", "🙏", "🔥", "❤️", "🎉", "☕", "🌧️", "🎮", "🎵", "⚽", "✨"];
// each category's chip colours (background, ink)
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
const MAX_PHOTOS = 10;
type Draft = { title: string; text: string; cover?: string; photos: string[]; category: string };

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
  // all photos; photos[0] is the cover
  const [photos, setPhotos] = useState<string[]>([]);
  const [category, setCategory] = useState("life");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [emoji, setEmoji] = useState(false);
  // 😊 the feeling chips (text only: saved as a line in the post)
  const [feel, setFeel] = useState(false);
  // 🎬 one optional video (uploaded to Storage; its URL goes with the post)
  const [video, setVideo] = useState("");
  // 🎬 miGlife can switch video posts off; then the Video button is hidden
  const [videoOn, setVideoOn] = useState(true);
  useEffect(() => {
    blogCall("videoStatus")
      .then((r) => setVideoOn(r.videoEnabled !== false))
      .catch(() => {});
  }, []);
  const videoInput = useRef<HTMLInputElement>(null);
  // 🏷 hashtag ideas for the words in the post (not yet in the text)
  const hashSuggest = useMemo(() => {
    const t = text.toLowerCase();
    return HASHTAG_IDEAS.filter(([k, tag]) => t.includes(k) && !t.includes(tag.toLowerCase())).map(([, tag]) => tag).slice(0, 4);
  }, [text]);
  const [saved, setSaved] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const area = useRef<EmoteEditorHandle>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const draftKey = user ? `migwith.feedDraft.${user.uid}` : "";
  // 📷 my profile photo (looked up with the name colours)
  // @mention (M1): typing @ + letters shows matching friends under the text
  const { friends } = useFriendRequests(username);
  const [caret, setCaret] = useState(0);
  const [pick, setPick] = useState(0);
  const [mentionOff, setMentionOff] = useState("");
  const typed = text.slice(0, caret).match(/(^|\s)@([A-Za-z0-9_.\-]{0,30})$/);
  const mq = typed ? typed[2].toLowerCase() : null;
  const mentionKey = typed ? `${caret - typed[2].length}` : "";
  const matches =
    mq === null || mentionOff === mentionKey
      ? []
      : friends
          .filter((f) => f.toLowerCase().includes(mq))
          .sort((a, b) => Number(!a.toLowerCase().startsWith(mq)) - Number(!b.toLowerCase().startsWith(mq)))
          .slice(0, 5);
  useSenderColors(username ? [username, ...matches] : matches);
  const myPhoto = cachedPhotoOf(username);
  const choose = (name: string) => {
    if (!typed) return;
    const start = caret - typed[2].length - 1;
    const rest = text.slice(caret).replace(/^[A-Za-z0-9_.\-]*/, "");
    const add = `@${name} `;
    setText(text.slice(0, start) + add + rest.replace(/^ /, ""));
    const pos = start + add.length;
    setCaret(pos);
    setPick(0);
    requestAnimationFrame(() => {
      const el = area.current;
      if (!el) return;
      el.focus();
      el.setCaret(pos);
    });
  };
  const onMentionKey = (e: React.KeyboardEvent<HTMLElement>) => {
    if (!matches.length) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setPick((p) => (p + (e.key === "ArrowDown" ? 1 : matches.length - 1)) % matches.length);
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      choose(matches[Math.min(pick, matches.length - 1)]);
    } else if (e.key === "Escape") {
      setMentionOff(mentionKey);
    }
  };

  // editing: load the post (cover first, then the photos in the story);
  // a new post: bring back the draft kept on this phone
  useEffect(() => {
    if (!user) return;
    if (editId) {
      // 🔒 a 👥 / 🔒 post is not readable here: then ask the server for it
      const load = async () => {
        const pub = await getDoc(doc(db, "blog_posts", editId));
        if (pub.exists()) return { get: (k: string) => pub.get(k) };
        const r = await blogCall("getPost", { postId: editId }).catch(() => null);
        const p = (r?.post || null) as Record<string, unknown> | null;
        return p ? { get: (k: string) => p[k] } : null;
      };
      load().then((s) => {
        if (!s || s.get("authorUid") !== user.uid) return router.replace("/feed");
        const lines = String(s.get("body") || "").split("\n");
        const inBody = lines.map((l) => l.trim().match(IMG_LINE)?.[1] || "").filter(Boolean);
        const cover = String(s.get("cover") || "");
        setTitle(String(s.get("title") || ""));
        setPhotos([...(cover ? [cover] : []), ...inBody].slice(0, MAX_PHOTOS));
        setText(lines.filter((l) => !IMG_LINE.test(l.trim())).join("\n").trim());
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
        setPhotos([...(d.cover ? [d.cover] : []), ...(Array.isArray(d.photos) ? d.photos : [])].slice(0, MAX_PHOTOS));
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
        const empty = !title.trim() && !text.trim() && photos.length === 0;
        if (empty) localStorage.removeItem(draftKey);
        else localStorage.setItem(draftKey, JSON.stringify({ title, text, photos, category } satisfies Draft));
        setSaved(!empty);
      } catch {
        // storage blocked
      }
    }, 600);
    return () => clearTimeout(t);
  }, [title, text, photos, category, loaded, editId, draftKey]);

  const insert = (before: string, after = "") => {
    const el = area.current;
    const start = el?.getCaret() ?? text.length;
    const end = start;
    setText(text.slice(0, start) + before + text.slice(start, end) + after + text.slice(end));
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      const pos = start + before.length + (end - start);
      el.setCaret(pos);
    });
  };

  const uploadVideo = async (files: FileList | null) => {
    const f = files?.[0];
    if (!f || !user) return;
    setError("");
    setBusy("Uploading video…");
    try {
      setVideo(await uploadBlogVideo(user.uid, f));
    } catch (e) {
      setError(e instanceof Error ? e.message : blogError(e));
    } finally {
      setBusy("");
    }
  };

  const upload = async (files: FileList | null) => {
    if (!files?.length || !user) return;
    const room = MAX_PHOTOS - photos.length;
    if (room <= 0) return setError(`At most ${MAX_PHOTOS} photos in one Mig.`);
    setError("");
    setBusy("Uploading…");
    try {
      for (const f of Array.from(files).slice(0, room)) {
        const url = await uploadChatImage(`room_images/blog_${user.uid}`, f);
        setPhotos((p) => [...p, url].slice(0, MAX_PHOTOS));
      }
    } catch (e) {
      setError(blogError(e));
    } finally {
      setBusy("");
    }
  };

  const canPublish = title.trim().length >= 3 && (text.trim().length > 0 || photos.length > 0 || !!video) && !busy;
  const publish = async () => {
    setError("");
    if (title.trim().length < 3) return setError("Please write a title (at least 3 letters).");
    if (!text.trim() && photos.length === 0 && !video) return setError("Please write something.");
    setBusy(editId ? "Saving…" : "Migging…");
    try {
      // the first photo is the cover; the rest go after the story
      const [cover = "", ...rest] = photos;
      const body = [text.trim(), ...rest.map((u) => `![](${u})`)].filter(Boolean).join("\n\n") || "📷";
      const data = { title: title.trim(), body, cover, category, video };
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
  // the photo squares: the photos, then "+" squares (at least 3 squares in all)
  const plusSquares = photos.length >= MAX_PHOTOS ? 0 : Math.max(1, 3 - photos.length);
  return (
    <PageShell light>
      <input ref={photoInput} type="file" accept="image/*" multiple hidden onChange={(e) => (upload(e.target.files), (e.target.value = ""))} />
      <input ref={videoInput} type="file" accept="video/mp4,video/webm,video/quicktime" hidden onChange={(e) => (uploadVideo(e.target.files), (e.target.value = ""))} />

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
          <b className="text-[15px]">{editId ? "Edit Mig" : "New Mig"}</b>
          <span className={`w-[64px] text-right text-[12px] font-bold text-[#16A34A] transition-opacity ${saved ? "opacity-100" : "opacity-0"}`}>✓ Saved</span>
        </div>

        <div className="relative z-[1] min-h-0 flex-1 overflow-y-auto pb-44">
          {/* who */}
          <div className="flex items-center gap-2.5 px-[18px] pt-4">
            <span className="flex shrink-0 rounded-full bg-[conic-gradient(#38BDF8,#6366F1,#A855F7,#EC4899,#38BDF8)] p-[2.5px]">
              {myPhoto ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={myPhoto} alt="" className="h-[42px] w-[42px] rounded-full border-[2.5px] border-[#EEF0FF] object-cover" />
              ) : (
                <span className="flex h-[42px] w-[42px] items-center justify-center rounded-full border-[2.5px] border-[#EEF0FF] bg-gradient-to-br from-[#4DABF7] to-[#1D4ED8] text-[17px] font-black text-white">
                  {username.slice(0, 1).toUpperCase() || "?"}
                </span>
              )}
            </span>
            <div className="min-w-0">
              <b data-notranslate className="block truncate text-[15px]">
                {username}
              </b>
              <span className="text-[11.5px] text-[#6B6F9A]">Migging to everyone 🌍</span>
            </div>
          </div>

          {/* categories */}
          <div className="no-scrollbar flex gap-[7px] overflow-x-auto px-4 pt-3.5">
            {BLOG_CATEGORIES.map(([k, label]) => {
              const [bg, fg] = CAT_COLORS[k] || CAT_COLORS.other;
              const on = k === category;
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => setCategory(k)}
                  className={`shrink-0 rounded-full px-3 py-2 text-[12.5px] font-extrabold transition active:scale-95 ${
                    on ? "bg-gradient-to-br from-[#38BDF8] to-[#6366F1] text-white shadow-[0_6px_14px_-6px_rgba(99,102,241,.7)]" : ""
                  }`}
                  style={on ? undefined : { background: bg, color: fg }}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {/* title + story in one white card */}
          <div className="mx-3.5 mt-3 overflow-hidden rounded-3xl border border-[#6366F1]/15 bg-white/85 shadow-[0_12px_26px_-16px_rgba(40,50,110,.5)]">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={120}
              placeholder="Give it a title…"
              className="w-full border-b border-[#ECEAFD] bg-transparent px-4 pb-3 pt-4 text-[22px] font-black tracking-tight text-[#1E1B4B] outline-none placeholder:text-[#1E1B4B]/30"
            />
            <EmoteEditor
              ref={area}
              value={text}
              onChange={(v) => {
                setText(v);
                setPick(0);
              }}
              onCaret={setCaret}
              onKeyDown={onMentionKey}
              placeholder="What's on your mind? Share a story, a tip or a moment…"
              className="block h-[150px] w-full overflow-y-auto whitespace-pre-wrap bg-transparent px-4 py-3 text-[15px] leading-[1.6] text-[#3F4373] outline-none"
            />
            {matches.length > 0 && (
              <div className="mention-pop mx-2.5 mb-2.5 rounded-2xl bg-white p-1.5 shadow-[0_14px_30px_-12px_rgba(76,63,176,.45)] ring-1 ring-[#6366F1]/10">
                {matches.map((f, i) => {
                  const ph = cachedPhotoOf(f);
                  const on = i === Math.min(pick, matches.length - 1);
                  return (
                    <button
                      key={f}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => choose(f)}
                      onMouseEnter={() => setPick(i)}
                      className={`flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left ${on ? "bg-[#EFEAFF]" : ""}`}
                    >
                      {ph ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={ph} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />
                      ) : (
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#F472B6] to-[#8B5CF6] text-[13px] font-black text-white">
                          {f.slice(0, 1).toUpperCase()}
                        </span>
                      )}
                      <span className="min-w-0">
                        <span className={`block truncate text-[14px] font-bold ${on ? "text-[#4C3FB0]" : "text-[#1E1B4B]"}`}>{f}</span>
                        <span className="block text-[11px] text-[#9AA0C4]">Friend · gets a notification</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* photos: the first one is the cover */}
          <div className="no-scrollbar flex gap-2.5 overflow-x-auto px-4 pt-3">
            {photos.map((u, i) => (
              <div key={u + i} className="relative h-24 w-24 shrink-0 overflow-hidden rounded-[18px] shadow-[0_8px_18px_-10px_rgba(30,40,90,.6)]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={u} alt="" className="h-full w-full object-cover" />
                {i === 0 && <span className="absolute left-1.5 top-1.5 rounded-full bg-black/50 px-[7px] py-0.5 text-[9.5px] font-black text-white">★ COVER</span>}
                <button
                  type="button"
                  onClick={() => setPhotos((p) => p.filter((_, j) => j !== i))}
                  aria-label="Remove photo"
                  className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/55 text-[11px] text-white"
                >
                  ✕
                </button>
                {i > 0 && (
                  <button
                    type="button"
                    onClick={() => setPhotos((p) => [p[i], ...p.filter((_, j) => j !== i)])}
                    className="absolute inset-x-1.5 bottom-1.5 rounded-full bg-white/85 py-0.5 text-[9.5px] font-extrabold text-[#4F46E5]"
                  >
                    Make cover
                  </button>
                )}
              </div>
            ))}
            {Array.from({ length: plusSquares }).map((_, i) => (
              <button
                key={`plus${i}`}
                type="button"
                onClick={() => photoInput.current?.click()}
                aria-label="Add photos"
                className="flex h-24 w-24 shrink-0 items-center justify-center rounded-[18px] border-2 border-dashed border-[#C4C2F3] bg-white/45 text-[22px] text-[#8B8FD6]"
              >
                {photos.length === 0 && i === 0 ? "📷" : "+"}
              </button>
            ))}
          </div>
          {photos.length === 0 && <p className="px-[18px] pt-1.5 text-[11.5px] text-[#8B8FD6]">The first photo is the cover · up to {MAX_PHOTOS}</p>}

          {error && <p className="mx-4 mt-3 rounded-xl bg-red-50/90 px-3 py-2 text-[13px] text-red-700">{error}</p>}
          {!editId && <p className="mt-3 text-center text-[11.5px] text-[#6B6F9A]/80">You can write 5 Migs a day.</p>}
        </div>

        {/* big Publish + the tool bar */}
        <div className="absolute inset-x-3.5 bottom-4 z-[2]">
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
          <button
            type="button"
            onClick={publish}
            disabled={!canPublish}
            className="mb-2.5 h-[52px] w-full rounded-[18px] bg-gradient-to-br from-[#38BDF8] via-[#6366F1] to-[#A855F7] text-[16px] font-black text-white shadow-[0_12px_24px_-10px_rgba(99,102,241,.8)] transition active:scale-[.98] disabled:from-[#C7CCE6] disabled:via-[#C7CCE6] disabled:to-[#C7CCE6] disabled:shadow-none"
          >
            {busy || (editId ? "Save ➤" : "Mig it ➤")}
          </button>
          {video && (
            <div className="mb-2 flex items-center justify-between rounded-[16px] bg-white px-3.5 py-2.5 text-[13px] font-bold text-[#4F46E5] shadow-[0_1px_0_#C9D8EA]">
              <span>🎬 Video attached</span>
              <button type="button" onClick={() => setVideo("")} className="text-[#8494B2]">✕</button>
            </div>
          )}
          {/* 🏷 hashtag ideas from what you write (tap to add) */}
          {hashSuggest.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5 px-1">
              {hashSuggest.map((h) => (
                <button
                  key={h}
                  type="button"
                  onClick={() => setText((t) => `${t.trimEnd()} ${h}`)}
                  className="rounded-full border border-dashed border-[#6366F1] px-3 py-1 text-[12px] font-bold text-[#6366F1]"
                >
                  + {h}
                </button>
              ))}
            </div>
          )}
          {feel && (
            <div className="np-bar mb-2 flex flex-wrap gap-1.5 rounded-[18px] p-2">
              {FEELINGS.map(([e, l]) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => {
                    insert(`${e} ${l} · `);
                    setFeel(false);
                  }}
                  className="rounded-full bg-white px-3 py-1.5 text-[13px] font-bold text-[#4F46E5] shadow-[0_1px_0_#C9D8EA]"
                >
                  {e} {l}
                </button>
              ))}
            </div>
          )}
          <div className="np-bar flex h-[58px] items-center gap-0.5 rounded-[22px] px-2">
            <Tool label="Add photos" onClick={() => photoInput.current?.click()}>
              📷
            </Tool>
            {videoOn && (
              <Tool label="Add video" onClick={() => videoInput.current?.click()}>
                🎬
              </Tool>
            )}
            <Tool label="Feeling" onClick={() => setFeel(!feel)}>
              😊
            </Tool>
            <Tool label="Check in" onClick={() => insert("📍 ")}>
              📍
            </Tool>
            <Tool label="Bold" onClick={() => insert("**", "**")}>
              <b>B</b>
            </Tool>
            <Tool label="Emoji" onClick={() => setEmoji(!emoji)}>
              😀
            </Tool>
            <Tool
              label="Mention"
              onClick={() => {
                const el = area.current;
                const at = el?.getCaret() ?? text.length;
                const needSpace = at > 0 && !/\s/.test(text[at - 1]);
                insert(needSpace ? " @" : "@");
                setCaret(at + (needSpace ? 2 : 1));
                setMentionOff("");
              }}
            >
              <b>@</b>
            </Tool>
            <span className="ml-auto pr-2 text-[11px] text-[#9AA0C4]">{text.length} / 19000</span>
          </div>
        </div>
      </section>
    </PageShell>
  );
}

// 🏷 keyword → hashtag ideas (shown while you write, never added by themselves)
const HASHTAG_IDEAS: [string, string][] = [
  ["ludo", "#LudoLife"],
  ["cricket", "#Cricket"],
  ["match", "#MatchDay"],
  ["food", "#Foodie"],
  ["travel", "#Travel"],
  ["photo", "#Photography"],
  ["game", "#GameNight"],
  ["morning", "#GoodMorning"],
];

const FEELINGS: [string, string][] = [
  ["😊", "Happy"],
  ["😍", "Loved"],
  ["😢", "Sad"],
  ["🤩", "Excited"],
  ["😴", "Tired"],
  ["🙏", "Thankful"],
];

function Tool({ children, label, onClick }: { children: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} className="flex h-[42px] w-[42px] items-center justify-center rounded-[14px] text-[17px] text-[#4F46E5] transition hover:bg-white/70 active:scale-90">
      {children}
    </button>
  );
}
