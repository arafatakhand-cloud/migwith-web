"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  updateDoc,
  where,
  type DocumentData,
} from "firebase/firestore";
import { db } from "../../../lib/firebase";
import { useCurrentUser } from "../../../lib/useCurrentUser";
import { chatHref } from "../../../lib/privateChat";
import { useFriendRequests } from "../../../lib/friends";
import { PageShell } from "../../_components/PageShell";

// Same profile as the app's ProfilePage (MainActivity.kt): the users/{uid}
// document found by username, plus friends / followers / footprints counted by
// queries. Follow, block and footprints only ever write the viewer's OWN doc.

type Profile = {
  uid: string;
  fullName: string;
  photoUrl: string;
  coverPhotoUrl: string;
  level: number;
  role: string;
  bio: string;
  country: string;
  relationship: string;
  gender: string;
  age: number;
  memberSince: string;
  online: boolean;
  gifts: number;
  votes: number;
  following: number;
};

type GiftEntry = { sent: boolean; other: string; giftName: string; at: number };

function profileImageUrl(d: DocumentData): string {
  for (const key of ["photoUrl", "profilePic", "avatarUrl", "imageUrl"]) {
    const v = String(d[key] || "").trim();
    if (v) return v;
  }
  return "";
}

function toMs(v: any): number {
  if (!v) return 0;
  if (typeof v.toMillis === "function") return v.toMillis();
  if (typeof v === "number") return v;
  return 0;
}

function ageFrom(dob: string): number {
  const [y, m, d] = dob.trim().split("-").map(Number);
  if (!y || !m || !d) return -1;
  const now = new Date();
  let years = now.getFullYear() - y;
  const month = now.getMonth() + 1;
  if (month < m || (month === m && now.getDate() < d)) years--;
  return years >= 1 && years <= 120 ? years : -1;
}

function roleInfo(raw: string): { label: string; color: string } | null {
  const key = raw.trim().toLowerCase().replace(/[- ]/g, "_");
  if (["owner", "ceo", "executive", "executive_board"].includes(key)) return { label: "Owner", color: "#D4AF37" };
  if (["admin", "administrator", "superadmin"].includes(key)) return { label: "Admin", color: "#CBA400" };
  if (key === "staff") return { label: "Staff", color: "#1E9E4F" };
  if (key === "mentor") return { label: "Mentor", color: "#E0303F" };
  if (key === "merchant") return { label: "Merchant", color: "#9C27B0" };
  if (key === "elite" || key === "elite_user") return { label: "Elite", color: "#0097A7" };
  return null;
}

