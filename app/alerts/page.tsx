"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { collection, getDocs, limit, onSnapshot, query, where, writeBatch } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useCurrentUser } from "../../lib/useCurrentUser";
import { roomHref } from "../../lib/rooms";
import { PageShell } from "../_components/PageShell";

// Same list as the app's AlertsPage: alerts where toUsername == me, newest
// first. Opening the page marks them all read (clears the 🔔 badge).

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

  useEffect(() => {
    if (!username) return;
    return onSnapshot(
      query(collection(db, "alerts"), where("toUsername", "==", username), limit(100)),
      (snap) => {
        setAlerts(
          snap.docs
            .map((d) => ({
              id: d.id,
              type: String(d.get("type") || ""),
              text: String(d.get("message") || d.get("text") || "You have a new alert."),
              read: d.get("read") === true,
              roomName: String(d.get("roomName") || ""),
              createdAtMs: d.get("createdAt")?.toMillis?.() ?? 0,
            }))
            .sort((a, b) => b.createdAtMs - a.createdAtMs)
        );
      },
      (err) => {
        console.error(err);
        setAlerts([]);
      }
    );
  }, [username]);

  // Clear every unread alert once per visit (not only the 100 shown), in batches.
  useEffect(() => {
    if (!username) return;
    getDocs(
      query(collection(db, "alerts"), where("toUsername", "==", username), where("read", "==", false), limit(2000))
    )
      .then(async (snap) => {
        const docs = snap.docs.filter((d) => !marked.current.has(d.id));
        for (let i = 0; i < docs.length; i += 450) {
          const batch = writeBatch(db);
          docs.slice(i, i + 450).forEach((d) => {
            marked.current.add(d.id);
            batch.update(d.ref, { read: true });
          });
          await batch.commit();
        }
      })
      .catch((err) => console.error("could not mark alerts read", err));
  }, [username]);

  if (loading || !user) {
    return (
      <PageShell>
        <p className="py-20 text-center text-sm text-white/40">Loading…</p>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <section className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <h1 className="text-3xl font-black tracking-tight">🔔 Alerts</h1>

        <ul className="mt-6 space-y-2">
          {alerts === null && <li className="py-10 text-center text-sm text-white/35">Loading…</li>}
          {alerts?.length === 0 && <li className="py-10 text-center text-sm text-white/35">No alerts yet.</li>}
          {alerts?.map((a) => {
            const room = a.type === "game_invite" || a.type === "mention" ? inviteRoom(a) : "";
            const isFriend = a.type === "friend_request" || a.type === "friend_request_accepted";
            const needsApp = a.type === "merchant_tag_request" || a.type === "mentor_tag_request";
            return (
              <li
                key={a.id}
                className={`flex gap-3 rounded-2xl border px-4 py-3 ${
                  a.read ? "border-white/10 bg-white/[0.03]" : "border-cyan-300/30 bg-cyan-300/[0.07]"
                }`}
              >
                <span className="text-xl leading-6">{ICONS[a.type] || "🔔"}</span>
                <div className="min-w-0 flex-1">
                  <p className="whitespace-pre-wrap break-words text-sm text-white/90">{a.text}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                    {a.createdAtMs > 0 && <span className="text-xs text-white/35">{timeLabel(a.createdAtMs)}</span>}
                    {room && (
                      <Link href={roomHref(room)} className="text-xs font-bold text-emerald-300 hover:underline">
                        {a.type === "game_invite" ? "▶ Open table" : "▶ Join room"}
                      </Link>
                    )}
                    {isFriend && (
                      <Link href="/friends" className="text-xs font-bold text-cyan-300 hover:underline">
                        {a.type === "friend_request" ? "View requests →" : "My friends →"}
                      </Link>
                    )}
                    {needsApp && <span className="text-xs text-amber-300/80">Respond in the MIGwith app</span>}
                  </div>
                </div>
                {!a.read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-pink-500" />}
              </li>
            );
          })}
        </ul>
      </section>
    </PageShell>
  );
}
