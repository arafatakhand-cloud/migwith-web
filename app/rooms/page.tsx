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
  const [closed, setClosed] = useState<Record<string, boolean>>({});
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
      <PageShell>
        <p className="py-20 text-center text-sm text-white/40">Loading…</p>
      </PageShell>
    );
  }

  // Everything the lists show, filtered by the search box.
  const q = search.trim().toLowerCase();
  const byName = new Map<string, UserRoom>(userRooms.map((r) => [r.name, r]));
  const allNames = Array.from(new Set([...OFFICIAL_COUNTRY_ROOMS, ...OFFICIAL_GAME_ROOMS, ...userRooms.map((r) => r.name)]));
  const known = new Set(allNames);
  const f = (names: string[]) => names.filter((n) => known.has(n) && (!q || n.toLowerCase().includes(q)));
  const hot = allNames
    .filter((n) => (counts[n] || 0) > 0)
    .sort((a, b) => (counts[b] || 0) - (counts[a] || 0))
    .slice(0, 5);
  const userList = [...userRooms]
    .sort((a, b) => Number(b.ownerUid === user.uid) - Number(a.ownerUid === user.uid) || (counts[b.name] || 0) - (counts[a.name] || 0))
    .map((r) => r.name);

  const sections: { id: string; title: string; accent: string; names: string[]; empty?: string }[] = [
    { id: "fav", title: "Favorite Rooms", accent: "#F5A524", names: f(favorites), empty: "Tap ☆ on a room to keep it here." },
    { id: "recent", title: "Recent Rooms", accent: "#38BDF8", names: f(recent) },
    { id: "official", title: "Official Rooms", accent: "#818CF8", names: f(OFFICIAL_COUNTRY_ROOMS) },
    { id: "game", title: "Game Rooms", accent: "#C084FC", names: f(OFFICIAL_GAME_ROOMS) },
    { id: "hot", title: "What's Hot", accent: "#F472B6", names: f(hot) },
    { id: "user", title: "User Rooms", accent: "#34D399", names: f(userList) },
  ];

  return (
    <PageShell>
      <section className="mx-auto max-w-2xl space-y-4 px-3 py-4 sm:px-6">
        {/* Search · refresh · create */}
        <div className="flex gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search room"
            className="min-w-0 flex-1 rounded-2xl border border-white/15 bg-[#0e1a47] px-4 py-3 text-sm text-white outline-none placeholder:text-white/40 focus:border-cyan-300/50"
          />
          <button
            type="button"
            onClick={() => setRefreshKey((k) => k + 1)}
            title="Refresh"
            className="flex w-12 items-center justify-center rounded-2xl border border-white/15 bg-[#13245f] text-xl hover:bg-[#1a2f78]"
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
            className="flex w-12 items-center justify-center rounded-2xl border border-white/15 bg-[#1f3a86] text-2xl hover:bg-[#274596]"
          >
            +
          </button>
        </div>

        {showCreate && (
          <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-2 sm:items-center"
            onClick={() => !creating && setShowCreate(false)}
          >
            <div
              className="w-full max-w-md space-y-3 rounded-3xl border border-white/10 bg-[#0b1430] p-5"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-lg font-black">➕ Create a Chat Room</h2>
              <p className="text-xs text-white/45">
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
                className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none placeholder:text-white/25 focus:border-violet-400/60"
              />
              <textarea
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value.slice(0, 300))}
                placeholder="Description"
                rows={3}
                className="w-full resize-none rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none placeholder:text-white/25 focus:border-violet-400/60"
              />
              {createError && <p className="text-center text-sm text-red-300">{createError}</p>}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  disabled={creating}
                  className="flex-1 rounded-xl border border-white/15 py-3 text-sm font-bold text-white/70"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={create}
                  disabled={creating}
                  className="flex-1 rounded-xl bg-violet-600 py-3 text-sm font-black disabled:opacity-50"
                >
                  {creating ? "Creating…" : "Create"}
                </button>
              </div>
              <p className="text-center text-[11px] text-white/35">
                In your room: /kick /ban /unban /lock /silence room /level /mod — type /modhelp
              </p>
            </div>
          </div>
        )}

        {sections.map((sec) =>
          sec.names.length === 0 && !(sec.id === "fav" && !q) ? null : (
            <div key={sec.id} className="overflow-hidden rounded-3xl border border-white/15 bg-[#13245f]/80">
              <div
                className="flex items-center gap-2 border-b border-white/10 bg-[#1c2352]/80 px-4 py-3"
                style={{ boxShadow: `inset 5px 0 0 ${sec.accent}` }}
              >
                <button
                  type="button"
                  onClick={() => setClosed((c) => ({ ...c, [sec.id]: !c[sec.id] }))}
                  className="flex flex-1 items-center gap-2 text-left"
                >
                  <span className="text-[15px] font-black uppercase tracking-wide">{sec.title}</span>
                  {sec.names.length > 0 && (
                    <span
                      className="rounded-full px-2 text-xs font-black leading-5 text-neutral-900"
                      style={{ backgroundColor: sec.accent }}
                    >
                      {sec.names.length}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setRefreshKey((k) => k + 1)}
                  title="Refresh"
                  className="rounded-lg px-2 text-lg"
                  style={{ color: sec.accent }}
                >
                  ↻
                </button>
                <span className="h-5 w-px bg-white/15" />
                <button
                  type="button"
                  onClick={() => setClosed((c) => ({ ...c, [sec.id]: !c[sec.id] }))}
                  className={`px-2 text-white/70 transition ${closed[sec.id] ? "rotate-180" : ""}`}
                >
                  ⌃
                </button>
              </div>
              {!closed[sec.id] && (
                <ul className="p-2">
                  {sec.names.length === 0 && <li className="px-3 py-3 text-sm text-white/45">{sec.empty}</li>}
                  {sec.names.map((name) => (
                    <RoomRow
                      key={name}
                      name={name}
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
          )
        )}
      </section>
    </PageShell>
  );
}

const AVATAR_COLORS = ["#8E24AA", "#F57C00", "#43A047", "#3949AB", "#E53935", "#00897B", "#6D4C41"];

function RoomRow({
  name,
  count,
  max,
  mine,
  favorite,
  onStar,
}: {
  name: string;
  count: number | undefined;
  max: number;
  mine: boolean;
  favorite: boolean;
  onStar: () => void;
}) {
  // Rooms whose name starts with an emoji show that emoji; others a coloured letter.
  const first = Array.from(name.trim())[0] || "?";
  const isEmoji = /\p{Extended_Pictographic}/u.test(first);
  const label = isEmoji ? name.trim().slice(first.length).trim() : name;
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const n = count ?? 0;
  const busy = n > 0 && n >= Math.max(1, max * 0.2);
  return (
    <li>
      <Link href={roomHref(name)} className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-white/5">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-base font-black"
          style={{ backgroundColor: isEmoji ? "#F57C00" : AVATAR_COLORS[h % AVATAR_COLORS.length] }}
        >
          {isEmoji ? first : first.toUpperCase()}
        </span>
        <span data-notranslate className="min-w-0 flex-1 truncate font-bold">
          {label}
          {mine && <span className="ml-1.5 text-sm">👑</span>}
        </span>
        <span className="shrink-0 text-sm font-bold text-amber-400">
          {count === undefined ? "…" : n}/{max}
        </span>
        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${busy ? "bg-orange-400" : n > 0 ? "bg-emerald-400" : "bg-white/30"}`} />
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            onStar();
          }}
          aria-label={favorite ? "Remove from favorites" : "Add to favorites"}
          className={`shrink-0 px-1 text-xl ${favorite ? "text-amber-400" : "text-white/50 hover:text-white"}`}
        >
          {favorite ? "★" : "☆"}
        </button>
      </Link>
    </li>
  );
}
