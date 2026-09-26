"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { collection, doc, getDocs, onSnapshot, query, serverTimestamp, updateDoc, where } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useFriendRequests } from "../../lib/friends";
import { chatHref } from "../../lib/privateChat";
import { useSession } from "./AppSession";
import { InstallHint } from "./InstallHint";

// Signed-in home, like the app's Home tab: orange profile header, then
// Messages / migAlerts rows, friends split into Online and Offline, Invite Friends.

type Me = { photoUrl: string; level: number; role: string; statusMessage: string; online: boolean };
type Friend = {
  name: string;
  photo: string;
  online: boolean;
  gender: string;
  level: number;
  country: string;
  status: string;
};

function photoOf(d: Record<string, unknown>): string {
  for (const k of ["photoUrl", "profilePic", "avatarUrl", "imageUrl"]) {
    const v = String(d[k] || "").trim();
    if (v) return v;
  }
  return "";
}

function roleLabel(role: string): string {
  const r = role.trim().toLowerCase();
  if (r === "merchant") return "Merchant";
  if (r === "mentor") return "Mentor";
  if (r === "staff") return "Staff";
  if (r === "admin" || r === "superadmin") return "Admin";
  if (r === "elite" || r === "elite_user") return "Elite";
  return "User";
}

function Avatar({ name, photo, size = "h-11 w-11" }: { name: string; photo: string; size?: string }) {
  return (
    <span className={`flex ${size} shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#DCEBFB] font-black text-[#174EA6]`}>
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photo} alt="" className="h-full w-full object-cover" />
      ) : (
        name.slice(0, 1).toUpperCase()
      )}
    </span>
  );
}

