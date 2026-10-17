"use client";

import { useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "./firebase";

// Friend requests in the same flat friend_requests shape as the app's
// FriendsPage: {fromUsername, toUsername, status, createdAt}, with status
// pending → accepted / rejected / cancelled. Removing a friend deletes the
// accepted doc. The other person is told through an "alerts" doc.

export type FriendRequest = { id: string; from: string; to: string; createdAtMs: number };

export type Relation = "self" | "friend" | "sent" | "incoming" | "none";

const key = (s: string) => s.trim().toLowerCase();

function toRequests(docs: { id: string; get: (f: string) => any }[]): FriendRequest[] {
  return docs
    .map((d) => ({
      id: d.id,
      from: String(d.get("fromUsername") || "").trim(),
      to: String(d.get("toUsername") || "").trim(),
      createdAtMs: d.get("createdAt")?.toMillis?.() ?? 0,
    }))
    .sort((a, b) => b.createdAtMs - a.createdAtMs);
}

export function useFriendRequests(username: string) {
  const [incoming, setIncoming] = useState<FriendRequest[]>([]);
  const [sent, setSent] = useState<FriendRequest[]>([]);
  const [acceptedFromMe, setAcceptedFromMe] = useState<FriendRequest[]>([]);
  const [acceptedToMe, setAcceptedToMe] = useState<FriendRequest[]>([]);
  // BUG FIX (Friends count climbing 2 → 5 on Lobby), like the app: the two
  // "accepted" listeners answer one after the other. The friends list is
  // shown only once both are in; until then the list remembered on this
  // device from last time.
  const [loadedFor, setLoadedFor] = useState<{ user: string; from: boolean; to: boolean }>({ user: "", from: false, to: false });

  useEffect(() => {
    if (!username) return;
    setLoadedFor({ user: username, from: false, to: false });
    const col = collection(db, "friend_requests");
    const listen = (field: string, status: string, set: (r: FriendRequest[]) => void) =>
      onSnapshot(
        query(col, where(field, "==", username), where("status", "==", status)),
        (snap) => set(toRequests(snap.docs)),
        (err) => console.error("friend_requests listener failed", err)
      );
    const offs = [
      listen("toUsername", "pending", setIncoming),
      listen("fromUsername", "pending", setSent),
      listen("fromUsername", "accepted", (rows) => {
        setAcceptedFromMe(rows);
        setLoadedFor((l) => (l.user === username ? { ...l, from: true } : l));
      }),
      listen("toUsername", "accepted", (rows) => {
        setAcceptedToMe(rows);
        setLoadedFor((l) => (l.user === username ? { ...l, to: true } : l));
      }),
    ];
    return () => offs.forEach((off) => off());
  }, [username]);

  // BUG FIX (the same person listed twice in Requests), like the app: a request
  // sent twice made two documents. The lists show ONE row per person; the full
  // lists are kept so accept / reject / cancel closes all of that person's
  // duplicates at once.
  const oneEach = (list: FriendRequest[], pick: (r: FriendRequest) => string) =>
    Array.from(new Map(list.map((r) => [key(pick(r)), r] as const).reverse()).values()).reverse();
  const incomingOne = oneEach(incoming, (r) => r.from);
  const sentOne = oneEach(sent, (r) => r.to);

  const liveFriends = Array.from(
    new Map(
      [...acceptedFromMe.map((r) => r.to), ...acceptedToMe.map((r) => r.from)]
        .filter(Boolean)
        .map((n) => [key(n), n])
    ).values()
  ).sort((a, b) => key(a).localeCompare(key(b)));
  const friendsLoaded = loadedFor.user === username && loadedFor.from && loadedFor.to;
  const cacheKey = `migwith.friends.${key(username)}`;
  const cachedFriends = useMemo(() => {
    try {
      const v = JSON.parse(localStorage.getItem(cacheKey) || "[]");
      return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
    } catch {
      return [];
    }
  }, [cacheKey]);
  const friends = friendsLoaded ? liveFriends : cachedFriends;
  const liveKey = liveFriends.join("\n");
  useEffect(() => {
    if (!friendsLoaded || !username) return;
    try {
      localStorage.setItem(cacheKey, JSON.stringify(liveFriends));
    } catch {
      // storage blocked
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [friendsLoaded, liveKey, cacheKey]);

  const relationTo = (other: string): Relation => {
    const k = key(other);
    if (!k) return "none";
    if (k === key(username)) return "self";
    if (friends.some((f) => key(f) === k)) return "friend";
    if (sent.some((r) => key(r.to) === k)) return "sent";
    if (incoming.some((r) => key(r.from) === k)) return "incoming";
    return "none";
  };

  const alert = (to: string, message: string, type: string) =>
    addDoc(collection(db, "alerts"), {
      toUsername: to,
      fromUsername: username,
      message,
      type,
      read: false,
      createdAt: serverTimestamp(),
    }).catch(() => {});

  const setStatus = (id: string, status: string) =>
    updateDoc(doc(db, "friend_requests", id), { status, updatedAt: serverTimestamp() });

  return {
    incoming: incomingOne,
    sent: sentOne,
    friends,
    relationTo,

    async send(to: string) {
      const rel = relationTo(to);
      if (rel === "self") throw new Error("You can't add yourself.");
      if (rel === "friend") throw new Error(`${to} is already your friend.`);
      if (rel === "sent") throw new Error(`You already sent ${to} a request.`);
      if (rel === "incoming") throw new Error(`${to} already sent you a request — accept it instead.`);
      await addDoc(collection(db, "friend_requests"), {
        fromUsername: username,
        toUsername: to,
        status: "pending",
        createdAt: serverTimestamp(),
      });
      alert(to, `${username} sent you a friend request.`, "friend_request");
    },

    async accept(r: FriendRequest) {
      await setStatus(r.id, "accepted");
      // duplicates from the same person are closed, so only ONE accepted
      // friendship document is left
      incoming
        .filter((d) => d.id !== r.id && key(d.from) === key(r.from))
        .forEach((d) => setStatus(d.id, "rejected").catch(() => {}));
      alert(r.from, `${username} accepted your friend request.`, "friend_request_accepted");
    },

    async decline(r: FriendRequest) {
      const same = incoming.filter((d) => key(d.from) === key(r.from));
      await Promise.all((same.length ? same : [r]).map((d) => setStatus(d.id, "rejected")));
    },
    async cancel(r: FriendRequest) {
      const same = sent.filter((d) => key(d.to) === key(r.to));
      await Promise.all((same.length ? same : [r]).map((d) => setStatus(d.id, "cancelled")));
    },

    async remove(friend: string) {
      const k = key(friend);
      const docs = [
        ...acceptedFromMe.filter((r) => key(r.to) === k),
        ...acceptedToMe.filter((r) => key(r.from) === k),
      ];
      await Promise.all(docs.map((r) => deleteDoc(doc(db, "friend_requests", r.id))));
    },
  };
}

export type FriendRequests = ReturnType<typeof useFriendRequests>;
