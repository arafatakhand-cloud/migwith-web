"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { collection, documentId, getDocs, limit, query, where } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { BackButton } from "./BackButton";
import { ClassicTitleBar, useIsClassic } from "./Classic";

// Owner-only list of everyone who visited (Footprints) or voted for (Votes)
// this profile, latest first — like the app's ProfileFootprintsDialog.
// 🔒 profile_visits|profile_votes/{myName}/by/{theirUid} — only I (and
// miglife) can read it; their photos come from their users docs.

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
  const sub = votes ? "profile_votes" : "profile_visits";
  const [people, setPeople] = useState<Person[] | null>(null);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const classic = useIsClassic();

  useEffect(() => {
    setPeople(null);
    setError("");
    (async () => {
      const snap = await getDocs(query(collection(db, sub, ownerName.toLowerCase(), "by"), limit(500)));
      const rows = snap.docs
        .filter((d) => d.id !== ownerUid)
        .map((d) => {
          const t = d.get("at");
          return { uid: d.id, username: String(d.get("username") || "").trim(), at: t && typeof t.toMillis === "function" ? (t.toMillis() as number) : null };
        })
        .filter((p) => p.username);
      // their pictures, 30 users at a time
      const photos = new Map<string, string>();
      for (let i = 0; i < rows.length; i += 30) {
        const ids = rows.slice(i, i + 30).map((r) => r.uid);
        const us = await getDocs(query(collection(db, "users"), where(documentId(), "in", ids))).catch(() => null);
        us?.docs.forEach((u) => photos.set(u.id, photoOf(u.data())));
      }
      setPeople(
        rows
          .map((r) => ({ username: r.username, photo: photos.get(r.uid) || "", at: r.at }))
          .sort((a, b) => (b.at ?? -Infinity) - (a.at ?? -Infinity) || a.username.localeCompare(b.username))
      );
    })().catch((err) => setError(err?.message || "Could not load the list."));
  }, [ownerName, ownerUid, sub, reload]);

  // 📟 Classic: white page, blue title bar, plain list lines with square photos.
  const subtitle = people ? `${people.length} ${people.length === 1 ? "person" : "people"} ${votes ? "voted for you" : "viewed your profile"}` : "";
  if (classic)
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-white">
        <ClassicTitleBar title={votes ? "❤️ Votes" : "👣 Footprints"} subtitle={subtitle} onBack={onClose} />
        <div className="flex-1 overflow-y-auto">
          {error ? (
            <div className="mt-16 text-center text-[#16315F]">
              <p className="text-sm">{error}</p>
              <button type="button" onClick={() => setReload((r) => r + 1)} className="mt-3 rounded bg-[#F07A00] px-5 py-2 font-bold text-white">
                Retry
              </button>
            </div>
          ) : !people ? (
            <p className="mt-16 text-center text-sm text-[#6B7788]">Loading…</p>
          ) : people.length === 0 ? (
            <p className="mt-16 text-center text-sm text-[#6B7788]">{votes ? "No one has voted for you yet." : "No one has viewed your profile yet."}</p>
          ) : (
            <ul data-notranslate>
              {people.map((p) => (
                <li key={p.username}>
                  <Link
                    href={`/profile/${encodeURIComponent(p.username)}`}
                    className="relative flex items-center px-2.5 py-2 after:absolute after:bottom-0 after:left-[58px] after:right-0 after:h-px after:bg-[#DDE3EA] hover:bg-[#F6F8FB]"
                  >
                    <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center overflow-hidden rounded border border-[#B9C4D2] bg-[#FFE0B8] text-[17px] font-bold text-[#F07A00]">
                      {p.photo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.photo} alt="" className="h-full w-full object-cover" />
                      ) : (
                        p.username.slice(0, 1).toUpperCase()
                      )}
                    </span>
                    <span className="ml-2.5 min-w-0 flex-1 truncate text-[15px] font-bold text-[#16315F]">{p.username}</span>
                    <span className="shrink-0 text-xs text-[#6B7788]">{timeLabel(p.at)}</span>
                    <span className="ml-1 text-lg text-[#A9B4C2]">›</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    );

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-sky-app">
      <div className="flex items-center gap-3 bg-[#1E6FD9] px-3 py-2.5 text-white">
        <BackButton variant="dark" onClick={onClose} />
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
