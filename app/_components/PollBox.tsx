"use client";

// 📊 A Mig's poll: tap an answer to vote (several when the writer allowed it).
// Before I vote the % stay hidden; after, every answer shows its bar and my
// answers get ✓. The writer (or the miGlife team) can end it early. The server
// counts every vote (blog "pollVote"), so nobody can vote twice.
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { blogCall, blogError, type BlogPoll } from "../../lib/feed";

const left = (ms: number) => {
  const d = ms - Date.now();
  if (d <= 0) return "";
  const h = Math.ceil(d / 3600000);
  return h >= 24 ? `${Math.ceil(h / 24)} day${Math.ceil(h / 24) === 1 ? "" : "s"} left` : `${h} hour${h === 1 ? "" : "s"} left`;
};

export function PollBox({ postId, poll: start, canEnd = false, signedIn = true }: { postId: string; poll: BlogPoll; canEnd?: boolean; signedIn?: boolean }) {
  const [poll, setPoll] = useState(start);
  const [mine, setMine] = useState<number[] | null>(null);
  const [pick, setPick] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [voters, setVoters] = useState(false);
  useEffect(() => setPoll(start), [start]);
  useEffect(() => {
    if (!signedIn) return setMine([]);
    let alive = true;
    blogCall("myPollVotes", { postIds: [postId] })
      .then((r) => alive && setMine(((r as { votes?: Record<string, number[]> }).votes || {})[postId] || []))
      .catch(() => alive && setMine([]));
    return () => {
      alive = false;
    };
  }, [postId, signedIn]);
  const open = !poll.ended && Date.now() < poll.endsMs;
  const voted = (mine || []).length > 0;
  const showResults = voted || !open;
  const total = poll.total || 0;
  const top = Math.max(0, ...poll.counts);

  const vote = async (choices: number[]) => {
    if (!signedIn || busy || !open) return;
    setBusy(true);
    setErr("");
    try {
      const r = (await blogCall("pollVote", { postId, choices })) as { poll?: BlogPoll; mine?: number[] };
      if (r.poll) setPoll({ ...poll, ...r.poll });
      setMine(r.mine || []);
      setPick([]);
    } catch (e) {
      setErr(blogError(e));
    } finally {
      setBusy(false);
    }
  };
  const tap = (i: number) => {
    if (!open) return;
    if (!poll.multi) return vote(mine && mine.length === 1 && mine[0] === i ? [] : [i]);
    const base = pick.length || !voted ? pick : mine || [];
    setPick(base.includes(i) ? base.filter((x) => x !== i) : [...base, i].sort());
  };
  const endNow = async () => {
    if (!confirm("End this poll now? Nobody can vote after this.")) return;
    try {
      const r = (await blogCall("pollEnd", { postId })) as { poll?: BlogPoll };
      if (r.poll) setPoll({ ...poll, ...r.poll });
    } catch (e) {
      setErr(blogError(e));
    }
  };

  return (
    <div className="mt-2" onClick={(e) => e.stopPropagation()}>
      {poll.options.map((o, i) => {
        const n = poll.counts[i] || 0;
        const pct = total > 0 ? Math.round((n / total) * 100) : 0;
        const isMine = (mine || []).includes(i);
        const picked = pick.includes(i);
        const win = !open && n > 0 && n === top;
        return (
          <button
            key={i}
            type="button"
            disabled={busy || !open || !signedIn}
            onClick={() => tap(i)}
            className={`relative mt-[7px] block w-full overflow-hidden rounded-[14px] border-[1.5px] px-3 py-2.5 text-left text-[13.5px] font-bold text-[#1E1B4B] transition active:scale-[.99] ${
              win ? "border-[#F59E0B]" : isMine || picked ? "border-[#6366F1]" : "border-[#D9DFF0]"
            } ${!open || !signedIn ? "cursor-default" : ""}`}
          >
            {showResults && (
              <span
                aria-hidden
                className="absolute inset-y-0 left-0 transition-[width] duration-500"
                style={{ width: `${pct}%`, background: win ? "linear-gradient(90deg,#FDE68A,#FCD34D)" : isMine ? "#C7D2FE" : "#E0E7FF" }}
              />
            )}
            <span className="relative flex items-center gap-2">
              {poll.multi && open && <span className="text-[14px]">{picked || (isMine && !pick.length) ? "☑" : "☐"}</span>}
              <span className="min-w-0 flex-1 break-words">
                {win ? "🏆 " : ""}
                {o}
                {isMine ? " ✓" : ""}
              </span>
              {showResults && <span className="shrink-0 tabular-nums">{pct}%</span>}
            </span>
          </button>
        );
      })}
      {poll.multi && open && pick.length > 0 && (
        <button type="button" disabled={busy} onClick={() => vote(pick)} className="mt-2 w-full rounded-[12px] bg-[#4F46E5] py-2 text-[13px] font-black text-white disabled:opacity-50">
          {busy ? "Voting…" : "Vote"}
        </button>
      )}
      <p className="mt-2 flex flex-wrap items-center gap-x-1.5 text-[11.5px] font-bold text-[#7A7FA6]">
        <span>
          {poll.voters || 0} {(poll.voters || 0) === 1 ? "vote" : "votes"}
        </span>
        <span>·</span>
        <span>{open ? left(poll.endsMs) : "Final results"}</span>
        {total > 0 && (
          <>
            <span>·</span>
            <button type="button" onClick={() => setVoters(true)} className="text-[#4F46E5]">
              👥 See voters
            </button>
          </>
        )}
        {open && canEnd && (
          <>
            <span>·</span>
            <button type="button" onClick={endNow} className="text-[#B45309]">
              End poll
            </button>
          </>
        )}
        {poll.multi && open && <span className="w-full text-[10.5px] font-semibold">You can pick several answers.</span>}
      </p>
      {err && <p className="mt-1 text-[12px] font-semibold text-[#B91C1C]">{err}</p>}
      {voters && <PollVoters postId={postId} options={poll.options} onClose={() => setVoters(false)} />}
    </div>
  );
}

