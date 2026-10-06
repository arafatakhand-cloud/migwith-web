"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  collection,
  doc,
  getDoc,
  getCountFromServer,
  getDocs,
  increment,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  where,
  writeBatch,
} from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useCurrentUser } from "../../lib/useCurrentUser";
import {
  OFFICIAL_COUNTRY_ROOMS,
  OFFICIAL_GAME_ROOMS,
  ROOM_PRESENCE_STALE_MS,
  roomHref,
  roomDisplayName,
} from "../../lib/rooms";
import { useRoomPrefs } from "../../lib/roomPrefs";
import { PageShell } from "../_components/PageShell";
import { isMainFounderName } from "../../lib/founder";
import { LUXURY_BET_ROOM, useLuxuryBetAccess } from "../_components/LuxuryBet";

type UserRoom = { name: string; description: string; ownerName: string; ownerUid: string; maxUsers: number; capped: boolean };

// Same limits as the app (MainActivity.kt).
const MIN_LEVEL_TO_CREATE = 10;
const MIN_NAME = 5;
const MAX_NAME = 15;
const MAX_ROOMS_PER_USER = 10;
const BANNED_ROOM_WORDS = [
  "sex", "porn", "xxx", "nude", "naked", "fuck", "pussy", "dick", "boobs",
  "horny", "escort", "chudi", "choda", "khanki", "randi",
];

function isBannedRoomName(name: string): boolean {
  const flat = name.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
  return BANNED_ROOM_WORDS.some((w) => flat.includes(w));
}

function capacityForLevel(level: number): number {
  if (level >= 40) return 50;
  if (level >= 25) return 40;
  if (level >= 15) return 30;
  return 25;
}

