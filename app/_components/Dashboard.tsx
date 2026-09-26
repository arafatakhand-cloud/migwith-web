"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { collection, doc, getDocs, onSnapshot, query, serverTimestamp, updateDoc, where } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useFriendRequests } from "../../lib/friends";
import { chatHref, useUnreadBySender } from "../../lib/privateChat";
import { levelProgress } from "../../lib/level";
import { roomHref } from "../../lib/rooms";
import { useRoomPrefs } from "../../lib/roomPrefs";
import { badgeText } from "../../lib/useBadges";
import { useSession } from "./AppSession";

// Signed-in home, laid out like the app's home: profile card, Recent, Friends.

type Me = { photoUrl: string; level: number; xp: number; role: string; statusMessage: string; online: boolean };
type FriendInfo = { online: boolean; status: string };

function photoOf(d: Record<string, unknown>): string {
  for (const k of ["photoUrl", "profilePic", "avatarUrl", "imageUrl"]) {
    const v = String(d[k] || "").trim();
    if (v) return v;
  }
  return "";
}

function roleBadge(role: string): { label: string; cls: string } | null {
  const r = role.trim().toLowerCase();
  if (r === "merchant") return { label: "SHOP", cls: "bg-blue-600" };
  if (r === "mentor") return { label: "MENTOR", cls: "bg-rose-600" };
  if (r === "staff") return { label: "STAFF", cls: "bg-emerald-600" };
  if (r === "admin" || r === "superadmin") return { label: "ADMIN", cls: "bg-amber-600" };
  if (r === "elite" || r === "elite_user") return { label: "ELITE", cls: "bg-cyan-700" };
  return null;
}

