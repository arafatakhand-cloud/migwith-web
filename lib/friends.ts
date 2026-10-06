"use client";

import { useEffect, useState } from "react";
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

  useEffect(() => {
    if (!username) return;
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
      listen("fromUsername", "accepted", setAcceptedFromMe),
      listen("toUsername", "accepted", setAcceptedToMe),
    ];
    return () => offs.forEach((off) => off());
  }, [username]);

  const friends = Array.from(
    new Map(
      [...acceptedFromMe.map((r) => r.to), ...acceptedToMe.map((r) => r.from)]
        .filter(Boolean)
        .map((n) => [key(n), n])
    ).values()
  ).sort((a, b) => key(a).localeCompare(key(b)));

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
    incoming,
    sent,
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
      alert(r.from, `${username} accepted your friend request.`, "friend_request_accepted");
    },

    decline: (r: FriendRequest) => setStatus(r.id, "rejected"),
    cancel: (r: FriendRequest) => setStatus(r.id, "cancelled"),

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
