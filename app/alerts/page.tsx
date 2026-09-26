"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { collection, limit, onSnapshot, query, where, writeBatch } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useCurrentUser } from "../../lib/useCurrentUser";
import { roomHref } from "../../lib/rooms";
import { PageShell } from "../_components/PageShell";
import { PageTitle } from "../_components/LightCards";
import { PushToggle } from "../_components/PushToggle";

// Same list as the app's AlertsPage: alerts where toUsername == me, newest
// first. Unread ones are marked read while the page is open (clears the 🔔 badge).

type Alert = {
  id: string;
  type: string;
  text: string;
  read: boolean;
  roomName: string;
  createdAtMs: number;
};

const ICONS: Record<string, string> = {
  friend_request: "🤝",
  friend_request_accepted: "🎉",
  mention: "💬",
  game_invite: "🎴",
  coin_transfer: "💰",
  merchant_tag_request: "🏪",
  merchant_tag_request_approved: "🏪",
  mentor_tag_request: "🎓",
  mentor_tag_request_approved: "🎓",
  mentor_request: "🎓",
};

function toAlert(d: { id: string; get: (f: string) => any }): Alert {
  return {
    id: d.id,
    type: String(d.get("type") || ""),
    text: String(d.get("message") || d.get("text") || "You have a new alert."),
    read: d.get("read") === true,
    roomName: String(d.get("roomName") || ""),
    createdAtMs: d.get("createdAt")?.toMillis?.() ?? 0,
  };
}

function timeLabel(ms: number): string {
  if (!ms) return "";
  return new Date(ms).toLocaleString(undefined, { hour: "numeric", minute: "2-digit", day: "2-digit", month: "short" });
}

// "/invite" alerts carry the room only inside the text: … join "Room Name"!
function inviteRoom(a: Alert): string {
  if (a.roomName) return a.roomName;
  const m = a.text.match(/invited you to join "(.+)"!?$/);
  return m ? m[1] : "";
}

export default function AlertsPage() {
  const router = useRouter();
  const { user, username, loading } = useCurrentUser();
  const [alerts, setAlerts] = useState<Alert[] | null>(null);
  const marked = useRef(new Set<string>());

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  // Up to 100 of my alerts (no orderBy, so which 100 is arbitrary — that
  // query needs no composite index) …
  const [base, setBase] = useState<Alert[] | null>(null);
  // … plus every alert that was unread while this page was open, so new ones
  // always show even when they fall outside those 100.
  const [fresh, setFresh] = useState<Map<string, Alert>>(new Map());

  useEffect(() => {
    if (!username) return;
    return onSnapshot(
      query(collection(db, "alerts"), where("toUsername", "==", username), limit(100)),
      (snap) => setBase(snap.docs.map(toAlert)),
      (err) => {
        console.error(err);
        setBase([]);
      }
    );
  }, [username]);

  // Unread alerts: keep them in the list and mark them read (clears the 🔔
  // badge), including ones that arrive while the page is open.
  useEffect(() => {
    if (!username) return;
    return onSnapshot(
      query(collection(db, "alerts"), where("toUsername", "==", username), where("read", "==", false)),
      (snap) => {
        if (snap.empty) return;
        setFresh((prev) => {
          const next = new Map(prev);
          snap.docs.forEach((d) => next.set(d.id, toAlert(d)));
          return next;
        });
        const docs = snap.docs.filter((d) => !marked.current.has(d.id));
        (async () => {
          for (let i = 0; i < docs.length; i += 450) {
            const batch = writeBatch(db);
            docs.slice(i, i + 450).forEach((d) => {
              marked.current.add(d.id);
              batch.update(d.ref, { read: true });
            });
            await batch.commit();
          }
        })().catch((err) => console.error("could not mark alerts read", err));
      },
      (err) => console.error("unread alerts listener failed", err)
    );
  }, [username]);

  useEffect(() => {
    if (base === null) return;
    const all = new Map(base.map((a) => [a.id, a]));
    // Keep the "new" dot for alerts that were unread when they arrived here.
    fresh.forEach((a, id) => all.set(id, { ...(all.get(id) || a), read: false }));
    setAlerts(Array.from(all.values()).sort((a, b) => b.createdAtMs - a.createdAtMs));
  }, [base, fresh]);

  if (loading || !user) {
    return (
      <PageShell light>
        <p className="py-20 text-center text-sm text-[#5B6B8C]">Loading…</p>
      </PageShell>
    );
  }

  return (
    <PageShell light>
      <section className="mx-auto max-w-2xl px-3 pb-8 sm:px-6">
        <PageTitle title="migAlerts" subtitle="Notifications" icon="🔔" />
        <PushToggle />

        <ul className="mt-4 space-y-2">
          {alerts === null && <li className="py-10 text-center text-sm text-[#6B7A99]">Loading…</li>}
          {alerts?.length === 0 && <li className="py-10 text-center text-sm text-[#6B7A99]">No alerts yet.</li>}
          {alerts?.map((a) => {
            const room = a.type === "game_invite" || a.type === "mention" ? inviteRoom(a) : "";
            const isFriend = a.type === "friend_request" || a.type === "friend_request_accepted";
            const needsApp = a.type === "merchant_tag_request" || a.type === "mentor_tag_request";
            return (
              <li
                key={a.id}
                className={`flex gap-3 rounded-2xl border px-4 py-3 shadow-sm ${
                  a.read ? "border-[#E3ECF7] bg-white" : "border-[#F7B27A] bg-[#FFF4EA]"
                }`}
              >
                <span className="text-xl leading-6">{ICONS[a.type] || "🔔"}</span>
                <div className="min-w-0 flex-1">
                  <p className="whitespace-pre-wrap break-words text-sm text-[#0B2A5B]">{a.text}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                    {a.createdAtMs > 0 && <span className="text-xs text-[#6B7A99]">{timeLabel(a.createdAtMs)}</span>}
                    {room && (
                      <Link href={roomHref(room)} className="text-xs font-bold text-emerald-600 hover:underline">
                        {a.type === "game_invite" ? "▶ Open table" : "▶ Join room"}
                      </Link>
                    )}
                    {isFriend && (
                      <Link href="/friends" className="text-xs font-bold text-[#2F80ED] hover:underline">
                        {a.type === "friend_request" ? "View requests →" : "My friends →"}
                      </Link>
                    )}
                    {needsApp && <span className="text-xs text-amber-700">Respond in the MIGwith app</span>}
                  </div>
                </div>
                {!a.read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#F58220]" />}
              </li>
            );
          })}
        </ul>
      </section>
    </PageShell>
  );
}
