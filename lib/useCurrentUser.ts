"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "./firebase";

// The signed-in user plus their MIG ID (users/{uid}.username), or null when logged out.
export function useCurrentUser() {
  const [user, setUser] = useState<User | null>(null);
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return onAuthStateChanged(auth, async (next) => {
      setUser(next);

      if (!next) {
        setUsername("");
        setLoading(false);
        return;
      }

      // Fallback: the part before "@" of "<migid>@login.migwith.local".
      let name = next.email?.split("@")[0] ?? "";

      try {
        const snap = await getDoc(doc(db, "users", next.uid));
        name = String(snap.get("username") || name);
      } catch (err) {
        console.error(err);
      }

      setUsername(name);
      setLoading(false);
    });
  }, []);

  return { user, username, loading };
}