const sameName = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export default function ProfilePage() {
  const params = useParams<{ username: string }>();
  const { user, username: me, loading } = useCurrentUser();
  const raw = decodeURIComponent(params.username);
  // "/profile/me" opens your own profile.
  const username = raw === "me" ? me : raw;
  const isOwn = !!me && sameName(username, me);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [friends, setFriends] = useState(0);
  const [followers, setFollowers] = useState(0);
  const [footprints, setFootprints] = useState(0);
  const [mentorTagged, setMentorTagged] = useState(false);
  const [gifts, setGifts] = useState<GiftEntry[]>([]);
  const [isFollowing, setIsFollowing] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const fr = useFriendRequests(me);
  const relation = fr.relationTo(username);

  const friendAction = async () => {
    setBusy("friend");
    setError("");
    try {
      if (relation === "none") await fr.send(username);
      else if (relation === "incoming") {
        const r = fr.incoming.find((x) => sameName(x.from, username));
        if (r) {
          await fr.accept(r);
          setFriends((c) => c + 1);
        }
      } else if (relation === "sent") {
        const r = fr.sent.find((x) => sameName(x.to, username));
        if (r) await fr.cancel(r);
      } else if (relation === "friend" && confirm(`Remove ${username} from your friends?`)) {
        await fr.remove(username);
        setFriends((c) => Math.max(0, c - 1));
      }
    } catch (err: any) {
      setError(err?.message || "Something went wrong. Please try again.");
    } finally {
      setBusy("");
    }
  };

  // The profile document.
  useEffect(() => {
    if (!user || !username) return;
    setProfile(null);
    setNotFound(false);
    getDocs(query(collection(db, "users"), where("username", "==", username), limit(1)))
      .then((snap) => {
        const d = snap.docs[0];
        if (!d) {
          setNotFound(true);
          return;
        }
        const x = d.data();
        const created = toMs(x.createdAt);
        setProfile({
          uid: d.id,
          fullName: String(x.fullName || "").trim(),
          photoUrl: profileImageUrl(x),
          coverPhotoUrl: String(x.coverPhotoUrl || "").trim(),
          level: Number(x.level || 1),
          role: String(x.membershipRole || x.memberType || x.role || ""),
          bio: String(x.bio || "").trim(),
          country: String(x.country || "").trim(),
          relationship: String(x.relationship || "").trim(),
          gender: String(x.gender || "").trim(),
          age: ageFrom(String(x.dateOfBirth || "")),
          memberSince: created
            ? new Date(created).toLocaleDateString(undefined, { month: "long", year: "numeric" })
            : "",
          online: String(x.presenceStatus || "ONLINE").toUpperCase() === "ONLINE",
          gifts: Array.isArray(x.unlockedGifts)
            ? x.unlockedGifts.reduce((s: number, g: any) => s + Number(g?.quantity || 0), 0)
            : 0,
          votes: Number(x.voteCount || 0),
          following: Array.isArray(x.following) ? x.following.length : 0,
        });
      })
      .catch((err) => {
        console.error(err);
        setError("Could not load this profile.");
      });
  }, [user, username]);

  // Counts and gift history.
  useEffect(() => {
    if (!user || !username) return;
    const users = collection(db, "users");
    getDocs(query(users, where("following", "array-contains", username)))
      .then((s) => setFollowers(s.size))
      .catch(() => {});
    getDocs(query(users, where("visitedProfiles", "array-contains", username)))
      .then((s) => setFootprints(s.size))
      .catch(() => {});

    const fr = collection(db, "friend_requests");
    Promise.all([
      getDocs(query(fr, where("fromUsername", "==", username), where("status", "==", "accepted"))),
      getDocs(query(fr, where("toUsername", "==", username), where("status", "==", "accepted"))),
    ])
      .then(([out, inc]) => {
        const names = new Set([
          ...out.docs.map((d) => String(d.get("toUsername") || "")),
          ...inc.docs.map((d) => String(d.get("fromUsername") || "")),
        ]);
        names.delete("");
        setFriends(names.size);
      })
      .catch(() => {});

    getDocs(
      query(
        collection(db, "mentor_tagged"),
        where("taggedUsername", "==", username),
        where("status", "==", "active"),
        limit(10)
      )
    )
      .then((s) => {
        const now = Date.now();
        setMentorTagged(s.docs.some((d) => toMs(d.get("expiresAt")) <= 0 || toMs(d.get("expiresAt")) > now));
      })
      .catch(() => {});

    const ga = collection(db, "gift_activity");
    Promise.all([
      getDocs(query(ga, where("fromUsername", "==", username), limit(10))),
      getDocs(query(ga, where("toUsername", "==", username), limit(10))),
    ])
      .then(([sent, got]) => {
        const list: GiftEntry[] = [
          ...sent.docs.map((d) => ({
            sent: true,
            other: String(d.get("toUsername") || ""),
            giftName: String(d.get("giftName") || ""),
            at: toMs(d.get("createdAt")),
          })),
          ...got.docs.map((d) => ({
            sent: false,
            other: String(d.get("fromUsername") || ""),
            giftName: String(d.get("giftName") || ""),
            at: toMs(d.get("createdAt")),
          })),
        ].filter((g) => g.other && g.giftName);
        setGifts(list.sort((a, b) => b.at - a.at).slice(0, 6));
      })
      .catch(() => {});
  }, [user, username]);

  // My follow / block state for this person, and leave a footprint.
  useEffect(() => {
    if (!user || !username || !me || isOwn) return;
    const ref = doc(db, "users", user.uid);
    getDoc(ref)
      .then((snap) => {
        const list = (k: string) => ((snap.get(k) as unknown[]) || []).filter((v): v is string => typeof v === "string");
        setIsFollowing(list("following").some((n) => sameName(n, username)));
        setIsBlocked(list("blockedUsers").some((n) => sameName(n, username)));
        const visited = list("visitedProfiles");
        if (!visited.some((n) => sameName(n, username))) {
          updateDoc(ref, { visitedProfiles: [...visited, username] }).catch(() => {});
        }
      })
      .catch(() => {});
  }, [user, username, me, isOwn]);

  // Edit one of MY lists (following / blockedUsers): add or remove this username.
  const toggleMine = async (field: "following" | "blockedUsers", on: boolean) => {
    if (!user) return;
    setBusy(field);
    setError("");
    try {
      const ref = doc(db, "users", user.uid);
      const snap = await getDoc(ref);
      const current = ((snap.get(field) as unknown[]) || []).filter((v): v is string => typeof v === "string");
      const next = on
        ? Array.from(new Set([...current, username]))
        : current.filter((n) => !sameName(n, username));
      await updateDoc(ref, { [field]: next });
      if (field === "following") {
        setIsFollowing(on);
        setFollowers((c) => Math.max(0, c + (on ? 1 : -1)));
      } else {
        setIsBlocked(on);
      }
    } catch (err) {
      console.error(err);
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy("");
    }
  };

  if (!loading && !user) {
    return (
      <PageShell>
        <div className="mx-auto max-w-md px-6 py-20 text-center">
          <p className="text-white/70">Please log in to see profiles.</p>
          <Link href="/login" className="mt-4 inline-block rounded-xl bg-blue-600 px-6 py-3 font-bold">
            Login
          </Link>
        </div>
      </PageShell>
    );
  }

  if (notFound) {
    return (
      <PageShell>
        <p className="py-20 text-center text-white/60">No user named “{username}”.</p>
      </PageShell>
    );
  }

  if (!profile) {
    return (
      <PageShell>
        <p className="py-20 text-center text-white/40">{error || "Loading…"}</p>
      </PageShell>
    );
  }

  const role = roleInfo(profile.role);
  // "Owner" is shown only on your own profile, same as the app.
  const shownRole = role && !(role.label === "Owner" && !isOwn) ? role : null;
  const genderIcon = sameName(profile.gender, "Female") ? "♀" : sameName(profile.gender, "Male") ? "♂" : "⚥";

  const info: [string, string][] = [];
  if (shownRole) info.push(["🎖", shownRole.label]);
  info.push(["⭐", `Level ${profile.level}`]);
  if (profile.gender) info.push([genderIcon, profile.gender]);
  if (profile.age > 0) info.push(["🎂", `${profile.age} years old`]);
  if (profile.relationship) info.push(["💍", profile.relationship]);
  if (profile.country) info.push(["📍", profile.country]);
  if (profile.fullName && !sameName(profile.fullName, username)) info.push(["👤", profile.fullName]);
  if (profile.memberSince) info.push(["🗓", `Member since ${profile.memberSince}`]);
  if (mentorTagged) info.push(["🎓", "Tagged"]);

  return (
    <PageShell>
      <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6">
        {/* Cover with the round photo over its bottom edge */}
        <div className="relative">
          <div className="flex aspect-[3.2] items-center justify-center overflow-hidden rounded-3xl bg-gradient-to-b from-blue-600 to-[#0F2C55]">
            {profile.coverPhotoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profile.coverPhotoUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="text-2xl font-black tracking-wide">MIG WITH</span>
            )}
          </div>
          <div className="absolute -bottom-10 left-3 h-20 w-20 overflow-hidden rounded-full border-4 border-[#050b1c] bg-gradient-to-br from-blue-500 to-cyan-400 sm:h-24 sm:w-24">
            {profile.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profile.photoUrl} alt={username} className="h-full w-full object-cover" />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-3xl font-black">
                {username.slice(0, 1).toUpperCase()}
              </span>
            )}
          </div>
        </div>

        {/* Name, role, level, online */}
        <div className="ml-[100px] mt-2 min-h-[48px] sm:ml-[116px]">
          <div className="flex flex-wrap items-center gap-1.5">
            <h1 className="truncate text-xl font-black sm:text-2xl">{username}</h1>
            {shownRole && (
              <span
                className="rounded-lg px-2 py-0.5 text-xs font-bold"
                style={{ backgroundColor: shownRole.color }}
              >
                {shownRole.label}
              </span>
            )}
            <span className="rounded-lg bg-gradient-to-r from-amber-200 to-amber-500 px-2 py-0.5 text-xs font-black text-neutral-900">
              Lv {profile.level}
            </span>
          </div>
          <p className={`mt-0.5 flex items-center gap-1.5 text-sm ${profile.online ? "text-emerald-300" : "text-white/40"}`}>
            <span className={`h-2 w-2 rounded-full ${profile.online ? "bg-emerald-400" : "bg-white/30"}`} />
            {profile.online ? "Online" : "Offline"}
          </p>
        </div>

        <div className="mt-3 px-1">
          <p className="text-sm text-white/50">@{username} · MIG WITH member</p>
          {profile.bio && <p className="mt-2 whitespace-pre-wrap text-white/85">{profile.bio}</p>}
        </div>

        {/* Details */}
        <ul className="mt-4 divide-y divide-white/5 rounded-2xl border border-white/10 bg-white/[0.04] px-3">
          {info.map(([icon, text]) => (
            <li key={icon + text} className="flex items-center gap-3 py-2.5 text-sm">
              <span className="w-7 text-center text-lg">{icon}</span>
              <span className="text-white/85">{text}</span>
            </li>
          ))}
        </ul>

        {/* Stats */}
        <div className="mt-4 grid grid-cols-4 gap-2">
          {[
            ["👥", friends, "Friends"],
            ["🎁", profile.gifts, "Gifts"],
            ["❤️", profile.votes, "Votes"],
            ["👣", footprints, "Footprints"],
          ].map(([icon, value, label]) => (
            <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.04] py-3 text-center">
              <div className="text-lg">{icon}</div>
              <div className="font-black">{Number(value).toLocaleString()}</div>
              <div className="text-[11px] text-white/45">{label}</div>
            </div>
          ))}
        </div>
        <p className="mt-2 text-center text-xs text-white/40">
          {followers.toLocaleString()} followers · {profile.following.toLocaleString()} following
        </p>

        {/* Actions */}
        <div className="mt-4 space-y-2.5">
          {isOwn ? (
            <Link
              href="/profile/edit"
              className="block w-full rounded-2xl bg-[#17395C] py-3 text-center font-bold transition hover:bg-[#1d4570]"
            >
              ✎ Edit Profile
            </Link>
          ) : (
            <>
              <div className="flex gap-2.5">
                <button
                  type="button"
                  onClick={() => toggleMine("following", !isFollowing)}
                  disabled={!!busy}
                  className={`flex-1 rounded-2xl py-3 font-bold transition disabled:opacity-50 ${
                    isFollowing ? "bg-[#2A3F63]" : "bg-blue-600 hover:bg-blue-500"
                  }`}
                >
                  {busy === "following" ? "Working…" : isFollowing ? "✓ Following" : "➕ Follow"}
                </button>
                <Link
                  href={chatHref(username)}
                  className="flex-1 rounded-2xl border border-cyan-300/30 bg-cyan-300/10 py-3 text-center font-bold text-cyan-200 transition hover:bg-cyan-300/20"
                >
                  ✉️ Message
                </Link>
              </div>
              <button
                type="button"
                onClick={friendAction}
                disabled={!!busy}
                className={`w-full rounded-2xl py-3 font-bold transition disabled:opacity-50 ${
                  relation === "friend"
                    ? "border border-emerald-400/40 bg-emerald-500/10 text-emerald-300"
                    : relation === "sent"
                      ? "border border-white/15 bg-white/5 text-white/60"
                      : relation === "incoming"
                        ? "bg-emerald-600 hover:bg-emerald-500"
                        : "bg-violet-600 hover:bg-violet-500"
                }`}
              >
                {busy === "friend"
                  ? "Working…"
                  : relation === "friend"
                    ? "✓ Friends · Remove"
                    : relation === "sent"
                      ? "⏳ Request sent · Cancel"
                      : relation === "incoming"
                        ? "🤝 Accept friend request"
                        : "🤝 Add Friend"}
              </button>
              <button
                type="button"
                onClick={() => toggleMine("blockedUsers", !isBlocked)}
                disabled={!!busy}
                className={`w-full rounded-2xl border-2 py-2.5 font-bold transition disabled:opacity-50 ${
                  isBlocked ? "border-white/20 text-white/50" : "border-red-500/70 text-red-400 hover:bg-red-500/10"
                }`}
              >
                {busy === "blockedUsers" ? "Working…" : isBlocked ? `✓ Unblock ${username}` : `🚫 Block ${username}`}
              </button>
            </>
          )}
          {error && <p className="text-center text-sm text-red-300">{error}</p>}
        </div>

        {/* Gift history */}
        <h2 className="mt-6 px-1 text-sm font-bold tracking-widest text-white/60">GIFT HISTORY</h2>
        <ul className="mt-2 space-y-1 rounded-2xl border border-white/10 bg-white/[0.04] p-2">
          {gifts.length === 0 ? (
            <li className="px-2 py-2 text-sm text-white/40">🎁 No gifts sent or received yet</li>
          ) : (
            gifts.map((g, i) => (
              <li key={i} className="flex items-center gap-2 rounded-xl px-2 py-2 text-sm">
                <span>{g.sent ? "🎁" : "🎉"}</span>
                <span className="text-white/85">
                  {g.sent ? "Sent" : "Received"} {g.giftName} {g.sent ? "to" : "from"}{" "}
                  <Link href={`/profile/${encodeURIComponent(g.other)}`} className="font-semibold text-cyan-300">
                    {g.other}
                  </Link>
                </span>
                {g.at > 0 && (
                  <span className="ml-auto shrink-0 text-xs text-white/35">
                    {new Date(g.at).toLocaleString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </span>
                )}
              </li>
            ))
          )}
        </ul>
      </div>
    </PageShell>
  );
}
