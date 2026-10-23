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
import { useComeBackInFromLists } from "../../lib/openRooms";
import { useCurrentUser } from "../../lib/useCurrentUser";
import {
  OFFICIAL_COUNTRY_ROOMS,
  OFFICIAL_GAME_ROOMS,
  ROOM_PRESENCE_STALE_MS,
  roomHref,
  roomListName,
  LUXURY_BOT_REMOVED_ROOM,
} from "../../lib/rooms";
import { useRoomPrefs } from "../../lib/roomPrefs";
import { PageShell } from "../_components/PageShell";
import { isMainFounderName } from "../../lib/founder";
import { LUXURY_BET_ROOM, useLuxuryBetAccess } from "../_components/LuxuryBet";
import { useIsClassic } from "../../lib/uiStyle";
import { RefreshButton } from "../_components/RefreshButton";

/** A Firestore Timestamp (or anything else) as milliseconds; 0 when missing. */
function toMillisSafe(v: unknown): number {
  return v && typeof (v as { toMillis?: unknown }).toMillis === "function" ? (v as { toMillis: () => number }).toMillis() : 0;
}

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

// ⚡ What this list last showed, kept while the tab is open: swiping back to
// Rooms shows it at once (no "0/50" while it counts again), and re-reads only
// after ROOMS_FRESH_MS or a ↻.
const ROOMS_FRESH_MS = 30_000;
const roomsMemory: {
  uid: string;
  userRooms: UserRoom[];
  listAt: number;
  level: number;
  counts: Record<string, number>;
  maxes: Record<string, number>;
  countKey: string;
  countAt: number;
} = { uid: "", userRooms: [], listAt: 0, level: 0, counts: {}, maxes: {}, countKey: "", countAt: 0 };

