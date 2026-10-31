"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { collection, doc, getDoc, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "../../../lib/firebase";
import { useCurrentUser } from "../../../lib/useCurrentUser";
import { useSenderColors } from "../../../lib/senderColors";
import { PageShell } from "../../_components/PageShell";
import { openReport } from "../../_components/ReportDialog";
import {
  blogAgo,
  blogCall,
  blogCategoryLabel,
  blogCoverFallback,
  blogError,
  blogShort,
  toBlogComment,
  toBlogPost,
  type BlogComment,
  type BlogPost,
} from "../../../lib/blog";

// 📝 One blog post: cover, title, the writing (with its photos), ❤️ like,
// 💬 comments, ↗ share, 🚩 report. The writer can edit / delete; the miGlife
// team can delete any post or comment.

export default function BlogPostPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user, username } = useCurrentUser();
  const [post, setPost] = useState<BlogPost | null | undefined>(undefined);
  const [comments, setComments] = useState<BlogComment[]>([]);
  const [liked, setLiked] = useState(false);
  const [likeBusy, setLikeBusy] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState("");
  const [canMod, setCanMod] = useState(false);
  const [menu, setMenu] = useState(false);
  const viewed = useRef(false);
  const commentsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!id) return;
    const ref = doc(db, "blog_posts", id);
    const off1 = onSnapshot(
      ref,
      (s) => setPost(s.exists() ? toBlogPost(s.id, s.data()) : null),
      () => setPost(null)
    );
    const off2 = onSnapshot(query(collection(ref, "comments"), orderBy("createdAt", "asc"), limit(300)), (s) =>
      setComments(s.docs.map((d) => toBlogComment(d.id, d.data())))
    );
    return () => {
      off1();
      off2();
    };
  }, [id]);

  // my like + one view (counted once per person, on the server)
  useEffect(() => {
    if (!id || !user) return;
    getDoc(doc(db, "blog_posts", id, "likes", user.uid))
      .then((s) => setLiked(s.exists()))
      .catch(() => {});
    if (!viewed.current) {
      viewed.current = true;
      blogCall("view", { postId: id }).catch(() => {});
      blogCall("canModerate")
        .then((r) => setCanMod(r.canModerate === true))
        .catch(() => {});
    }
  }, [id, user]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  const names = useMemo(() => Array.from(new Set([post?.author || "", ...comments.map((c) => c.author)].filter(Boolean))), [post, comments]);
  const colorOf = useSenderColors(names);
  const mine = !!user && post?.authorUid === user.uid;

  const like = async () => {
    if (!user) return router.push("/login");
    if (!post || likeBusy) return;
    setLikeBusy(true);
    setLiked(!liked); // at once; the server's answer settles it
    try {
      const r = await blogCall("like", { postId: post.id });
      setLiked(r.liked === true);
    } catch (e) {
      setLiked(liked);
      setToast(blogError(e));
    } finally {
      setLikeBusy(false);
    }
  };
  const send = async () => {
    if (!user) return router.push("/login");
    const t = text.trim();
    if (!t || !post || sending) return;
    setSending(true);
    try {
      await blogCall("comment", { postId: post.id, text: t });
      setText("");
      setTimeout(() => commentsRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }), 300);
    } catch (e) {
      setToast(blogError(e));
    } finally {
      setSending(false);
    }
  };
  const share = async () => {
    if (!post) return;
    const url = `${window.location.origin}/blog/${post.id}`;
    try {
      if (navigator.share) await navigator.share({ title: post.title, text: `📝 ${post.title} — by ${post.author} on miGlife`, url });
      else {
        await navigator.clipboard.writeText(url);
        setToast("Link copied ✓");
      }
    } catch {
      // closed the share sheet
    }
  };
  const remove = async () => {
    if (!post || !confirm(mine ? "Delete this post?" : `Delete ${post.author}'s post?`)) return;
    try {
      await blogCall("delete", { postId: post.id });
      router.replace("/blog");
    } catch (e) {
      setToast(blogError(e));
    }
  };
  const removeComment = async (c: BlogComment) => {
    if (!post || !confirm("Delete this comment?")) return;
    try {
      await blogCall("deleteComment", { postId: post.id, commentId: c.id });
    } catch (e) {
      setToast(blogError(e));
    }
  };

  if (post === undefined)
    return (
      <PageShell light>
        <div className="mx-auto max-w-2xl animate-pulse px-3 pt-4">
          <div className="h-52 rounded-2xl bg-white/60" />
          <div className="mt-4 h-6 w-2/3 rounded bg-white/60" />
          <div className="mt-3 h-24 rounded bg-white/50" />
        </div>
      </PageShell>
    );
  if (post === null)
    return (
      <PageShell light>
        <div className="mx-auto max-w-2xl px-3 pt-16 text-center text-[#5A6F93]">
          <div className="text-4xl">📝</div>
          <p className="mt-2 font-semibold">This post is gone.</p>
          <Link href="/blog" className="mt-4 inline-block rounded-xl bg-[#2563EB] px-4 py-2 font-bold text-white">
            Back to Blog
          </Link>
        </div>
      </PageShell>
    );

  const pic = post.cover;
  const color = colorOf(post.author) || "#1D4ED8";
  return (
    <PageShell light>
      <article className="mx-auto max-w-2xl pb-28">
        <div className="relative">
          <div className="bg-cover bg-center sm:mt-3 sm:rounded-2xl" style={{ backgroundImage: pic ? `url("${pic}")` : blogCoverFallback(post.id), height: pic ? 220 : 110 }} />
          <button
            type="button"
            onClick={() => (window.history.length > 1 ? router.back() : router.push("/blog"))}
            className="absolute left-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-black/35 text-xl text-white backdrop-blur"
            aria-label="Back"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={() => setMenu(!menu)}
            className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-black/35 text-lg font-bold text-white backdrop-blur"
            aria-label="More"
          >
            ⋯
          </button>
          {menu && (
            <div className="absolute right-3 top-14 z-20 w-44 overflow-hidden rounded-xl bg-white text-[14px] font-semibold text-[#0F1D3A] shadow-xl" onClick={() => setMenu(false)}>
              {mine && (
                <Link href={`/blog/write?edit=${post.id}`} className="block px-4 py-2.5 hover:bg-[#F1F5FB]">
                  ✏️ Edit
                </Link>
              )}
              {(mine || canMod) && (
                <button type="button" onClick={remove} className="block w-full px-4 py-2.5 text-left text-[#DC2626] hover:bg-[#FEF2F2]">
                  🗑 Delete
                </button>
              )}
              {!mine && (
                <button
                  type="button"
                  onClick={() =>
                    user
                      ? openReport({ kind: "blog_post", targetUsername: post.author, messageId: post.id, preview: post.title })
                      : router.push("/login")
                  }
                  className="block w-full px-4 py-2.5 text-left hover:bg-[#F1F5FB]"
                >
                  🚩 Report
                </button>
              )}
              <button type="button" onClick={share} className="block w-full px-4 py-2.5 text-left hover:bg-[#F1F5FB]">
                ↗ Share
              </button>
            </div>
          )}
        </div>

        <div className="px-4 pt-3">
          <div className="flex items-center gap-2 text-[12.5px] text-[#5A6F93]">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-bold text-white" style={{ background: color }}>
              {post.author.slice(0, 1).toUpperCase()}
            </span>
            <Link href={`/profile/${encodeURIComponent(post.author)}`} data-notranslate className="truncate font-bold" style={{ color }}>
              {post.author}
            </Link>
            <span className="shrink-0">
              · {blogAgo(post.createdMs)}
              {post.edited ? " · edited" : ""} · {blogCategoryLabel(post.category)}
            </span>
          </div>
          <h1 className="mt-2 text-[22px] font-extrabold leading-tight text-[#0F1D3A]">{post.title}</h1>
          <BlogBody body={post.body} />

          <div className="mt-3 flex gap-2.5">
            <button
              type="button"
              onClick={like}
              className={`flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl text-[14px] font-bold shadow-[0_2px_6px_-3px_rgba(30,60,120,.35)] transition active:scale-95 ${
                liked ? "bg-[#FFE4EC] text-[#E2366F]" : "bg-white text-[#1D4ED8]"
              }`}
            >
              {liked ? "❤️" : "🤍"} {blogShort(post.likes)}
            </button>
            <button
              type="button"
              onClick={() => document.getElementById("blog-comment")?.focus()}
              className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-white text-[14px] font-bold text-[#1D4ED8] shadow-[0_2px_6px_-3px_rgba(30,60,120,.35)]"
            >
              💬 {blogShort(post.comments)}
            </button>
            <button
              type="button"
              onClick={share}
              className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-white text-[14px] font-bold text-[#1D4ED8] shadow-[0_2px_6px_-3px_rgba(30,60,120,.35)]"
            >
              ↗ Share
            </button>
          </div>
          <p className="mt-2 text-right text-[12px] text-[#6B7FA6]">👁 {blogShort(post.views)} {post.views === 1 ? "view" : "views"}</p>

          <h3 className="mb-2 mt-3 text-[13px] font-bold tracking-wide text-[#5A6F93]">COMMENTS ({comments.length})</h3>
          <div ref={commentsRef} className="space-y-2">
            {comments.length === 0 && <p className="text-[13px] text-[#6B7FA6]">No comments yet. Say something nice!</p>}
            {comments.map((c) => {
              const cc = colorOf(c.author) || "#2563EB";
              const canDel = !!user && (c.authorUid === user.uid || mine || canMod);
              return (
                <div key={c.id} className="flex gap-2">
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-bold text-white" style={{ background: cc }}>
                    {c.author.slice(0, 1).toUpperCase()}
                  </span>
                  <div className="min-w-0 rounded-xl bg-white px-2.5 py-1.5 text-[13.5px] leading-snug text-[#253A5E] shadow-[0_1px_4px_-2px_rgba(0,0,0,.15)]">
                    <Link href={`/profile/${encodeURIComponent(c.author)}`} data-notranslate className="mr-1.5 font-bold" style={{ color: cc }}>
                      {c.author}
                    </Link>
                    <span className="break-words">{c.text}</span>
                    <div className="mt-0.5 flex gap-3 text-[11px] text-[#8494B2]">
                      <span>{blogAgo(c.createdMs)}</span>
                      {canDel && (
                        <button type="button" onClick={() => removeComment(c)} className="font-semibold text-[#DC2626]/80">
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </article>

      {/* comment box, fixed at the bottom */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[#C9D9EE] bg-white/95 px-3 py-2 backdrop-blur">
        <div className="mx-auto flex max-w-2xl gap-2">
          {user ? (
            <>
              <input
                id="blog-comment"
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && send()}
                maxLength={500}
                placeholder={`Comment as ${username || "you"}…`}
                className="min-w-0 flex-1 rounded-full border border-[#C9D9EE] bg-[#F4F8FD] px-4 py-2 text-[14px] text-[#0F1D3A] outline-none focus:border-[#2563EB]"
              />
              <button
                type="button"
                onClick={send}
                disabled={sending || !text.trim()}
                className="rounded-full bg-gradient-to-b from-[#3B82F6] to-[#1D4ED8] px-4 text-[14px] font-bold text-white disabled:opacity-50"
              >
                {sending ? "…" : "Send"}
              </button>
            </>
          ) : (
            <Link href="/login" className="w-full rounded-full bg-gradient-to-b from-[#3B82F6] to-[#1D4ED8] py-2.5 text-center text-[14px] font-bold text-white">
              Log in to like and comment
            </Link>
          )}
        </div>
      </div>

      {toast && (
        <div className="fixed bottom-20 left-1/2 z-40 -translate-x-1/2 rounded-full bg-[#0F1D3A]/90 px-4 py-2 text-[13px] font-semibold text-white">{toast}</div>
      )}
    </PageShell>
  );
}

/** The writing: paragraphs, **bold**, @names and ![](photo) lines. */
function BlogBody({ body }: { body: string }) {
  const blocks = body.split(/\n/);
  return (
    <div className="mt-3 text-[15px] leading-[1.65] text-[#253A5E]">
      {blocks.map((line, i) => {
        const img = line.trim().match(/^!\[\]\((https:\/\/[^)\s]+)\)$/);
        if (img)
          return (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={i} src={img[1]} alt="" loading="lazy" className="my-3 w-full rounded-xl object-cover" />
          );
        if (!line.trim()) return <div key={i} className="h-3" />;
        return (
          <p key={i} className="break-words">
            {inline(line)}
          </p>
        );
      })}
    </div>
  );
}
function inline(line: string): React.ReactNode[] {
  // **bold** and @mentions
  return line.split(/(\*\*[^*]+\*\*|@[A-Za-z0-9_.-]{2,30})/g).map((part, i) => {
    if (/^\*\*[^*]+\*\*$/.test(part)) return <b key={i}>{part.slice(2, -2)}</b>;
    if (/^@[A-Za-z0-9_.-]{2,30}$/.test(part))
      return (
        <Link key={i} href={`/profile/${encodeURIComponent(part.slice(1))}`} className="font-semibold text-[#2563EB]">
          {part}
        </Link>
      );
    return part;
  });
}
