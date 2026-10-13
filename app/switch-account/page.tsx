"use client";

import { useEffect, useState } from "react";
import { FounderShell, input } from "../secret/_Shell";
import { useFounderPerms } from "../../lib/founder";
import {
  addSavedAccount,
  listSavedAccounts,
  removeSavedAccount,
  returnToMiglife,
  switchToAccount,
  useSwitchedSession,
  type SavedAccount,
} from "../../lib/switchAccount";
import { useSession } from "../_components/AppSession";

// 🔀 Switch Account — miglife only: up to 5 saved accounts (each added once with
// its password), opened with one tap; "Return to miglife" comes back.
export default function SwitchAccountPage() {
  const f = useFounderPerms();
  const switched = useSwitchedSession();
  const { username } = useSession();
  const [accounts, setAccounts] = useState<SavedAccount[] | null>(null);
  const [max, setMax] = useState(5);
  const [currentUid, setCurrentUid] = useState("");
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const [newId, setNewId] = useState("");
  const [newPw, setNewPw] = useState("");
  const [removing, setRemoving] = useState<SavedAccount | null>(null);
  const allowed = f.isMigwith || switched;

  const load = () =>
    listSavedAccounts()
      .then((d) => {
        setAccounts(d.accounts);
        setMax(d.max);
        setCurrentUid(d.currentUid);
      })
      .catch((e) => {
        setAccounts([]);
        setMsg(e?.message || "Could not load the accounts.");
      });

  useEffect(() => {
    if (allowed) load();
  }, [allowed]);

  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    setMsg("");
    try {
      await fn();
    } catch (e: any) {
      setMsg(e?.message || "Something went wrong.");
    } finally {
      setBusy("");
    }
  };

  return (
    <FounderShell title="🔀 Switch Account" allowed={allowed} loaded={f.loaded}>
      {switched && (
        <div className="flex items-center gap-3 rounded-2xl bg-gradient-to-r from-[#FFF4D6] to-[#FFE7A8] p-3.5">
          <span className="text-2xl">👑</span>
          <span className="min-w-0 flex-1 text-sm">
            You are in <b>@{username}</b>, opened from miglife.
          </span>
          <button
            type="button"
            disabled={!!busy}
            onClick={() => run("return", returnToMiglife)}
            className="shrink-0 rounded-xl bg-[#B8860B] px-3 py-2 text-sm font-bold text-white disabled:opacity-50"
          >
            {busy === "return" ? "…" : "↩ Return to miglife"}
          </button>
        </div>
      )}

      <div className="rounded-3xl bg-white p-3 shadow-sm">
        <div className="flex items-center px-1 pb-2">
          <p className="flex-1 text-[15px] font-extrabold">Saved accounts</p>
          <span className="rounded-full bg-[#EEF3FA] px-2.5 py-0.5 text-xs font-bold text-[#35507E]">
            {accounts ? accounts.length : "…"} / {max}
          </span>
        </div>
        {accounts === null ? (
          <p className="py-6 text-center text-sm text-[#5B6B8C]">Loading…</p>
        ) : accounts.length === 0 ? (
          <p className="py-6 text-center text-sm text-[#5B6B8C]">No saved accounts yet — add one below.</p>
        ) : (
          <div className="divide-y divide-[#EEF2F8]">
            {accounts.map((a) => {
              const here = a.uid === currentUid;
              return (
                <div key={a.uid} className="flex items-center gap-3 px-1 py-2.5">
                  <button
                    type="button"
                    disabled={here || !!busy}
                    onClick={() => run(a.uid, () => switchToAccount(a.username))}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left disabled:cursor-default"
                  >
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-[#2F6FD6] to-[#174EA6] font-black text-white">
                      {a.photo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={a.photo} alt="" className="h-full w-full object-cover" />
                      ) : (
                        a.username.slice(0, 1).toUpperCase()
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span data-notranslate className="block truncate text-[15px] font-bold">@{a.username}</span>
                      <span className="block text-xs text-[#6B7A99]">Level {a.level}</span>
                    </span>
                    {here ? (
                      <span className="rounded-full bg-[#E3F7EA] px-2 py-0.5 text-[11px] font-bold text-[#1B8A3A]">● Now</span>
                    ) : (
                      <span className="rounded-full bg-[#2F80ED] px-3 py-1 text-xs font-bold text-white">{busy === a.uid ? "…" : "Switch"}</span>
                    )}
                  </button>
                  <button
                    type="button"
                    disabled={!!busy}
                    onClick={() => setRemoving(a)}
                    aria-label={`Remove ${a.username}`}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#F4F6F9] text-sm text-[#8A97A8] hover:text-[#C62828]"
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {accounts && accounts.length < max && (
        <form
          className="space-y-2 rounded-3xl bg-white p-3.5 shadow-sm"
          onSubmit={(e) => {
            e.preventDefault();
            run("add", async () => {
              const d = await addSavedAccount(newId.trim(), newPw);
              setAccounts(d.accounts);
              setNewId("");
              setNewPw("");
              setMsg("Account saved. Tap it to switch.");
            });
          }}
        >
          <p className="text-[15px] font-extrabold">➕ Add account</p>
          <p className="text-xs text-[#6B7A99]">Its password is asked once. After that it opens with one tap.</p>
          <input value={newId} onChange={(e) => setNewId(e.target.value)} placeholder="MIG ID" autoComplete="off" className={input} />
          <input value={newPw} onChange={(e) => setNewPw(e.target.value)} placeholder="Password of that ID" type="password" autoComplete="new-password" className={input} />
          <button
            type="submit"
            disabled={!!busy || !newId.trim() || !newPw}
            className="w-full rounded-xl bg-[#2F80ED] py-2.5 font-extrabold text-white disabled:opacity-50"
          >
            {busy === "add" ? "Checking…" : "Add account"}
          </button>
        </form>
      )}

      {msg && <p className="text-sm font-semibold text-[#0B2A5B]">{msg}</p>}

      {removing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-3" onClick={() => setRemoving(null)}>
          <div className="w-full max-w-sm space-y-3 rounded-3xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
            <p className="text-lg font-bold">Remove @{removing.username}?</p>
            <p className="text-sm">It is taken off this list. To add it again, its password is needed.</p>
            <div className="flex justify-end gap-4">
              <button type="button" onClick={() => setRemoving(null)} className="font-bold text-[#2F80ED]">
                Cancel
              </button>
              <button
                type="button"
                className="font-bold text-[#C62828]"
                onClick={() => {
                  const r = removing;
                  setRemoving(null);
                  run("remove", async () => {
                    const d = await removeSavedAccount(r.uid);
                    setAccounts(d.accounts);
                  });
                }}
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </FounderShell>
  );
}
