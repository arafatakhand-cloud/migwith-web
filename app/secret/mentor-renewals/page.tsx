"use client";

import { useEffect, useState } from "react";
import { useFounderPerms } from "../../../lib/founder";
import { FounderShell, card } from "../_Shell";
import { RenewDecider, dhakaDate, loadRenewRequests, type RenewRequest } from "../../_components/MentorRenew";

// 🔁 Mentor Renewals (miGlife only): mentors' renew requests — pending first,
// then the latest answered ones. Renew 30 days or decline right here.

const STATUS: Record<string, [string, string, string]> = {
  pending: ["PENDING", "#FFF4D6", "#8A5A00"],
  approved: ["RENEWED", "#DFF7EA", "#15803D"],
  declined: ["DECLINED", "#FDE2E2", "#B91C1C"],
  cancelled: ["CANCELLED", "#EEF2F7", "#5B6B8C"],
};

export default function MentorRenewalsPage() {
  const f = useFounderPerms();
  const allowed = f.isMigwith;
  const [rows, setRows] = useState<RenewRequest[] | null>(null);
  const load = () => loadRenewRequests(true).then(setRows);
  useEffect(() => {
    if (allowed) load();
  }, [allowed]);

  return (
    <FounderShell title="🔁 Mentor Renewals" allowed={allowed} loaded={f.loaded}>
      <div className={`${card} space-y-3`}>
        <p className="text-xs text-[#5B6B8C]">
          Mentors can ask from 5 days before their Mentorship ends. ✅ Renew adds 30 days (and the renewal coins); ✖ Decline tells the mentor why.
        </p>
        <button type="button" onClick={load} className="rounded-xl bg-[#EEF3FB] px-4 py-2 text-sm font-bold text-[#1E3A6E]">
          ↻ Refresh
        </button>
        {rows === null ? (
          <p className="text-sm text-[#5B6B8C]">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-[#5B6B8C]">No renewal requests yet.</p>
        ) : (
          <ul className="space-y-2.5">
            {rows.map((r) => {
              const [label, bg, fg] = STATUS[r.status] || [r.status.toUpperCase(), "#EEF2F7", "#5B6B8C"];
              const left = r.untilMs ? Math.ceil((r.untilMs - Date.now()) / 86_400_000) : 0;
              return (
                <li key={r.uid + r.createdAtMs} className="rounded-xl border border-[#E5EAF5] p-3 text-sm">
                  <div className="flex items-center gap-2.5">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#C7D7FF] font-extrabold uppercase text-[#2B5FD9]">
                      {r.username.slice(0, 1)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <b>{r.username}</b>
                      <div className="text-xs text-[#5B6B8C]">
                        {r.status === "approved" && r.newUntilMs
                          ? `renewed → ${dhakaDate(r.newUntilMs)}`
                          : r.status === "pending"
                            ? `${left > 0 ? `ends ${dhakaDate(r.untilMs)} (${left} day${left > 1 ? "s" : ""})` : `ended ${dhakaDate(r.untilMs)}`}`
                            : r.reason
                              ? `"${r.reason}"`
                              : dhakaDate(r.decidedAtMs)}
                      </div>
                    </div>
                    <span className="rounded-full px-2 py-0.5 text-[10.5px] font-extrabold" style={{ background: bg, color: fg }}>
                      {label}
                    </span>
                  </div>
                  {r.note && <div className="mt-2 rounded-lg bg-[#F4F7FB] px-2.5 py-1.5 text-xs text-[#2E3B4E]">📝 {r.note}</div>}
                  {r.status === "pending" && <RenewDecider uid={r.uid} onDone={() => setTimeout(load, 300)} />}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </FounderShell>
  );
}
