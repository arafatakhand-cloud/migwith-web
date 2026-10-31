"use client";

import { openPresencePopup } from "./PresencePopup";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { collection, doc, getDocs, onSnapshot, query, serverTimestamp, updateDoc, where } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useFriendRequests } from "../../lib/friends";
import { chatHref } from "../../lib/privateChat";
import { OFFICIAL_COUNTRY_ROOMS, badgeForLevel, badgeNameForLevel, roomHref } from "../../lib/rooms";
import { useLevelBadgeImages } from "../../lib/badgeImages";
import { useSession } from "./AppSession";
import { InstallHint } from "./InstallHint";
import { AndroidDownloadRow } from "./AndroidDownload";
import { isOnlineNow } from "../../lib/heartbeat";
import { useIsClassic } from "../../lib/uiStyle";
import { ModernHomeTop } from "./ModernHome";
import { totalXpForLevel } from "../../lib/level";
import { activeSupporterTeam, type SupporterTeam } from "../../lib/supporterTeams";
import { SupporterJersey } from "./SupporterBadge";

// Signed-in home, like the app's Home tab. Modern: the hero card, quick buttons,
// friend search, online strip and friend cards (ModernHome.tsx). Classic: the
// profile strip in the top bar, Email / Messages / migAlerts rows and the
// Online / Offline folders. Both end with Find Friends and Invite Friends.

type Me = { photoUrl: string; level: number; role: string; statusMessage: string; online: boolean; presence: string; coins: number; xp: number; supporter: SupporterTeam | null };
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
  if (r === "elite" || r === "elite_user") return "Honor Member";
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

// Last profile / friends seen on Home: switching Lobby ⇄ Chat Rooms shows them
// at once instead of loading again from empty (the XP bar grew from 0 each time).
let lastMe: { uid: string; me: Me } | null = null;
let lastInfo: { uid: string; info: Record<string, Friend> } | null = null;

