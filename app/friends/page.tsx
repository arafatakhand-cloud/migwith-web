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
import { BackButton } from "../_components/BackButton";
import { isOnlineNow } from "../../lib/heartbeat";

// Same three tabs as the app's FriendsPage: My Friends / Requests / Find Friends.

type Info = { level: number; online: boolean };

const profileHref = (u: string) => `/profile/${encodeURIComponent(u)}`;

// Same colours and pick as the app's avatarColorFor().
const AVATAR_COLORS = ["#43B65A", "#3984D9", "#E9A625", "#7B1FB8", "#12AFC7", "#E12A2A", "#D4AF37", "#3F55C7"];
const avatarColorFor = (name: string) => {
  const n = name.trim().toLowerCase();
  if (!n) return AVATAR_COLORS[0];
  let sum = 0;
  for (const ch of n) sum += ch.codePointAt(0) || 0;
  return AVATAR_COLORS[sum % AVATAR_COLORS.length];
};

function Avatar({ name }: { name: string }) {
  return (
    <div
      className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full font-bold text-white"
      style={{ backgroundColor: avatarColorFor(name) }}
    >
      {name.slice(0, 1).toUpperCase()}
    </div>
  );
}

// A solid white card, like the app (the Glass theme would make it see-through).
const CARD = "fr-solid flex items-center gap-3 rounded-2xl bg-white px-3 py-3 shadow-sm";

