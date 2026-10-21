"use client";

import {
  collection,
  getDocs,
  limit,
  limitToLast,
  orderBy,
  query,
  where,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { db } from "./firebase";

// The newest gift_activity docs someone sent or received. The ordered query
// needs a (field, createdAt) index; if that index is missing it falls back to
// an unordered read (which may miss the newest ones) instead of showing nothing.
export async function latestGifts(
  field: "fromUsername" | "toUsername",
  username: string,
  n: number,
  // 🔒 also my private-chat gifts (gift_activity_private) — only for MY own lists
  withPrivate = false
): Promise<QueryDocumentSnapshot[]> {
  const read = async (name: string) => {
    const col = collection(db, name);
    try {
      const snap = await getDocs(query(col, where(field, "==", username), orderBy("createdAt"), limitToLast(n)));
      return snap.docs;
    } catch (err) {
      console.warn(`${name} ${field}+createdAt index missing, falling back`, err);
      const snap = await getDocs(query(col, where(field, "==", username), limit(n))).catch(() => null);
      return snap?.docs || [];
    }
  };
  if (!withPrivate) return read("gift_activity");
  const [pub, priv] = await Promise.all([read("gift_activity"), read("gift_activity_private")]);
  const ms = (d: QueryDocumentSnapshot) => (d.get("createdAt")?.toMillis?.() as number) || 0;
  return [...pub, ...priv].sort((a, b) => ms(a) - ms(b)).slice(-n);
}
