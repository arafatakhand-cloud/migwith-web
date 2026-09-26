"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useCurrentUser } from "../../lib/useCurrentUser";
import {
  OFFICIAL_COUNTRY_ROOMS,
  OFFICIAL_GAME_ROOMS,
  roomHref,
} from "../../lib/rooms";
import { PageShell } from "../_components/PageShell";

type UserRoom = { name: string; description: string; ownerName: string; ownerUid: string };

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
            }))
            .sort((a, b) => a.name.localeCompare(b.name))
        )
      )
      .catch((err) => console.error(err));
    getDoc(doc(db, "users", user.uid))
      .then((snap) => setLevel(Number(snap.get("level") || 1)))
      .catch(() => {});
  }, [user]);

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

  const q = search.trim().toLowerCase();
  const matches = (name: string) => !q || name.toLowerCase().includes(q);

  if (loading || !user) {
    return (
      <PageShell>
        <p className="py-20 text-center text-sm text-white/40">Loading…</p>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <section className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <h1 className="text-3xl font-black tracking-tight">Chat Rooms</h1>
        <p className="mt-1 text-sm text-white/45">
          Same rooms as the MIGwith app — chat with app users live.
        </p>

        <button
          type="button"
          onClick={() => {
            setShowCreate(true);
            setCreateError("");
          }}
          className="mt-5 rounded-2xl bg-gradient-to-r from-violet-600 to-fuchsia-500 px-5 py-3 text-sm font-black shadow-lg shadow-violet-500/20"
        >
          ➕ Create Room
        </button>

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

        {myRooms.length > 0 && (
          <div className="mt-6">
            <h2 className="mb-3 text-sm font-bold uppercase tracking-widest text-white/50">👑 My Rooms</h2>
            <div className="flex flex-wrap gap-2">
              {myRooms.map((r) => (
                <Link
                  key={r.name}
                  href={roomHref(r.name)}
                  className="rounded-xl border border-violet-400/30 bg-violet-500/10 px-4 py-2 text-sm font-bold hover:bg-violet-500/20"
                >
                  {r.name}
                </Link>
              ))}
            </div>
          </div>
        )}

        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search rooms"
          className="mt-6 w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none placeholder:text-white/25 focus:border-cyan-300/50"
        />

        <RoomGroup title="🌍 Country Rooms" names={OFFICIAL_COUNTRY_ROOMS.filter(matches)} />
        <RoomGroup title="🎮 Game Rooms" names={OFFICIAL_GAME_ROOMS.filter(matches)} />

        {userRooms.some((r) => matches(r.name)) && (
          <div className="mt-8">
            <h2 className="mb-3 text-sm font-bold uppercase tracking-widest text-white/50">
              🏠 User Rooms
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {userRooms.filter((r) => matches(r.name)).map((r) => (
                <Link
                  key={r.name}
                  href={roomHref(r.name)}
                  className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 transition hover:border-cyan-300/30 hover:bg-white/[0.07]"
                >
                  <div className="font-bold">{r.name}</div>
                  <div className="mt-1 truncate text-xs text-white/40">
                    {r.description || `by ${r.ownerName}`}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </section>
    </PageShell>
  );
}

function RoomGroup({ title, names }: { title: string; names: string[] }) {
  if (names.length === 0) return null;
  return (
    <div className="mt-8">
      <h2 className="mb-3 text-sm font-bold uppercase tracking-widest text-white/50">{title}</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {names.map((name) => (
          <Link
            key={name}
            href={roomHref(name)}
            className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-4 text-sm font-bold transition hover:-translate-y-0.5 hover:border-cyan-300/30 hover:bg-white/[0.07]"
          >
            {name}
          </Link>
        ))}
      </div>
    </div>
  );
}
