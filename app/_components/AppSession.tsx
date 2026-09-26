"use client";

import { createContext, useContext, useEffect } from "react";
import { startAppCheck } from "../../lib/appCheck";
import { syncPush } from "../../lib/push";
import { useCurrentUser } from "../../lib/useCurrentUser";
import { useBadges } from "../../lib/useBadges";

// One sign-in listener and one set of badge listeners for the whole site.
// It lives in the root layout, so it survives page changes instead of being
// rebuilt (twice — header and bottom bar) on every navigation.

// App Check has to start before the first Firestore / Functions call, so it
// runs as soon as this file loads in the browser (before any page renders).
startAppCheck();

type Session = ReturnType<typeof useCurrentUser> & { badges: ReturnType<typeof useBadges> };

const SessionContext = createContext<Session | null>(null);

export function AppSession({ children }: { children: React.ReactNode }) {
  const current = useCurrentUser();
  const badges = useBadges(current.username);

  // Keep this browser's push token saved for whoever is signed in.
  const uid = current.user?.uid;
  useEffect(() => {
    if (uid) syncPush();
  }, [uid]);
  return <SessionContext.Provider value={{ ...current, badges }}>{children}</SessionContext.Provider>;
}

export function useSession(): Session {
  const s = useContext(SessionContext);
  if (!s) throw new Error("useSession must be used inside <AppSession>");
  return s;
}