function PollVoters({ postId, options, onClose }: { postId: string; options: string[]; onClose: () => void }) {
  const [list, setList] = useState<{ username: string; choices: number[] }[] | null>(null);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState(-1);
  useEffect(() => {
    blogCall("pollVoters", { postId })
      .then((r) => setList(((r as { voters?: { username: string; choices: number[] }[] }).voters) || []))
      .catch((e) => setErr(blogError(e)));
  }, [postId]);
  const shown = (list || []).filter((v) => tab < 0 || v.choices.includes(tab));
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/40 p-3" onClick={onClose}>
      <div className="flex max-h-[80vh] w-full max-w-md flex-col rounded-[24px] bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-[16px] font-black text-[#1E1B4B]">📊 Voters · {list ? list.length : "…"}</h3>
          <button type="button" onClick={onClose} className="text-[#8494B2]" aria-label="Close">
            ✕
          </button>
        </div>
        {list && list.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {[-1, ...options.map((_, i) => i)].map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setTab(k)}
                className={`max-w-full truncate rounded-full px-3 py-1.5 text-[12.5px] font-extrabold ${tab === k ? "bg-[#1D4ED8] text-white" : "bg-[#F1F4FB] text-[#4F46E5]"}`}
              >
                {k < 0 ? `All ${list.length}` : `${options[k]} ${list.filter((v) => v.choices.includes(k)).length}`}
              </button>
            ))}
          </div>
        )}
        <div className="mt-3 flex-1 overflow-y-auto">
          {err && <p className="text-[13px] text-[#B91C1C]">{err}</p>}
          {list === null && !err && <p className="text-[13px] text-[#6B6F9A]">Loading…</p>}
          {shown.map((v, i) => (
            <div key={`${v.username}-${i}`} className="flex items-center gap-3 border-b border-[#EEF2FA] py-2.5 last:border-0">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#38BDF8] to-[#6366F1] text-[13px] font-bold text-white">
                {v.username.slice(0, 1).toUpperCase()}
              </span>
              <Link href={`/profile/${encodeURIComponent(v.username)}`} className="min-w-0 flex-1 truncate text-[14px] font-bold text-[#1E1B4B]">
                {v.username}
              </Link>
              <span className="max-w-[45%] truncate text-[12px] font-bold text-[#4F46E5]">{v.choices.map((c) => options[c]).filter(Boolean).join(", ")}</span>
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body
  );
}
