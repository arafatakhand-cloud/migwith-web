"use client";

import { useEffect, useState } from "react";
import { SupporterJersey } from "../../_components/SupporterBadge";
import { activeSupporterTeam, supporterBackground, type SupporterTeam } from "../../../lib/supporterTeams";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  FieldPath,
  arrayRemove,
  arrayUnion,
  collection,
  deleteField,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  updateDoc,
  where,
  type DocumentData,
} from "firebase/firestore";
import { db } from "../../../lib/firebase";
import { useCurrentUser } from "../../../lib/useCurrentUser";
import { chatHref } from "../../../lib/privateChat";
import { useFriendRequests } from "../../../lib/friends";
import { latestGifts } from "../../../lib/giftActivity";
import { openReport } from "../../_components/ReportDialog";
import { PageShell } from "../../_components/PageShell";
import { ProfilePeopleList } from "../../_components/ProfilePeopleList";
import { BackButton } from "../../_components/BackButton";
import { useProfileAchievements } from "../../_components/Achievements";
import { badgeForLevel } from "../../../lib/rooms";
import { RainbowName } from "../../_components/RainbowName";
import { useSpecialColors } from "../../../lib/specialColor";
import { useIsClassic } from "../../../lib/uiStyle";

// Same profile as the app's ProfilePage (MainActivity.kt): the users/{uid}
// document found by username, plus friends / followers / footprints counted by
// queries. Follow, block, votes and footprints only ever write the viewer's OWN doc.

