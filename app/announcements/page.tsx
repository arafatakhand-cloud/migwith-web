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

// 📢 Announcements, like the app's (Explore → Announcements): everyone reads
// them, migwith adds / edits / deletes them.

type Item = { id: string; message: string; createdAtMs: number };

export default function AnnouncementsPage() {
  const ready = useRequireLogin();
  const { username } = useSession();
  const isAdmin = (username || "").trim().toLowerCase() === "migwith";
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
        <PageTitle title="Announcements" subtitle="MIGlife News & Updates" icon="📢" />
        {isAdmin && (
          <button
            type="button"
            onClick={() => setEditor({ id: null, text: "" })}
            className="mb-2 w-full rounded-full bg-[#2F80ED] py-2 text-[13px] font-semibold text-white"
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
          <div className="space-y-2">
            {items.map((a) => (
              <div key={a.id} className="rounded-xl bg-[#0B1F3A] p-2.5 text-white">
                <p className="whitespace-pre-wrap break-words text-[13px] leading-[17px]">{a.message}</p>
                {a.createdAtMs > 0 && (
                  <p className="mt-1 text-[10px] text-[#B9C4DD]">
                    {new Date(a.createdAtMs).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })} ·{" "}
                    {new Date(a.createdAtMs).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                  </p>
                )}
                {isAdmin && (
                  <div className="mt-1.5 flex gap-2 text-xs">
                    <button type="button" onClick={() => setEditor({ id: a.id, text: a.message })} className="px-2.5 py-1 text-[#F2B53A]">
                      EDIT
                    </button>
                    <button type="button" onClick={() => remove(a.id)} className="px-2.5 py-1 text-[#FF9696]">
                      DELETE
                    </button>
                  </div>
                )}
              </div>
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
