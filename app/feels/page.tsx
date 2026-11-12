"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { collection, doc, getDoc, getDocs } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { PageShell } from "../_components/PageShell";
import { BackButton } from "../_components/BackButton";
import { useRequireLogin } from "../../lib/useRequireLogin";
import { useSession } from "../_components/AppSession";
import { loadFeelings, loadFeelingsToManage, manageFeel, sendFeel, type CatalogFeel } from "../../lib/roomFeelings";

// 💭 FeelMig, like the Gift Gallery: every feeling as a card (5 coins each).
// Opened from a room (?room=Bangladesh): tap one → pick who it's with, add a
// message, Send — the server takes the coins and writes the room line.
// miGlife (the Gift Shops tool): add / edit / delete, upload a picture.

export default function FeelsPage() {
  return (
    <Suspense fallback={null}>
      <FeelGallery />
    </Suspense>
  );
}

const fileToBase64 = (f: File) =>
  new Promise<string>((ok, bad) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result).split(",")[1] || "");
    r.onerror = () => bad(new Error("Could not read the picture."));
    r.readAsDataURL(f);
  });

function FeelGallery() {
  useRequireLogin();
  const { user, username } = useSession();
  const [myLevel, setMyLevel] = useState(0);
  useEffect(() => {
    if (user) getDoc(doc(db, "users", user.uid)).then((d) => setMyLevel(Math.floor(Number(d.get("level")) || 0))).catch(() => {});
  }, [user]);
  const router = useRouter();
  const room = useSearchParams().get("room") || "";
  const [list, setList] = useState<CatalogFeel[] | null>(null);
  const [manager, setManager] = useState(false);
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<CatalogFeel | null>(null);
  const [editing, setEditing] = useState<{ isNew: boolean; feel: CatalogFeel } | null>(null);
  const [toast, setToast] = useState("");

  const load = () =>
    loadFeelingsToManage()
      .then((r) => {
        setManager(r.manager);
        setList(r.feelings.filter((f) => r.manager || f.active));
      })
      .catch(() => loadFeelings().then(setList));
  useEffect(() => {
    if (user) load();
  }, [user]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (list || []).filter((f) => !q || f.label.toLowerCase().includes(q) || f.id.includes(q));
  }, [list, search]);

  if (!user) return null;
  return (
    <PageShell light>
      <section className="mx-auto max-w-2xl p-3.5 pb-8 lg:max-w-4xl">
        <div className="flex items-center gap-1">
          <BackButton onClick={() => router.back()} className="mr-1.5" />
          <div className="min-w-0 flex-1">
            <h1 className="text-[25px] font-bold text-[#0B1F3A]">💭 FeelMig</h1>
            <p className="text-xs text-[#68758D]">{room ? `Send a feeling in ${room} · 5 coins` : "Share how you feel · 5 coins"}</p>
          </div>
          {manager && (
            <button
              type="button"
              onClick={() => setEditing({ isNew: true, feel: { id: "", label: "", emoji: "💭", imageUrl: "", price: 5, sortOrder: (list?.length || 0) + 1, active: true } })}
              className="rounded-full bg-[#0B1F3A] px-3 py-2 text-xs font-semibold text-white shadow-[inset_0_2px_0_rgba(255,255,255,.2),0_3px_0_#050F1F,0_5px_0_#03080F,0_8px_10px_rgba(11,31,58,.3)] active:translate-y-[2px]"
            >
              ＋ Add Feel
            </button>
          )}
        </div>

        {manager && (
          <p className="mt-2.5 rounded-2xl border border-[#D4AF37]/65 bg-[#FFF6D8] p-3.5 text-xs text-[#0B1F3A]">
            Admin mode: Add, edit or delete feelings, or upload a picture for one. Everyone else can browse and send them.
          </p>
        )}
        {!room && (
          <p className="mt-2.5 rounded-2xl bg-white/70 p-3 text-xs text-[#45557A]">
            💡 In a room, type <b>/feel miglife sad -m Sorry for that</b> — or open this page from the room&apos;s menu and tap a feeling.
          </p>
        )}
        <label className="mt-3 flex items-center gap-2 rounded-[14px] border border-[#D4DDEB] bg-white px-3 py-2.5 shadow-[inset_0_2px_0_#fff,0_2px_0_#C9D8EA,0_4px_0_#B7C9E0,0_7px_10px_rgba(11,31,58,.12)]">
          <span>🔍</span>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search feelings…" className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
          {search && (
            <button type="button" onClick={() => setSearch("")} className="px-1 text-[#68758D]">
              ✕
            </button>
          )}
        </label>

        {list === null ? (
          <p className="p-4 text-[#0B1F3A]">Loading feelings…</p>
        ) : shown.length === 0 ? (
          <p className="py-10 text-center text-sm text-[#5B6B8C]">No feeling matches &quot;{search}&quot;.</p>
        ) : (
          <ul className="mt-3 grid grid-cols-3 gap-2.5 sm:grid-cols-4 lg:grid-cols-6">
            {shown.map((f) => (
              <li key={f.id} className="relative py-1">
                <div
                  className={`flex flex-col items-center rounded-[20px] border border-[#D4DDEB] bg-white px-2 pb-2.5 pt-3 text-center shadow-[inset_0_2px_0_#fff,0_3px_0_#BFD0E8,0_6px_0_#AFC2DE,0_9px_0_#9FB4D4,0_14px_18px_rgba(11,31,58,.22)] ${f.active ? "" : "opacity-55"}`}
                >
                  <button type="button" onClick={() => setPicked(f)} className="flex w-full flex-col items-center" aria-label={`Send ${f.label}`}>
                    <span className="flex h-[62px] w-[62px] items-center justify-center overflow-hidden rounded-full border border-white/60 bg-gradient-to-br from-[#EAF1FB] to-[#D7E6FA] text-[34px] shadow">
                      {f.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={f.imageUrl} alt="" className="h-full w-full object-contain" />
                      ) : (
                        f.emoji
                      )}
                    </span>
                    <span className="mt-2 line-clamp-1 text-[14px] font-bold text-[#0B1F3A]">{f.label}</span>
                    <span className="mt-1.5 rounded-full bg-gradient-to-b from-[#FFE7A0] to-[#FFD15A] px-2.5 py-0.5 text-[11.5px] font-extrabold text-[#6A4A00] shadow-[0_3px_0_#D9A92A]">
                      💰 {f.price}
                    </span>
                  </button>
                  {manager && (
                    <div className="mt-2 flex w-full justify-center gap-3 border-t border-[#EEF2F7] pt-1.5 text-[12px] font-bold">
                      <button type="button" onClick={() => setEditing({ isNew: false, feel: f })} className="text-[#2563EB]">
                        ✎ Edit
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          if (!confirm(`Delete ${f.label}?`)) return;
                          try {
                            await manageFeel({ action: "delete", id: f.id });
                            loadFeelings(true);
                            load();
                          } catch (e: any) {
                            setToast(e?.message || "Could not delete.");
                          }
                        }}
                        className="text-[#DC2626]"
                      >
                        🗑 Delete
                      </button>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        {toast && (
          <p className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-full bg-[#0B1F3A]/95 px-4 py-2 text-[13px] font-bold text-white" onClick={() => setToast("")}>
            {toast}
          </p>
        )}
      </section>

      {picked && (
        <SendSheet
          feel={picked}
          room={room}
          me={username}
          myLevel={myLevel}
          onClose={() => setPicked(null)}
          onSent={() => {
            setPicked(null);
            router.back();
          }}
        />
      )}
      {editing && (
        <EditSheet
          isNew={editing.isNew}
          initial={editing.feel}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            loadFeelings(true);
            load();
          }}
        />
      )}
    </PageShell>
  );
}

function Sheet({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-[24px] bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

/** Tap a feeling → who it's with, a message, the line it makes, Send. */
function SendSheet({ feel, room, me, myLevel, onClose, onSent }: { feel: CatalogFeel; room: string; me: string; myLevel: number; onClose: () => void; onSent: () => void }) {
  const [people, setPeople] = useState<string[]>([]);
  const [who, setWho] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => {
    if (!room) return;
    getDocs(collection(db, "room_presence", room, "users"))
      .then((s) =>
        setPeople(
          s.docs
            .map((d) => String(d.get("username") || ""))
            .filter((n) => n && n.toLowerCase() !== me.toLowerCase())
            .sort((a, b) => a.localeCompare(b))
        )
      )
      .catch(() => setPeople([]));
  }, [room, me]);
  const send = async () => {
    setBusy(true);
    setErr("");
    try {
      await sendFeel(room, feel.id, who, msg.trim());
      onSent();
    } catch (e: any) {
      setErr(e?.message || "Could not send. Please try again.");
      setBusy(false);
    }
  };
  return (
    <Sheet onClose={onClose}>
      <div className="flex items-start justify-between">
        <div className="flex-1 text-center">
          <div className="mx-auto flex h-20 w-20 items-center justify-center text-[60px]">
            {feel.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={feel.imageUrl} alt="" className="h-full w-full object-contain" />
            ) : (
              feel.emoji
            )}
          </div>
          <div className="text-[20px] font-black text-[#16264A]">{feel.label}</div>
          <div className="text-[12px] font-bold text-[#8A6A00]">💰 {feel.price} coins</div>
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="text-[#8494B2]">
          ✕
        </button>
      </div>
      {!room ? (
        <p className="mt-4 rounded-2xl bg-[#F4F7FB] p-3 text-center text-[13px] text-[#45557A]">
          In a room, type <b>/feel {feel.id}</b> — or <b>/feel name {feel.id} -m message</b>.
        </p>
      ) : (
        <>
          <p className="mt-4 text-[13px] font-bold text-[#5B6B8C]">With who? (optional)</p>
          <div className="mt-1.5 flex max-h-32 flex-wrap gap-2 overflow-y-auto">
            {["", ...people].map((n) => (
              <button
                key={n || "-me"}
                type="button"
                onClick={() => setWho(n)}
                className={`rounded-full px-3 py-1.5 text-[13px] font-bold ${who === n ? "bg-[#2563EB] text-white" : "bg-[#F1F4F9] text-[#16264A]"}`}
              >
                {n || "Just me"}
              </button>
            ))}
          </div>
          <p className="mt-3 text-[13px] font-bold text-[#5B6B8C]">Message (optional)</p>
          <input
            value={msg}
            onChange={(e) => setMsg(e.target.value.slice(0, 200))}
            placeholder="e.g. Sorry for that"
            className="mt-1.5 w-full rounded-[14px] border-[1.5px] border-[#D4DDEB] px-3 py-2.5 text-[14px] text-[#16264A] outline-none focus:border-[#2563EB]"
          />
          <div className="mt-3 rounded-[14px] bg-[#F4F7FB] p-2.5 text-center text-[13.5px] font-bold text-[#2563EB]">
            &lt;&lt;{me}
            <span className="text-[#F57C00]">[{myLevel}]</span> feels {feel.emoji} {feel.label}
            {who ? ` with ${who}` : ""}!&gt;&gt;
            {msg.trim() && <div className="font-semibold italic text-[#5B6B8C]">— &quot;{msg.trim()}&quot;</div>}
          </div>
          {err && <p className="mt-2 text-[12.5px] font-bold text-[#B91C1C]">{err}</p>}
          <button
            type="button"
            disabled={busy}
            onClick={send}
            className="mt-3 w-full rounded-[14px] bg-[#2563EB] py-3 text-[15px] font-extrabold text-white disabled:opacity-60"
          >
            {busy ? "Sending…" : `💭 Send to ${room} · ${feel.price} coins`}
          </button>
        </>
      )}
    </Sheet>
  );
}

/** miGlife: add or change a feeling (name, emoji, picture, price, shown or hidden). */
function EditSheet({ isNew, initial, onClose, onSaved }: { isNew: boolean; initial: CatalogFeel; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const id = isNew ? f.label.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 30) : f.id;
  const upload = async (file: File | undefined) => {
    if (!file || !id) {
      if (!id) setErr("Write the name first.");
      return;
    }
    setBusy(true);
    setErr("");
    try {
      const r = await manageFeel({ action: "upload", id, contentType: file.type, fileBase64: await fileToBase64(file) });
      if (r.url) setF((x) => ({ ...x, imageUrl: r.url! }));
    } catch (e: any) {
      setErr(e?.message || "Could not upload the picture.");
    } finally {
      setBusy(false);
    }
  };
  const save = async () => {
    setBusy(true);
    setErr("");
    try {
      await manageFeel({ action: "save", id, isNew, feel: { label: f.label, emoji: f.emoji, imageUrl: f.imageUrl, price: f.price, sortOrder: f.sortOrder, active: f.active } });
      onSaved();
    } catch (e: any) {
      setErr(e?.message || "Could not save.");
      setBusy(false);
    }
  };
  const field = "mt-1 w-full rounded-[12px] border border-[#D4DDEB] px-3 py-2 text-[14px] text-[#16264A] outline-none focus:border-[#2563EB]";
  return (
    <Sheet onClose={onClose}>
      <div className="flex items-center justify-between">
        <h3 className="text-[17px] font-black text-[#16264A]">{isNew ? "＋ Add a feeling" : `✎ ${initial.label}`}</h3>
        <button type="button" onClick={onClose} aria-label="Close" className="text-[#8494B2]">
          ✕
        </button>
      </div>
      <label className="mt-3 block text-[12.5px] font-bold text-[#5B6B8C]">
        Name (what people see)
        <input value={f.label} onChange={(e) => setF({ ...f, label: e.target.value.slice(0, 30) })} placeholder="e.g. Missing you" className={field} />
      </label>
      {isNew && id && <p className="mt-1 text-[11.5px] text-[#8A97A8]">Typed as: /feel {id}</p>}
      <div className="mt-3 grid grid-cols-2 gap-3">
        <label className="block text-[12.5px] font-bold text-[#5B6B8C]">
          Emoji
          <input value={f.emoji} onChange={(e) => setF({ ...f, emoji: e.target.value.slice(0, 16) })} className={field} />
        </label>
        <label className="block text-[12.5px] font-bold text-[#5B6B8C]">
          Price (coins)
          <input
            type="number"
            min={1}
            value={f.price}
            onChange={(e) => setF({ ...f, price: Math.max(1, Math.floor(Number(e.target.value) || 1)) })}
            className={field}
          />
        </label>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <span className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-[#EEF3FB] text-[34px]">
          {f.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={f.imageUrl} alt="" className="h-full w-full object-contain" />
          ) : (
            f.emoji
          )}
        </span>
        <label className="cursor-pointer rounded-full bg-[#EAF2FF] px-3 py-2 text-[12.5px] font-extrabold text-[#2563EB]">
          📷 {f.imageUrl ? "Change picture" : "Upload picture"}
          <input type="file" accept="image/*" hidden onChange={(e) => (upload(e.target.files?.[0]), (e.target.value = ""))} />
        </label>
        {f.imageUrl && (
          <button type="button" onClick={() => setF({ ...f, imageUrl: "" })} className="text-[12.5px] font-bold text-[#DC2626]">
            Remove
          </button>
        )}
      </div>
      <label className="mt-3 flex items-center gap-2 text-[13px] font-bold text-[#16264A]">
        <input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} />
        Shown to everyone
      </label>
      {err && <p className="mt-2 text-[12.5px] font-bold text-[#B91C1C]">{err}</p>}
      <button type="button" disabled={busy || !f.label.trim()} onClick={save} className="mt-4 w-full rounded-[14px] bg-[#0B1F3A] py-3 text-[15px] font-extrabold text-white disabled:opacity-50">
        {busy ? "…" : "Save"}
      </button>
    </Sheet>
  );
}
