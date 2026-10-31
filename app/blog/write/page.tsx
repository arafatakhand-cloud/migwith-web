"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../../lib/firebase";
import { useRequireLogin } from "../../../lib/useRequireLogin";
import { useCurrentUser } from "../../../lib/useCurrentUser";
import { uploadChatImage } from "../../../lib/imageUpload";
import { PageShell } from "../../_components/PageShell";
import { BLOG_CATEGORIES, blogCall, blogError } from "../../../lib/blog";

// ✍️ Write (or ?edit=<id>: edit) a blog post: cover photo (optional), title,
// the writing with **bold**, photos, emoji and @mentions, a category → Publish.
// 5 posts a day (the server counts).

const EMOJIS = ["😀", "😂", "😍", "🥰", "😎", "😢", "😡", "👍", "🙏", "🔥", "❤️", "🎉", "☕", "🌧️", "🎮", "🎵", "⚽", "✨"];

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
  const { user } = useCurrentUser();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [cover, setCover] = useState("");
  const [category, setCategory] = useState("life");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [emoji, setEmoji] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  const coverInput = useRef<HTMLInputElement>(null);
  const photoInput = useRef<HTMLInputElement>(null);

  // editing: load the post
  useEffect(() => {
    if (!editId || !user) return;
    getDoc(doc(db, "blog_posts", editId)).then((s) => {
      if (!s.exists() || s.get("authorUid") !== user.uid) return router.replace("/blog");
      setTitle(String(s.get("title") || ""));
      setBody(String(s.get("body") || ""));
      setCover(String(s.get("cover") || ""));
      setCategory(String(s.get("category") || "other"));
    });
  }, [editId, user, router]);

  // put text where the cursor is
  const insert = (before: string, after = "") => {
    const el = area.current;
    const start = el?.selectionStart ?? body.length;
    const end = el?.selectionEnd ?? body.length;
    const next = body.slice(0, start) + before + body.slice(start, end) + after + body.slice(end);
    setBody(next);
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      const pos = start + before.length + (end - start) + after.length;
      el.setSelectionRange(end === start ? start + before.length : pos, end === start ? start + before.length : pos);
    });
  };

  const upload = async (file: File | undefined, kind: "cover" | "photo") => {
    if (!file || !user) return;
    setError("");
    setBusy(kind === "cover" ? "Uploading cover…" : "Uploading photo…");
    try {
      const url = await uploadChatImage(`room_images/blog_${user.uid}`, file);
      if (kind === "cover") setCover(url);
      else insert(`\n![](${url})\n`);
    } catch (e) {
      setError(blogError(e));
    } finally {
      setBusy("");
    }
  };

  const publish = async () => {
    setError("");
    if (title.trim().length < 3) return setError("Please write a title (at least 3 letters).");
    if (!body.trim()) return setError("Please write something.");
    setBusy(editId ? "Saving…" : "Publishing…");
    try {
      const data = { title: title.trim(), body: body.trim(), cover, category };
      if (editId) {
        await blogCall("edit", { postId: editId, ...data });
        router.replace(`/blog/${editId}`);
      } else {
        const r = await blogCall("create", data);
        router.replace(`/blog/${String(r.postId || "")}`);
      }
    } catch (e) {
      setError(blogError(e));
      setBusy("");
    }
  };

  if (!ready) return null;
  return (
    <PageShell light>
      <section className="mx-auto max-w-2xl px-3 pb-10 pt-2 sm:px-6">
        <div className="mb-3 flex items-center gap-2">
          <button
            type="button"
            onClick={() => (window.history.length > 1 ? router.back() : router.push("/blog"))}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/70 text-lg text-[#0F1D3A]"
            aria-label="Close"
          >
            ✕
          </button>
          <h1 className="text-[18px] font-extrabold text-[#0F1D3A]">{editId ? "Edit post" : "New post"}</h1>
        </div>

        <input ref={coverInput} type="file" accept="image/*" hidden onChange={(e) => (upload(e.target.files?.[0], "cover"), (e.target.value = ""))} />
        <input ref={photoInput} type="file" accept="image/*" hidden onChange={(e) => (upload(e.target.files?.[0], "photo"), (e.target.value = ""))} />

        {cover ? (
          <div className="relative mb-2.5 h-[150px] overflow-hidden rounded-2xl bg-cover bg-center" style={{ backgroundImage: `url("${cover}")` }}>
            <div className="absolute bottom-2 right-2 flex gap-1.5">
              <button type="button" onClick={() => coverInput.current?.click()} className="rounded-lg bg-black/45 px-2.5 py-1 text-[12px] font-semibold text-white">
                Change
              </button>
              <button type="button" onClick={() => setCover("")} className="rounded-lg bg-black/45 px-2.5 py-1 text-[12px] font-semibold text-white">
                Remove
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => coverInput.current?.click()}
            className="mb-2.5 grid h-[110px] w-full place-items-center rounded-2xl border-2 border-dashed border-[#9FB3D6] bg-white/50 text-[14px] font-semibold text-[#5A6F93]"
          >
            📷 Add a cover photo (optional)
          </button>
        )}

        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={120}
          placeholder="Title"
          className="mb-2.5 w-full rounded-[14px] border border-[#2563EB]/15 bg-white px-3.5 py-3 text-[18px] font-extrabold text-[#0F1D3A] outline-none placeholder:font-semibold placeholder:text-[#8494B2] focus:border-[#2563EB] focus:ring-4 focus:ring-[#2563EB]/12"
        />

        <div className="relative mb-2 flex flex-wrap gap-2">
          <ToolBtn onClick={() => insert("**", "**")}>
            <b>B</b>
          </ToolBtn>
          <ToolBtn onClick={() => photoInput.current?.click()}>🖼 Photo</ToolBtn>
          <ToolBtn onClick={() => setEmoji(!emoji)}>😀</ToolBtn>
          <ToolBtn onClick={() => insert("@")}>@ mention</ToolBtn>
          {emoji && (
            <div className="absolute left-0 top-11 z-20 grid w-[260px] grid-cols-6 gap-1 rounded-xl bg-white p-2 shadow-xl">
              {EMOJIS.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => {
                    insert(e);
                    setEmoji(false);
                  }}
                  className="rounded-lg py-1 text-xl hover:bg-[#F1F5FB]"
                >
                  {e}
                </button>
              ))}
            </div>
          )}
        </div>

        <textarea
          ref={area}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={20000}
          placeholder="Write your story…"
          className="h-[260px] w-full resize-y rounded-[14px] border border-[#2563EB]/15 bg-white px-3.5 py-3 text-[14.5px] leading-relaxed text-[#253A5E] outline-none placeholder:text-[#8494B2] focus:border-[#2563EB] focus:ring-4 focus:ring-[#2563EB]/12"
        />
        <p className="mt-1 text-right text-[11px] text-[#8494B2]">**bold** · photos show where you put them</p>

        <p className="mb-1.5 mt-2 px-0.5 text-[11px] font-bold tracking-[0.14em] text-[#7D8CAB]">CATEGORY</p>
        <div className="mb-4 flex flex-wrap gap-1.5">
          {BLOG_CATEGORIES.map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setCategory(k)}
              className={`rounded-full px-3 py-1.5 text-[12.5px] font-semibold ${category === k ? "bg-[#2563EB] text-white" : "bg-white/70 text-[#4A5F85]"}`}
            >
              {label}
            </button>
          ))}
        </div>

        {error && <p className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-[13px] text-red-700">{error}</p>}

        <button
          type="button"
          onClick={publish}
          disabled={!!busy}
          className="h-[50px] w-full rounded-[14px] bg-gradient-to-b from-[#3B82F6] to-[#1D4ED8] text-[16px] font-bold text-white shadow-[0_10px_22px_-10px_rgba(29,78,216,.8)] transition active:scale-[.98] disabled:opacity-60"
        >
          {busy || (editId ? "Save" : "Publish")}
        </button>
        {!editId && <p className="mt-2 text-center text-[11.5px] text-[#8494B2]">You can write 5 posts a day.</p>}
      </section>
    </PageShell>
  );
}

function ToolBtn({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-9 items-center rounded-[10px] bg-white px-3 text-[13px] font-semibold text-[#253A5E] shadow-[0_1px_4px_-2px_rgba(0,0,0,.2)]"
    >
      {children}
    </button>
  );
}
