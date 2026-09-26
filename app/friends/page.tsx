"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { collection, getDocs, limit, query, where } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useCurrentUser } from "../../lib/useCurrentUser";
import { chatHref } from "../../lib/privateChat";
import { useFriendRequests, type FriendRequest } from "../../lib/friends";
import { PageShell } from "../_components/PageShell";

// Same three tabs as the app's FriendsPage: My Friends / Requests / Find Friends.

type Info = { level: number; online: boolean };

const profileHref = (u: string) => `/profile/${encodeURIComponent(u)}`;

function Avatar({ name }: { name: string }) {
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-cyan-400 font-black">
      {name.slice(0, 1).toUpperCase()}
    </div>
  );
}

export default function FriendsPage() {
  const router = useRouter();
  const { user, username, loading } = useCurrentUser();
  const fr = useFriendRequests(username);

  const [tab, setTab] = useState<"FRIENDS" | "REQUESTS" | "FIND">("FRIENDS");
  const [reqTab, setReqTab] = useState<"INCOMING" | "SENT">("INCOMING");
  const [friendFilter, setFriendFilter] = useState<"ALL" | "ONLINE" | "OFFLINE">("ALL");
  const [info, setInfo] = useState<Record<string, Info>>({});
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<{ username: string; level: number }[]>([]);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState<{ text: string; error: boolean } | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  // Level and online status for my friends (Firestore "in" takes 30 at a time).
  const friendsKey = fr.friends.join("|");
  useEffect(() => {
    if (!user || fr.friends.length === 0) return;
    const chunks: string[][] = [];
    for (let i = 0; i < fr.friends.length; i += 30) chunks.push(fr.friends.slice(i, i + 30));
    Promise.all(chunks.map((c) => getDocs(query(collection(db, "users"), where("username", "in", c)))))
      .then((snaps) => {
        const next: Record<string, Info> = {};
        snaps.forEach((s) =>
          s.docs.forEach((d) => {
            next[String(d.get("username")).toLowerCase()] = {
              level: Number(d.get("level") || 1),
              online: String(d.get("presenceStatus") || "OFFLINE").toUpperCase() === "ONLINE",
            };
          })
        );
        setInfo(next);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, friendsKey]);

  // Find: username prefix search (as typed, lowercase and Capitalized).
  useEffect(() => {
    const q = search.trim();
    if (!user || q.length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    const t = setTimeout(() => {
      const variants = Array.from(new Set([q, q.toLowerCase(), q[0].toUpperCase() + q.slice(1).toLowerCase()]));
      Promise.all(
        variants.map((v) =>
          getDocs(
            query(collection(db, "users"), where("username", ">=", v), where("username", "<=", v + ""), limit(20))
          )
        )
      )
        .then((snaps) => {
          const seen = new Map<string, { username: string; level: number }>();
          snaps.forEach((s) =>
            s.docs.forEach((d) => {
              const name = String(d.get("username") || "").trim();
              if (name) seen.set(name.toLowerCase(), { username: name, level: Number(d.get("level") || 1) });
            })
          );
          setResults(Array.from(seen.values()).filter((r) => fr.relationTo(r.username) !== "self"));
        })
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, user]);

  const act = async (k: string, fn: () => Promise<unknown>, ok: string) => {
    if (busy.has(k)) return;
    setBusy((s) => new Set(s).add(k));
    try {
      await fn();
      setMsg({ text: ok, error: false });
    } catch (err: any) {
      setMsg({ text: err?.message || "Something went wrong.", error: true });
    } finally {
      setBusy((s) => {
        const n = new Set(s);
        n.delete(k);
        return n;
      });
    }
  };

  if (loading || !user) {
    return (
      <PageShell>
        <p className="py-20 text-center text-sm text-white/40">Loading…</p>
      </PageShell>
    );
  }

  const friendRows = fr.friends.map((name) => ({ name, ...(info[name.toLowerCase()] || { level: 1, online: false }) }));
  const online = friendRows.filter((f) => f.online);
  const shownFriends =
    friendFilter === "ONLINE" ? online : friendFilter === "OFFLINE" ? friendRows.filter((f) => !f.online) : friendRows;

  const tabBtn = (id: typeof tab, label: string) => (
    <button
      type="button"
      onClick={() => setTab(id)}
      className={`flex-1 rounded-xl py-2.5 text-sm font-bold transition ${
        tab === id ? "bg-blue-600 text-white" : "bg-white/5 text-white/60 hover:bg-white/10"
      }`}
    >
      {label}
    </button>
  );

  const requestRow = (r: FriendRequest, incoming: boolean) => {
    const other = incoming ? r.from : r.to;
    const k = other.toLowerCase();
    return (
      <li key={r.id} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2.5">
        <Avatar name={other} />
        <Link href={profileHref(other)} className="min-w-0 flex-1 truncate font-bold hover:text-cyan-300">
          {other}
        </Link>
        {incoming ? (
          <>
            <button
              type="button"
              disabled={busy.has(k)}
              onClick={() => act(k, () => fr.accept(r), `${other} accepted as friend.`)}
              className="rounded-xl bg-emerald-600 px-3 py-1.5 text-sm font-bold disabled:opacity-50"
            >
              Accept
            </button>
            <button
              type="button"
              disabled={busy.has(k)}
              onClick={() => act(k, () => fr.decline(r), `Declined ${other}'s friend request.`)}
              className="rounded-xl border border-white/15 px-3 py-1.5 text-sm font-bold text-white/70 disabled:opacity-50"
            >
              Decline
            </button>
          </>
        ) : (
          <button
            type="button"
            disabled={busy.has(k)}
            onClick={() => act(k, () => fr.cancel(r), `Cancelled request to ${other}.`)}
            className="rounded-xl border border-white/15 px-3 py-1.5 text-sm font-bold text-white/70 disabled:opacity-50"
          >
            Cancel
          </button>
        )}
      </li>
    );
  };

  return (
    <PageShell>
      <section className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <h1 className="text-3xl font-black tracking-tight">👥 Friends</h1>

        <div className="mt-5 flex gap-2">
          {tabBtn("FRIENDS", "My Friends")}
          {tabBtn("REQUESTS", fr.incoming.length > 0 ? `Requests (${fr.incoming.length})` : "Requests")}
          {tabBtn("FIND", "Find Friends")}
        </div>

        {msg && <p className={`mt-3 text-sm ${msg.error ? "text-red-300" : "text-emerald-300"}`}>{msg.text}</p>}

        {tab === "FRIENDS" && (
          <>
            <div className="mt-4 grid grid-cols-3 gap-2">
              {(
                [
                  ["ALL", "Total", fr.friends.length, "text-violet-300"],
                  ["ONLINE", "Online", online.length, "text-emerald-300"],
                  ["OFFLINE", "Offline", fr.friends.length - online.length, "text-amber-300"],
                ] as const
              ).map(([id, label, n, color]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setFriendFilter(id)}
                  className={`rounded-2xl border py-3 text-center ${
                    friendFilter === id ? "border-cyan-300/50 bg-cyan-300/10" : "border-white/10 bg-white/[0.04]"
                  }`}
                >
                  <div className={`text-xl font-black ${color}`}>{n}</div>
                  <div className="text-xs text-white/50">{label}</div>
                </button>
              ))}
            </div>

            <ul className="mt-4 space-y-2">
              {shownFriends.length === 0 && (
                <li className="py-10 text-center text-sm text-white/35">
                  {fr.friends.length === 0
                    ? "No friends yet. Add friends from the Find Friends tab."
                    : friendFilter === "ONLINE"
                      ? "No friends online right now."
                      : "No offline friends."}
                </li>
              )}
              {shownFriends.map((f) => (
                <li
                  key={f.name}
                  className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2.5"
                >
                  <Avatar name={f.name} />
                  <Link href={profileHref(f.name)} className="min-w-0 flex-1">
                    <p className="truncate font-bold hover:text-cyan-300">{f.name}</p>
                    <p className="text-xs text-cyan-300/70">Lv.{f.level}</p>
                  </Link>
                  <span className={`text-xs ${f.online ? "text-emerald-300" : "text-white/35"}`}>
                    {f.online ? "🟢 Online" : "Offline"}
                  </span>
                  <Link href={chatHref(f.name)} title="Message" className="rounded-lg px-2 py-1 hover:bg-white/10">
                    ✉️
                  </Link>
                  <button
                    type="button"
                    title="Remove friend"
                    disabled={busy.has(f.name.toLowerCase())}
                    onClick={() => {
                      if (confirm(`Remove ${f.name} from your friends?`))
                        act(f.name.toLowerCase(), () => fr.remove(f.name), `${f.name} removed from friends.`);
                    }}
                    className="rounded-lg px-2 py-1 text-sm text-red-300/70 hover:bg-red-500/10 disabled:opacity-40"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}

        {tab === "REQUESTS" && (
          <>
            <div className="mt-4 flex gap-2">
              {(
                [
                  ["INCOMING", `Received (${fr.incoming.length})`],
                  ["SENT", `Sent (${fr.sent.length})`],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setReqTab(id)}
                  className={`rounded-full border px-4 py-1.5 text-sm font-bold ${
                    reqTab === id ? "border-cyan-300 bg-cyan-300/15 text-cyan-200" : "border-white/10 text-white/60"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <ul className="mt-3 space-y-2">
              {reqTab === "INCOMING" ? (
                fr.incoming.length === 0 ? (
                  <li className="py-10 text-center text-sm text-white/35">No friend requests.</li>
                ) : (
                  fr.incoming.map((r) => requestRow(r, true))
                )
              ) : fr.sent.length === 0 ? (
                <li className="py-10 text-center text-sm text-white/35">No sent requests.</li>
              ) : (
                fr.sent.map((r) => requestRow(r, false))
              )}
            </ul>
          </>
        )}

        {tab === "FIND" && (
          <>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search a username or MIG ID…"
              className="mt-4 w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none placeholder:text-white/25 focus:border-cyan-300/50"
            />
            <ul className="mt-3 space-y-2">
              {search.trim().length < 2 ? (
                <li className="py-10 text-center text-sm text-white/35">Type at least 2 letters to find someone.</li>
              ) : searching ? (
                <li className="py-10 text-center text-sm text-white/35">Searching…</li>
              ) : results.length === 0 ? (
                <li className="py-10 text-center text-sm text-white/35">No users found.</li>
              ) : (
                results.map((r) => {
                  const rel = fr.relationTo(r.username);
                  const k = r.username.toLowerCase();
                  return (
                    <li
                      key={r.username}
                      className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2.5"
                    >
                      <Avatar name={r.username} />
                      <Link href={profileHref(r.username)} className="min-w-0 flex-1">
                        <p className="truncate font-bold hover:text-cyan-300">{r.username}</p>
                        <p className="text-xs text-cyan-300/70">Lv.{r.level}</p>
                      </Link>
                      {rel === "friend" ? (
                        <span className="text-xs text-emerald-300">✓ Friends</span>
                      ) : rel === "sent" ? (
                        <span className="text-xs text-white/45">Request sent</span>
                      ) : rel === "incoming" ? (
                        <button
                          type="button"
                          onClick={() => {
                            setTab("REQUESTS");
                            setReqTab("INCOMING");
                          }}
                          className="text-xs font-bold text-amber-300"
                        >
                          Wants to be friends →
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={busy.has(k)}
                          onClick={() => act(k, () => fr.send(r.username), `Friend request sent to ${r.username}.`)}
                          className="rounded-xl bg-blue-600 px-4 py-1.5 text-sm font-bold disabled:opacity-50"
                        >
                          {busy.has(k) ? "Sending…" : "ADD"}
                        </button>
                      )}
                    </li>
                  );
                })
              )}
            </ul>
          </>
        )}
      </section>
    </PageShell>
  );
}