export function Dashboard() {
  const { user, username, badges } = useSession();
  const [me, setMeState] = useState<Me | null>(() => (lastMe && lastMe.uid === user?.uid ? lastMe.me : null));
  const setMe = (m: Me) => {
    if (user) lastMe = { uid: user.uid, me: m };
    setMeState(m);
  };
  const [editing, setEditing] = useState(false);
  const [statusDraft, setStatusDraft] = useState("");
  const [openOnline, setOpenOnline] = useState(true);
  const [openOffline, setOpenOffline] = useState(true);
  const classic = useIsClassic();
  const [friendSearch, setFriendSearch] = useState("");
  const [info, setInfoState] = useState<Record<string, Friend>>(() => (lastInfo && lastInfo.uid === user?.uid ? lastInfo.info : {}));
  const setInfo = (i: Record<string, Friend>) => {
    if (user) lastInfo = { uid: user.uid, info: i };
    setInfoState(i);
  };

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
        presence: String(d.presenceStatus || "ONLINE").toUpperCase(),
        coins: Number(d.balance || 0),
        xp: Number(d.xp || 0),
        supporter: activeSupporterTeam(d.supporterTeam, d.supporterUntil),
      });
    });
  }, [user]);

  // 📟 Classic Home: the profile strip is drawn by the Lobby page itself (it
  // used to sit in the top bar between the orange header and the blue tabs).
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
              // A fresh heartbeat, like the app (presenceStatus alone stayed ONLINE forever).
              online: isOnlineNow(x),
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
      if (navigator.share) await navigator.share({ title: "MIGlife", text: "Join me on MIGlife!", url });
      else {
        await navigator.clipboard.writeText(url);
        alert("Link copied: " + url);
      }
    } catch {
      // share sheet closed
    }
  };

  const unreadOf = (name: string) =>
    Object.entries(badges.unreadBy || {}).reduce((n, [k, v]) => (k.toLowerCase() === name.toLowerCase() ? n + v : n), 0);
  // 📟 Classic style: a small presence icon + "name - status" on one line.
  const ClassicFriendRow = ({ f }: { f: Friend }) => (
    <div className="flex items-center bg-white py-[9px] pl-3 pr-2.5 hover:bg-[#F4F9FF]">
      {/* new messages from this friend: the icon glows red ⇄ green with ✉ (like the app) */}
      <Link
        href={`/profile/${encodeURIComponent(f.name)}`}
        aria-label={f.name}
        className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border border-white bg-gradient-to-b font-bold text-white ${
          unreadOf(f.name) > 0 ? "friend-unread-blink text-[10px]" : f.online ? "from-[#7EE06A] to-[#34A82A] text-xs" : "from-[#D3D8DF] to-[#9AA3AE] text-xs"
        }`}
      >
        {unreadOf(f.name) > 0 ? "✉" : "☺"}
      </Link>
      <Link href={chatHref(f.name)} data-notranslate className="ml-[9px] flex min-w-0 flex-1 items-center text-[15px]">
        <span className={`max-w-[190px] shrink-0 truncate font-bold ${f.online ? "text-[#16315F]" : "text-[#6B7788]"}`}>{f.name}</span>
        <span className="shrink-0 whitespace-pre text-sm text-[#6B7788]">{" - "}</span>
        {f.status ? (
          // a status message travels right → left (the app's MaMarqueeStatusText)
          <span className="relative min-w-0 flex-1 overflow-hidden whitespace-nowrap text-sm italic text-[#6B7788]">
            <span className="status-marquee inline-block">{f.status}</span>
          </span>
        ) : (
          <span className="min-w-0 flex-1 truncate text-sm text-[#6B7788]">{[f.gender, `Level: ${f.level}`, f.country].filter(Boolean).join(", ")}</span>
        )}
      </Link>
    </div>
  );

  const FriendRow = ({ f }: { f: Friend }) => classic ? <ClassicFriendRow f={f} /> : (
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
  }) => classic ? (
    // 📟 Classic style: grey folder bar "▼ Online (4)" / "► Offline (12)".
    <>
      <button
        type="button"
        onClick={toggle}
        className="flex w-full items-center border-b border-[#C9D2DE] bg-gradient-to-b from-[#E9EEF4] to-[#D6DEE8] px-2.5 py-2 text-left"
      >
        <span className="w-[18px] text-[11px] text-[#2F6ABD]">{open ? "▼" : "►"}</span>
        <span className="text-sm font-bold text-[#16315F]">
          {title} ({list.length})
        </span>
      </button>
      {open && list.map((f) => <FriendRow key={f.name} f={f} />)}
    </>
  ) : (
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

  // 📟 Classic: a light strip with a small square photo, ● name + role, the
  // status in grey italics, and the level on the right.
  const presenceDot = { ONLINE: "#3CC24A", BUSY: "#E53935", AWAY: "#FFB300" }[me?.presence || "ONLINE"] || "#9AA3AE";
  const xpNow = me?.xp ?? 0;
  const lvlNow = me?.level ?? 1;
  const xpStart = totalXpForLevel(lvlNow);
  const xpNext = totalXpForLevel(lvlNow + 1);
  const xpFrac = xpNext > xpStart ? Math.min(1, Math.max(0, (xpNow - xpStart) / (xpNext - xpStart))) : 0;
  // the uploaded tier picture (Share Permissions → Level Badges), else the emoji
  const levelBadgeImages = useLevelBadgeImages(true);
  const levelBadgeUrl = levelBadgeImages[badgeNameForLevel(me?.level ?? 1)] || "";
  const classicStrip = (
    <div className="relative isolate overflow-hidden border-b border-[#C9D2DE] bg-gradient-to-b from-white to-[#EEF2F7] text-[#16315F]">
    {/* ⚽ my Supporters Badge team (while it lasts): its crest, faint, behind the strip */}
    {me?.supporter && (
      <span aria-hidden className="pointer-events-none absolute -top-3.5 right-16 -z-10 rotate-12 opacity-[0.15]">
        <SupporterJersey team={me.supporter} size={130} />
      </span>
    )}
    <div className="flex items-center px-2.5 pb-1.5 pt-2">
      <Link href="/profile/me" className="flex h-[46px] w-[46px] shrink-0 items-center justify-center overflow-hidden rounded border border-[#B9C4D2] bg-[#FFE0B8] text-xl font-bold text-[#F07A00]">
        {me?.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={me.photoUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          username.slice(0, 1).toUpperCase() || "U"
        )}
      </Link>
      <div className="ml-2.5 min-w-0 flex-1">
        <div className="flex items-center">
          <Link href="/profile/me" data-notranslate className="min-w-0 truncate text-base font-bold">
            {username || "User"}
          </Link>
          <span className="ml-1.5 shrink-0 rounded-[3px] border border-[#2F6ABD]/60 px-1 text-[10px] font-bold text-[#2F6ABD]">
            {roleLabel(me?.role || "")}
          </span>
          {/* presence dot AFTER the role (tap = change presence) */}
          <button type="button" onClick={openPresencePopup} aria-label="Presence status" className="ml-[7px] h-3 w-3 shrink-0 rounded-full border border-white" style={{ background: presenceDot }} />
        </div>
      </div>
      {/* 🏅 level badge in the top-right corner, the level under it (square box, like the app) */}
      <Link
        href="/level"
        className="ml-2 flex shrink-0 flex-col items-center self-start px-0.5 text-[#2F6ABD]"
      >
        <span className="flex h-[46px] w-[46px] items-center justify-center">
          {levelBadgeUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={levelBadgeUrl} alt="" className="h-full w-full object-contain" />
          ) : (
            <span className="text-[32px] leading-tight">{badgeForLevel(me?.level ?? 1)}</span>
          )}
        </span>
        <span className="whitespace-nowrap text-[11px] font-extrabold">Level {me?.level ?? "…"}</span>
      </Link>
    </div>
    {/* status, under the photo row, full width */}
    <div className="px-2.5 pb-1">
      {editing ? (
        <div className="mt-0.5 flex gap-1.5">
          <input
            autoFocus
            value={statusDraft}
            onChange={(e) => setStatusDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && saveStatus()}
            maxLength={300}
            placeholder="What are you thinking?"
            className="min-w-0 flex-1 rounded border border-[#B9C4D2] bg-white px-1.5 py-0.5 text-[13px] outline-none"
          />
          <button type="button" onClick={saveStatus} className="rounded bg-gradient-to-b from-[#FF9D2E] to-[#F07A00] px-2 text-xs font-bold text-white">
            ✓
          </button>
        </div>
      ) : (
        <button
          type="button"
          data-notranslate
          onClick={() => {
            setStatusDraft(me?.statusMessage || "");
            setEditing(true);
          }}
          className="block h-5 w-full truncate text-left text-[13px] italic text-[#6B7788]"
        >
          {me?.statusMessage || "What are you thinking?"}
        </button>
      )}
    </div>
    {/* 📟 Classic XP bar: a flat meter — square corners, grey frame, blue fill
        with a light top half, numbers on the right. */}
    <Link href="/level" className="flex items-center px-2.5 pb-[7px]">
      <span className="text-[11px] font-extrabold text-[#F07A00]">XP</span>
      <span className="mx-1.5 block h-2.5 min-w-0 flex-1 border border-[#9FB0C6] bg-[#DDE4EC] p-px">
        <span className="relative block h-full bg-gradient-to-b from-[#5A8FD6] to-[#2F6ABD]" style={{ width: `${xpFrac * 100}%` }}>
          <span className="absolute inset-x-0 top-0 h-[45%] bg-white/[0.28]" />
        </span>
      </span>
      <span className="shrink-0 text-[11px] font-bold text-[#4A5A70]">
        {xpNow.toLocaleString("en-US")} / {xpNext.toLocaleString("en-US")}
      </span>
    </Link>
    </div>
  );

  return (
    <div className="relative mx-auto max-w-2xl pb-8 lg:flex lg:max-w-5xl lg:items-start lg:gap-4 lg:px-4 lg:pt-4">
      {/* 🦋 Modern Lobby: the butterfly picture, very faint, behind everything —
          in the 🫧 Glass theme the sky (globals.css) shows instead */}
      {!classic && (
        <div
          aria-hidden
          className="lobby-butterfly pointer-events-none fixed inset-0 z-0"
          style={{
            backgroundImage: "linear-gradient(rgba(255,255,255,.86), rgba(255,255,255,.86)), url(/lobby-bg.webp)",
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        />
      )}
      <div className="relative z-[1] min-w-0 flex-1 lg:overflow-hidden lg:rounded-2xl lg:bg-white lg:shadow-md">
      {classic ? (
        classicStrip
      ) : (
        <ModernHomeTop
          username={username}
          photo={me?.photoUrl || ""}
          roleLabel={roleLabel(me?.role || "")}
          presence={me?.presence || "ONLINE"}
          status={me?.statusMessage || ""}
          xp={me?.xp ?? 0}
          level={me?.level ?? 1}
          levelIcon={badgeForLevel(me?.level ?? 1)}
          levelBadgeUrl={levelBadgeUrl}
          supporter={me?.supporter ?? null}
          friends={friends.filter((f) => !friendSearch.trim() || f.name.toLowerCase().includes(friendSearch.trim().toLowerCase()))}
          unreadEmails={badges.emails}
          unreadAlerts={badges.alerts}
          search={friendSearch}
          onSearch={setFriendSearch}
          onStatus={() => {
            setStatusDraft(me?.statusMessage || "");
            setEditing(true);
          }}
        />
      )}
      {/* Modern: status editor (tap the status in the hero card) */}
      {!classic && editing && (
        <StatusEditor
          value={statusDraft}
          onChange={setStatusDraft}
          onCancel={() => setEditing(false)}
          onSave={saveStatus}
        />
      )}

      {classic && <InstallHint />}

      {/* Rows — Classic only: Modern ends with the friend cards, like the app's Lobby */}
      {classic && (
      <div className="bg-white shadow-sm">
        {/* Classic keeps the Email / Messages / migAlerts rows and the Online / Offline folders;
            Modern shows them in the new top part instead (like the app). */}
        {classic && (
        <>
        <Link href="/mail" className="flex items-center gap-3 border-b border-[#E3ECF7] px-4 py-3 text-[#0B2A5B] hover:bg-[#F4F9FF]">
          {/* An envelope, like the app's */}
          <svg width="26" height="19" viewBox="0 0 26 19" className="shrink-0" aria-hidden>
            <rect x="1" y="1" width="24" height="17" rx="3" fill="none" stroke="#2A6F9E" strokeWidth="2" />
            <path d="M2 3 L13 11.4 L24 3" fill="none" stroke="#2A6F9E" strokeWidth="2" />
          </svg>
          <span className="font-semibold">Email ({badges.emails})</span>
        </Link>
        <Link href="/messages" className="flex items-center gap-3 border-b border-[#E3ECF7] px-4 py-3 text-[#0B2A5B] hover:bg-[#F4F9FF]">
          <span className="text-lg text-[#174EA6]">💬</span>
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
        </>
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
        {/* Android app download, right under Invite Friends */}
        <AndroidDownloadRow />
      </div>
      )}
      </div>

      {/* Laptop: quick links beside the list */}
      <aside className="relative z-[1] hidden w-72 shrink-0 space-y-3 lg:block">
        <div className="rounded-2xl bg-white p-3 shadow-md">
          <p className="mb-2 text-sm font-black text-[#0B2A5B]">💬 Popular rooms</p>
          <ul className="space-y-1">
            {OFFICIAL_COUNTRY_ROOMS.slice(0, 6).map((r) => (
              <li key={r}>
                <Link href={roomHref(r)} className="flex items-center gap-2 rounded-xl px-2 py-1.5 text-sm font-semibold text-[#0B2A5B] hover:bg-[#F4F9FF]">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#DCEBFB] text-xs font-black text-[#174EA6]">
                    {r.slice(0, 1)}
                  </span>
                  <span data-notranslate>{r}</span>
                </Link>
              </li>
            ))}
          </ul>
          <Link href="/rooms" className="mt-2 block rounded-xl bg-[#2F80ED] py-2 text-center text-sm font-bold text-white">
            All rooms
          </Link>
        </div>
        <div className="rounded-2xl bg-white p-3 shadow-md">
          <p className="mb-2 text-sm font-black text-[#0B2A5B]">◉ Discover</p>
          <div className="grid grid-cols-2 gap-2 text-center text-xs font-bold text-[#0B2A5B]">
            {[
              ["/gifts", "🎁", "Gift Gallery"],
              ["/leaderboard", "🏆", "Leader Board"],
              ["/lucky", "🍀", "Lucky User"],
              ["/members", "👥", "Community"],
            ].map(([href, icon, label]) => (
              <Link key={href} href={href} className="rounded-xl bg-[#F4F9FF] py-3 hover:bg-[#EAF4FE]">
                <span className="block text-xl">{icon}</span>
                {label}
              </Link>
            ))}
          </div>
        </div>
      </aside>
    </div>
  );
}

/* ✨ The status editor (Modern): a glass card, a rounded writing box with a live
   word bar, one-tap ready statuses and emojis, big gradient buttons — like the app. */
const QUICK_STATUSES = ["😊 Available", "💬 Free to chat", "🎮 Playing games", "🎵 Listening to music", "📚 Studying", "💼 At work", "😴 Sleeping", "📵 Busy"];
const QUICK_EMOJIS = ["😀", "😍", "😎", "🥰", "🔥", "✨", "💯", "❤️", "🙏", "🌙"];
const BRAND = "linear-gradient(135deg, #1565D8, #3B7BF0, #7B5CF0)";
const wordCount = (t: string) => t.trim().split(/\s+/).filter(Boolean).length;
const limitWords = (t: string) => {
  const words = t.trim().split(/\s+/).filter(Boolean);
  if (words.length <= 120) return t;
  return words.slice(0, 120).join(" ");
};

function StatusEditor({ value, onChange, onCancel, onSave }: { value: string; onChange: (v: string) => void; onCancel: () => void; onSave: () => void | Promise<void> }) {
  const [saving, setSaving] = useState(false);
  const words = wordCount(value);
  const near = words >= 110;
  // ⌨️ The phone keyboard: the sheet sits in the part of the screen you can
  // still see (above the keyboard) and scrolls inside when it doesn't fit —
  // the title and the box were pushed off the top before.
  const [vv, setVv] = useState<{ top: number; h: number } | null>(null);
  useEffect(() => {
    const v = window.visualViewport;
    if (!v) return;
    const upd = () => setVv({ top: v.offsetTop, h: v.height });
    upd();
    v.addEventListener("resize", upd);
    v.addEventListener("scroll", upd);
    return () => {
      v.removeEventListener("resize", upd);
      v.removeEventListener("scroll", upd);
    };
  }, []);
  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await onSave();
    } finally {
      setSaving(false);
    }
  };
  return (
    <div
      className="fixed inset-x-0 top-0 z-50 flex h-[100dvh] items-end justify-center bg-[#0B1F3A]/[0.12] p-3 pb-safe sm:items-center"
      style={vv ? { top: vv.top, height: vv.h } : undefined}
      onClick={() => !saving && onCancel()}
    >
      <div
        className="max-h-full w-full max-w-md overflow-y-auto overscroll-contain rounded-[28px] border-[1.5px] border-white/[0.92] p-[18px] shadow-[inset_0_1px_1px_#fff,0_10px_30px_rgba(40,80,140,.22)]"
        style={{
          // a solid white card (the clear glass let the page show through)
          background: "linear-gradient(180deg, #ffffff, #f7faff)",
          backdropFilter: "blur(14px) saturate(1.4)",
          WebkitBackdropFilter: "blur(14px) saturate(1.4)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-[1.5px] border-white/85 text-xl shadow-[0_4px_10px_rgba(59,123,240,.45)]" style={{ background: BRAND }}>
            💬
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[19px] font-extrabold leading-6 text-[#0B2A5B]">Edit Status</p>
            <p className="text-xs text-[#5B6B8C]">Let your friends know what&apos;s on your mind</p>
          </div>
          <button type="button" onClick={onCancel} disabled={saving} aria-label="Close" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#D5E3F5] bg-[#F2F6FC] text-sm font-bold text-[#5B6B8C]">
            ✕
          </button>
        </div>

        <div className="relative mt-4">
          <textarea
            autoFocus
            value={value}
            onChange={(e) => onChange(limitWords(e.target.value))}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                save();
              }
            }}
            rows={4}
            placeholder="What are you thinking?"
            className="block min-h-[104px] w-full resize-none rounded-[18px] border-[1.5px] border-[#D5E3F5] bg-[#F5F9FF] px-3.5 pb-7 pt-3 text-base leading-[22px] text-[#0B2A5B] outline-none transition focus:border-[#3B7BF0] focus:shadow-[0_0_0_3px_rgba(59,123,240,.15)]"
          />
          {value && (
            <button type="button" onClick={() => onChange("")} className="absolute bottom-2 right-3 rounded-lg px-1 text-xs font-bold text-[#3B7BF0]">
              Clear
            </button>
          )}
        </div>

        <div className="mt-2 flex items-center gap-2.5">
          <div className="h-[5px] flex-1 overflow-hidden rounded-full bg-[#E3ECF7]">
            <div
              className="h-full rounded-full transition-[width]"
              style={{ width: `${Math.min(100, (words / 120) * 100)}%`, background: near ? "linear-gradient(90deg, #FF8A3D, #E5484D)" : BRAND }}
            />
          </div>
          <span className={`text-[11px] font-semibold ${near ? "text-[#E5484D]" : "text-[#5B6B8C]"}`}>{words}/120 words</span>
        </div>

        <p className="mt-3.5 text-xs font-bold text-[#0B2A5B]">✨ Quick status</p>
        <div className="no-scrollbar mt-1.5 flex gap-1.5 overflow-x-auto pb-0.5">
          {QUICK_STATUSES.map((q) => {
            const picked = value.trim() === q;
            return (
              <button
                key={q}
                type="button"
                onClick={() => onChange(q)}
                className={`shrink-0 whitespace-nowrap rounded-2xl border px-3 py-[7px] text-[13px] font-semibold ${picked ? "border-white/80 text-white" : "border-[#D5E3F5] text-[#0B2A5B]"}`}
                style={{ background: picked ? BRAND : "linear-gradient(180deg, #ffffff, #f2f6fc)" }}
              >
                {q}
              </button>
            );
          })}
        </div>

        <div className="no-scrollbar mt-2.5 flex gap-1 overflow-x-auto">
          {QUICK_EMOJIS.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => onChange(limitWords(value.trimEnd() + (value.trim() ? " " : "") + e))}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#D5E3F5] bg-[#F5F9FF] text-[19px]"
            >
              {e}
            </button>
          ))}
        </div>

        <div className="mt-[18px] flex gap-2.5">
          <button type="button" onClick={onCancel} disabled={saving} className="h-12 flex-1 rounded-3xl border-[1.5px] border-[#D5E3F5] bg-[#F2F6FC] text-[15px] font-bold text-[#5B6B8C]">
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="h-12 flex-[1.4] rounded-3xl border-[1.5px] border-white/60 text-[15px] font-extrabold text-white shadow-[0_6px_14px_rgba(59,123,240,.4)] disabled:opacity-70"
            style={{ background: BRAND }}
          >
            {saving ? "Saving…" : "✓  Save status"}
          </button>
        </div>
      </div>
    </div>
  );
}
