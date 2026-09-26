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
  n: number
): Promise<QueryDocumentSnapshot[]> {
  const col = collection(db, "gift_activity");
  try {
    const snap = await getDocs(query(col, where(field, "==", username), orderBy("createdAt"), limitToLast(n)));
    return snap.docs;
  } catch (err) {
    console.warn(`gift_activity ${field}+createdAt index missing, falling back`, err);
    const snap = await getDocs(query(col, where(field, "==", username), limit(n)));
    return snap.docs;
  }
}
