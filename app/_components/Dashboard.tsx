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

// Signed-in home, like the app's Home tab. Modern: the hero card, quick buttons,
// friend search, online strip and friend cards (ModernHome.tsx). Classic: the
// profile strip in the top bar, Email / Messages / migAlerts rows and the
// Online / Offline folders. Both end with Find Friends and Invite Friends.

type Me = { photoUrl: string; level: number; role: string; statusMessage: string; online: boolean; presence: string; coins: number; xp: number };
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
    <div className="border-b border-[#C9D2DE] bg-gradient-to-b from-white to-[#EEF2F7] text-[#16315F]">
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
    <div className="mx-auto max-w-2xl pb-8 lg:flex lg:max-w-5xl lg:items-start lg:gap-4 lg:px-4 lg:pt-4">
      <div className="min-w-0 flex-1 lg:overflow-hidden lg:rounded-2xl lg:bg-white lg:shadow-md">
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
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 pb-safe sm:items-center" onClick={() => setEditing(false)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm font-bold text-[#0B2A5B]">💬 Your status</p>
            <input
              autoFocus
              value={statusDraft}
              onChange={(e) => setStatusDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && saveStatus()}
              maxLength={300}
              placeholder="What are you thinking?"
              className="mt-2 w-full rounded-xl border border-[#D5E3F5] bg-[#F4F9FF] px-3 py-2.5 text-sm text-[#0B2A5B] outline-none focus:border-[#2F80ED]"
            />
            <div className="mt-3 flex gap-2">
              <button type="button" onClick={() => setEditing(false)} className="flex-1 rounded-xl border border-[#D5E3F5] py-2.5 text-sm font-bold text-[#5B6B8C]">
                Cancel
              </button>
              <button type="button" onClick={saveStatus} className="flex-1 rounded-xl bg-[#2F80ED] py-2.5 text-sm font-bold text-white">
                Save
              </button>
            </div>
          </div>
        </div>
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
      <aside className="hidden w-72 shrink-0 space-y-3 lg:block">
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
              ["/leaderboard", "🏆", "Rankings"],
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
