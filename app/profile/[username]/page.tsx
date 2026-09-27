"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  arrayRemove,
  arrayUnion,
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
import { latestGifts } from "../../../lib/giftActivity";
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
  const router = useRouter();
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
  // Days left on an active mentor tag (0 = no end date), or null when not tagged.
  const [taggedDays, setTaggedDays] = useState<number | null>(null);
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
        const active = s.docs.map((d) => toMs(d.get("expiresAt"))).filter((ms) => ms <= 0 || ms > now);
        if (active.length === 0) return setTaggedDays(null);
        const ends = Math.max(...active);
        setTaggedDays(active.some((ms) => ms <= 0) ? 0 : Math.ceil((ends - now) / 86_400_000));
      })
      .catch(() => {});

    Promise.all([latestGifts("fromUsername", username, 10), latestGifts("toUsername", username, 10)])
      .then(([sent, got]) => {
        const list: GiftEntry[] = [
          ...sent.map((d) => ({
            sent: true,
            other: String(d.get("toUsername") || ""),
            giftName: String(d.get("giftName") || ""),
            at: toMs(d.get("createdAt")),
          })),
          ...got.map((d) => ({
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
          updateDoc(ref, { visitedProfiles: arrayUnion(username) }).catch(() => {});
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
      // arrayUnion / arrayRemove change only this name, so an edit made at the
      // same time elsewhere (another tab, the app) is not overwritten.
      const matches = current.filter((n) => sameName(n, username));
      if (on) {
        if (matches.length === 0) await updateDoc(ref, { [field]: arrayUnion(username) });
      } else if (matches.length > 0) {
        await updateDoc(ref, { [field]: arrayRemove(...matches) });
      }
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
      <PageShell light>
        <div className="mx-auto max-w-md px-6 py-20 text-center">
          <p className="text-[#35507E]">Please log in to see profiles.</p>
          <Link href="/login" className="mt-4 inline-block rounded-xl bg-[#2F80ED] px-6 py-3 font-bold text-white">
            Login
          </Link>
        </div>
      </PageShell>
    );
  }

  if (notFound) {
    return (
      <PageShell light>
        <p className="py-20 text-center text-[#35507E]">No user named “{username}”.</p>
      </PageShell>
    );
  }

  if (!profile) {
    return (
      <PageShell light>
        <p className="py-20 text-center text-[#5B6B8C]">{error || "Loading…"}</p>
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
  if (taggedDays !== null) info.push(["🎓", taggedDays > 0 ? `Tagged · ${taggedDays}d left` : "Tagged"]);

  return (
    <PageShell light>
      <div className="mx-auto max-w-2xl px-4 py-5 sm:px-6">
        {/* Cover with the round photo over its bottom edge */}
        <div className="relative">
          <div className="flex aspect-[3.2] items-center justify-center overflow-hidden rounded-3xl bg-gradient-to-b from-[#174EA6] to-[#0B2A5B] text-white shadow-md">
            {profile.coverPhotoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profile.coverPhotoUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="text-2xl font-black tracking-wide">MIG LIFE</span>
            )}
          </div>
          <button
            type="button"
            onClick={() => (window.history.length > 1 ? router.back() : router.push("/"))}
            aria-label="Back"
            className="absolute left-3 top-3 flex h-10 w-10 items-center justify-center rounded-full border-2 border-white/80 bg-black/20 text-lg text-white"
          >
            ←
          </button>
          <div className="absolute -bottom-10 left-3 h-20 w-20 overflow-hidden rounded-full border-4 border-[#CFE6F9] bg-[#1E3A6B] text-white shadow-md sm:h-24 sm:w-24">
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
            <h1 data-notranslate className="truncate text-xl font-black text-[#0B2A5B] sm:text-2xl">{username}</h1>
            {shownRole && (
              <span
                className="rounded-lg px-2 py-0.5 text-xs font-bold text-white"
                style={{ backgroundColor: shownRole.color }}
              >
                {shownRole.label}
              </span>
            )}
            <span className="rounded-lg bg-gradient-to-r from-amber-200 to-amber-500 px-2 py-0.5 text-xs font-black text-neutral-900">
              Lv {profile.level}
            </span>
          </div>
          <p className={`mt-0.5 flex items-center gap-1.5 text-sm ${profile.online ? "text-emerald-600" : "text-[#6B7A99]"}`}>
            <span className={`h-2 w-2 rounded-full ${profile.online ? "bg-emerald-500" : "bg-[#B5C2D6]"}`} />
            {profile.online ? "Online" : "Offline"}
          </p>
        </div>

        <div className="mt-3 px-1">
          <p className="text-sm text-[#35507E]">@{username} · MIG LIFE member</p>
          {profile.bio && <p data-notranslate className="mt-2 whitespace-pre-wrap text-[#0B2A5B]">{profile.bio}</p>}
        </div>

        {/* Details */}
        <ul className="mt-4 border-y border-[#A9CBEB] px-1">
          {info.map(([icon, text]) => (
            <li key={icon + text} className="flex items-center gap-3 py-2.5 text-sm">
              <span className="w-7 text-center text-lg">{icon}</span>
              <span className="text-[#0B2A5B]">{text}</span>
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
            <div key={label} className="rounded-2xl bg-white py-3 text-center text-[#0B2A5B] shadow-sm">
              <div className="text-lg">{icon}</div>
              <div className="font-black">{Number(value).toLocaleString()}</div>
              <div className="text-[11px] text-[#35507E]">{label}</div>
            </div>
          ))}
        </div>
        <p className="mt-2 text-center text-xs text-[#35507E]">
          {followers.toLocaleString()} followers · {profile.following.toLocaleString()} following
        </p>

        {/* Actions */}
        <div className="mt-4 space-y-2.5">
          {isOwn ? (
            <Link
              href="/profile/edit"
              className="block w-full rounded-2xl bg-[#0B2A5B] py-3 text-center font-bold text-white shadow transition hover:bg-[#123A78]"
            >
              ✎ Edit Profile
            </Link>
          ) : null}
          {isOwn ? (
            <Link
              href="/wallet"
              className="block w-full rounded-2xl border border-[#F5D77A] bg-[#FFF3D6] py-3 text-center font-bold text-[#8A5A00] transition hover:bg-[#FFEBB8]"
            >
              💰 My Account · Coins
            </Link>
          ) : null}
          {isOwn ? (
            <Link
              href="/security"
              className="block w-full rounded-2xl border border-[#BFD7F2] bg-white py-3 text-center font-bold text-[#0B2A5B] transition hover:bg-[#F4F9FF]"
            >
              🔐 Security PIN
            </Link>
          ) : (
            <>
              <div className="flex gap-2.5">
                <button
                  type="button"
                  onClick={() => toggleMine("following", !isFollowing)}
                  disabled={!!busy}
                  className={`flex-1 rounded-2xl py-3 font-bold transition disabled:opacity-50 ${
                    isFollowing ? "bg-[#0B2A5B] text-white" : "bg-[#2F80ED] text-white hover:bg-[#1F6FDC]"
                  }`}
                >
                  {busy === "following" ? "Working…" : isFollowing ? "✓ Following" : "➕ Follow"}
                </button>
                <Link
                  href={chatHref(username)}
                  className="flex-1 rounded-2xl border border-[#BFD7F2] bg-white py-3 text-center font-bold text-[#174EA6] transition hover:bg-[#F4F9FF]"
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
                    ? "border border-emerald-400 bg-emerald-50 text-emerald-700"
                    : relation === "sent"
                      ? "border border-[#D5E3F5] bg-white text-[#5B6B8C]"
                      : relation === "incoming"
                        ? "bg-emerald-500 text-white hover:bg-emerald-600"
                        : "bg-[#7B3FC7] text-white hover:bg-[#6A32B0]"
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
                  isBlocked ? "border-[#D5E3F5] bg-white text-[#5B6B8C]" : "border-rose-400 bg-white text-rose-600 hover:bg-rose-50"
                }`}
              >
                {busy === "blockedUsers" ? "Working…" : isBlocked ? `✓ Unblock ${username}` : `🚫 Block ${username}`}
              </button>
            </>
          )}
          {error && <p className="text-center text-sm text-rose-600">{error}</p>}
        </div>

        {/* Gift history */}
        <h2 className="mt-6 px-1 text-sm font-bold tracking-widest text-[#0B2A5B]">GIFT HISTORY</h2>
        <ul className="mt-2 space-y-1.5">
          {gifts.length === 0 ? (
            <li className="rounded-2xl bg-white px-4 py-3 text-sm text-[#5B6B8C] shadow-sm">🎁 No gifts sent or received yet</li>
          ) : (
            gifts.map((g, i) => (
              <li key={i} className="flex items-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm shadow-sm">
                <span>{g.sent ? "🎁" : "🎉"}</span>
                <span className="text-[#0B2A5B]">
                  {g.sent ? "Sent" : "Received"} {g.giftName} {g.sent ? "to" : "from"}{" "}
                  <Link href={`/profile/${encodeURIComponent(g.other)}`} className="font-semibold text-[#2F80ED]">
                    {g.other}
                  </Link>
                </span>
                {g.at > 0 && (
                  <span className="ml-auto shrink-0 text-xs text-[#6B7A99]">
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
