"use client";

import { collection, getDocs, limit, orderBy, query, where } from "firebase/firestore";
import { db } from "./firebase";

// 📸 Stories: one photo each, shown for 24 hours (the server sets expiresAt).
// A story has an optional caption and an audience: "everyone" or "friends".

export type Story = {
  id: string;
  authorUid: string;
  author: string;
  url: string;
  createdMs: number;
  expiresAt: number;
  caption: string;
  privacy: "everyone" | "friends" | "only_me";
  /** a text-only story (no photo) */
  text: string;
  /** an optional song; it plays for 30 seconds from startSec */
  song: { url: string; title: string; startSec: number } | null;
};

/** Stories still inside their 24 hours, newest first. Friends-only stories are kept for the caller to filter. */
export async function loadStories(): Promise<Story[]> {
  const snap = await getDocs(
    query(collection(db, "blog_stories"), where("expiresAt", ">", Date.now()), orderBy("expiresAt", "desc"), limit(100))
  );
  return snap.docs
    .map((d) => {
      const x = d.data();
      return {
        id: d.id,
        authorUid: String(x.authorUid || ""),
        author: String(x.author || ""),
        url: String(x.url || ""),
        createdMs: Number(x.createdMs || 0),
        expiresAt: Number(x.expiresAt || 0),
        caption: String(x.caption || ""),
        privacy: x.privacy === "friends" || x.privacy === "only_me" ? x.privacy : "everyone",
        text: String(x.text || ""),
        song:
          x.song && typeof x.song.url === "string" && x.song.url
            ? { url: String(x.song.url), title: String(x.song.title || "Song"), startSec: Number(x.song.startSec || 0) }
            : null,
      } as Story;
    })
    .filter((s) => s.author && (s.url || s.text));
}