export default function FriendsPage() {
  const router = useRouter();
  const { user, username, loading } = useCurrentUser();
  const fr = useFriendRequests(username);

  const [tab, setTab] = useState<"FRIENDS" | "REQUESTS" | "FIND">("FRIENDS");
  const [reqTab, setReqTab] = useState<"INCOMING" | "SENT">("INCOMING");
  const [friendFilter, setFriendFilter] = useState<"ALL" | "ONLINE" | "OFFLINE">("ALL");
  const [menuFor, setMenuFor] = useState<string | null>(null);
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
              // A fresh heartbeat, like the app (presenceStatus alone stayed ONLINE forever).
              online: isOnlineNow(d.data()),
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
      <PageShell light>
        <p className="py-20 text-center text-sm text-[#5B6B8C]">Loading…</p>
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
      // like the app: the chosen tab navy → gold with a gold rim, the others white
      className={`fr-solid min-w-0 flex-1 truncate rounded-full border py-2.5 text-[13px] font-bold transition ${
        tab === id
          ? "border-[#D4AF37] bg-[linear-gradient(90deg,#0B1F3A,#1E3A66,#D4AF37)] text-white shadow-md"
          : "border-[#DDE3EF] bg-white text-[#0B1F3A]"
      }`}
    >
      {label}
    </button>
  );

  const requestRow = (r: FriendRequest, incoming: boolean) => {
    const other = incoming ? r.from : r.to;
    const k = other.toLowerCase();
    return (
      <li key={r.id} className={CARD}>
        <Avatar name={other} />
        <Link href={profileHref(other)} className="min-w-0 flex-1 truncate font-bold hover:text-[#2F80ED]">
          {other}
        </Link>
        {incoming ? (
          <>
            <button
              type="button"
              disabled={busy.has(k)}
              onClick={() => act(k, () => fr.accept(r), `${other} accepted as friend.`)}
              className="rounded-xl bg-emerald-500 px-3 py-1.5 text-sm font-bold text-white disabled:opacity-50"
            >
              Accept
            </button>
            <button
              type="button"
              disabled={busy.has(k)}
              onClick={() => act(k, () => fr.decline(r), `Declined ${other}'s friend request.`)}
              className="rounded-xl border border-[#D5E3F5] px-3 py-1.5 text-sm font-bold text-[#5B6B8C] disabled:opacity-50"
            >
              Decline
            </button>
          </>
        ) : (
          <button
            type="button"
            disabled={busy.has(k)}
            onClick={() => act(k, () => fr.cancel(r), `Cancelled request to ${other}.`)}
            className="rounded-xl border border-[#D5E3F5] px-3 py-1.5 text-sm font-bold text-[#5B6B8C] disabled:opacity-50"
          >
            Cancel
          </button>
        )}
      </li>
    );
  };

  return (
    <PageShell light>
      <div className="bg-[#0B1F3A] text-white">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-3 py-2.5 sm:px-6 lg:max-w-4xl">
          <BackButton variant="dark" href="/" />
          <h1 className="text-lg font-black">👥 Friends</h1>
        </div>
      </div>
      <section className="mx-auto max-w-2xl px-3 py-4 sm:px-6 lg:max-w-4xl">

        <div className="flex gap-2">
          {tabBtn("FRIENDS", "My Friends")}
          {tabBtn("REQUESTS", fr.incoming.length > 0 ? `Requests (${fr.incoming.length})` : "Requests")}
          {tabBtn("FIND", "Find Friends")}
        </div>

        {msg && <p className={`mt-3 text-sm ${msg.error ? "text-rose-600" : "text-emerald-600"}`}>{msg.text}</p>}

        {tab === "FRIENDS" && (
          <>
            <div className="mt-4 grid grid-cols-3 gap-2">
              {(
                [
                  ["ONLINE", "Online", online.length, "#32A852"],
                  ["OFFLINE", "Offline", fr.friends.length - online.length, "#E9A625"],
                  ["ALL", "Total", fr.friends.length, "#7B1FB8"],
                ] as const
              ).map(([id, label, n, color]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setFriendFilter(id)}
                  className="rounded-[14px] py-3 text-center transition"
                  style={{
                    border: `${friendFilter === id ? 2 : 1}px solid ${color}`,
                    backgroundColor: `${color}${friendFilter === id ? "33" : "1A"}`,
                  }}
                >
                  <div className="text-xl font-black" style={{ color }}>
                    {n}
                  </div>
                  <div className="text-xs font-bold" style={{ color }}>
                    {label}
                  </div>
                </button>
              ))}
            </div>

            {/* Total is only a count (like the app): no list under it */}
            {friendFilter !== "ALL" && (
            <ul className="mt-3 grid gap-2 md:grid-cols-2">
              {shownFriends.length === 0 && (
                <li className="py-10 text-center text-sm text-[#6B7A99]">
                  {fr.friends.length === 0
                    ? "No friends yet. Add friends from the Find Friends tab."
                    : friendFilter === "ONLINE"
                      ? "No friends online right now."
                      : "No offline friends."}
                </li>
              )}
              {shownFriends.map((f) => (
                <li key={f.name} className={`relative ${CARD}`}>
                  <Avatar name={f.name} />
                  {/* tap the name → private chat (like the app) */}
                  <Link href={chatHref(f.name)} className="min-w-0 flex-1">
                    <p className="truncate font-bold text-[#0B1F3A]">{f.name}</p>
                    <p className="text-xs text-[#2F6ABD]">Lv.{f.level}</p>
                  </Link>
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${f.online ? "bg-[#32A852]" : "bg-[#8A93AC]"}`} />
                  <span className={`text-xs ${f.online ? "text-[#32A852]" : "text-[#6B7A99]"}`}>{f.online ? "Online" : "Offline"}</span>
                  <button
                    type="button"
                    aria-label="More"
                    onClick={() => setMenuFor(menuFor === f.name ? null : f.name)}
                    className="rounded-md px-1.5 text-xl font-bold leading-none text-[#6B7A99] hover:bg-[#EEF3FA]"
                  >
                    ⋮
                  </button>
                  {menuFor === f.name && (
                    <>
                      <div className="fixed inset-0 z-20" onClick={() => setMenuFor(null)} />
                      <div className="fr-solid absolute right-2 top-12 z-30 w-44 overflow-hidden rounded-xl bg-white py-1 shadow-xl ring-1 ring-black/5">
                        <Link
                          href={profileHref(f.name)}
                          className="block px-4 py-2.5 text-sm text-[#0B1F3A] hover:bg-[#F2F6FC]"
                          onClick={() => setMenuFor(null)}
                        >
                          View profile
                        </Link>
                        <button
                          type="button"
                          disabled={busy.has(f.name.toLowerCase())}
                          onClick={() => {
                            setMenuFor(null);
                            if (confirm(`Remove ${f.name} from your friends?`))
                              act(f.name.toLowerCase(), () => fr.remove(f.name), `${f.name} removed from friends.`);
                          }}
                          className="block w-full px-4 py-2.5 text-left text-sm text-[#E5484D] hover:bg-[#FFF1F1] disabled:opacity-40"
                        >
                          Remove friend
                        </button>
                      </div>
                    </>
                  )}
                </li>
              ))}
            </ul>
            )}
          </>
        )}

        {tab === "REQUESTS" && (
          <>
            <div className="mt-4 flex gap-2">
              {(
                [
                  ["INCOMING", fr.incoming.length ? `Friend requests (${fr.incoming.length})` : "Friend requests", "#3984D9"],
                  ["SENT", fr.sent.length ? `Sent requests (${fr.sent.length})` : "Sent requests", "#E9A625"],
                ] as const
              ).map(([id, label, color]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setReqTab(id)}
                  className="min-w-0 flex-1 truncate rounded-full py-2.5 text-[13px] font-bold"
                  style={{
                    color,
                    border: `${reqTab === id ? 2 : 1}px solid ${color}`,
                    backgroundColor: `${color}${reqTab === id ? "33" : "1A"}`,
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            <ul className="mt-3 space-y-2">
              {reqTab === "INCOMING" ? (
                fr.incoming.length === 0 ? (
                  <li className="py-10 text-center text-sm text-[#6B7A99]">No friend requests.</li>
                ) : (
                  fr.incoming.map((r) => requestRow(r, true))
                )
              ) : fr.sent.length === 0 ? (
                <li className="py-10 text-center text-sm text-[#6B7A99]">No sent requests.</li>
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
              className="mt-4 w-full rounded-2xl border border-[#D5E3F5] bg-white px-4 py-3 text-sm text-[#0B2A5B] outline-none placeholder:text-[#8A9BBC] focus:border-[#2F80ED]"
            />
            <ul className="mt-3 space-y-2">
              {search.trim().length < 2 ? (
                <li className="py-10 text-center text-sm text-[#6B7A99]">Type at least 2 letters to find someone.</li>
              ) : searching ? (
                <li className="py-10 text-center text-sm text-[#6B7A99]">Searching…</li>
              ) : results.length === 0 ? (
                <li className="py-10 text-center text-sm text-[#6B7A99]">No users found.</li>
              ) : (
                results.map((r) => {
                  const rel = fr.relationTo(r.username);
                  const k = r.username.toLowerCase();
                  return (
                    <li
                      key={r.username}
                      className={CARD}
                    >
                      <Avatar name={r.username} />
                      <Link href={profileHref(r.username)} className="min-w-0 flex-1">
                        <p className="truncate font-bold hover:text-[#2F80ED]">{r.username}</p>
                        <p className="text-xs text-[#6B7A99]">Lv.{r.level}</p>
                      </Link>
                      {rel === "friend" ? (
                        <span className="text-xs text-emerald-600">✓ Friends</span>
                      ) : rel === "sent" ? (
                        <span className="text-xs text-[#6B7A99]">Request sent</span>
                      ) : rel === "incoming" ? (
                        <button
                          type="button"
                          onClick={() => {
                            setTab("REQUESTS");
                            setReqTab("INCOMING");
                          }}
                          className="text-xs font-bold text-amber-600"
                        >
                          Wants to be friends →
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={busy.has(k)}
                          onClick={() => act(k, () => fr.send(r.username), `Friend request sent to ${r.username}.`)}
                          className="rounded-xl bg-[#2F80ED] px-4 py-1.5 text-sm font-bold text-white disabled:opacity-50"
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
