"use client";

import { httpsCallable } from "firebase/functions";
import { functions } from "./firebase";

// 📝 Blog: every user may write. Posts live in blog_posts/{id}; the server
// (the `blog` function) does every write — create / edit / delete / like /
// comment / view. Same in the app (Blog.kt).

export type BlogPost = {
  id: string;
  authorUid: string;
  author: string;
  title: string;
  body: string;
  excerpt: string;
  cover: string;
  firstImage: string;
  category: string;
  likes: number;
  comments: number;
  views: number;
  createdMs: number;
  edited: boolean;
  /** friends tagged with @ (they were notified) — shown as a pill */
  mentions: string[];
  /** a feed video's download URL ('' = none) */
  video: string;
  /** a shared post: the original's id, author and title ('' = not a share) */
  sharedId: string;
  sharedAuthor: string;
  sharedTitle: string;
  /** the Text Art colour the writer picked (0–7, 8 = plain white), -1 = picked from the post id */
  bg: number;
  /** a small copy of the cover for the Feed list ('' = use the cover) */
  thumb: string;
  /** who can see it: '' = 🌍 Everyone, 'friends' = 👥 Friends, 'me' = 🔒 Only me */
  privacy: "" | "friends" | "me";
  /** 📍 where the writer was ("" = none) and the line under it */
  place: string;
  placeSub: string;
};

export type BlogComment = {
  id: string;
  authorUid: string;
  author: string;
  text: string;
  createdMs: number;
  /** the top comment this one answers ('' = top level) */
  replyTo: string;
  /** 👍 reactions on the comment: { emoji: count } and the total */
  reactions: Record<string, number>;
  likes: number;
};
/** the six reactions, with the word shown on the Like button */
export const BLOG_REACTIONS: [string, string, string][] = [
  ["👍", "Like", "#2563EB"],
  ["❤️", "Love", "#E11D48"],
  ["😂", "Haha", "#D97706"],
  ["😮", "Wow", "#D97706"],
  ["😢", "Sad", "#D97706"],
  ["😡", "Angry", "#EA580C"],
];
function reactionCounts(v: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (v && typeof v === "object") for (const [k, n] of Object.entries(v as Record<string, unknown>)) if (Number(n) > 0) out[k] = Number(n);
  return out;
}

export const BLOG_CATEGORIES: [string, string][] = [
  ["life", "💬 Life"],
  ["games", "🎮 Games"],
  ["music", "🎵 Music"],
  ["fun", "😂 Fun"],
  ["news", "📢 News"],
  ["love", "❤️ Love"],
  ["tips", "💡 Tips"],
  ["other", "✨ Other"],
];
export const blogCategoryLabel = (id: string) => BLOG_CATEGORIES.find(([k]) => k === id)?.[1] || "✨ Other";

// Cover colours when a post has no photo (picked by the post id, so it stays the same).
const COVERS = [
  "linear-gradient(135deg,#ff9a8b,#ff6a88 50%,#ff99ac)",
  "linear-gradient(135deg,#43cea2,#185a9d)",
  "linear-gradient(135deg,#f6d365,#fda085)",
  "linear-gradient(135deg,#a18cd1,#fbc2eb)",
  "linear-gradient(135deg,#4facfe,#00f2fe)",
  "linear-gradient(135deg,#667eea,#764ba2)",
];
export function blogCoverFallback(id: string): string {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return COVERS[h % COVERS.length];
}

const ms = (t: unknown): number =>
  t && typeof (t as { toMillis?: () => number }).toMillis === "function" ? (t as { toMillis: () => number }).toMillis() : 0;

export function toBlogPost(id: string, d: Record<string, unknown>): BlogPost {
  return {
    id,
    authorUid: String(d.authorUid || ""),
    author: String(d.author || ""),
    title: String(d.title || ""),
    body: String(d.body || ""),
    excerpt: String(d.excerpt || ""),
    cover: String(d.cover || ""),
    firstImage: String(d.firstImage || ""),
    category: String(d.category || "other"),
    likes: Number(d.likes || 0),
    comments: Number(d.comments || 0),
    views: Number(d.views || 0),
    createdMs: Number(d.createdMs || 0) || ms(d.createdAt),
    edited: d.edited === true,
    mentions: Array.isArray(d.mentions) ? d.mentions.map((x) => String(x).toLowerCase()) : [],
    video: String(d.video || ""),
    sharedId: String(d.sharedId || ""),
    sharedAuthor: String(d.sharedAuthor || ""),
    sharedTitle: String(d.sharedTitle || ""),
    bg: Number.isInteger(d.bg) && Number(d.bg) >= 0 && Number(d.bg) < 9 ? Number(d.bg) : -1,
    thumb: String(d.thumb || ""),
    privacy: d.privacy === "friends" || d.privacy === "me" ? d.privacy : "",
    place: String(d.place || ""),
    placeSub: String(d.placeSub || ""),
  };
}
export function toBlogComment(id: string, d: Record<string, unknown>): BlogComment {
  return {
    id,
    authorUid: String(d.authorUid || ""),
    author: String(d.author || ""),
    text: String(d.text || ""),
    createdMs: Number(d.createdMs || 0) || ms(d.createdAt),
    replyTo: String(d.replyTo || ""),
    reactions: reactionCounts(d.reactions),
    likes: Number(d.likes || 0),
  };
}

export const blogShort = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n));

export function blogAgo(t: number): string {
  if (!t) return "now";
  const m = Math.floor((Date.now() - t) / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  if (m < 1440) return `${Math.floor(m / 60)}h`;
  if (m < 43200) return `${Math.floor(m / 1440)}d`;
  return new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/** 0-9 → ০-৯ */
export const toBnDigits = (n: number) => String(n);

/** "5 min ago", "2 h ago", "3 d ago" — the time on a post card. */
export function blogAgoBn(t: number): string {
  if (!t) return "just now";
  const m = Math.floor((Date.now() - t) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  if (m < 1440) return `${Math.floor(m / 60)} h ago`;
  if (m < 43200) return `${Math.floor(m / 1440)} d ago`;
  return new Date(t).toLocaleDateString("bn-BD", { day: "numeric", month: "short", year: "numeric" });
}

const call = httpsCallable<Record<string, unknown>, Record<string, unknown>>(functions, "blog");
export async function blogCall(action: string, data: Record<string, unknown> = {}) {
  const r = await call({ action, ...data });
  return r.data;
}
export function blogError(e: unknown): string {
  const m = (e as { message?: string })?.message || "";
  return m.replace(/^FirebaseError:\s*/, "") || "Something went wrong. Please try again.";
}

// 🔒 who can see a post
export const BLOG_PRIVACY: ["" | "friends" | "me", string, string][] = [
  ["", "🌍", "Everyone"],
  ["friends", "👥", "Friends"],
  ["me", "🔒", "Only me"],
];
export function blogPrivacyLabel(p: string): string {
  const x = BLOG_PRIVACY.find(([k]) => k === p) || BLOG_PRIVACY[0];
  return `${x[1]} ${x[2]}`;
}
