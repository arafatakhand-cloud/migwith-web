"use client";

import { useEffect, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useSession } from "../_components/AppSession";
import { useRequireLogin } from "../../lib/useRequireLogin";
import { PageShell } from "../_components/PageShell";
import { PageTitle } from "../_components/LightCards";
import { isMainFounderName } from "../../lib/founder";

// 📢 Announcements, like the app's (Explore → Announcements): everyone reads
// them, migwith adds / edits / deletes them.

type Item = { id: string; message: string; createdAtMs: number };

// A short card: the first line as the title, 2 lines of preview, and a tap
// opens the whole announcement (tap again to close). New ones (3 days) get a NEW tag.
function AnnouncementCard({ a, isAdmin, onEdit, onDelete }: { a: Item; isAdmin: boolean; onEdit: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const lines = a.message.trim().split("\n");
  const title = lines[0].trim();
  const rest = lines.slice(1).join("\n").trim();
  const isNew = a.createdAtMs > 0 && Date.now() - a.createdAtMs < 3 * 86_400_000;
  const when =
    a.createdAtMs > 0
      ? `${new Date(a.createdAtMs).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })} · ${new Date(a.createdAtMs).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
      : "";
  return (
    <div
      className={`ann-card relative overflow-hidden rounded-[20px] border bg-white shadow-sm transition ${open ? "border-[#BFD5F5] shadow-md" : "border-[#E3ECF7]"}`}
    >
      <span className="absolute inset-y-0 left-0 w-1.5 bg-gradient-to-b from-[#5A8FD6] to-[#8B5CFF]" />
      <button type="button" onClick={() => setOpen((v) => !v)} className="block w-full py-3 pl-5 pr-4 text-left">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center ann-icon rounded-2xl bg-gradient-to-br from-[#EAF1FC] to-[#F1EAFF] text-xl"><span className="inline-block -scale-x-100">📢</span></span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              {isNew && <span className="rounded-full bg-[#FF5E8A] px-1.5 py-px text-[9px] font-black tracking-wide text-white">NEW</span>}
              <span className="truncate text-[11px] font-semibold text-[#8A97B2]">{when}</span>
            </div>
            <p className={`mt-0.5 break-words text-[15px] font-extrabold leading-5 text-[#0B2A5B] ${open ? "" : "line-clamp-2"}`}>{title}</p>
            {rest && (
              <p className={`mt-1 whitespace-pre-wrap break-words text-[13.5px] leading-5 text-[#3D4F72] ${open ? "" : "line-clamp-2"}`}>{rest}</p>
            )}
            {(rest || title.length > 60) && (
              <span className="mt-1.5 inline-flex items-center gap-1 ann-chip rounded-full bg-[#EEF3FB] px-2.5 py-1 text-[11px] font-bold text-[#1E63D6]">
                {open ? "Show less ▴" : "Read more ▾"}
              </span>
            )}
          </div>
        </div>
      </button>
      {isAdmin && open && (
        <div className="ann-line flex justify-end gap-2 border-t border-[#EEF3FB] px-4 py-2 text-xs font-bold">
          <button type="button" onClick={onEdit} className="rounded-full bg-[#FFF4DC] px-3 py-1 text-[#B7791F]">
            ✏️ EDIT
          </button>
          <button type="button" onClick={onDelete} className="rounded-full bg-[#FFE8E8] px-3 py-1 text-[#C62828]">
            🗑 DELETE
          </button>
        </div>
      )}
    </div>
  );
}

export default function AnnouncementsPage() {
  const ready = useRequireLogin();
  const { username } = useSession();
  const isAdmin = isMainFounderName(username);
  const [items, setItems] = useState<Item[] | null>(null);
  const [editor, setEditor] = useState<{ id: string | null; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!ready) return;
    return onSnapshot(
      query(collection(db, "announcements"), orderBy("createdAt", "desc")),
      (snap) =>
        setItems(
          snap.docs.map((d) => ({
            id: d.id,
            message: String(d.get("message") || ""),
            createdAtMs: d.get("createdAt")?.toMillis?.() ?? 0,
          }))
        ),
      () => setItems([])
    );
  }, [ready]);

  const save = async () => {
    if (!editor) return;
    const text = editor.text.trim();
    if (!text) return setError("Announcement can't be empty.");
    setBusy(true);
    setError("");
    try {
      if (editor.id) await updateDoc(doc(db, "announcements", editor.id), { message: text, editedAt: serverTimestamp() });
      else await addDoc(collection(db, "announcements"), { message: text, createdBy: username, createdAt: serverTimestamp() });
      setEditor(null);
    } catch (e: any) {
      setError(e?.message || (editor.id ? "Could not update announcement." : "Could not post announcement."));
    } finally {
      setBusy(false);
    }
  };

  const remove = (id: string) => {
    if (window.confirm("Delete announcement?\n\nThis can't be undone.")) deleteDoc(doc(db, "announcements", id)).catch(() => {});
  };

  return (
    <PageShell light>
      <section className="mx-auto max-w-2xl px-3 pb-8 sm:px-6">
        <PageTitle title="Announcements" subtitle="MIGlife News & Updates" icon="📢" backHref="/explore" />
        {isAdmin && (
          <button
            type="button"
            onClick={() => setEditor({ id: null, text: "" })}
            className="ann-add mb-2 w-full rounded-full bg-[#2F80ED] py-2 text-[13px] font-semibold text-white"
          >
            ＋ Add Announcement
          </button>
        )}
        {error && <p className="mb-1.5 text-xs text-[#B3261E]">{error}</p>}
        {items === null ? (
          <p className="py-10 text-center text-sm text-[#6B7A99]">Loading…</p>
        ) : items.length === 0 ? (
          <p className="text-[13px] text-[#5A6B8C]">No announcements yet.</p>
        ) : (
          <div className="space-y-2.5">
            {items.map((a) => (
              <AnnouncementCard
                key={a.id}
                a={a}
                isAdmin={isAdmin}
                onEdit={() => setEditor({ id: a.id, text: a.message })}
                onDelete={() => remove(a.id)}
              />
            ))}
          </div>
        )}
      </section>

      {editor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !busy && setEditor(null)}>
          <div className="w-full max-w-md rounded-3xl bg-white p-5 text-[#0B1F3A]" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold">{editor.id ? "Edit Announcement" : "New Announcement"}</h2>
            <textarea
              value={editor.text}
              onChange={(e) => setEditor({ ...editor, text: e.target.value.slice(0, 1500) })}
              placeholder="Write the announcement…"
              className="mt-3 h-36 w-full rounded-xl border border-[#CFE3F5] p-3 text-base outline-none focus:border-[#2F80ED]"
            />
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