type Profile = {
  uid: string;
  /** ⚽ Supporter Colours team, while it lasts */
  supporter: SupporterTeam | null;
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
  joinedAtMs: number;
  /** Online / Away / Busy / Offline, like the app. */
  presence: "Online" | "Away" | "Busy" | "Offline";
  statusMessage: string;
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

function roleInfo(raw: string): { label: string; color: string; icon?: string } | null {
  const key = raw.trim().toLowerCase().replace(/[- ]/g, "_");
  if (["owner", "ceo", "executive", "executive_board"].includes(key)) return { label: "Owner", color: "#D4AF37" };
  if (["admin", "administrator", "superadmin"].includes(key)) return { label: "Admin", color: "#CBA400" };
  if (key === "staff") return { label: "Staff", color: "#1E9E4F" };
  if (key === "mentor") return { label: "Mentor", color: "#E0303F" };
  if (key === "merchant") return { label: "Merchant", color: "#9C27B0" };
  if (key === "elite" || key === "elite_user") return { label: "Elite", color: "#0097A7" };
  if (["country_representative", "countryrep", "country_rep"].includes(key)) return { label: "Country Representative", color: "#B58A70", icon: "🌍" };
  return null;
}

const sameName = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

// Online = active in the last 90 seconds and not Offline / Invisible (like the app).
function presenceLabel(raw: string, lastActiveMs: number): Profile["presence"] {
  const st = raw.trim().toUpperCase();
  if (Date.now() - lastActiveMs >= 90_000 || st === "OFFLINE" || st === "INVISIBLE") return "Offline";
  if (st === "BUSY") return "Busy";
  if (st === "AWAY") return "Away";
  return "Online";
}

const PRESENCE_DOT: Record<Profile["presence"], [string, string]> = {
  Online: ["#B6F25A", "#3E9E12"],
  Busy: ["#FF8A80", "#C62828"],
  Away: ["#FFD180", "#E08A00"],
  Offline: ["#D0D4DA", "#8A9099"],
};

// One rounded "bubble" tile in its own colour (the app's migTile): big round
// corners, glossy dome, a shine dot and an icon on top.
function Tile({ value, label, tint: tintIn, icon, onClick }: { value: string; label: string; tint: string; icon: string; onClick?: () => void }) {
  // 📟 Classic: every tile the same blue, square, no gloss.
  const classic = useIsClassic();
  const tint = classic ? "#2F6ABD" : tintIn;
  const style = {
    background: `linear-gradient(180deg, color-mix(in srgb, ${tint} 70%, white), ${tint}, color-mix(in srgb, ${tint} 65%, black))`,
    borderColor: `color-mix(in srgb, ${tint} 60%, black)`,
    boxShadow: classic ? "0 1px 2px rgba(0,0,0,.3)" : `0 4px 8px color-mix(in srgb, ${tint} 45%, transparent)`,
  };
  const inner = (
    <>
      {!classic && (
        <>
          <span className="pointer-events-none absolute inset-x-0.5 top-0.5 h-[48%] rounded-t-[20px] rounded-b-[40px] bg-gradient-to-b from-white/[0.34] to-white/[0.06]" />
          <span className="pointer-events-none absolute bottom-0 right-0 h-[34px] w-[34px] rounded-full bg-[radial-gradient(circle,rgba(255,255,255,.18),transparent_70%)]" />
          <span className="pointer-events-none absolute left-2.5 top-[7px] h-1.5 w-3.5 rounded-full bg-white/55" />
        </>
      )}
      <span className="relative block text-[15px] leading-[17px]">{icon}</span>
      <span className={`relative block text-[19px] font-extrabold leading-[21px] [text-shadow:0_2px_3px_rgba(0,0,0,.55)] ${classic ? "text-[#16315F]" : ""}`}>{value}</span>
      <span className={`relative block text-[13px] font-semibold [text-shadow:0_1.5px_2px_rgba(0,0,0,.5)] ${classic ? "text-[#16315F]" : ""}`}>{label}</span>
    </>
  );
  const cls = `relative flex h-[76px] min-w-0 flex-col items-center justify-center overflow-hidden border text-white ${classic ? "rounded" : "rounded-[22px]"}`;
  return onClick ? (
    <button type="button" onClick={onClick} className={`${cls} transition active:translate-y-0.5 active:scale-[.97]`} style={style}>
      {inner}
    </button>
  ) : (
    <div className={cls} style={style}>
      {inner}
    </div>
  );
}

export default function ProfilePage() {
  const params = useParams<{ username: string }>();
  const router = useRouter();
  const { user, username: me, loading } = useCurrentUser();
  const raw = decodeURIComponent(params.username);
  // "/profile/me" opens your own profile.
  const username = raw === "me" ? me : raw;
  const isOwn = !!me && sameName(username, me);
  const classic = useIsClassic();
  // 📟 Classic: the main button keeps its colour with navy text and a light frame (like the app).
  const mainBtnInk = classic ? "border-[#C9D2DE] text-[#16315F]" : "border-[#B8350A] text-white";

  const [profile, setProfile] = useState<Profile | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [friends, setFriends] = useState(0);
  const [followers, setFollowers] = useState(0);
  const [footprints, setFootprints] = useState(0);
  // Votes work like footprints: a voter adds this username to their OWN
  // "votedProfiles" list (+ votedAt.<name> time); the owner can see who.
  const [voters, setVoters] = useState(0);
  const [hasVoted, setHasVoted] = useState(false);
  const [giftCount, setGiftCount] = useState(0);
  const [peopleList, setPeopleList] = useState<"footprints" | "votes" | null>(null);
  // Days left on an active mentor tag (0 = no end date), or null when not tagged.
  const [taggedDays, setTaggedDays] = useState<number | null>(null);
  const [gifts, setGifts] = useState<GiftEntry[]>([]);
  const [isFollowing, setIsFollowing] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [moreOpen, setMoreOpen] = useState(false);
  const fr = useFriendRequests(me);
  const relation = fr.relationTo(username);
  const badges = useProfileAchievements(profile?.uid, isOwn);
  const special = useSpecialColors();

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
          supporter: activeSupporterTeam(x.supporterTeam, x.supporterUntil),
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
          joinedAtMs: created,
          memberSince: created
            ? new Date(created).toLocaleDateString(undefined, { month: "long", year: "numeric" })
            : "",
          // your OWN profile: you are here right now, so your chosen status shows
          // (the last heartbeat can be a little old the moment the page opens)
          presence: presenceLabel(String(x.presenceStatus || ""), d.id === user?.uid ? Date.now() : toMs(x.lastActiveAt)),
          statusMessage: String(x.statusMessage || "").trim(),
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
    // count(): the server returns only the number, like the app.
    getCountFromServer(query(users, where("visitedProfiles", "array-contains", username)))
      .then((s) => setFootprints(s.data().count))
      .catch(() => {});
    getCountFromServer(query(users, where("votedProfiles", "array-contains", username)))
      .then((s) => setVoters(s.data().count))
      .catch(() => {});
    // Gifts really received (gift_activity), as the app counts them.
    getCountFromServer(query(collection(db, "gift_activity"), where("toUsername", "==", username)))
      .then((s) => setGiftCount(s.data().count))
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
        setHasVoted(list("votedProfiles").some((n) => sameName(n, username)));
        const visited = list("visitedProfiles");
        if (!visited.some((n) => sameName(n, username))) {
          updateDoc(ref, { visitedProfiles: arrayUnion(username) }).catch(() => {});
        }
        // WHEN: visitedAt.<name>, refreshed on every visit, for the owner's
        // "Who viewed my profile" list. Separate write, like the app.
        updateDoc(ref, new FieldPath("visitedAt", username.toLowerCase()), serverTimestamp()).catch(() => {});
      })
      .catch(() => {});
  }, [user, username, me, isOwn]);

  // Vote / remove my vote. Only MY document is written: votedProfiles and
  // votedAt.<name>, same as the app.
  const toggleVote = async () => {
    if (!user || isOwn) return;
    setBusy("vote");
    setError("");
    try {
      const ref = doc(db, "users", user.uid);
      const snap = await getDoc(ref);
      const current = ((snap.get("votedProfiles") as unknown[]) || []).filter((v): v is string => typeof v === "string");
      const matches = current.filter((n) => sameName(n, username));
      const already = matches.length > 0;
      if (already) await updateDoc(ref, { votedProfiles: arrayRemove(...matches) });
      else await updateDoc(ref, { votedProfiles: arrayUnion(username) });
      setHasVoted(!already);
      setVoters((c) => Math.max(0, c + (already ? -1 : 1)));
      updateDoc(ref, new FieldPath("votedAt", username.toLowerCase()), already ? deleteField() : serverTimestamp()).catch(() => {});
    } catch (err) {
      console.error(err);
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy("");
    }
  };

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

  // Signed out (e.g. a profile link opened in another browser): say so under
  // the bar instead of "Loading…" forever.
  if (!loading && !user) {
    return (
      <PageShell light>
        <div className="flex flex-col items-center px-6 py-20 text-center">
          <p className="text-base font-bold text-[#0B2A5B]">Please re login</p>
          <p className="mt-1 text-sm text-[#5B6B8C]">You are logged out on this browser.</p>
          <Link href="/login" className="mt-4 rounded-xl bg-[#2F80ED] px-6 py-2.5 font-bold text-white">
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
  const facts = [profile.gender, profile.age > 0 ? String(profile.age) : ""].filter(Boolean);
  const bubble = profile.statusMessage || profile.bio;
  const dot = PRESENCE_DOT[profile.presence];
  // ⚽ Supporters Badge team (colours the top of the profile)
  const team = profile.supporter;
  const goBack = () => (window.history.length > 1 ? router.back() : router.push("/"));

  const menu: [string, () => void, string?][] = [["🏅 Achievements", badges.open]];
  if (isOwn) {
    menu.push(["✎ Edit Profile", () => router.push("/profile/edit")]);
    menu.push(["👣 Who viewed me", () => setPeopleList("footprints")]);
    menu.push(["❤️ Who voted for me", () => setPeopleList("votes")]);
  } else {
    menu.push(["✉️ Message", () => router.push(chatHref(username))]);
    menu.push([
      relation === "friend"
        ? "✓ Friends · Remove"
        : relation === "sent"
          ? "⏳ Request sent · Cancel"
          : relation === "incoming"
            ? "🤝 Accept friend request"
            : "🤝 Add Friend",
      friendAction,
    ]);
    menu.push([isBlocked ? `✓ Unblock ${username}` : `🚫 Block ${username}`, () => toggleMine("blockedUsers", !isBlocked), isBlocked ? "" : "text-rose-600"]);
    menu.push([`🚩 Report ${username}`, () => openReport({ kind: "user", targetUsername: username }), "text-rose-600"]);
  }

  return (
    <PageShell light noTopBar>
      <div className="mx-auto max-w-2xl bg-[#EEF3F8] pb-6">
        {/* Title bar: back · miglife logo · the person's ID (📟 Classic: the orange bar) */}
        <div
          className={`flex items-center gap-2 bg-gradient-to-b px-2 py-2 ${
            classic ? "from-[#FF9D2E] to-[#F07A00]" : "from-[#3A3A3A] to-[#1C1C1C]"
          }`}
        >
          <BackButton variant="dark" onClick={goBack} />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon-192.png" alt="miGlife" className="h-[38px] w-[38px] rounded-lg" />
          <h1 data-notranslate className={`min-w-0 flex-1 truncate pl-1 text-[21px] font-medium ${classic ? "text-[#16315F]" : "text-white"}`}>
            {username}
          </h1>
        </div>

        {/* Cover photo (only when the person has one), in the same frame as the photo */}
        {profile.coverPhotoUrl && (
          <div className="bg-white px-2.5 pt-2.5">
            <div className="mig-frame aspect-[3.2] rounded-2xl">
              <div className="h-full overflow-hidden rounded-[13px] bg-gradient-to-b from-[#174EA6] to-[#0F2C55]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={profile.coverPhotoUrl} alt="" className="h-full w-full object-cover" />
              </div>
            </div>
          </div>
        )}

        {/* Photo (left, 108 × 140) + details (right). With a cover, the photo's
            frame starts right on the cover's bottom border, joined to it. */}
        {/* ⚽ Supporters Badge: this block takes the team's colours, with the
            jersey and the team's letters ("FCB") big and faint behind it. */}
        <div
          className={`relative flex gap-3 p-2.5 ${team ? "" : "bg-white"}`}
          style={team ? { background: supporterBackground(team) } : undefined}
        >
          {team && (
            // clipped on its own layer: the photo may still reach up onto a cover
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
              <span className="pointer-events-none absolute -right-6 -top-4 rotate-12 opacity-[0.18]" aria-hidden>
                <SupporterJersey team={team} size={170} />
              </span>
              <span
                className="pointer-events-none absolute -right-3 top-1/2 -translate-y-1/2 select-none text-[110px] font-black italic leading-none tracking-tighter text-white/15"
                aria-hidden
                data-notranslate
              >
                {team.mark}
              </span>
            </div>
          )}
          {/* ROUND photo (like the rest of the app). With a cover photo it sits
              half on the cover's bottom edge, Facebook-style — except on a
              Supporters Badge profile, where it sits fully on the team colours. */}
          {/* 📟 Classic: a square photo with a plain grey frame. */}
          <div
            className={`relative z-10 h-[112px] w-[112px] shrink-0 ${
              classic ? "rounded bg-gradient-to-b from-[#C9CED6] to-[#9AA3AE] p-[3px] shadow" : "mig-frame rounded-full"
            } ${profile.coverPhotoUrl && !team ? "-mt-[60px]" : ""}`}
          >
            <div className={`h-full overflow-hidden bg-[#E8EEF5] ${classic ? "rounded-sm border-[1.5px] border-white/95" : "rounded-full"}`}>
              {profile.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={profile.photoUrl} alt={username} className="h-full w-full object-cover" />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-[42px] font-bold text-[#8FA3BF]">
                  {username.slice(0, 1).toUpperCase()}
                </span>
              )}
            </div>
          </div>
          <div className={`relative min-w-0 flex-1 text-[15px] ${team ? "text-white" : "text-[#333]"}`}>
            <div className="flex items-center gap-1.5">
              {special.has(username) ? (
                // 🌈 Special Edition Colour / miglife
                <RainbowName name={username} style={special.styleOf(username)} className="truncate text-xl" />
              ) : (
                <span
                  data-notranslate
                  className={`truncate text-xl font-bold ${team ? "text-white" : "text-[#3AA0E0]"}`}
                  style={team ? { textShadow: "0 1px 3px rgba(0,0,0,.35)" } : undefined}
                >
                  {username}
                </span>
              )}
              {shownRole && (
                <span
                  className={`shrink-0 text-[13px] font-bold ${team ? "rounded-full bg-white/90 px-2 py-0.5 shadow-sm" : ""}`}
                  style={{ color: shownRole.color }}
                >
                  {shownRole.icon || "🎖"} {shownRole.label}
                </span>
              )}
            </div>
            {profile.fullName && !sameName(profile.fullName, username) && (
              <p data-notranslate className={`truncate text-base ${team ? "text-white/80" : "text-[#6E6E6E]"}`}>{profile.fullName}</p>
            )}
            <p className="mt-1 flex items-center gap-1.5">
              <span
                className="h-[15px] w-[15px] rounded-full border"
                style={{ background: `radial-gradient(circle at 35% 35%, ${dot[0]}, ${dot[1]})`, borderColor: dot[1] }}
              />
              {profile.presence}
            </p>
            <p className="mt-1">
              miGlife Level {profile.level} <span className="text-base">{badgeForLevel(profile.level)}</span>
            </p>
            {profile.supporter && (
              // ⚽ Supporter Colours: the team as a badge
              <p className="mt-1.5">
                <span
                  className="inline-flex items-center gap-1.5 rounded-full bg-white/90 px-2 py-[3px] text-[12px] font-extrabold shadow-sm"
                  style={{ color: profile.supporter.text }}
                >
                  <SupporterJersey team={profile.supporter} size={18} />
                  {profile.supporter.name} supporter
                </span>
              </p>
            )}
            {facts.length > 0 && <p className="mt-1 truncate">{facts.join(", ")}</p>}
            {profile.relationship && <p className="mt-0.5 truncate text-sm">💍 {profile.relationship}</p>}
            {profile.memberSince && <p className="mt-0.5 truncate text-sm">🗓 Member since {profile.memberSince}</p>}
            {profile.country && <p className="mt-0.5 truncate text-sm">📍 {profile.country}</p>}
            {taggedDays !== null && (
              <p className="mt-0.5 truncate text-sm">🎓 {isOwn && taggedDays > 0 ? `Tagged · ${taggedDays}d left` : "Tagged"}</p>
            )}
            {bubble && (
              <div className="mt-1.5">
                {/* 📟 Classic: light grey speech bubble with navy text */}
                <span
                  className={`ml-[34px] block h-0 w-0 border-x-[7px] border-b-[7px] border-x-transparent ${classic ? "border-b-[#E3E8EE]" : "border-b-[#5E5E5E]"}`}
                />
                <p
                  data-notranslate
                  className={`whitespace-pre-wrap rounded-lg px-2.5 py-1.5 text-sm ${classic ? "bg-[#E3E8EE] text-[#16315F]" : "bg-[#5E5E5E] text-white"}`}
                >
                  {bubble}
                </p>
              </div>
            )}
            <div className="mt-2.5 flex items-center gap-2">
              {isOwn ? (
                <Link
                  href="/profile/edit"
                  className={`rounded-lg border bg-gradient-to-b from-[#FF9A3C] to-[#E8480C] px-[26px] py-2 text-base font-medium ${mainBtnInk}`}
                >
                  Edit Profile
                </Link>
              ) : (
                <>
                  <button
                    type="button"
                    disabled={!!busy}
                    onClick={() => toggleMine("following", !isFollowing)}
                    className={`rounded-lg border px-[26px] py-2 text-base font-medium disabled:opacity-60 ${mainBtnInk} ${
                      isFollowing ? "bg-gradient-to-b from-[#9A9A9A] to-[#6A6A6A]" : "bg-gradient-to-b from-[#FF9A3C] to-[#E8480C]"
                    }`}
                  >
                    {busy === "following" ? "…" : isFollowing ? "Unfollow" : "Follow"}
                  </button>
                  <button
                    type="button"
                    disabled={!!busy}
                    onClick={toggleVote}
                    aria-label={hasVoted ? "Remove vote" : "Vote"}
                    className={`flex h-[38px] w-[38px] items-center justify-center rounded-lg text-[17px] disabled:opacity-60 ${
                      hasVoted ? "bg-[#E0303F]" : classic ? "bg-[#F4F6F9]" : "bg-[#6A6A6A]"
                    }`}
                  >
                    {hasVoted ? "❤️" : "🤍"}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* 4 × 2 grid of number tiles */}
        <div className="mt-px space-y-2 bg-white px-2 py-2">
          <div className="grid grid-cols-4 gap-1.5">
            <Tile value={String(friends)} label="Friends" icon="👥" tint="#1E88E5" />
            <Tile value={String(giftCount)} label="Gifts" icon="🎁" tint="#E91E63" />
            <Tile value={String(followers)} label="Followers" icon="💜" tint="#8E24AA" />
            <Tile value={String(profile.following)} label="Following" icon="➕" tint="#00897B" />
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            <Tile value={String(badges.count)} label="Badges" icon="🏅" tint="#F08C00" onClick={badges.open} />
            {/* Any old number stored on the profile, plus the real votes. Only the owner sees who. */}
            {/* tap: your own → who voted; someone else's → vote / remove your vote (like the app) */}
            <Tile
              value={String(profile.votes + voters)}
              label={!isOwn && hasVoted ? "Voted ✓" : "Votes"}
              icon="❤️"
              tint="#E53935"
              onClick={isOwn ? () => setPeopleList("votes") : busy ? undefined : toggleVote}
            />
            <Tile value={String(footprints)} label="Views" icon="👀" tint="#43A047" onClick={isOwn ? () => setPeopleList("footprints") : undefined} />
            {isOwn ? (
              // 📅 how long you've been here (the app's "Days here" tile)
              (() => {
                const days = profile.joinedAtMs > 0 ? Math.max(1, Math.floor((Date.now() - profile.joinedAtMs) / 86_400_000) + 1) : 0;
                return <Tile value={days > 0 ? String(days) : "—"} label={days === 1 ? "Day here" : "Days here"} icon="📅" tint="#3949AB" />;
              })()
            ) : (
            <div className="relative">
              <Tile value="•••" label="More" icon="✨" tint="#546E7A" onClick={() => setMoreOpen((o) => !o)} />
              {moreOpen && (
                <>
                  <button type="button" aria-label="Close" className="fixed inset-0 z-30 cursor-default" onClick={() => setMoreOpen(false)} />
                  <div className="absolute right-0 top-full z-40 mt-1 w-56 overflow-hidden rounded-xl bg-white py-1 shadow-xl ring-1 ring-black/10">
                    {menu.map(([label, act, cls]) => (
                      <button
                        key={label}
                        type="button"
                        disabled={!!busy}
                        onClick={() => {
                          setMoreOpen(false);
                          act();
                        }}
                        className={`block w-full px-4 py-2.5 text-left text-[15px] hover:bg-[#F1F5FB] disabled:opacity-50 ${cls || "text-[#0B1F3A]"}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
            )}
          </div>
          {error && <p className="text-center text-sm text-rose-600">{error}</p>}
        </div>

        {/* Gift history, under a dark section bar */}
        <h2 data-notranslate className="mt-2 bg-gradient-to-b from-[#3C3C3C] to-[#1E1E1E] px-2.5 py-[7px] text-[15px] font-bold text-white">
          {username}&apos;s Gift History
        </h2>
        <ul className="bg-white py-1">
          {gifts.length === 0 ? (
            <li className="flex items-center gap-3 px-3.5 py-[11px] text-sm text-[#0B2A5B]">
              <span className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full bg-[#E6F0FB] text-xl">🎁</span>
              No gifts sent or received yet
            </li>
          ) : (
            gifts.map((g, i) => (
              <li key={i} className={`flex items-center gap-3 px-3.5 py-[11px] text-sm text-[#0B2A5B] ${i > 0 ? "border-t border-[#E3E6EA]" : ""}`}>
                <span className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full bg-[#E6F0FB] text-xl">
                  {g.sent ? "🎁" : "🎉"}
                </span>
                <span className="min-w-0">
                  {g.sent ? "Sent" : "Received"} {g.giftName} {g.sent ? "to" : "from"}{" "}
                  <Link href={`/profile/${encodeURIComponent(g.other)}`} className="font-semibold text-[#2F80ED]">
                    {g.other}
                  </Link>
                  {g.at > 0 &&
                    " · " +
                      new Date(g.at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                </span>
              </li>
            ))
          )}
        </ul>
      </div>
      {badges.dialog}
      {peopleList && isOwn && user && profile && (
        <ProfilePeopleList kind={peopleList} ownerName={username} ownerUid={user.uid} onClose={() => setPeopleList(null)} />
      )}
    </PageShell>
  );
}
