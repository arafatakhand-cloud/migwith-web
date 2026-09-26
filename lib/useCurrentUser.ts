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
    // Each sign-in change gets a number; a slow profile read from an earlier
    // one must not overwrite the current username.
    let latest = 0;
    return onAuthStateChanged(auth, async (next) => {
      const run = ++latest;
      setUser(next);

      if (!next) {
        setUsername("");
        setLoading(false);
        return;
      }

      // Never show the previous account's name while this one loads.
      setUsername("");
      setLoading(true);

      // Fallback: the part before "@" of "<migid>@login.migwith.local".
      let name = next.email?.split("@")[0] ?? "";

      try {
        const snap = await getDoc(doc(db, "users", next.uid));
        name = String(snap.get("username") || name);
      } catch (err) {
        console.error(err);
      }
      if (run !== latest) return;

      setUsername(name);
      setLoading(false);
    });
  }, []);

  return { user, username, loading };
}