export default function RoomsPage() {
  const router = useRouter();
  const { user, username, loading } = useCurrentUser();
  // ⏰ tapping a room you were auto left from = coming back in
  useComeBackInFromLists(user?.uid);
  // 🎰 Luxury Bet shows only for the IDs miglife added (or everyone once open).
  const luxuryBetAccess = useLuxuryBetAccess(user?.uid);
  const gameRooms = luxuryBetAccess.canSee
    ? [LUXURY_BET_ROOM, ...OFFICIAL_GAME_ROOMS]
    : OFFICIAL_GAME_ROOMS;
  const [userRooms, setUserRooms] = useState<UserRoom[]>(roomsMemory.userRooms);
  const [search, setSearch] = useState("");
  const [level, setLevel] = useState(roomsMemory.level);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [counts, setCounts] = useState<Record<string, number>>(roomsMemory.counts);
  const [maxes, setMaxes] = useState<Record<string, number>>(roomsMemory.maxes);
  const [refreshKey, setRefreshKey] = useState(0);
  const [classicOpen, setClassicOpen] = useState<Record<string, boolean>>({});
  const [modernOpen, setModernOpen] = useState<Record<string, boolean>>({});
  // Which folders show ALL their rooms (the ⌄ button under the top 5).
  const [showAll, setShowAll] = useState<Record<string, boolean>>({});
  // 🔥 Hot now's ↻ moves on to the next 5 busy rooms (the rest stay under ⌄)
  const [hotOffset, setHotOffset] = useState(0);
  const classic = useIsClassic();
  const { favorites, recent, toggleFavorite } = useRoomPrefs();

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  useEffect(() => {
    if (!user) return;
    // ⚡ Just read (a swipe back here): keep what is shown, no new reads.
    if (roomsMemory.uid === user.uid && Date.now() - roomsMemory.listAt < ROOMS_FRESH_MS) return;
    getDocs(query(collection(db, "rooms"), where("category", "==", "user")))
      .then((snap) => {
        const list = snap.docs
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
            // 👻 Luxury Bot Official was removed from the app — never list it.
            .filter((r) => r.name !== LUXURY_BOT_REMOVED_ROOM)
            .sort((a, b) => a.name.localeCompare(b.name));
        Object.assign(roomsMemory, { uid: user.uid, userRooms: list, listAt: Date.now() });
        setUserRooms(list);
      })
      .catch((err) => console.error(err));
    getDoc(doc(db, "users", user.uid))
      .then((snap) => {
        const lv = Number(snap.get("level") || 1);
        roomsMemory.level = lv;
        setLevel(lv);
      })
      .catch(() => {});
  }, [user]);

  // How many are in each room now (fresh presence, like the app's list) and each room's capacity.
  const userRoomNames = userRooms.map((r) => r.name).join("|");
  useEffect(() => {
    if (!user) return;
    // ⚡ Counted a moment ago (a swipe back here) and not ↻: show those numbers.
    const countKey = `${user.uid}|${userRoomNames}|${refreshKey}`;
    if (roomsMemory.countKey === countKey && Date.now() - roomsMemory.countAt < ROOMS_FRESH_MS) return;
    roomsMemory.countKey = countKey;
    roomsMemory.countAt = Date.now();
    const names = Array.from(new Set([...OFFICIAL_COUNTRY_ROOMS, ...OFFICIAL_GAME_ROOMS, LUXURY_BET_ROOM, ...userRooms.map((r) => r.name)]));
    const cutoff = Timestamp.fromMillis(Date.now() - ROOM_PRESENCE_STALE_MS);
    names.forEach((name) => {
      const users = collection(db, "room_presence", name, "users");
      // Like the app's list: fresh heartbeats PLUS /parked spots (paid — they
      // stay listed until parkedUntil passes, however old lastSeen is).
      Promise.all([
        getCountFromServer(query(users, where("lastSeen", ">=", cutoff))),
        getDocs(query(users, where("parkedUntil", ">", Date.now()))).catch(() => null),
      ])
        .then(([c, parked]) => {
          const extra = parked ? parked.docs.filter((d) => toMillisSafe(d.get("lastSeen", { serverTimestamps: "estimate" })) < cutoff.toMillis()).length : 0;
          roomsMemory.counts = { ...roomsMemory.counts, [name]: c.data().count + extra };
          setCounts((prev) => ({ ...prev, [name]: c.data().count + extra }));
        })
        .catch(() => {});
    });
    getDocs(collection(db, "rooms"))
      .then((snap) => {
        const m: Record<string, number> = {};
        snap.docs.forEach((d) => {
          const max = Number(d.get("maxUsers") || 0);
          if (max > 0) m[String(d.get("name") || d.id)] = max;
        });
        roomsMemory.maxes = m;
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
        `Room creation failed. You may have reached the ${MAX_ROOMS_PER_USER}-room limit or your level is too low.`
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

  const tryCreate = () => {
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
  };
  const roomMax = (name: string) => (gameSet.has(name) ? gameCapacity(name) : maxes[name] || byName.get(name)?.maxUsers || 50);

  const createDialog = (
    <>
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

    </>
  );

  // 📟 CLASSIC style: search + Create + refresh, then plain ▼/► folders with
  // "Room (4/30)" lines. Favorites, Recent and Public start open. Each folder
  // (except Favorites) shows only its 5 busiest rooms; Search finds the rest.
  // While searching every folder opens.
  if (classic) {
    const sections: [string, string, string[]][] = [
      ["fav", "Favorites", others.fav.names],
      ["recent", "Recent", others.recent.names],
      ["mine", "My Rooms", others.mine.names],
      ["game", "Game Rooms", gameSection.filter(matches)],
      ["public", "Public Rooms", publicSection],
      ["private", "Private Rooms", privateSection],
    ];
    return (
      <PageShell light>
        <section className="mx-auto min-h-[calc(100dvh-64px)] max-w-2xl bg-white pb-6 text-[#16315F] lg:max-w-4xl">
          <div className="flex items-center gap-1.5 border-b border-[#D5DCE6] bg-[#EFF2F6] px-2 py-[7px]">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="🔍 Search room"
              className="h-9 min-w-0 flex-1 rounded border border-[#B9C4D2] bg-white px-2.5 text-sm text-[#16315F] outline-none placeholder:text-[#8A97A8]"
            />
            <button
              type="button"
              onClick={tryCreate}
              className="h-9 shrink-0 rounded bg-gradient-to-b from-[#FF9D2E] to-[#F07A00] px-3 text-[13px] font-bold text-white"
            >
              + Create
            </button>
            <RefreshButton
              onClick={() => setRefreshKey((k) => k + 1)}
              className="h-9 w-9 shrink-0 rounded border border-[#B9C4D2] bg-white text-base font-bold text-[#4A5F7E]"
            />
          </div>
          {sections.map(([key, title, allRooms]) => {
            const isOpen = !!q || (key in classicOpen ? classicOpen[key] : key === "fav" || key === "recent" || key === "public");
            const limited = key !== "fav" && !q && allRooms.length > 5;
            const expanded = !!showAll[key];
            const rooms = limited ? [...allRooms].sort(byLive).slice(0, expanded ? undefined : 5) : allRooms;
            return (
              <div key={key}>
                <button
                  type="button"
                  onClick={() => setClassicOpen((o) => ({ ...o, [key]: !isOpen }))}
                  className="flex w-full items-center border-b border-[#D5DCE6] bg-gradient-to-b from-[#E9EEF4] to-[#D6DEE8] px-2.5 py-2 text-left"
                >
                  <span className="w-[18px] text-[11px] text-[#2F6ABD]">{isOpen ? "▼" : "►"}</span>
                  <span className="text-sm font-bold">
                    {title}
                  </span>
                </button>
                {isOpen && (
                  <>
                    {rooms.length === 0 && (
                      <p className="border-b border-[#D5DCE6] py-[7px] pl-8 text-[13px] italic text-[#8A97A8]">No rooms</p>
                    )}
                    {rooms.map((name) => {
                      const users = counts[name] ?? 0;
                      const fav = favorites.includes(name);
                      return (
                        <div key={name} className="relative flex items-center after:absolute after:bottom-0 after:left-8 after:right-0 after:h-px after:bg-[#D5DCE6]">
                          <Link href={roomHref(name)} className="flex min-w-0 flex-1 items-center py-2.5 pl-3">
                            <span className="relative h-4 w-4 shrink-0">
                              <span className="flex h-4 w-4 items-center justify-center rounded-[3px] bg-gradient-to-b from-[#FF9D2E] to-[#F07A00] text-[9px] font-bold text-white">
                                #
                              </span>
                              {users > 0 && (
                                <span className="absolute -bottom-0.5 -right-0.5 h-[7px] w-[7px] rounded-full border border-white bg-[#3CC24A]" />
                              )}
                            </span>
                            <span data-notranslate className="ml-2 min-w-0 truncate text-[15px]">
                              {roomListName(name)}
                            </span>
                            <span className={`shrink-0 whitespace-pre text-sm ${users > 0 ? "font-bold text-[#2E9B3A]" : "text-[#8A97A8]"}`}>
                              {` (${users}/${roomMax(name)})`}
                            </span>
                          </Link>
                          <button
                            type="button"
                            onClick={() => toggleFavorite(name)}
                            aria-label={fav ? "Remove from favorites" : "Add to favorites"}
                            className={`flex h-10 w-10 shrink-0 items-center justify-center text-lg ${fav ? "text-[#F07A00]" : "text-[#A9B4C2]"}`}
                          >
                            {fav ? "★" : "☆"}
                          </button>
                        </div>
                      );
                    })}
                    {limited && (
                      // ▼ small button, centred: opens / closes the rest of the folder
                      <div className="relative flex items-center justify-center py-1.5">
                        <span className="absolute left-8 right-8 top-1/2 h-px bg-[#D5DCE6]" />
                        <button
                          type="button"
                          onClick={() => setShowAll((o) => ({ ...o, [key]: !expanded }))}
                          aria-label={expanded ? "Show fewer rooms" : "Show all rooms"}
                          className="relative flex h-[22px] w-11 items-center justify-center rounded border border-[#B9C4D2] bg-gradient-to-b from-[#4F86C6] to-[#2F5F9E] text-[10px] text-white"
                        >
                          <span className={`transition-transform duration-[250ms] ${expanded ? "rotate-180" : ""}`}>▼</span>
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </section>
        {createDialog}
      </PageShell>
    );
  }

  // ✨ MODERN Chat Rooms list (the app's ModernRoomsList): the same folders as
  // Classic (Favorites, Recent, My Rooms, Game, Public, Private — 5 busiest
  // each, Search finds the rest, and 🔥 Hot now at the bottom), each
  // folder as a rounded card with an icon tile, a count chip and a turning
  // arrow, and every room a row with a colour avatar, live dot and "4/30" pill.
  const sections: [string, string, string[]][] = [
    ["fav", "Favorites", others.fav.names],
    ["recent", "Recent", others.recent.names],
    ["mine", "My Rooms", others.mine.names],
    ["game", "Game Rooms", gameSection.filter(matches)],
    ["public", "Public Rooms", publicSection],
    ["private", "Private Rooms", privateSection],
  ];
  const LOOK: Record<string, [string, string]> = {
    hot: ["🔥", "#FF6B3D"],
    fav: ["⭐", "#F5A623"],
    recent: ["🕘", "#3B7BF0"],
    mine: ["🏠", "#22A06B"],
    game: ["🎮", "#7B5CF0"],
    public: ["🌍", "#1FA2B8"],
    private: ["🔐", "#E5484D"],
  };
  // every room with people, busiest first; ↻ turns the list by 5 so the
  // next busy rooms come to the top (the rest stay under the ⌄ below)
  const hotAll = Array.from(new Set(sections.flatMap(([, , names]) => names)))
    .filter((n) => live(n) > 0)
    .sort(byLive);
  const hotStart = hotAll.length > 5 ? hotOffset % hotAll.length : 0;
  const hot = [...hotAll.slice(hotStart), ...hotAll.slice(0, hotStart)];
  // 🔥 Hot now is a normal folder like the others, at the bottom (no coloured
  // strip on top any more); only shown while rooms have people.
  const shownSections: [string, string, string[]][] = hot.length > 0 && !q ? [...sections, ["hot", "Hot now", hot]] : sections;
  return (
    <PageShell light>
      {/* 🦋 the Lobby's butterfly picture, very faint, behind the room list */}
      <div
        aria-hidden
        className="rooms-butterfly pointer-events-none fixed inset-0 z-0"
        style={{
          backgroundImage: "linear-gradient(rgba(255,255,255,.86), rgba(255,255,255,.86)), url(/lobby-bg.webp)",
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      />
      <section className="relative z-[1] mx-auto min-h-[calc(100dvh-64px)] max-w-2xl space-y-2.5 px-3 pb-6 pt-2.5 lg:max-w-4xl">
        {/* search + create + refresh */}
        <div className="flex items-center">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="🔍  Search any room"
            className="glass-shine h-[46px] min-w-0 flex-1 rounded-full bg-white px-4 text-sm font-semibold text-[#0B2A5B] shadow-[0_2px_6px_rgba(0,0,0,.1)] outline-none placeholder:font-normal placeholder:text-[#6B7A99]"
          />
          <button
            type="button"
            onClick={tryCreate}
            title="Create Room"
            className="glass-shine ml-2 flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#6FB0FF] via-[#3B7BF0] to-[#7B5CF0] text-[26px] font-light text-white shadow-[0_3px_8px_rgba(59,123,240,.45)]"
          >
            +
          </button>
          <RefreshButton
            onClick={() => setRefreshKey((k) => k + 1)}
            className="glass-bubble glass-shine ml-1.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-[17px] font-bold text-[#6B7A99]"
          />
        </div>

        {shownSections.map(([key, title, allRooms]) => {
          const isOpen = !!q || (key in modernOpen ? modernOpen[key] : key === "fav" || key === "recent" || key === "public" || key === "game" || key === "hot");
          const limited = key !== "fav" && !q && allRooms.length > 5;
          const expanded = !!showAll[key];
          const rooms = limited ? (key === "hot" ? allRooms : [...allRooms].sort(byLive)).slice(0, expanded ? undefined : 5) : allRooms;
          const [icon, accent] = LOOK[key];
          return (
            <div key={key} className="overflow-hidden rounded-[18px] bg-white" style={{ boxShadow: `0 3px 10px ${accent}40` }}>
              <div className="flex items-center pr-3" style={{ background: `linear-gradient(90deg, ${accent}1A, transparent)` }}>
                <button
                  type="button"
                  onClick={() => setModernOpen((o) => ({ ...o, [key]: !isOpen }))}
                  className="flex min-w-0 flex-1 items-center py-2.5 pl-3 text-left"
                >
                  <span className="glass-shine flex h-8 w-8 items-center justify-center rounded-[10px] text-base" style={{ background: `${accent}29` }}>
                    {icon}
                  </span>
                  <span className="ml-2.5 text-[15px] font-extrabold text-[#0B2A5B]">{title}</span>
                  <span className={`ml-auto text-[22px] font-bold text-[#6B7A99] transition-transform ${isOpen ? "rotate-90" : ""}`}>›</span>
                </button>
                {/* 🔥 Hot now: its own ↻ — the live numbers count again and the
                    next 5 busy rooms come to the top */}
                {key === "hot" && (
                  <RefreshButton
                    onClick={() => {
                      setHotOffset((o) => o + 5);
                      setRefreshKey((k) => k + 1);
                    }}
                    className="glass-bubble glass-shine ml-2 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-[15px] font-bold text-[#FF6B3D] shadow-sm"
                  />
                )}
              </div>
              {isOpen && (
                <>
                  {rooms.length === 0 && <p className="pb-3 pl-[54px] pt-1 text-[12.5px] text-[#6B7A99]">No rooms here yet</p>}
                  {rooms.map((name, i) => {
                    const users = counts[name] ?? 0;
                    const fav = favorites.includes(name);
                    const shown = roomListName(name);
                    const letter = (shown.match(/[\p{L}\p{N}]/u)?.[0] || "#").toUpperCase();
                    return (
                      <div key={name} className="px-2 py-[3px]">
                        {/* 🫧 every room is its own clear glass card, like the app */}
                        <div
                          className="flex items-center rounded-[14px] border border-white/90 py-2 pl-2.5 pr-1 backdrop-blur-sm"
                          style={{
                            background: "linear-gradient(135deg, rgba(255,255,255,0.55), rgba(255,255,255,0.18))",
                            boxShadow: `0 1px 2px ${accent}2E`,
                          }}
                        >
                          <Link href={roomHref(name)} className="flex min-w-0 flex-1 items-center">
                            <span className="relative h-10 w-10 shrink-0">
                              <span
                                className="glass-shine flex h-10 w-10 items-center justify-center rounded-[13px] text-[17px] font-extrabold text-white"
                                style={{ background: `linear-gradient(135deg, ${accent}D9, ${accent}8C)` }}
                              >
                                {letter}
                              </span>
                              {users > 0 && (
                                <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white bg-[#34C77B]" />
                              )}
                            </span>
                            <span className="ml-3 min-w-0 flex-1">
                              <span data-notranslate className="block truncate text-[14.5px] font-bold text-[#0B2A5B]">
                                {shown}
                              </span>
                              <span className="block truncate text-[11.5px] text-[#6B7A99]">{subtitle(name)}</span>
                            </span>
                            <span
                              className={`glass-shine shrink-0 rounded-full px-[9px] py-[3px] text-[11.5px] font-extrabold ${
                                users > 0 ? "bg-[#DDF6E8] text-[#15824B]" : "bg-[#F0F3F8] text-[#6B7A99]"
                              }`}
                            >
                              {users}/{roomMax(name)}
                            </span>
                          </Link>
                          <button
                            type="button"
                            onClick={() => toggleFavorite(name)}
                            aria-label={fav ? "Remove from favorites" : "Add to favorites"}
                            className={`flex h-[38px] w-[38px] shrink-0 items-center justify-center text-[19px] ${fav ? "text-[#F5A623]" : "text-[#B4C0D0]"}`}
                          >
                            {fav ? "★" : "☆"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {limited ? (
                    // ⌄ round arrow button, centred: opens / closes the rest
                    <div className="relative flex items-center justify-center pb-2.5 pt-1">
                      <span
                        className="absolute left-6 right-6 top-1/2 h-px"
                        style={{ background: `linear-gradient(90deg, transparent, ${accent}40, transparent)` }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowAll((o) => ({ ...o, [key]: !expanded }))}
                        aria-label={expanded ? "Show fewer rooms" : "Show all rooms"}
                        className="glass-shine relative flex h-[30px] w-[30px] items-center justify-center rounded-full text-[20px] font-black leading-none text-white"
                        style={{ background: `linear-gradient(135deg, ${accent}D9, ${accent})`, boxShadow: `0 2px 6px ${accent}80` }}
                      >
                        <span className={`-mt-0.5 transition-transform duration-300 ${expanded ? "-rotate-90" : "rotate-90"}`}>›</span>
                      </button>
                    </div>
                  ) : (
                    <div className="h-1.5" />
                  )}
                </>
              )}
            </div>
          );
        })}
      </section>
      {createDialog}
    </PageShell>
  );
}
