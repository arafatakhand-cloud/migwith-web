"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useCurrentUser } from "../../lib/useCurrentUser";
import {
  OFFICIAL_COUNTRY_ROOMS,
  OFFICIAL_GAME_ROOMS,
  roomHref,
} from "../../lib/rooms";
import { PageShell } from "../_components/PageShell";

type UserRoom = { name: string; description: string; ownerName: string };

export default function RoomsPage() {
  const router = useRouter();
  const { user, loading } = useCurrentUser();
  const [userRooms, setUserRooms] = useState<UserRoom[]>([]);
  const [search, setSearch] = useState("");

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
            }))
            .sort((a, b) => a.name.localeCompare(b.name))
        )
      )
      .catch((err) => console.error(err));
  }, [user]);

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
