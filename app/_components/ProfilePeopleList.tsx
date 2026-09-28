"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { collection, getDocs, limit, query, where } from "firebase/firestore";
import { db } from "../../lib/firebase";

// Owner-only list of everyone who visited (Footprints) or voted for (Votes)
// this profile, latest first — like the app's ProfileFootprintsDialog. Reads
// every user whose own visitedProfiles / votedProfiles list has my name, plus
// their visitedAt / votedAt time for me.

type Person = { username: string; photo: string; at: number | null };

function photoOf(d: Record<string, unknown>): string {
  for (const k of ["photoUrl", "profilePic", "avatarUrl", "imageUrl"]) {
    const v = String(d[k] || "").trim();
    if (v) return v;
  }
  return "";
}

function timeLabel(ms: number | null): string {
  if (!ms) return "Earlier";
  const diff = Date.now() - ms;
  if (diff < 60_000) return "Just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} h ago`;
  if (diff < 2 * 86_400_000) return "Yesterday";
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)} days ago`;
  return new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function ProfilePeopleList({
  kind,
  ownerName,
  ownerUid,
  onClose,
}: {
  kind: "footprints" | "votes";
  ownerName: string;
  ownerUid: string;
  onClose: () => void;
}) {
  const votes = kind === "votes";
  const listField = votes ? "votedProfiles" : "visitedProfiles";
  const timeField = votes ? "votedAt" : "visitedAt";
  const [people, setPeople] = useState<Person[] | null>(null);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);

  useEffect(() => {
    setPeople(null);
    setError("");
    const key = ownerName.toLowerCase();
    getDocs(query(collection(db, "users"), where(listField, "array-contains", ownerName), limit(500)))
      .then((snap) => {
        const list = snap.docs
          .filter((d) => d.id !== ownerUid)
          .map((d) => {
            const x = d.data();
            const t = (x[timeField] as Record<string, any> | undefined)?.[key];
            return {
              username: String(x.username || "").trim(),
              photo: photoOf(x),
              at: t && typeof t.toMillis === "function" ? t.toMillis() : null,
            };
          })
          .filter((p) => p.username)
          .sort((a, b) => (b.at ?? -Infinity) - (a.at ?? -Infinity) || a.username.localeCompare(b.username));
        setPeople(list);
      })
      .catch((err) => setError(err?.message || "Could not load the list."));
  }, [ownerName, ownerUid, listField, timeField, reload]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-sky-app">
      <div className="flex items-center gap-3 bg-[#1E6FD9] px-3 py-2.5 text-white">
        <button type="button" onClick={onClose} aria-label="Back" className="rounded-full px-2 py-1 text-xl hover:bg-white/15">
          ←
        </button>
        <div>
          <p className="text-[17px] font-bold">{votes ? "❤️ Votes" : "👣 Footprints"}</p>
          {people && (
            <p className="text-xs text-white/85">
              {people.length} {people.length === 1 ? "person" : "people"} {votes ? "voted for you" : "viewed your profile"}
            </p>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        {error ? (
          <div className="mt-16 text-center text-white">
            <p className="text-sm">{error}</p>
            <button type="button" onClick={() => setReload((r) => r + 1)} className="mt-3 rounded-xl bg-[#0B2A5B] px-5 py-2 font-bold">
              Retry
            </button>
          </div>
        ) : !people ? (
          <p className="mt-16 text-center text-sm text-white">Loading…</p>
        ) : people.length === 0 ? (
          <p className="mt-16 text-center text-sm text-white">
            {votes ? "No one has voted for you yet." : "No one has viewed your profile yet."}
          </p>
        ) : (
          <ul className="mx-auto max-w-md space-y-2" data-notranslate>
            {people.map((p) => (
              <li key={p.username}>
                <Link
                  href={`/profile/${encodeURIComponent(p.username)}`}
                  className="flex items-center gap-3 rounded-2xl bg-white px-3 py-2.5 shadow-sm hover:bg-[#F4F9FF]"
                >
                  {p.photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.photo} alt="" className="h-11 w-11 shrink-0 rounded-full object-cover" />
                  ) : (
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#DCE8F7] font-bold text-[#0B2A5B]">
                      {p.username.slice(0, 1).toUpperCase()}
                    </span>
                  )}
                  <span className="min-w-0 flex-1 truncate font-semibold text-[#0B2A5B]">{p.username}</span>
                  <span className="shrink-0 text-xs text-[#6B7A99]">{timeLabel(p.at)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
