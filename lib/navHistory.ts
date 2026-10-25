"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

// The page this tab was on just before the current one (inside the site), so a
// ← / Close can really go BACK — leaving no copy of the page behind for the
// phone's back gesture to bring up again.
let previous: string | null = null;
let current: string | null = null;

export function useTrackPath() {
  const pathname = usePathname();
  useEffect(() => {
    if (!pathname || pathname === current) return;
    previous = current;
    current = pathname;
  }, [pathname]);
}

/** The site page opened before this one in this tab, or null (opened directly / from outside). */
export function previousPath(): string | null {
  return previous;
}
