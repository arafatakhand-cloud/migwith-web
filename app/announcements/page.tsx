"use client";

import { useEffect, useState } from "react";
import { addDoc, collection, deleteDoc, doc, onSnapshot, orderBy, query, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useSession } from "../_components/AppSession";
import { useRequireLogin } from "../../lib/useRequireLogin";
import { PageShell } from "../_components/PageShell";
import { PageTitle } from "../_components/LightCards";
import { isMainFounderName } from "../../lib/founder";

// 📢 Announcements (miglife "D · Glass + 📌 Pinned", Nov 2026): the pinned one (else the
// newest) is a big glass card on top; the rest are glass rows with a coloured 3D badge
// for their kind. Everyone reads them; miglife adds / edits / pins / deletes them.

type Kind = "important" | "news" | "update" | "event";
type Item = { id: string; message: string; createdAtMs: number; kind: Kind; pinned: boolean };

const ANN_KINDS: Record<Kind, { icon: string; label: string; grad: string; ink: string }> = {
  important: { icon: "⚠️", label: "Important", grad: "linear-gradient(135deg,#FDE68A,#F59E0B)", ink: "#B45309" },
  news: { icon: "🎉", label: "News", grad: "linear-gradient(135deg,#A7F3D0,#14B88F)", ink: "#0E7A62" },
  update: { icon: "🛠", label: "Update", grad: "linear-gradient(135deg,#F5D0FE,#A855F7)", ink: "#7E22CE" },
  event: { icon: "🏆", label: "Event", grad: "linear-gradient(135deg,#BFDBFE,#3B82F6)", ink: "#1D4ED8" },
};
// an older announcement has no kind: "important" if it says so, else news
function kindOf(v: unknown, message: string): Kind {
  if (v === "important" || v === "news" || v === "update" || v === "event") return v;
  return /important|urgent|warning|জরুরি|গুরুত্বপূর্ণ/i.test(message.split("\n")[0] || "") ? "important" : "news";
}

