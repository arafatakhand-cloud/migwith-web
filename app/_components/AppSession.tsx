"use client";

import { createContext, useContext, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { syncPush } from "../../lib/push";
import { useCurrentUser } from "../../lib/useCurrentUser";
import { useBadges } from "../../lib/useBadges";
import { useAchievementSync } from "./Achievements";
import { useSpecialColorListener } from "../../lib/specialColor";
import { useOnlineHeartbeat } from "../../lib/heartbeat";
import { useAutoLogout } from "../../lib/autoLogout";

// One sign-in listener and one set of badge listeners for the whole site.
// It lives in the root layout, so it survives page changes instead of being
// rebuilt (twice — header and bottom bar) on every navigation.

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
  // 🏅 Achievements the server checks on open (level, streak, friends, views …).
  useAchievementSync(uid);
  // 🌈 Who has the Special Edition Colour (rainbow name) right now.
  useSpecialColorListener(uid);
  // Online for friends on every page (lastActiveAt every 30 s), like the app.
  useOnlineHeartbeat(uid);
  // 🔐 Minimised for 120 min → logged out (rooms left, tabs closed); signed out
  // any other way → that ID's room tabs closed too.
  useAutoLogout(uid);
  // 🔐 Signed out (e.g. coming back to a tab after the login ran out): straight
  // to the login page instead of a page that keeps showing "Loading…".
  const pathname = usePathname() || "/";
  const router = useRouter();
  const signedOut = !current.loading && !current.user;
  useEffect(() => {
    if (signedOut && !isPublicPath(pathname)) router.replace("/login");
  }, [signedOut, pathname, router]);
  return <SessionContext.Provider value={{ ...current, badges }}>{children}</SessionContext.Provider>;
}

export function useSession(): Session {
  const s = useContext(SessionContext);
  if (!s) throw new Error("useSession must be used inside <AppSession>");
  return s;
}

// Pages anyone may open without signing in.
const PUBLIC_PATHS = ["/", "/login", "/register", "/forgot-password", "/welcome", "/privacy", "/delete-account", "/terms", "/child-safety"];
function isPublicPath(path: string): boolean {
  return PUBLIC_PATHS.some((p) => path === p || (p !== "/" && path.startsWith(`${p}/`)));
}
