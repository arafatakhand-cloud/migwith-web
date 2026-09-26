"use client";

import { createContext, useContext } from "react";
import { useCurrentUser } from "../../lib/useCurrentUser";
import { useBadges } from "../../lib/useBadges";

// One sign-in listener and one set of badge listeners for the whole site.
// It lives in the root layout, so it survives page changes instead of being
// rebuilt (twice — header and bottom bar) on every navigation.

type Session = ReturnType<typeof useCurrentUser> & { badges: ReturnType<typeof useBadges> };

const SessionContext = createContext<Session | null>(null);

export function AppSession({ children }: { children: React.ReactNode }) {
  const current = useCurrentUser();
  const badges = useBadges(current.username);
  return <SessionContext.Provider value={{ ...current, badges }}>{children}</SessionContext.Provider>;
}

export function useSession(): Session {
  const s = useContext(SessionContext);
  if (!s) throw new Error("useSession must be used inside <AppSession>");
  return s;
}