// A line that starts with an emoji / symbol (not a letter or number).
const EMOJI_START = /^[^\p{L}\p{N}\s"'(—–-]/u;

function ago(ms: number): string {
  if (!ms) return "";
  const d = Math.floor((Date.now() - ms) / 86_400_000);
  if (d <= 0) return "Today";
  if (d === 1) return "Yesterday";
  if (d < 7) return `${d} days ago`;
  return new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric", year: new Date(ms).getFullYear() === new Date().getFullYear() ? undefined : "numeric" });
}
const clock = (ms: number) => (ms ? new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "");

function Body({ text, className = "" }: { text: string; className?: string }) {
  return (
    <p className={`whitespace-pre-wrap break-words ${className}`}>
      {/* a line that starts with an emoji (📌 👀 ✨ …) stands out: teal and bold */}
      {text.split("\n").map((ln, i, all) => (
        <span key={i} className={EMOJI_START.test(ln.trim()) ? "font-extrabold text-[#0E7490]" : undefined}>
          {ln}
          {i < all.length - 1 ? "\n" : ""}
        </span>
      ))}
    </p>
  );
}

function Badge({ kind, size }: { kind: Kind; size: number }) {
  const k = ANN_KINDS[kind];
  return (
    <span
      className="flex shrink-0 items-center justify-center"
      style={{ width: size, height: size, borderRadius: size * 0.35, background: k.grad, fontSize: size * 0.5, boxShadow: "0 3px 0 rgba(0,0,0,.12), inset 0 1px 1px rgba(255,255,255,.7)" }}
    >
      {k.icon}
    </span>
  );
}

function AdminBar({ onEdit, onPin, onDelete, pinned }: { onEdit: () => void; onPin: () => void; onDelete: () => void; pinned: boolean }) {
  return (
    <div className="mt-3 flex flex-wrap justify-end gap-2 text-xs font-bold">
      <button type="button" onClick={onPin} className="rounded-full bg-[#ECFBF6] px-3 py-1 text-[#0E7A62]">{pinned ? "📌 Unpin" : "📌 Pin"}</button>
      <button type="button" onClick={onEdit} className="rounded-full bg-[#FFF4DC] px-3 py-1 text-[#B7791F]">✏️ Edit</button>
      <button type="button" onClick={onDelete} className="rounded-full bg-[#FFE8E8] px-3 py-1 text-[#C62828]">🗑 Delete</button>
    </div>
  );
}

const glass = "border-[1.5px] border-white/90 bg-white/60 shadow-[inset_0_1px_1px_#fff,0_6px_16px_rgba(40,80,160,.10)] backdrop-blur-md";

export default function AnnouncementsPage() {
  const ready = useRequireLogin();
  const { username } = useSession();
  const isAdmin = isMainFounderName(username);
  const [items, setItems] = useState<Item[] | null>(null);
  const [editor, setEditor] = useState<{ id: string | null; text: string; kind: Kind; pinned: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [heroOpen, setHeroOpen] = useState(false);
  const [openId, setOpenId] = useState("");
  const [toast, setToast] = useState("");

  useEffect(() => {
    if (!ready) return;
    return onSnapshot(
      query(collection(db, "announcements"), orderBy("createdAt", "desc")),
      (snap) =>
        setItems(
          snap.docs.map((d) => {
            const message = String(d.get("message") || "");
            return { id: d.id, message, createdAtMs: d.get("createdAt")?.toMillis?.() ?? 0, kind: kindOf(d.get("kind"), message), pinned: d.get("pinned") === true };
          })
        ),
      () => setItems([])
    );
  }, [ready]);
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(""), 2200);
    return () => window.clearTimeout(t);
  }, [toast]);

  const save = async () => {
    if (!editor) return;
    const text = editor.text.trim();
    if (!text) return setError("Announcement can't be empty.");
    setBusy(true);
    setError("");
    try {
      // 📌 only one pinned at a time
      if (editor.pinned) await Promise.all((items || []).filter((x) => x.pinned && x.id !== editor.id).map((x) => updateDoc(doc(db, "announcements", x.id), { pinned: false })));
      if (editor.id) await updateDoc(doc(db, "announcements", editor.id), { message: text, kind: editor.kind, pinned: editor.pinned, editedAt: serverTimestamp() });
      else await addDoc(collection(db, "announcements"), { message: text, kind: editor.kind, pinned: editor.pinned, createdBy: username, createdAt: serverTimestamp() });
      setEditor(null);
    } catch (e: any) {
      setError(e?.message || (editor.id ? "Could not update announcement." : "Could not post announcement."));
    } finally {
      setBusy(false);
    }
  };
  const togglePin = async (a: Item) => {
    try {
      if (!a.pinned) await Promise.all((items || []).filter((x) => x.pinned).map((x) => updateDoc(doc(db, "announcements", x.id), { pinned: false })));
      await updateDoc(doc(db, "announcements", a.id), { pinned: !a.pinned });
      setToast(a.pinned ? "Unpinned" : "📌 Pinned to the top");
    } catch (e: any) {
      setError(e?.message || "Could not pin it.");
    }
  };
  const remove = (id: string) => {
    if (window.confirm("Delete announcement?\n\nThis can't be undone.")) deleteDoc(doc(db, "announcements", id)).catch(() => {});
  };
  const share = async (a: Item) => {
    const title = a.message.split("\n")[0].trim();
    const url = `${window.location.origin}/announcements`;
    try {
      if (navigator.share) await navigator.share({ title, text: title, url });
      else {
        await navigator.clipboard.writeText(`${title}\n${url}`);
        setToast("Link copied");
      }
    } catch {
      // closed the share sheet
    }
  };

  const hero = items && items.length ? items.find((x) => x.pinned) || items[0] : null;
  const rest = (items || []).filter((x) => x !== hero);

  return (
    <PageShell light>
      <section className="mx-auto max-w-2xl px-3 pb-8 sm:px-6">
        <PageTitle title="Announcements" subtitle="miGlife Team" icon="📢" backHref="/explore" />
        {isAdmin && (
          <button
            type="button"
            onClick={() => setEditor({ id: null, text: "", kind: "news", pinned: false })}
            className="mb-3 w-full rounded-2xl bg-gradient-to-b from-[#2C9BEA] to-[#1A78C8] py-2.5 text-[13.5px] font-extrabold text-white shadow-[0_3px_0_#13589A] transition active:translate-y-[2px] active:shadow-[0_1px_0_#13589A]"
          >
            ＋ Add Announcement
          </button>
        )}
        {error && <p className="mb-1.5 text-xs text-[#B3261E]">{error}</p>}
        {items === null ? (
          <p className="py-10 text-center text-sm text-[#6B7A99]">Loading…</p>
        ) : !hero ? (
          <p className="text-[13px] text-[#5A6B8C]">No announcements yet.</p>
        ) : (
          <>
            {/* the pinned one (else the newest): a big glass card */}
            {(() => {
              const lines = hero.message.trim().split("\n");
              const title = lines[0].trim();
              const body = lines.slice(1).join("\n").trim();
              const isNew = hero.createdAtMs > 0 && Date.now() - hero.createdAtMs < 3 * 86_400_000;
              const long = body.length > 180 || body.split("\n").length > 3;
              return (
                <article className={`rounded-[22px] p-4 ${glass}`}>
                  <div className="flex items-center gap-2.5">
                    <Badge kind={hero.kind} size={46} />
                    <div className="min-w-0">
                      <div className="flex flex-wrap gap-1">
                        {hero.pinned && <span className="rounded-[10px] bg-[#FF4D7E] px-2 py-0.5 text-[10.5px] font-black text-white">📌 PINNED</span>}
                        {isNew && <span className="rounded-[10px] bg-[#FF4D7E] px-2 py-0.5 text-[10.5px] font-black text-white">NEW</span>}
                        <span className="rounded-[10px] bg-white px-2 py-0.5 text-[10.5px] font-black" style={{ color: ANN_KINDS[hero.kind].ink }}>
                          {ANN_KINDS[hero.kind].icon} {ANN_KINDS[hero.kind].label}
                        </span>
                      </div>
                      <div className="mt-0.5 text-[11.5px] font-semibold text-[#5B6B8C]">{ago(hero.createdAtMs)} · {clock(hero.createdAtMs)}</div>
                    </div>
                  </div>
                  <h2 className="mt-2.5 break-words text-[17px] font-black leading-snug text-[#0B2A5B]">{title}</h2>
                  {body && <Body text={body} className={`mt-1.5 text-[13.5px] leading-relaxed text-[#33476A] ${heroOpen || !long ? "" : "line-clamp-3"}`} />}
                  <div className="mt-3 flex gap-2">
                    {long && (
                      <button type="button" onClick={() => setHeroOpen((v) => !v)} className="flex-1 rounded-[14px] bg-gradient-to-b from-[#2C9BEA] to-[#1A78C8] py-2.5 text-[13px] font-extrabold text-white shadow-[0_3px_0_#13589A] transition active:translate-y-[2px] active:shadow-[0_1px_0_#13589A]">
                        {heroOpen ? "Show less ▴" : "Read more ▾"}
                      </button>
                    )}
                    <button type="button" onClick={() => share(hero)} className="flex-1 rounded-[14px] bg-white py-2.5 text-[13px] font-extrabold text-[#0B2A5B] shadow-[0_3px_0_#C3D9EF] transition active:translate-y-[2px] active:shadow-[0_1px_0_#C3D9EF]">
                      ↗ Share
                    </button>
                  </div>
                  {isAdmin && <AdminBar pinned={hero.pinned} onPin={() => togglePin(hero)} onEdit={() => setEditor({ id: hero.id, text: hero.message, kind: hero.kind, pinned: hero.pinned })} onDelete={() => remove(hero.id)} />}
                </article>
              );
            })()}

            {/* the rest: glass rows, tap to open */}
            {rest.length > 0 && <p className="mb-1 mt-5 px-1 text-[11.5px] font-black tracking-[1px] text-[#4A6A8A]">EARLIER</p>}
            <div className="space-y-2.5">
              {rest.map((a) => {
                const lines = a.message.trim().split("\n");
                const title = lines[0].trim();
                const body = lines.slice(1).join("\n").trim();
                const open = openId === a.id;
                const k = ANN_KINDS[a.kind];
                return (
                  <div key={a.id} className={`rounded-[18px] ${glass}`}>
                    <button type="button" onClick={() => setOpenId(open ? "" : a.id)} className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left">
                      <Badge kind={a.kind} size={40} />
                      <span className="min-w-0 flex-1">
                        <span className={`block break-words text-[14px] font-extrabold leading-snug text-[#0B2A5B] ${open ? "" : "line-clamp-2"}`}>{title}</span>
                        <span className="mt-0.5 block text-[11px] font-semibold text-[#6B7FA0]">
                          <span style={{ color: k.ink }}>{k.icon} {k.label}</span> · {ago(a.createdAtMs)}
                        </span>
                      </span>
                      <span className={`text-[20px] text-[#8EA3C4] transition ${open ? "rotate-90" : ""}`}>›</span>
                    </button>
                    {open && (
                      <div className="border-t border-white/80 px-3.5 pb-3 pt-2">
                        {body && <Body text={body} className="text-[13.5px] leading-relaxed text-[#33476A]" />}
                        <div className="mt-2 flex items-center justify-between">
                          <span className="text-[11px] font-semibold text-[#8A97AE]">{new Date(a.createdAtMs).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })} · {clock(a.createdAtMs)}</span>
                          <button type="button" onClick={() => share(a)} className="rounded-full bg-white px-3 py-1 text-[12px] font-bold text-[#0B2A5B] shadow-[0_2px_0_#C3D9EF]">↗ Share</button>
                        </div>
                        {isAdmin && <AdminBar pinned={a.pinned} onPin={() => togglePin(a)} onEdit={() => setEditor({ id: a.id, text: a.message, kind: a.kind, pinned: a.pinned })} onDelete={() => remove(a.id)} />}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </section>

      {toast && <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-[#0B2A5B] px-4 py-2 text-[13px] font-bold text-white shadow-lg">{toast}</div>}

      {editor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !busy && setEditor(null)}>
          <div className="w-full max-w-md rounded-3xl bg-white p-5 text-[#0B1F3A]" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold">{editor.id ? "Edit Announcement" : "New Announcement"}</h2>
            {/* the kind: its coloured badge on the card */}
            <div className="mt-3 grid grid-cols-4 gap-1.5">
              {(Object.keys(ANN_KINDS) as Kind[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setEditor({ ...editor, kind: k })}
                  className={`flex flex-col items-center gap-1 rounded-xl border-2 py-2 text-[11.5px] font-bold ${editor.kind === k ? "border-[#2F80ED] bg-[#EEF5FF]" : "border-transparent bg-[#F6F9FD]"}`}
                >
                  <Badge kind={k} size={30} />
                  {ANN_KINDS[k].label}
                </button>
              ))}
            </div>
            <textarea
              value={editor.text}
              onChange={(e) => setEditor({ ...editor, text: e.target.value.slice(0, 1500) })}
              placeholder={"The first line is the title…\nThen the details. A line that starts with an emoji (📌 👀) stands out."}
              className="mt-3 h-40 w-full rounded-xl border border-[#CFE3F5] p-3 text-base outline-none focus:border-[#2F80ED]"
            />
            <label className="mt-2 flex items-center gap-2 text-[13.5px] font-semibold">
              <input type="checkbox" checked={editor.pinned} onChange={(e) => setEditor({ ...editor, pinned: e.target.checked })} className="h-4 w-4" />
              📌 Pin to the top (the pinned one shows first)
            </label>
            <div className="mt-3 flex justify-end gap-2 text-sm font-semibold">
              <button type="button" disabled={busy} onClick={() => setEditor(null)} className="px-3 py-2 text-[#2F80ED]">
                CANCEL
              </button>
              <button type="button" disabled={busy} onClick={save} className="px-3 py-2 text-[#2F80ED]">
                {busy ? "Saving…" : "SAVE"}
              </button>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}
