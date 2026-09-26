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
} from "../../lib/rooms";
import { useRoomPrefs } from "../../lib/roomPrefs";
import { PageShell } from "../_components/PageShell";

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
  const [listOpen, setListOpen] = useState(true);
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
    const names = Array.from(new Set([...OFFICIAL_COUNTRY_ROOMS, ...OFFICIAL_GAME_ROOMS, ...userRooms.map((r) => r.name)]));
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
  const isFounder = username.trim().toLowerCase() === "migwith";

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
    const all = [...OFFICIAL_COUNTRY_ROOMS, ...OFFICIAL_GAME_ROOMS, ...userRooms.map((r) => r.name)];
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

  // Everything the lists show, filtered by the search box and the pills.
  const q = search.trim().toLowerCase();
  const byName = new Map<string, UserRoom>(userRooms.map((r) => [r.name, r]));
  const allNames = Array.from(new Set([...OFFICIAL_COUNTRY_ROOMS, ...OFFICIAL_GAME_ROOMS, ...userRooms.map((r) => r.name)]));
  const known = new Set(allNames);
  const f = (names: string[]) => names.filter((n) => known.has(n) && (!q || n.toLowerCase().includes(q)));
  const hotName =
    [...allNames].sort((a, b) => (counts[b] || 0) - (counts[a] || 0)).find((n) => (counts[n] || 0) > 0) ||
    OFFICIAL_COUNTRY_ROOMS[0];
  const userList = [...userRooms]
    .sort((a, b) => (counts[b.name] || 0) - (counts[a.name] || 0) || a.name.localeCompare(b.name))
    .map((r) => r.name);

  const lists = {
    all: { title: "Public rooms", names: f([...OFFICIAL_COUNTRY_ROOMS, ...userList]), empty: "No rooms match your search." },
    fav: { title: "Favorite Rooms", names: f(favorites), empty: "Tap ☆ on a room to keep it here." },
    recent: { title: "Recent Rooms", names: f(recent), empty: "Rooms you visit show up here." },
    mine: { title: "My rooms", names: f(myRooms.map((r) => r.name)), empty: "You haven't created a room yet." },
  };
  const list = lists[filter];
  const subtitle = (name: string) => {
    if (OFFICIAL_COUNTRY_ROOMS.includes(name)) return "Official room";
    if (OFFICIAL_GAME_ROOMS.includes(name)) return "Official game";
    const r = byName.get(name);
    return r?.description || (r?.ownerName ? `by ${r.ownerName}` : "User room");
  };

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
            onClick={() => setRefreshKey((k) => k + 1)}
            title="Refresh"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-lg text-[#2F80ED] shadow-sm"
          >
            ↻
          </button>
          <button
            type="button"
            onClick={() => {
              setShowCreate(true);
              setCreateError("");
            }}
            title="Create Room"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-[#2F80ED] text-2xl text-white shadow-md"
          >
            +
          </button>
        </div>

        {/* Hot now */}
        <div className="flex items-center gap-3 rounded-3xl bg-gradient-to-r from-[#FBC9B6] to-[#FDE1D4] px-5 py-4 shadow-sm">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-[#B4533A]">Hot now</p>
            <p data-notranslate className="truncate text-xl font-black text-[#5A2314]">
              {hotName}
            </p>
            <p className="text-xs text-[#8A4A38]">{counts[hotName] ?? 0} people · active</p>
          </div>
          <Link href={roomHref(hotName)} className="rounded-full bg-white px-5 py-2 text-sm font-bold text-[#D9481E] shadow">
            Join
          </Link>
        </div>

        {/* Official games */}
        <div>
          <p className="mb-2 text-sm font-bold text-[#0B2A5B]">Official games</p>
          <div className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1">
            {OFFICIAL_GAME_ROOMS.map((name, i) => {
              const c = GAME_COLORS[i % GAME_COLORS.length];
              const n = counts[name] ?? 0;
              const label = name.replace(/^\P{L}+/u, "").replace(/\s*Official$/i, "");
              return (
                <Link
                  key={name}
                  href={roomHref(name)}
                  className="w-32 shrink-0 rounded-2xl border px-3 py-2.5 shadow-sm"
                  style={{ backgroundColor: c.bg, borderColor: c.border }}
                >
                  <p data-notranslate className="truncate text-sm font-bold" style={{ color: c.text }}>
                    {label}
                  </p>
                  <p className="text-[11px] text-[#6B7A99]">
                    <span className={n > 0 ? "text-emerald-500" : "text-[#9AA8C2]"}>●</span> {n} playing
                  </p>
                </Link>
              );
            })}
          </div>
        </div>

        {/* Filter pills */}
        <div className="flex gap-2 overflow-x-auto">
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
              className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold shadow-sm ${
                filter === id ? "bg-[#2F80ED] text-white" : "bg-white text-[#0B2A5B]"
              }`}
            >
              {label}
            </button>
          ))}
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
        <div>
          <button
            type="button"
            onClick={() => setListOpen((v) => !v)}
            className="flex w-full items-center gap-2 rounded-xl bg-[#E4EEFB] px-3 py-2 text-left"
          >
            <span className="text-sm font-bold text-[#0B2A5B]">{list.title}</span>
            <span className="rounded-full bg-white px-2 text-xs font-bold leading-5 text-[#5B6B8C]">{list.names.length}</span>
            <span className={`ml-auto text-[#5B6B8C] transition ${listOpen ? "" : "rotate-180"}`}>▴</span>
          </button>
          {listOpen && (
            <ul className="mt-2 grid gap-2 md:grid-cols-2">
              {list.names.length === 0 && <li className="px-3 py-3 text-sm text-[#5B6B8C]">{list.empty}</li>}
              {list.names.map((name) => (
                <RoomRow
                  key={name}
                  name={name}
                  subtitle={subtitle(name)}
                  count={counts[name]}
                  max={maxes[name] || byName.get(name)?.maxUsers || 50}
                  mine={byName.get(name)?.ownerUid === user.uid}
                  favorite={favorites.includes(name)}
                  onStar={() => toggleFavorite(name)}
                />
              ))}
            </ul>
          )}
        </div>
      </section>
    </PageShell>
  );
}

const GAME_COLORS = [
  { bg: "#E6F7EC", border: "#B7E4C7", text: "#1E8C4E" },
  { bg: "#FDE7EF", border: "#F6BFD2", text: "#C2185B" },
  { bg: "#E6F0FD", border: "#BFD7F7", text: "#1E63C7" },
  { bg: "#FFF3E0", border: "#FFD9A8", text: "#D9730D" },
  { bg: "#F1E8FD", border: "#D9C4F7", text: "#7B3FC7" },
];

function RoomRow({
  name,
  subtitle,
  count,
  max,
  mine,
  favorite,
  onStar,
}: {
  name: string;
  subtitle: string;
  count: number | undefined;
  max: number;
  mine: boolean;
  favorite: boolean;
  onStar: () => void;
}) {
  const n = count ?? 0;
  return (
    <li>
      <Link
        href={roomHref(name)}
        className="flex items-center gap-3 rounded-2xl border border-[#E3ECF7] bg-white px-4 py-3 shadow-sm hover:bg-[#F4F9FF]"
      >
        <span className="min-w-0 flex-1">
          <span data-notranslate className="flex items-center gap-1.5 font-bold text-[#0B2A5B]">
            <span className="truncate">{name}</span>
            {mine && <span className="text-sm">👑</span>}
            <span className={`h-2 w-2 shrink-0 rounded-full ${n > 0 ? "bg-emerald-500" : "bg-[#C5D0E0]"}`} />
          </span>
          <span data-notranslate className="block truncate text-xs text-[#6B7A99]">
            {subtitle}
          </span>
        </span>
        <span className="shrink-0 text-sm font-semibold text-[#0B2A5B]">
          {count === undefined ? "…" : n}/{max}
        </span>
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            onStar();
          }}
          aria-label={favorite ? "Remove from favorites" : "Add to favorites"}
          className={`shrink-0 px-1 text-xl ${favorite ? "text-amber-400" : "text-[#B5C2D6] hover:text-amber-400"}`}
        >
          {favorite ? "★" : "☆"}
        </button>
      </Link>
    </li>
  );
}