function Panel({
  title,
  open,
  onToggle,
  children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-3xl border border-white/15 bg-[#13245f]/80">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between border-b border-white/10 bg-[#1a2657]/70 px-4 py-3.5 text-left"
      >
        <span className="text-lg font-black">{title}</span>
        <span className={`text-white/70 transition ${open ? "" : "rotate-180"}`}>⌃</span>
      </button>
      {open && <div className="p-3">{children}</div>}
    </section>
  );
}

export function Dashboard() {
  const { user, username, badges } = useSession();
  const [me, setMe] = useState<Me | null>(null);
  const [editing, setEditing] = useState(false);
  const [statusDraft, setStatusDraft] = useState("");
  const [openRecent, setOpenRecent] = useState(true);
  const [openFriends, setOpenFriends] = useState(true);
  const [search, setSearch] = useState("");
  const [friendInfo, setFriendInfo] = useState<Record<string, FriendInfo>>({});

  const fr = useFriendRequests(username);
  const unread = useUnreadBySender(username);
  const { recent } = useRoomPrefs();

  useEffect(() => {
    if (!user) return;
    return onSnapshot(doc(db, "users", user.uid), (snap) => {
      const d = snap.data() || {};
      setMe({
        photoUrl: photoOf(d),
        level: Number(d.level || 1),
        xp: Number(d.xp || 0),
        role: String(d.role || d.membershipRole || ""),
        statusMessage: String(d.statusMessage || "").trim(),
        online: String(d.presenceStatus || "ONLINE").toUpperCase() === "ONLINE",
      });
    });
  }, [user]);

  // Online state and status line of my friends (Firestore "in" takes 30 at a time).
  const friendsKey = fr.friends.join("|");
  useEffect(() => {
    if (fr.friends.length === 0) return;
    const chunks: string[][] = [];
    for (let i = 0; i < fr.friends.length; i += 30) chunks.push(fr.friends.slice(i, i + 30));
    Promise.all(chunks.map((c) => getDocs(query(collection(db, "users"), where("username", "in", c)))))
      .then((snaps) => {
        const next: Record<string, FriendInfo> = {};
        snaps.forEach((s) =>
          s.docs.forEach((d) => {
            const ps = String(d.get("presenceStatus") || "OFFLINE").toUpperCase();
            next[String(d.get("username")).toLowerCase()] = {
              online: ps === "ONLINE",
              status: ps === "AWAY" ? "away" : ps === "BUSY" ? "busy" : String(d.get("statusMessage") || "").trim(),
            };
          })
        );
        setFriendInfo(next);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [friendsKey]);

  const friends = useMemo(() => {
    const q = search.trim().toLowerCase();
    return fr.friends
      .filter((f) => !q || f.toLowerCase().includes(q))
      .map((f) => ({ name: f, ...(friendInfo[f.toLowerCase()] || { online: false, status: "" }) }))
      .sort((a, b) => Number(b.online) - Number(a.online) || a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
  }, [fr.friends, friendInfo, search]);

  const unreadChats = Object.entries(unread).sort((a, b) => b[1] - a[1]);

  const saveStatus = async () => {
    if (!user) return;
    const text = statusDraft.trim().slice(0, 300);
    await updateDoc(doc(db, "users", user.uid), { statusMessage: text, statusUpdatedAt: serverTimestamp() }).catch(() => {});
    setEditing(false);
  };

  const badge = me ? roleBadge(me.role) : null;
  const progress = me ? levelProgress(me.xp, me.level) : 0;

  return (
    <div className="mx-auto max-w-2xl space-y-4 px-3 py-4 sm:px-6">
      {/* Profile card */}
      <section className="rounded-3xl border border-white/15 bg-[#13245f]/80 p-4">
        <div className="flex items-center gap-3">
          <Link
            href="/profile/me"
            className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#2a4a9a] text-2xl font-black"
          >
            {me?.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={me.photoUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              username.slice(0, 1).toUpperCase()
            )}
          </Link>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Link href="/profile/me" data-notranslate className="truncate text-xl font-black">
                {username}
              </Link>
              {badge && <span className={`rounded-md px-2 py-0.5 text-[11px] font-black ${badge.cls}`}>{badge.label}</span>}
              <span className={`h-3.5 w-3.5 rounded-full border-2 border-white/40 ${me?.online ? "bg-emerald-400" : "bg-white/30"}`} />
              <Link
                href="/leaderboard"
                className="rounded-full border border-violet-400/60 bg-violet-500/20 px-2.5 py-0.5 text-sm font-black text-violet-200"
              >
                ⚡ {me?.level ?? "…"} ›
              </Link>
            </div>
            {editing ? (
              <div className="mt-1 flex gap-2">
                <input
                  autoFocus
                  value={statusDraft}
                  onChange={(e) => setStatusDraft(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && saveStatus()}
                  maxLength={300}
                  placeholder="What are you thinking?"
                  className="min-w-0 flex-1 rounded-lg border border-white/15 bg-black/30 px-2 py-1 text-sm outline-none focus:border-cyan-300/60"
                />
                <button type="button" onClick={saveStatus} className="rounded-lg bg-cyan-500 px-3 text-sm font-bold text-neutral-900">
                  ✓
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setStatusDraft(me?.statusMessage || "");
                  setEditing(true);
                }}
                className="mt-0.5 flex w-full items-center gap-2 text-left text-sm text-white/65"
              >
                <span data-notranslate className="min-w-0 flex-1 truncate">
                  {me?.statusMessage || "Set your status…"}
                </span>
                <span className="text-white/60">✎</span>
              </button>
            )}
          </div>
        </div>

        <div className="mt-3 h-2 overflow-hidden rounded-full bg-black/40" title={`${Math.round(progress * 100)}% to the next level`}>
          <div className="h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-500" style={{ width: `${progress * 100}%` }} />
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2">
          {(
            [
              ["/alerts", "🔔", "Alerts", badges.alerts],
              ["/messages", "✉️", "Messages", badges.messages],
              ["/friends", "👥", "Friends", badges.requests],
            ] as const
          ).map(([href, icon, label, n]) => (
            <Link
              key={href}
              href={href}
              className="flex items-center justify-center gap-1.5 rounded-2xl bg-[#1d2a5c] py-2.5 text-sm font-bold hover:bg-[#24346e]"
            >
              <span>{icon}</span>
              <span>{label}</span>
              {n > 0 && <span className="rounded-full bg-rose-500 px-1.5 text-[11px] leading-5">{badgeText(n)}</span>}
            </Link>
          ))}
        </div>
      </section>

      {/* Recent */}
      <Panel title="Recent" open={openRecent} onToggle={() => setOpenRecent((v) => !v)}>
        {unreadChats.length === 0 && recent.length === 0 ? (
          <p className="px-2 py-3 text-sm text-white/45">Nothing yet — open a room from 💬.</p>
        ) : (
          <ul className="space-y-2">
            {unreadChats.map(([name, n]) => (
              <li key={`c_${name}`}>
                <Link
                  href={chatHref(name)}
                  className="flex items-center gap-3 rounded-2xl border border-blue-300/30 bg-[#1f3a86]/70 px-3 py-2.5"
                >
                  <span className="text-lg">✉️</span>
                  <span data-notranslate className="min-w-0 flex-1 truncate font-bold">
                    {name}
                  </span>
                  <span className="rounded-full bg-violet-500 px-2 text-xs font-bold leading-6">{badgeText(n)}</span>
                </Link>
              </li>
            ))}
            {recent.slice(0, 5).map((room) => (
              <li key={`r_${room}`}>
                <Link
                  href={roomHref(room)}
                  className="flex items-center gap-3 rounded-2xl border border-blue-300/20 bg-[#1b3278]/60 px-3 py-2.5"
                >
                  <span className="text-lg">💬</span>
                  <span data-notranslate className="min-w-0 flex-1 truncate font-bold">
                    {room}
                  </span>
                  <span className="text-white/40">›</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {/* Friends */}
      <Panel title="Friends" open={openFriends} onToggle={() => setOpenFriends((v) => !v)}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search friends…"
          className="mb-2 w-full rounded-2xl border border-white/15 bg-[#0e1a47] px-4 py-3 text-sm outline-none placeholder:text-white/40 focus:border-cyan-300/50"
        />
        {fr.friends.length === 0 ? (
          <p className="px-2 py-3 text-sm text-white/45">
            No friends yet.{" "}
            <Link href="/friends" className="font-bold text-cyan-300">
              Find friends →
            </Link>
          </p>
        ) : (
          <ul data-notranslate>
            {friends.map((f) => (
              <li key={f.name}>
                <Link href={chatHref(f.name)} className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-white/5">
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${f.online ? "bg-rose-500" : "bg-white/30"}`} />
                  <span className={`shrink-0 font-bold ${f.online ? "text-white" : "text-white/70"}`}>{f.name}</span>
                  {f.status && <span className="min-w-0 flex-1 truncate text-sm text-white/45">{f.status}</span>}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
