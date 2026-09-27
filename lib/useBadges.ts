"use client";

import { useUnreadBySender } from "./privateChat";
import { useFriendRequests } from "./friends";
import { useUnreadAlerts, useUnreadEmails } from "./alerts";

// Unread counts for the header and the mobile bottom bar.
export function useBadges(username: string) {
  const unread = useUnreadBySender(username);
  return {
    messages: Object.values(unread).reduce((a, b) => a + b, 0),
    requests: useFriendRequests(username).incoming.length,
    alerts: useUnreadAlerts(username),
    emails: useUnreadEmails(username),
  };
}

export const badgeText = (n: number) => (n > 99 ? "99+" : String(n));
