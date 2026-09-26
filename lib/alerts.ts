"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "./firebase";

// Unread alerts for the 🔔 badge — same query as the app's home bell.
export function useUnreadAlerts(username: string): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!username) {
      setCount(0);
      return;
    }
    return onSnapshot(
      query(collection(db, "alerts"), where("toUsername", "==", username), where("read", "==", false)),
      (snap) => setCount(snap.size),
      (err) => console.error("alerts listener failed", err)
    );
  }, [username]);

  return count;
}
