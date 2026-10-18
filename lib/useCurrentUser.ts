"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "./firebase";
import { migIdFromAliasEmail } from "./migAlias";

// ⚡ The MIG ID already read in this tab: a page opened by a swipe / tap shows
// at once instead of "Loading…" while it reads users/{uid} again.
let known: { uid: string; username: string } | null = null;

// The signed-in user plus their MIG ID (users/{uid}.username), or null when logged out.
export function useCurrentUser() {
  const now = auth.currentUser;
  const warm = now && known && known.uid === now.uid ? known : null;
  const [user, setUser] = useState<User | null>(warm ? now : null);
  const [username, setUsername] = useState(warm?.username ?? "");
  const [loading, setLoading] = useState(!warm);

  useEffect(() => {
    // Each sign-in change gets a number; a slow profile read from an earlier
    // one must not overwrite the current username.
    let latest = 0;
    return onAuthStateChanged(auth, async (next) => {
      const run = ++latest;
      setUser(next);

      if (!next) {
        known = null;
        setUsername("");
        setLoading(false);
        return;
      }

      // Already read in this tab: nothing to wait for.
      if (known && known.uid === next.uid) {
        setUsername(known.username);
        setLoading(false);
        return;
      }

      // Never show the previous account's name while this one loads.
      setUsername("");
      setLoading(true);

      // Fallback: the MIG ID from "<migid>@login.migwith.local" (see migAlias.ts).
      let name = migIdFromAliasEmail(next.email);

      let read = false;
      try {
        const snap = await getDoc(doc(db, "users", next.uid));
        name = String(snap.get("username") || name);
        read = true;
      } catch (err) {
        console.error(err);
      }
      if (run !== latest) return;

      if (read) known = { uid: next.uid, username: name };
      setUsername(name);
      setLoading(false);
    });
  }, []);

  return { user, username, loading };
}
