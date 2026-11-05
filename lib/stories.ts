"use client";

import { collection, getDocs, limit, orderBy, query, where } from "firebase/firestore";
import { db } from "./firebase";

// 📸 Stories: one photo each, shown for 24 hours (the server sets expiresAt).

export type Story = { id: string; author: string; url: string; createdMs: number; expiresAt: number };

/** Stories that are still inside their 24 hours, newest first. */
export async function loadStories(): Promise<Story[]> {
  const snap = await getDocs(
    query(collection(db, "blog_stories"), where("expiresAt", ">", Date.now()), orderBy("expiresAt", "desc"), limit(100))
  );
  return snap.docs
    .map((d) => {
      const x = d.data();
      return { id: d.id, author: String(x.author || ""), url: String(x.url || ""), createdMs: Number(x.createdMs || 0), expiresAt: Number(x.expiresAt || 0) };
    })
    .filter((s) => s.author && s.url);
}
