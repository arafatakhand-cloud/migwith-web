"use client";

import { useState } from "react";
import { founderAccountDeletion } from "../../lib/accountDeletion";
import { input } from "./_Shell";

// 🗑 Delete Account (miglife): for an email request from
// web.miglife.app/delete-account. Look up an ID, schedule its deletion
// (deleted after 7 days; the person logging in again cancels it) or cancel it.
export function AccountDeleteCard() {
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<{ username: string; status: string; scheduledAt?: number; coins?: number } | null>(null);
  const [msg, setMsg] = useState("");
  const [confirm, setConfirm] = useState(false);
  const who = target.trim().replace(/^@/, "");
  const day = (ms?: number) => (ms ? new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "");

  const run = (action: "status" | "schedule" | "cancel") => {
    setBusy(true);
    setMsg("");
    founderAccountDeletion({ username: who, action })
      .then(({ data }) => {
        setInfo(data);
        if (action === "schedule") setMsg(`@${data.username} will be deleted on ${day(data.scheduledAt)}. They have been logged out.`);
        if (action === "cancel") setMsg(`@${data.username}: deletion cancelled.`);
      })
      .catch((e) => setMsg(e?.message || "Something went wrong."))
      .finally(() => setBusy(false));
  };

  return (
    <div className="space-y-2 rounded-[18px] border-[1.5px] border-[#E53935] bg-white p-4">
      <p className="text-[17px] font-extrabold">🗑 Delete Account</p>
      <p className="text-xs text-gray-500">
        For a “Delete my account” email. The account is deleted 7 days after you schedule it; if the person logs in again
        before that, it is cancelled. Accounts with coins can&apos;t be deleted.
      </p>
      <input
        value={target}
        onChange={(e) => {
          setTarget(e.target.value);
          setInfo(null);
          setMsg("");
        }}
        placeholder="MIG ID"
        disabled={busy}
        className={input}
      />
      <button
        type="button"
        disabled={busy || !who}
        onClick={() => run("status")}
        className="w-full rounded-xl bg-[#2F80ED] py-2.5 font-extrabold text-white disabled:opacity-50"
      >
        {busy ? "Checking…" : "CHECK"}
      </button>
      {info && (
        <div className="space-y-2 rounded-xl bg-[#F6F8FB] p-3 text-sm">
          <p>
            <b>@{info.username}</b> · coins: <b>{(info.coins ?? 0).toLocaleString()}</b>
          </p>
          <p>
            {info.status === "scheduled"
              ? `⏳ Will be deleted on ${day(info.scheduledAt)}`
              : info.status === "deleted"
                ? "✅ Already deleted"
                : "No deletion scheduled"}
          </p>
          {info.status === "scheduled" ? (
            <button type="button" disabled={busy} onClick={() => run("cancel")} className="w-full rounded-xl border border-[#2F80ED] py-2 font-bold text-[#2F80ED]">
              Cancel deletion
            </button>
          ) : info.status !== "deleted" ? (
            <button
              type="button"
              disabled={busy || (info.coins ?? 0) > 0}
              onClick={() => setConfirm(true)}
              className="w-full rounded-xl bg-[#E53935] py-2 font-bold text-white disabled:opacity-50"
            >
              {(info.coins ?? 0) > 0 ? "Has coins — can't delete" : "Schedule deletion (7 days)"}
            </button>
          ) : null}
        </div>
      )}
      {msg && <p className="text-sm font-semibold text-[#0B2A5B]">{msg}</p>}
      {confirm && info && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-3" onClick={() => setConfirm(false)}>
          <div className="w-full max-w-sm space-y-3 rounded-3xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
            <p className="text-lg font-bold">Delete @{info.username}?</p>
            <p className="text-sm">
              They are logged out now and the account is deleted in 7 days (profile, photos, friends, mail, history, login). Their old
              messages stay as “Deleted user”.
            </p>
            <div className="flex justify-end gap-4">
              <button type="button" onClick={() => setConfirm(false)} className="font-bold text-[#2F80ED]">
                Cancel
              </button>
              <button
                type="button"
                className="font-bold text-[#E53935]"
                onClick={() => {
                  setConfirm(false);
                  run("schedule");
                }}
              >
                Delete in 7 days
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