export default function RoomsPage() {
  const router = useRouter();
  const { user, username, loading } = useCurrentUser();
  // 🎰 Luxury Bet shows only for the IDs miglife added (or everyone once open).
  const luxuryBetAccess = useLuxuryBetAccess(user?.uid);
  const gameRooms = luxuryBetAccess.canSee
    ? OFFICIAL_GAME_ROOMS.flatMap((n) => (n === "👻 Luxury Bot Official" ? [n, LUXURY_BET_ROOM] : [n]))
    : OFFICIAL_GAME_ROOMS;
  const [userRooms, setUserRooms] = useState<UserRoom[]>([]);
  const [search, setSearch] = useState("");
  const [level, setLevel] = useState(0);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [maxes, setMaxes] = useState<Record<string, number>>({});
  // "All": the three sections (Public / Game / Private), each open and showing 5 at first.
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const [showAll, setShowAll] = useState<Record<string, boolean>>({});
  const [filter, setFilter] = useState<"all" | "fav" | "recent" | "mine">("all");
  const [refreshKey, setRefreshKey] = useState(0);
  const { favorites, recent, toggleFavorite } = useRoomPrefs();

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  useEffect(() => {
    if (!user) return;
    getDocs(query(collection(db, "rooms"), where("category", "==", "user")))
      .then((snap) =>
        setUserRooms(
          snap.docs
            .map((d) => ({
              name: String(d.get("name") || d.id),
              description: String(d.get("description") || ""),
              ownerName: String(d.get("ownerName") || ""),
              ownerUid: String(d.get("ownerUid") || ""),
              maxUsers: Number(d.get("maxUsers") || 50),
              capped:
                typeof d.get("capacityEnforced") === "boolean"
                  ? d.get("capacityEnforced") === true
                  : d.get("capacityByLevel") === true,
            }))
            .sort((a, b) => a.name.localeCompare(b.name))
        )
      )
      .catch((err) => console.error(err));
    getDoc(doc(db, "users", user.uid))
      .then((snap) => setLevel(Number(snap.get("level") || 1)))
      .catch(() => {});
  }, [user]);

  // How many are in each room now (fresh presence, like the app's list) and each room's capacity.
  const userRoomNames = userRooms.map((r) => r.name).join("|");
  useEffect(() => {
    if (!user) return;
    const names = Array.from(new Set([...OFFICIAL_COUNTRY_ROOMS, ...OFFICIAL_GAME_ROOMS, LUXURY_BET_ROOM, ...userRooms.map((r) => r.name)]));
    const cutoff = Timestamp.fromMillis(Date.now() - ROOM_PRESENCE_STALE_MS);
    names.forEach((name) => {
      getCountFromServer(query(collection(db, "room_presence", name, "users"), where("lastSeen", ">=", cutoff)))
        .then((c) => setCounts((prev) => ({ ...prev, [name]: c.data().count })))
        .catch(() => {});
    });
    getDocs(collection(db, "rooms"))
      .then((snap) => {
        const m: Record<string, number> = {};
        snap.docs.forEach((d) => {
          const max = Number(d.get("maxUsers") || 0);
          if (max > 0) m[String(d.get("name") || d.id)] = max;
        });
        setMaxes(m);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, userRoomNames, refreshKey]);

  const myRooms = userRooms.filter((r) => user && r.ownerUid === user.uid);
  const isFounder = isMainFounderName(username);

  const create = async () => {
    if (!user || creating) return;
    const room = newName.trim();
    const description = newDesc.trim().slice(0, 300);
    setCreateError("");
    if (level < MIN_LEVEL_TO_CREATE)
      return setCreateError(`You need to reach Level ${MIN_LEVEL_TO_CREATE} to create a chat room.`);
    if (!isFounder && myRooms.length >= MAX_ROOMS_PER_USER)
      return setCreateError(`You can create up to ${MAX_ROOMS_PER_USER} rooms.`);
    if (room.length < MIN_NAME || room.length > MAX_NAME)
      return setCreateError(`Room name must be ${MIN_NAME} to ${MAX_NAME} characters.`);
    // The name is the Firestore document id.
    if (room.includes("/") || room === "." || room === ".." || (room.startsWith("__") && room.endsWith("__")))
      return setCreateError("That room name isn't allowed. Please use letters, numbers or spaces.");
    if (isBannedRoomName(room)) return setCreateError("This room name isn't allowed. Please choose a clean name.");
    const all = [...OFFICIAL_COUNTRY_ROOMS, ...OFFICIAL_GAME_ROOMS, LUXURY_BET_ROOM, ...userRooms.map((r) => r.name)];
    if (all.some((n) => n.toLowerCase() === room.toLowerCase())) return setCreateError("This room already exists.");

    setCreating(true);
    try {
      const ref = doc(db, "rooms", room);
      if ((await getDoc(ref)).exists()) {
        setCreating(false);
        return setCreateError("This room already exists.");
      }
      const data = {
        name: room,
        description,
        category: "user",
        ownerUid: user.uid,
        ownerName: username,
        // A room made by migwith is Public; anybody else's is Private.
        privacy: isFounder ? "Public" : "Private",
        maxUsers: isFounder ? 50 : capacityForLevel(level),
        capacityByLevel: !isFounder,
        capacityEnforced: !isFounder,
        members: [user.uid],
        createdAt: serverTimestamp(),
      };
      if (isFounder) {
        await setDoc(ref, data);
      } else {
        // The rules accept a new room only together with room_counts +1 (max 10).
        const batch = writeBatch(db);
        batch.set(ref, data);
        batch.set(doc(db, "room_counts", user.uid), { count: increment(1) }, { merge: true });
        await batch.commit();
      }
      router.push(roomHref(room));
    } catch (err) {
      console.error(err);
      setCreateError(
        `Room create failed. You may have reached the ${MAX_ROOMS_PER_USER}-room limit or your level is too low.`
      );
      setCreating(false);
    }
  };

  if (loading || !user) {
    return (
      <PageShell light>
        <p className="py-20 text-center text-sm text-[#5B6B8C]">Loading…</p>
      </PageShell>
    );
  }

  // Everything the lists show, filtered by the search box and the pills (the app's RoomsPage).
  const q = search.trim().toLowerCase();
  const byName = new Map<string, UserRoom>(userRooms.map((r) => [r.name, r]));
  const matches = (n: string) => !q || n.toLowerCase().includes(q);
  const live = (n: string) => counts[n] || 0;
  const byLive = (a: string, b: string) => live(b) - live(a);
  const gameSet = new Set([...OFFICIAL_GAME_ROOMS, LUXURY_BET_ROOM]);
  const nonGame = userRooms.filter((r) => !gameSet.has(r.name));
  const byMigwith = (r: UserRoom) => isMainFounderName(r.ownerName);
  const publicSection = Array.from(new Set([...OFFICIAL_COUNTRY_ROOMS, ...nonGame.filter(byMigwith).map((r) => r.name)]))
    .filter((n) => matches(n) && !isBannedRoomName(n))
    .sort(byLive);
  const gameSection = [...gameRooms].sort(byLive);
  const privateSection = Array.from(new Set(nonGame.filter((r) => !byMigwith(r)).map((r) => r.name)))
    .filter((n) => matches(n) && !OFFICIAL_COUNTRY_ROOMS.includes(n) && !isBannedRoomName(n))
    .sort(byLive);
  const hotName = [...OFFICIAL_COUNTRY_ROOMS, ...gameRooms, ...userRooms.map((r) => r.name)]
    .filter((n) => !isBannedRoomName(n))
    .sort(byLive)[0];
  const hotLive = hotName ? live(hotName) : 0;

  const others = {
    fav: { names: favorites.filter(matches), empty: "No favorite rooms yet — tap ☆ on a room." },
    recent: { names: recent.filter(matches), empty: "No recent rooms yet." },
    mine: { names: myRooms.map((r) => r.name).filter(matches), empty: "You haven't created any rooms yet." },
  };
  const subtitle = (name: string) => {
    if (OFFICIAL_COUNTRY_ROOMS.includes(name)) return "Official room";
    if (gameSet.has(name)) return "Game room";
    const owner = byName.get(name)?.ownerName;
    return owner ? `by ${owner}` : "Chat room";
  };
  const gameCapacity = (name: string) =>
    /millionaire/i.test(name) ? 40 : name === "🃏 LowCard Official" ? 30 : name === "🎁 Gift Official" ? 500 : 50;
  const row = (name: string) => (
    <RoomRow
      key={name}
      name={name}
      subtitle={subtitle(name)}
      count={counts[name]}
      max={gameSet.has(name) ? gameCapacity(name) : maxes[name] || byName.get(name)?.maxUsers || 50}
      favorite={favorites.includes(name)}
      onStar={() => toggleFavorite(name)}
    />
  );

  return (
    <PageShell light>
      <section className="mx-auto max-w-2xl space-y-4 px-3 lg:max-w-4xl py-4 sm:px-6">
        {/* Search · create */}
        <div className="flex items-center gap-2">
          <label className="flex min-w-0 flex-1 items-center gap-2 rounded-full border border-[#D5E3F5] bg-white px-4 py-2.5 shadow-sm">
            <span className="text-[#8A9BBC]">⌕</span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search room"
              className="min-w-0 flex-1 bg-transparent text-sm text-[#0B2A5B] outline-none placeholder:text-[#8A9BBC]"
            />
          </label>
          <button
            type="button"
            onClick={() => {
              // Same checks as the app, before the form opens.
              if (level > 0 && level < MIN_LEVEL_TO_CREATE)
                return window.alert(
                  `Can't create a room\n\nYou need to reach Level ${MIN_LEVEL_TO_CREATE} to create a chat room. Your level: ${level}.`
                );
              if (!isFounder && myRooms.length >= MAX_ROOMS_PER_USER)
                return window.alert(
                  `Can't create a room\n\nYou can create up to ${MAX_ROOMS_PER_USER} rooms. You have already created ${myRooms.length}.`
                );
              setShowCreate(true);
              setCreateError("");
            }}
            title="Create Room"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#6FB0FF] to-[#3B7BF0] text-[26px] font-light text-white shadow-[0_3px_8px_rgba(59,123,240,.45)]"
          >
            +
          </button>
        </div>

        {/* Hot now (only while someone is in it) */}
        {hotName && hotLive > 0 && (
          <Link
            href={roomHref(hotName)}
            className="flex items-center gap-3 rounded-3xl bg-gradient-to-r from-[#FFD2B3] via-[#FFB8A8] to-[#FFC7C7] px-[18px] py-4 shadow-[0_6px_14px_rgba(255,154,107,.45)]"
          >
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-[#9A3A1C]">Hot now</p>
              <p data-notranslate className="truncate text-[21px] font-extrabold text-[#5A1E0C]">
                {roomDisplayName(hotName)}
              </p>
              <p className="text-xs text-[#9A3A1C]">
                {hotLive} people · {hotLive >= 20 ? "very active" : "active"}
              </p>
            </div>
            <span className="rounded-full bg-white px-5 py-2 text-[15px] font-bold text-[#D2553A]">Join</span>
          </Link>
        )}

        {/* Official games */}
        <div>
          <p className="mb-2 pl-1 text-[15px] font-bold text-[#0B2A5B]">Official games</p>
          <div className="no-scrollbar -mx-3 flex gap-2.5 overflow-x-auto px-3 pb-1">
            {OFFICIAL_GAME_CARDS.filter(([name]) => name !== LUXURY_BET_ROOM || luxuryBetAccess.canSee).map(([name, label], i) => {
              const [bg, ink] = GAME_PASTELS[i % GAME_PASTELS.length];
              const n = counts[name] ?? 0;
              return (
                <Link
                  key={name}
                  href={roomHref(name)}
                  className="w-[120px] shrink-0 rounded-[20px] border p-3.5 shadow-sm"
                  style={{ background: `linear-gradient(135deg, ${bg}, #FFFFFF80)`, borderColor: `${ink}2E` }}
                >
                  <p data-notranslate className="truncate text-[15px] font-extrabold" style={{ color: ink }}>
                    {label}
                  </p>
                  <p className="flex items-center gap-1.5 text-xs" style={{ color: `${ink}CC` }}>
                    <span className="h-[7px] w-[7px] rounded-full" style={{ background: n > 0 ? "#34C77B" : `${ink}4D` }} />
                    {n} playing
                  </p>
                </Link>
              );
            })}
          </div>
        </div>

        {/* Filter pills + refresh */}
        <div className="no-scrollbar flex gap-2 overflow-x-auto">
          {(
            [
              ["all", "All"],
              ["fav", "Favorites"],
              ["recent", "Recent"],
              ["mine", "My rooms"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setFilter(id)}
              className={`shrink-0 rounded-full border px-[18px] py-2 text-sm ${
                filter === id
                  ? "border-transparent bg-gradient-to-b from-[#6FB0FF] to-[#3B7BF0] font-bold text-white"
                  : "border-[#D3E1F3] bg-white font-medium text-[#0B2A5B]"
              }`}
            >
              {label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setRefreshKey((k) => k + 1)}
            title="Refresh"
            className="shrink-0 rounded-full border border-[#D3E1F3] bg-white px-3.5 py-2 text-sm font-bold text-[#5B6B8C]"
          >
            ↻
          </button>
        </div>

        {showCreate && (
          <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-2 pb-safe sm:items-center"
            onClick={() => !creating && setShowCreate(false)}
          >
            <div
              className="w-full max-w-md space-y-3 rounded-3xl bg-white p-5 text-[#0B2A5B] shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-lg font-black">➕ Create a Chat Room</h2>
              <p className="text-xs text-[#5B6B8C]">
                Level {MIN_LEVEL_TO_CREATE}+ · up to {MAX_ROOMS_PER_USER} rooms · you are Level {level || "…"}
                {!isFounder && level >= MIN_LEVEL_TO_CREATE && ` · holds ${capacityForLevel(level)} people`}
              </p>
              <input
                value={newName}
                onChange={(e) => {
                  setNewName(e.target.value.slice(0, MAX_NAME));
                  setCreateError("");
                }}
                placeholder={`Room name (${MIN_NAME}–${MAX_NAME} characters)`}
                className="w-full rounded-xl border border-[#D5E3F5] bg-[#F4F9FF] px-4 py-3 text-sm outline-none placeholder:text-[#8A9BBC] focus:border-[#2F80ED]"
              />
              <textarea
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value.slice(0, 300))}
                placeholder="Description"
                rows={3}
                className="w-full resize-none rounded-xl border border-[#D5E3F5] bg-[#F4F9FF] px-4 py-3 text-sm outline-none placeholder:text-[#8A9BBC] focus:border-[#2F80ED]"
              />
              {createError && <p className="text-center text-sm text-rose-600">{createError}</p>}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  disabled={creating}
                  className="flex-1 rounded-xl border border-[#D5E3F5] py-3 text-sm font-bold text-[#5B6B8C]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={create}
                  disabled={creating}
                  className="flex-1 rounded-xl bg-[#2F80ED] py-3 text-sm font-black text-white disabled:opacity-50"
                >
                  {creating ? "Creating…" : "Create"}
                </button>
              </div>
              <p className="text-center text-[11px] text-[#8A9BBC]">
                In your room: /kick /ban /unban /lock /silence room /level /mod — type /modhelp
              </p>
            </div>
          </div>
        )}

        {/* Room list */}
        {filter === "all" ? (
          (
            [
              ["public", "Public rooms", publicSection],
              ["game", "Game rooms", gameSection],
              ["private", "Private rooms", privateSection],
            ] as const
          ).map(([key, title, names]) => {
            const open = !closed[key];
            // Public & Private: only the 5 HOTTEST rooms (most people inside),
            // no "Show more" — every other room is found with Search (like the app).
            const topOnly = key === "public" || key === "private";
            const all = topOnly ? !!q : showAll[key];
            return (
              <div key={key} className="space-y-[7px]">
                <button
                  type="button"
                  onClick={() => setClosed((c) => ({ ...c, [key]: open }))}
                  className="flex w-full items-center gap-2 rounded-[14px] bg-gradient-to-r from-[#E2EFFD] to-[#EDE7FB] px-3.5 py-2.5 text-left"
                >
                  <span className="text-[15px] font-bold text-[#0B2A5B]">{title}</span>
                  <span className="rounded-full bg-white/85 px-2 text-xs font-bold leading-5 text-[#5B6B8C]">{names.length}</span>
                  <span className="ml-auto text-base font-bold text-[#5B6B8C]">{open ? "▴" : "▾"}</span>
                </button>
                {open && (
                  <>
                    {names.length === 0 && <p className="py-2 text-center text-[13px] text-[#5B6B8C]">No rooms here.</p>}
                    <ul className="grid gap-[7px] md:grid-cols-2">{(all ? names : names.slice(0, 5)).map(row)}</ul>
                    {topOnly && !q && names.length > 5 && (
                      <p className="py-1.5 text-center text-[11.5px] text-[#5B6B8C]">🔍 Showing the 5 hottest rooms — search to find any other room</p>
                    )}
                    {!topOnly && names.length > 5 && (
                      <button
                        type="button"
                        onClick={() => setShowAll((s) => ({ ...s, [key]: !all }))}
                        className="w-full py-2 text-center text-[13px] font-bold text-[#3B7BF0]"
                      >
                        {all ? "Show less ▴" : `Show more (${names.length - 5}) ▾`}
                      </button>
                    )}
                  </>
                )}
              </div>
            );
          })
        ) : others[filter].names.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-[#5B6B8C]">{others[filter].empty}</p>
        ) : (
          <ul className="grid gap-[7px] md:grid-cols-2">{others[filter].names.map(row)}</ul>
        )}
      </section>
    </PageShell>
  );
}

const OFFICIAL_GAME_CARDS: [string, string][] = [
  ["🏏 Cricket Official", "Cricket"],
  ["🎴 Teen Patti Official", "Teen Patti"],
  ["🎲 Ludo Bot Official", "Ludo"],
  ["🎲 Ludo Bot Free", "Ludo Free"],
  ["👑 MIG Royale Official", "MIG Royale"],
  ["🃏 29 Official", "29 Card"],
  ["🃏 29 Card Free", "29 Card Free"],
  ["🧠 Trivia Official", "Trivia"],
  ["👻 Luxury Bot Official", "Luxury Bot"],
  ["🎰 Luxury Bet", "Luxury Bet"],
  ["🃏 LowCard Official", "LowCard"],
  ["🎁 Gift Official", "Gift"],
];

const GAME_PASTELS: [string, string][] = [
  ["#D7F4E6", "#178A5A"],
  ["#FCE1EC", "#C2336E"],
  ["#DDEBFD", "#2F6BD6"],
  ["#EFE3FD", "#7B45C9"],
  ["#FFF0D6", "#B7791F"],
  ["#FFE4DC", "#D2553A"],
];

// The app's LightRoomCard.
function RoomRow({
  name,
  subtitle,
  count,
  max,
  favorite,
  onStar,
}: {
  name: string;
  subtitle: string;
  count: number | undefined;
  max: number;
  favorite: boolean;
  onStar: () => void;
}) {
  const n = count ?? 0;
  return (
    <li>
      <Link
        href={roomHref(name)}
        className="flex items-center gap-2 rounded-[14px] border border-[#E1EAF6] bg-white px-3.5 py-[9px] shadow-[0_1px_3px_rgba(156,194,236,.6)] hover:bg-[#F7FBFF]"
      >
        <span className="min-w-0 flex-1">
          <span data-notranslate className="flex items-center gap-1.5 text-sm font-semibold text-[#0B2A5B]">
            <span className="truncate">{roomDisplayName(name)}</span>
            {n > 0 && <span className="h-[7px] w-[7px] shrink-0 rounded-full bg-[#6FCFA4]" />}
          </span>
          <span data-notranslate className="block truncate text-xs text-[#5B6B8C]">
            {subtitle}
          </span>
        </span>
        <span className={`shrink-0 text-[13px] font-semibold ${n > 0 ? "text-[#0B2A5B]" : "text-[#5B6B8C]"}`}>
          {count === undefined ? "…" : n}/{max}
        </span>
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            onStar();
          }}
          aria-label={favorite ? "Remove from favorites" : "Add to favorites"}
          className={`shrink-0 pl-2.5 text-base ${favorite ? "text-[#F2B53A]" : "text-[#5B6B8C]/60"}`}
        >
          {favorite ? "★" : "☆"}
        </button>
      </Link>
    </li>
  );
}