export function Dashboard() {
  const { user, username, badges } = useSession();
  const [me, setMe] = useState<Me | null>(null);
  const [editing, setEditing] = useState(false);
  const [statusDraft, setStatusDraft] = useState("");
  const [openOnline, setOpenOnline] = useState(true);
  const [openOffline, setOpenOffline] = useState(true);
  const [info, setInfo] = useState<Record<string, Friend>>({});

  const fr = useFriendRequests(username);

  useEffect(() => {
    if (!user) return;
    return onSnapshot(doc(db, "users", user.uid), (snap) => {
      const d = snap.data() || {};
      setMe({
        photoUrl: photoOf(d),
        level: Number(d.level || 1),
        role: String(d.role || d.membershipRole || ""),
        statusMessage: String(d.statusMessage || "").trim(),
        online: String(d.presenceStatus || "ONLINE").toUpperCase() === "ONLINE",
      });
    });
  }, [user]);

  // Photo, level, country and online state of my friends ("in" takes 30 at a time).
  const friendsKey = fr.friends.join("|");
  useEffect(() => {
    if (fr.friends.length === 0) return;
    const chunks: string[][] = [];
    for (let i = 0; i < fr.friends.length; i += 30) chunks.push(fr.friends.slice(i, i + 30));
    Promise.all(chunks.map((c) => getDocs(query(collection(db, "users"), where("username", "in", c)))))
      .then((snaps) => {
        const next: Record<string, Friend> = {};
        snaps.forEach((s) =>
          s.docs.forEach((d) => {
            const x = d.data();
            const name = String(x.username || "");
            next[name.toLowerCase()] = {
              name,
              photo: photoOf(x),
              online: String(x.presenceStatus || "OFFLINE").toUpperCase() === "ONLINE",
              gender: String(x.gender || ""),
              level: Number(x.level || 1),
              country: String(x.country || ""),
              status: String(x.statusMessage || "").trim(),
            };
          })
        );
        setInfo(next);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [friendsKey]);

  const friends = useMemo(
    () =>
      fr.friends
        .map(
          (f) =>
            info[f.toLowerCase()] || { name: f, photo: "", online: false, gender: "", level: 1, country: "", status: "" }
        )
        .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase())),
    [fr.friends, info]
  );
  const online = friends.filter((f) => f.online);
  const offline = friends.filter((f) => !f.online);

  const saveStatus = async () => {
    if (!user) return;
    const text = statusDraft.trim().slice(0, 300);
    await updateDoc(doc(db, "users", user.uid), { statusMessage: text, statusUpdatedAt: serverTimestamp() }).catch(() => {});
    setEditing(false);
  };

  const invite = async () => {
    const url = window.location.origin;
    try {
      if (navigator.share) await navigator.share({ title: "MIGwith", text: "Join me on MIGwith!", url });
      else {
        await navigator.clipboard.writeText(url);
        alert("Link copied: " + url);
      }
    } catch {
      // share sheet closed
    }
  };

  const FriendRow = ({ f }: { f: Friend }) => (
    <Link href={chatHref(f.name)} className="flex items-center gap-3 border-b border-[#E3ECF7] bg-white px-4 py-2.5 hover:bg-[#F4F9FF]">
      <span className="relative">
        <Avatar name={f.name} photo={f.photo} />
        {f.online && <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white bg-emerald-500" />}
      </span>
      <span data-notranslate className="min-w-0 flex-1">
        <span className="block truncate font-semibold text-[#0B2A5B]">{f.name}</span>
        <span className="block truncate text-xs text-[#5B6B8C]">
          {f.status || [f.gender, `Level: ${f.level}`, f.country].filter(Boolean).join(", ")}
        </span>
      </span>
    </Link>
  );

  const Section = ({
    title,
    list,
    open,
    toggle,
  }: {
    title: string;
    list: Friend[];
    open: boolean;
    toggle: () => void;
  }) => (
    <>
      <button
        type="button"
        onClick={toggle}
        className="flex w-full items-center justify-between border-b border-[#E3ECF7] bg-[#F3F8FE] px-4 py-2 text-sm font-semibold text-[#35507E]"
      >
        <span>
          {title} ({list.length})
        </span>
        <span className={`transition ${open ? "" : "rotate-180"}`}>▴</span>
      </button>
      {open && list.map((f) => <FriendRow key={f.name} f={f} />)}
    </>
  );

  return (
    <div className="mx-auto max-w-2xl pb-8">
      {/* Orange profile header */}
      <section className="bg-gradient-to-r from-[#F7931E] to-[#F58220] px-4 py-3 text-white shadow">
        <div className="flex items-center gap-3">
          <Link href="/profile/me" className="shrink-0 rounded-lg bg-white p-0.5">
            <span className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-md bg-white text-2xl font-black text-[#0B2A5B]">
              {me?.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={me.photoUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                username.slice(0, 1).toUpperCase()
              )}
            </span>
          </Link>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <Link href="/profile/me" data-notranslate className="truncate text-lg font-black">
                {username}
              </Link>
              <span className="rounded-full border border-white/70 bg-white/25 px-2 text-[11px] font-bold">
                {roleLabel(me?.role || "")}
              </span>
              <span className={`h-3.5 w-3.5 rounded-full border-2 border-white ${me?.online === false ? "bg-gray-300" : "bg-emerald-400"}`} />
              <Link href="/messages" aria-label="Messages" className="text-base">
                💬
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
                  className="min-w-0 flex-1 rounded-lg bg-white px-2 py-1 text-sm text-[#0B2A5B] outline-none"
                />
                <button type="button" onClick={saveStatus} className="rounded-lg bg-white/90 px-3 text-sm font-bold text-[#F58220]">
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
                data-notranslate
                className="mt-0.5 block w-full truncate text-left text-sm text-white/90"
              >
                {me?.statusMessage || "What are you thinking?"}
              </button>
            )}
          </div>
          <Link href="/leaderboard" className="shrink-0 text-sm font-black">
            🏅 {me?.level ?? "…"}
          </Link>
        </div>
      </section>

      <InstallHint />

      {/* Rows */}
      <div className="bg-white shadow-sm">
        <Link href="/messages" className="flex items-center gap-3 border-b border-[#E3ECF7] px-4 py-3 text-[#0B2A5B] hover:bg-[#F4F9FF]">
          <span className="text-lg text-[#174EA6]">✉️</span>
          <span className="font-semibold">Messages ({badges.messages})</span>
        </Link>
        <Link href="/alerts" className="flex items-center gap-3 border-b border-[#E3ECF7] px-4 py-3 hover:bg-[#F4F9FF]">
          <span className="flex h-5 w-5 items-center justify-center rounded bg-[#F58220] text-xs font-black text-white">!</span>
          <span className="font-semibold text-[#F58220]">migAlerts ({badges.alerts})</span>
        </Link>

        {friends.length === 0 ? (
          <p className="border-b border-[#E3ECF7] px-4 py-3 text-sm text-[#5B6B8C]">No friends yet. Add friends to see them here.</p>
        ) : (
          <div data-notranslate>
            <Section title="Online" list={online} open={openOnline} toggle={() => setOpenOnline((v) => !v)} />
            <Section title="Offline" list={offline} open={openOffline} toggle={() => setOpenOffline((v) => !v)} />
          </div>
        )}

        <Link href="/friends" className="flex items-center gap-3 border-b border-[#E3ECF7] bg-[#EAF4FE] px-4 py-3 text-[#0B2A5B] hover:bg-[#DCEBFB]">
          <span className="w-5 text-center text-lg text-[#5B6B8C]">+</span>
          <span className="font-semibold">Find Friends</span>
          {badges.requests > 0 && (
            <span className="ml-auto rounded-full bg-rose-500 px-2 text-xs font-bold leading-5 text-white">{badges.requests}</span>
          )}
        </Link>
        <button type="button" onClick={invite} className="flex w-full items-center gap-3 px-4 py-3 text-left text-[#0B2A5B] hover:bg-[#F4F9FF]">
          <span className="flex h-5 w-5 items-center justify-center rounded bg-[#2F80ED] text-xs font-black text-white">i</span>
          <span className="font-semibold">Invite Friends</span>
        </button>
      </div>
    </div>
  );
}
