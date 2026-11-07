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
import { TranslateChip, feedPlainText, useFeedTranslation } from "../../_components/FeedTranslate";
import {
  blogAgo,
  blogCall,
  blogCategoryLabel,
  blogPrivacyLabel,
  blogMood,
  BLOG_PRIVACY,
  BLOG_REACTIONS,
  blogCoverFallback,
  blogError,
  blogShort,
  toBlogComment,
  toBlogPost,
  type BlogComment,
  type BlogPost,
} from "../../../lib/feed";

// 📰 One Feed post: cover, title, the writing (with its photos), ❤️ like,
// 💬 comments, ↗ share, 🚩 report. The writer can edit / delete; the miGlife
// team can delete any post or comment.

export default function BlogPostPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user, username } = useCurrentUser();
  const [post, setPost] = useState<BlogPost | null | undefined>(undefined);
  const tr = useFeedTranslation(String(id || ""));
  const [comments, setComments] = useState<BlogComment[]>([]);
  const [liked, setLiked] = useState(false);
  const [likeBusy, setLikeBusy] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  // ↩ the top comment I am replying to (null = a new top comment)
  const [replyTo, setReplyTo] = useState<BlogComment | null>(null);
  const [toast, setToast] = useState("");
  const [canMod, setCanMod] = useState(false);
  const [menu, setMenu] = useState(false);
  const viewed = useRef(false);
  // 🔒 a 👥 Friends / 🔒 Only me post: it comes from the server (no live updates);
  // bump privTick to read it again after a like / comment / change
  const [isPrivate, setIsPrivate] = useState(false);
  const [privTick, setPrivTick] = useState(0);
  const [privMenu, setPrivMenu] = useState(false);
  const commentsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!id) return;
    const ref = doc(db, "blog_posts", id);
    const off1 = onSnapshot(
      ref,
      (s) => {
        if (s.exists()) {
          setIsPrivate(false);
          setPost(toBlogPost(s.id, s.data()));
        } else setIsPrivate(true); // maybe a 👥 / 🔒 post: asked from the server below
      },
      () => setIsPrivate(true)
    );
    const off2 = onSnapshot(query(collection(ref, "comments"), orderBy("createdAt", "asc"), limit(300)), (s) =>
      setComments(s.docs.map((d) => toBlogComment(d.id, d.data())))
    );
    return () => {
      off1();
      off2();
    };
  }, [id]);

  // 🔒 read a private post (and its comments) from the server
  useEffect(() => {
    if (!id || !isPrivate) return;
    if (!user) {
      setPost(null);
      return;
    }
    blogCall("getPost", { postId: id })
      .then((r) => {
        const p = r.post as Record<string, unknown> | undefined;
        if (!p) return setPost(null);
        setPost(toBlogPost(String(p.id), p));
        const cs = Array.isArray(r.comments) ? (r.comments as Record<string, unknown>[]) : [];
        setComments(cs.map((c) => toBlogComment(String(c.id), c)));
      })
      .catch(() => setPost(null));
    blogCall("myReactions", { postIds: [id], privateIds: [id] })
      .then((r) => setLiked(!!(r.reactions as Record<string, string> | undefined)?.[id]))
      .catch(() => {});
  }, [id, isPrivate, user, privTick]);
  // 👍 my reaction on each comment, and the comment whose reaction row is open
  const [cReact, setCReact] = useState<Record<string, string>>({});
  const [cPick, setCPick] = useState("");
  const holdRef = useRef<number | null>(null);
  const cIds = comments.map((c) => c.id).join(",");
  useEffect(() => {
    if (!user || !id || !cIds) return;
    let alive = true;
    blogCall("myCommentReactions", { postId: id, commentIds: cIds.split(",") })
      .then((r) => alive && setCReact((r.reactions as Record<string, string>) || {}))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [id, user, cIds]);
  const reactComment = async (c: BlogComment, emoji: string) => {
    if (!user) return router.push("/login");
    if (!post) return;
    setCPick("");
    const was = cReact[c.id] || "";
    const next = was === emoji ? "" : emoji;
    // at once; the server's answer settles it
    const bump = (cur: Record<string, number>) => {
      const m = { ...cur };
      if (was) m[was] = Math.max(0, (m[was] || 0) - 1);
      if (next) m[next] = (m[next] || 0) + 1;
      Object.keys(m).forEach((k) => !m[k] && delete m[k]);
      return m;
    };
    const setCounts = (cid: string, reactions: Record<string, number>) =>
      setComments((list) => list.map((x) => (x.id === cid ? { ...x, reactions, likes: Object.values(reactions).reduce((a, b) => a + b, 0) } : x)));
    setCReact((m) => ({ ...m, [c.id]: next }));
    setCounts(c.id, bump(c.reactions));
    try {
      const r = await blogCall("commentReact", { postId: post.id, commentId: c.id, reaction: next });
      setCReact((m) => ({ ...m, [c.id]: String(r.reaction || "") }));
      setCounts(c.id, (r.reactions as Record<string, number>) || {});
    } catch (e) {
      setCReact((m) => ({ ...m, [c.id]: was }));
      setCounts(c.id, c.reactions);
      setToast(blogError(e));
    }
  };
  const setPrivacy = async (next: string) => {
    if (!post) return;
    try {
      await blogCall("setPrivacy", { postId: post.id, privacy: next || "everyone" });
      setToast(`Now: ${blogPrivacyLabel(next)}`);
      if (post.privacy && !next) setIsPrivate(false);
      else if (!post.privacy && next) setIsPrivate(true);
      setPrivTick((n) => n + 1);
      setPost({ ...post, privacy: next as BlogPost["privacy"] });
    } catch (e) {
      setToast(blogError(e));
    }
  };

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
      if (isPrivate) setPrivTick((n) => n + 1);
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
      await blogCall("comment", { postId: post.id, text: t, parentId: replyTo?.id || "" });
      setReplyTo(null);
      setText("");
      if (isPrivate) setPrivTick((n) => n + 1);
      setTimeout(() => commentsRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }), 300);
    } catch (e) {
      setToast(blogError(e));
    } finally {
      setSending(false);
    }
  };
  const share = async () => {
    if (!post) return;
    const url = `${window.location.origin}/feed/${post.id}`;
    try {
      if (navigator.share) await navigator.share({ title: post.title, text: `📰 ${post.title} — by ${post.author} on miGlife`, url });
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
      router.replace("/feed");
    } catch (e) {
      setToast(blogError(e));
    }
  };
  const removeComment = async (c: BlogComment) => {
    if (!post || !confirm("Delete this comment?")) return;
    try {
      await blogCall("deleteComment", { postId: post.id, commentId: c.id });
      if (isPrivate) setPrivTick((n) => n + 1);
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
          <Link href="/feed" className="mt-4 inline-block rounded-xl bg-[#2563EB] px-4 py-2 font-bold text-white">
            Back to Feed
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
            onClick={() => (window.history.length > 1 ? router.back() : router.push("/feed"))}
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
                // ✏️ edit in the Feed's writer (colours, photos, place…)
                <button
                  type="button"
                  onClick={() => {
                    try {
                      sessionStorage.setItem("migwith.feedEdit", post.id);
                    } catch {
                      return router.push(`/feed/write?edit=${post.id}`);
                    }
                    router.push("/feed");
                  }}
                  className="block w-full px-4 py-2.5 text-left hover:bg-[#F1F5FB]"
                >
                  ✏️ Edit
                </button>
              )}
              {mine && !post.sharedId && (
                <button type="button" onClick={(e) => (e.stopPropagation(), setPrivMenu((v) => !v))} className="block w-full px-4 py-2.5 text-left hover:bg-[#F1F5FB]">
                  {blogPrivacyLabel(post.privacy)} ▾
                </button>
              )}
              {mine && privMenu &&
                BLOG_PRIVACY.map(([k, icon, label]) => (
                  <button
                    key={k || "all"}
                    type="button"
                    onClick={() => (setPrivMenu(false), setPrivacy(k))}
                    className={`block w-full py-2 pl-8 pr-4 text-left text-[13px] hover:bg-[#F1F5FB] ${post.privacy === k ? "font-black text-[#6366F1]" : ""}`}
                  >
                    {icon} {label} {post.privacy === k ? "✓" : ""}
                  </button>
                ))}
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
              {!post.privacy && (
                <button type="button" onClick={share} className="block w-full px-4 py-2.5 text-left hover:bg-[#F1F5FB]">
                  ↗ Share
                </button>
              )}
            </div>
          )}
        </div>

        <div className="px-4 pt-3">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12.5px] text-[#5A6F93]">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-bold text-white" style={{ background: color }}>
              {post.author.slice(0, 1).toUpperCase()}
            </span>
            <Link href={`/profile/${encodeURIComponent(post.author)}`} data-notranslate className="truncate font-bold" style={{ color }}>
              {post.author}
            </Link>
            {blogMood(post.mood) && (
              <span className="shrink-0 font-semibold text-[#3B4266]">
                is {blogMood(post.mood)![0]} <b>{blogMood(post.mood)![1]}</b>
              </span>
            )}
            <span className="shrink-0">
              · {blogAgo(post.createdMs)}
              {post.edited ? " · edited" : ""} · {blogCategoryLabel(post.category)}
              {post.privacy ? ` · ${blogPrivacyLabel(post.privacy)}` : ""}
            </span>
          </div>
          {post.place && (
            <button
              type="button"
              onClick={() => {
                try {
                  sessionStorage.setItem("migwith.feedPlace", post.place);
                } catch {
                  // blocked
                }
                router.push("/feed");
              }}
              className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-[#FFE4E6] to-[#FCE7F3] px-2.5 py-0.5 text-[12.5px] font-extrabold text-[#BE185D]"
            >
              <span className="font-semibold text-[#5A6F93]">is at</span> 📍 {post.place}
              {post.placeSub ? <span className="font-semibold text-[#BE185D]/70">, {post.placeSub.split(",")[0]}</span> : null}
            </button>
          )}
          <div className="mt-2 flex justify-end">
            <TranslateChip postId={post.id} title={post.title} text={feedPlainText(post.body)} />
          </div>
          {tr?.text && (
            <div className="mt-3 whitespace-pre-line rounded-2xl border border-[#6366F1]/15 bg-[#EEF2FF] px-3.5 py-3 text-[15px] leading-[1.65] text-[#253A5E]">
              <div className="mb-1 text-[11px] font-extrabold text-[#4F46E5]">🌐 English</div>
              {tr.text}
            </div>
          )}
          <BlogBody body={post.body} mentions={post.mentions} />

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
            {!post.privacy && <button
              type="button"
              onClick={share}
              className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-white text-[14px] font-bold text-[#1D4ED8] shadow-[0_2px_6px_-3px_rgba(30,60,120,.35)]"
            >
              ↗ Share
            </button>}
          </div>
          <p className="mt-2 text-right text-[12px] text-[#6B7FA6]">👁 {blogShort(post.views)} {post.views === 1 ? "view" : "views"}</p>

          <h3 className="mb-2 mt-3 text-[13px] font-bold tracking-wide text-[#5A6F93]">COMMENTS ({comments.length})</h3>
          <div ref={commentsRef} className="space-y-3" onClick={(e) => cPick && !(e.target as HTMLElement).closest("[data-react]") && setCPick("")}>
            {comments.length === 0 && <p className="text-[13px] text-[#6B7FA6]">No comments yet. Say something nice!</p>}
            {comments.map((c) => {
              const cc = colorOf(c.author) || "#2563EB";
              const canDel = !!user && (c.authorUid === user.uid || mine || canMod);
              const isReply = !!c.replyTo;
              return (
                <div key={c.id} className={`flex gap-2 ${isReply ? "ml-9" : ""}`}>
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-bold text-white" style={{ background: cc }}>
                    {c.author.slice(0, 1).toUpperCase()}
                  </span>
                  <div className="relative min-w-0">
                  <div className="relative min-w-0 rounded-xl bg-white px-2.5 py-1.5 text-[13.5px] leading-snug text-[#253A5E] shadow-[0_1px_4px_-2px_rgba(0,0,0,.15)]">
                    <Link href={`/profile/${encodeURIComponent(c.author)}`} data-notranslate className="block text-[13px] font-extrabold text-[#1E3A6E] underline-offset-2 hover:underline">
                      {c.author}
                    </Link>
                    <span className="break-words">{c.text}</span>
                    {/* 👍❤️ 5 — the reactions on this comment, on the bubble's corner */}
                    {c.likes > 0 && (
                      <span className="absolute -bottom-2.5 right-1 flex items-center gap-0.5 rounded-full bg-white px-1.5 py-0.5 text-[11px] font-bold text-[#5A6F93] shadow-[0_1px_4px_rgba(0,0,0,.18)]">
                        {Object.entries(c.reactions)
                          .sort((a, b) => b[1] - a[1])
                          .slice(0, 3)
                          .map(([e]) => (
                            <span key={e} className="text-[12px] leading-none">{e}</span>
                          ))}
                        <span className="ml-0.5">{c.likes}</span>
                      </span>
                    )}
                  </div>
                    {/* the six reactions, after a long press on Like */}
                    {cPick === c.id && (
                      <div data-react className="absolute -top-11 left-0 z-20 flex gap-0.5 rounded-full bg-white px-1.5 py-1 shadow-[0_6px_18px_-6px_rgba(30,40,90,.45)]">
                        {BLOG_REACTIONS.map(([e, label]) => (
                          <button key={e} type="button" aria-label={label} onClick={() => reactComment(c, e)} className="rounded-full px-1 text-[24px] leading-none transition hover:scale-125 active:scale-110">
                            {e}
                          </button>
                        ))}
                      </div>
                    )}
                    <div className={`flex gap-3 pl-1 text-[11.5px] text-[#8494B2] ${c.likes > 0 ? "mt-3" : "mt-1"}`}>
                      <span>{blogAgo(c.createdMs)}</span>
                      {(() => {
                        const mineR = cReact[c.id] || "";
                        const look = BLOG_REACTIONS.find(([e]) => e === mineR);
                        const clear = () => holdRef.current && (window.clearTimeout(holdRef.current), (holdRef.current = null));
                        return (
                          <button
                            type="button"
                            onPointerDown={() => {
                              clear();
                              holdRef.current = window.setTimeout(() => {
                                holdRef.current = null;
                                setCPick(c.id);
                              }, 450);
                            }}
                            onPointerUp={(e) => {
                              if (holdRef.current) {
                                clear();
                                e.preventDefault();
                                void reactComment(c, mineR || "👍");
                              }
                            }}
                            onPointerLeave={clear}
                            data-react
                            onContextMenu={(e) => (e.preventDefault(), setCPick(c.id))}
                            className="select-none font-bold"
                            style={{ color: look ? look[2] : undefined }}
                          >
                            {look ? `${look[0]} ${look[1]}` : "Like"}
                          </button>
                        );
                      })()}
                      {user && (
                        <button
                          type="button"
                          onClick={() => {
                            // ↩ reply: the box says who it answers and starts with @name
                            setReplyTo(isReply ? comments.find((x) => x.id === c.replyTo) || c : c);
                            setText(`@${c.author} `);
                            document.getElementById("blog-comment")?.focus();
                          }}
                          className="font-semibold text-[#2563EB]"
                        >
                          Reply
                        </button>
                      )}
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
        {replyTo && (
          <div className="mx-auto mb-1.5 flex max-w-2xl items-center justify-between text-[12px] font-semibold text-[#2563EB]">
            <span>↩ Replying to {replyTo.author}</span>
            <button type="button" onClick={() => { setReplyTo(null); setText(""); }} className="text-[#8494B2]">✕</button>
          </div>
        )}
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
function BlogBody({ body, mentions }: { body: string; mentions: string[] }) {
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
            {inline(line, mentions)}
          </p>
        );
      })}
    </div>
  );
}
function inline(line: string, mentions: string[] = []): React.ReactNode[] {
  // **bold** and @mentions (a tagged friend = a soft purple pill)
  return line.split(/(\*\*[^*]+\*\*|@[A-Za-z0-9_.-]{2,30})/g).map((part, i) => {
    if (/^\*\*[^*]+\*\*$/.test(part)) return <b key={i}>{part.slice(2, -2)}</b>;
    if (/^@[A-Za-z0-9_.-]{2,30}$/.test(part))
      return (
        <Link
          key={i}
          href={`/profile/${encodeURIComponent(part.slice(1))}`}
          className={
            mentions.includes(part.slice(1).toLowerCase())
              ? "rounded-md bg-[#EFEAFF] px-1.5 py-[1px] font-bold text-[#4C3FB0]"
              : "font-semibold text-[#2563EB]"
          }
        >
          {part}
        </Link>
      );
    return part;
  });
}
