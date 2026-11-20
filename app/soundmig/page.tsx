"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PageShell } from "../_components/PageShell";
import { BackButton } from "../_components/BackButton";
import { useRequireLogin } from "../../lib/useRequireLogin";
import { useSession } from "../_components/AppSession";
import { SOUND_GROUPS, addStarterSounds, loadSounds, manageSound, playSound, previewSound, setSoundsMuted, soundsMuted, stopSound, type Sound } from "../../lib/soundMig";

// 🔊 SoundMig: short sounds (2–3 s) played in a room for everyone.
// Opened from a room (?room=Bangladesh): tap one → listen → Play in the room.
// The coins all go to the house. miGlife (Gift Shops): add / edit / delete.

export default function SoundMigPage() {
  return (
    <Suspense fallback={null}>
      <SoundGallery />
    </Suspense>
  );
}

const fileToBase64 = (f: File) =>
  new Promise<string>((ok, bad) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result).split(",")[1] || "");
    r.onerror = () => bad(new Error("Could not read the sound."));
    r.readAsDataURL(f);
  });

const TINT: Record<string, string> = {
  fun: "from-[#DFF7EC] to-[#B8EBD3]",
  love: "from-[#FFE4EE] to-[#FFC2D8]",
  party: "from-[#FFF1D6] to-[#FFD98A]",
  royal: "from-[#EDE4FF] to-[#D3C1FF]",
};
const groupLabel = (g: string) => SOUND_GROUPS.find(([k]) => k === g)?.[1] || "😂 Fun";

function SoundGallery() {
  useRequireLogin();
  const { user } = useSession();
  const router = useRouter();
  const room = useSearchParams().get("room") || "";
  const [list, setList] = useState<Sound[] | null>(null);
  const [manager, setManager] = useState(false);
  const [err, setErr] = useState("");
  const [search, setSearch] = useState("");
  const [group, setGroup] = useState("all");
  const [picked, setPicked] = useState<Sound | null>(null);
  const [editing, setEditing] = useState<Sound | null>(null);
  const [muted, setMuted] = useState(false);
  const [toast, setToast] = useState("");
  const [starterBusy, setStarterBusy] = useState("");
  useEffect(() => setMuted(soundsMuted()), []);
  useEffect(() => () => stopSound(), []);

  const load = () =>
    loadSounds()
      .then((r) => {
        setManager(r.manager);
        setList(r.sounds || []);
        setErr("");
      })
      .catch((e: any) => {
        setErr(e?.message || "Could not load the sounds.");
        setList([]);
      });
  useEffect(() => {
    if (user) load();
  }, [user]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (list || []).filter((s) => (group === "all" || s.group === group) && (!q || s.name.toLowerCase().includes(q)));
  }, [list, search, group]);

  if (!user) return null;
  return (
    <PageShell light>
      <section className="mx-auto max-w-2xl p-3.5 pb-8 lg:max-w-4xl">
        <div className="flex items-center gap-1.5">
          <BackButton onClick={() => router.back()} className="mr-1.5" />
          <div className="min-w-0 flex-1">
            <h1 className="text-[25px] font-bold text-[#0B1F3A]">🔊 SoundMig</h1>
            <p className="text-xs text-[#68758D]">{room ? `Play a short sound in ${room}` : "Play a short sound in your room"}</p>
          </div>
          <button
            type="button"
            aria-label={muted ? "Turn sounds on" : "Turn sounds off"}
            onClick={() => {
              setSoundsMuted(!muted);
              setMuted(!muted);
            }}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white/80 text-[17px] shadow"
          >
            {muted ? "🔇" : "🔊"}
          </button>
          {manager && (
            <button
              type="button"
              onClick={() => setEditing({ id: "", emoji: "🔊", name: "", group: group !== "all" ? group : "fun", seconds: 3, price: 0, url: "", active: true, order: (list?.length || 0) + 1 })}
              className="rounded-full bg-[#0B1F3A] px-3 py-2 text-xs font-semibold text-white shadow-[inset_0_2px_0_rgba(255,255,255,.2),0_3px_0_#050F1F,0_5px_0_#03080F,0_8px_10px_rgba(11,31,58,.3)] active:translate-y-[2px]"
            >
              ＋ Add
            </button>
          )}
        </div>

        {manager && (
          <p className="mt-2.5 rounded-2xl border border-[#D4AF37]/65 bg-[#FFF6D8] p-3.5 text-xs text-[#0B1F3A]">
            Admin mode: add a sound (MP3 under 1 MB, 2–3 seconds), edit or delete. The coins all go to the house.
            <button
              type="button"
              disabled={!!starterBusy}
              onClick={async () => {
                setStarterBusy("Adding…");
                try {
                  const n = await addStarterSounds((list || []).map((x) => x.name), (d, t) => setStarterBusy(`Adding ${d} / ${t}…`));
                  setToast(n ? `✅ Added ${n} sounds` : "All starter sounds are already here");
                  setTimeout(() => setToast(""), 2500);
                  load();
                } catch (e: any) {
                  setErr(e?.message || "Could not add the sounds.");
                }
                setStarterBusy("");
              }}
              className="mt-2 block w-full rounded-xl bg-[#059669] py-2.5 text-[13px] font-bold text-white disabled:opacity-60"
            >
              {starterBusy || "🎵 Add 20 starter sounds (made for miGlife)"}
            </button>
          </p>
        )}
        {!room && (
          <p className="mt-2.5 rounded-2xl bg-white/70 p-3 text-xs text-[#45557A]">
            💡 Open SoundMig from a room&apos;s menu to play a sound there. Here you can listen first.
          </p>
        )}
        <label className="mt-3 flex items-center gap-2 rounded-[14px] border border-[#D4E5DC] bg-white px-3 py-2.5 shadow-[inset_0_2px_0_#fff,0_2px_0_#C6E3D4,0_4px_0_#B3D8C4,0_7px_10px_rgba(11,58,40,.12)]">
          <span>🔍</span>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search sounds…" className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
          {search && (
            <button type="button" onClick={() => setSearch("")} className="px-1 text-[#68758D]">
              ✕
            </button>
          )}
        </label>

        <div className="no-scrollbar -mx-3.5 mt-3 flex gap-2 overflow-x-auto px-3.5 pb-1">
          {[["all", "All"] as [string, string], ...SOUND_GROUPS].map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setGroup(k)}
              className={`shrink-0 rounded-full px-3.5 py-2 text-[13px] font-extrabold transition ${
                group === k ? "bg-[#059669] text-white shadow-[0_8px_16px_-8px_rgba(5,150,105,.9)]" : "bg-white text-[#3F5A4E]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {list === null ? (
          <p className="p-4 text-[#0B1F3A]">Loading sounds…</p>
        ) : err ? (
          <p className="py-10 text-center text-sm text-[#DC2626]">{err}</p>
        ) : shown.length === 0 ? (
          <p className="py-10 text-center text-sm text-[#5B6B8C]">{search ? `No sound matches "${search}".` : "No sounds here yet."}</p>
        ) : (
          <ul className="mt-3 grid grid-cols-3 gap-2.5 sm:grid-cols-4 lg:grid-cols-6">
            {shown.map((s) => (
              <li key={s.id} className="relative py-1">
                <div
                  className={`flex flex-col items-center rounded-[20px] border border-[#D4E5DC] bg-white px-2 pb-2.5 pt-3 text-center shadow-[inset_0_2px_0_#fff,0_3px_0_#C0E2D0,0_6px_0_#ACD6C0,0_9px_0_#98CAB0,0_14px_18px_rgba(11,58,40,.2)] ${s.active ? "" : "opacity-55"}`}
                >
                  <button type="button" onClick={() => setPicked(s)} className="flex w-full flex-col items-center" aria-label={`Play ${s.name}`}>
                    <span className="relative">
                      <span className={`flex h-[62px] w-[62px] items-center justify-center rounded-[18px] bg-gradient-to-br ${TINT[s.group] || TINT.fun} text-[32px] shadow`}>{s.emoji}</span>
                      <span
                        role="button"
                        aria-label={`Listen to ${s.name}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          previewSound(s.url);
                        }}
                        className="absolute -bottom-1 -right-1 flex h-[22px] w-[22px] items-center justify-center rounded-full bg-[#059669] text-[10px] text-white shadow"
                      >
                        ▶
                      </span>
                    </span>
                    <span className="mt-2 line-clamp-1 text-[13.5px] font-bold text-[#0B1F3A]">{s.name}</span>
                    <span className="text-[11px] text-[#68758D]">{s.seconds} s</span>
                    {s.price <= 0 ? (
                      <span className="mt-1 rounded-full bg-[#CDF3E0] px-2.5 py-0.5 text-[11px] font-extrabold text-[#0B5B40]">FREE</span>
                    ) : (
                      <span className="mt-1 rounded-full bg-gradient-to-b from-[#FFE7A0] to-[#FFD15A] px-2.5 py-0.5 text-[11px] font-extrabold text-[#6A4A00] shadow-[0_3px_0_#D9A92A]">
                        💰 {s.price}
                      </span>
                    )}
                  </button>
                  {manager && (
                    <div className="mt-2 flex w-full justify-center gap-3 border-t border-[#EEF2F7] pt-1.5 text-[12px] font-bold">
                      <button type="button" onClick={() => setEditing(s)} className="text-[#2563EB]">
                        ✎ Edit
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          if (!confirm(`Delete ${s.name}?`)) return;
                          try {
                            await manageSound({ action: "delete", id: s.id });
                            load();
                          } catch (e: any) {
                            setToast(e?.message || "Could not delete.");
                          }
                        }}
                        className="text-[#DC2626]"
                      >
                        🗑
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
        <PlaySheet
          sound={picked}
          room={room}
          onClose={() => {
            setPicked(null);
            stopSound();
          }}
          onPlayed={() => {
            setPicked(null);
            router.back();
          }}
        />
      )}
      {editing && (
        <EditSheet
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
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

function PlaySheet({ sound, room, onClose, onPlayed }: { sound: Sound; room: string; onClose: () => void; onPlayed: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const play = async () => {
    setBusy(true);
    setErr("");
    try {
      await playSound(room, sound.id);
      onPlayed();
    } catch (e: any) {
      setErr(e?.message || "Could not play. Please try again.");
      setBusy(false);
    }
  };
  return (
    <Sheet onClose={onClose}>
      <div className="flex items-center gap-3">
        <span className={`flex h-16 w-16 items-center justify-center rounded-[20px] bg-gradient-to-br ${TINT[sound.group] || TINT.fun} text-[32px]`}>{sound.emoji}</span>
        <div className="min-w-0 flex-1">
          <div className="text-[19px] font-bold text-[#16264A]">{sound.name}</div>
          <div className="text-[12px] text-[#68758D]">
            {groupLabel(sound.group)} · {sound.seconds} s · {sound.price <= 0 ? "FREE" : `💰 ${sound.price} coins`}
          </div>
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="self-start text-[#8494B2]">
          ✕
        </button>
      </div>
      <button type="button" onClick={() => previewSound(sound.url)} className="mt-3.5 flex w-full items-center gap-2.5 rounded-[14px] bg-[#EFF8F4] px-3 py-2.5 text-left">
        <span className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-[#059669] text-[12px] text-white">▶</span>
        <span className="flex-1 text-[14px] font-bold text-[#16264A]">Listen first</span>
        <span className="text-[12px] text-[#059669]">▮▮▮▮▮</span>
      </button>
      {err && <p className="mt-2.5 text-[12.5px] text-[#DC2626]">{err}</p>}
      {room ? (
        <>
          <button
            type="button"
            disabled={busy}
            onClick={play}
            className="mt-3.5 w-full rounded-2xl bg-gradient-to-r from-[#10B981] to-[#059669] py-3.5 text-[15px] font-bold text-white shadow-[0_4px_0_#047857] active:translate-y-[2px] disabled:opacity-60"
          >
            {busy ? "Playing…" : `🔊 Play in ${room}`}
          </button>
          <p className="mt-2 text-[11px] text-[#68758D]">Everyone in the room hears it once (unless they turned sounds off). One sound every 30 s.</p>
        </>
      ) : (
        <p className="mt-3 text-[12px] text-[#68758D]">Open SoundMig from a room to play it there.</p>
      )}
    </Sheet>
  );
}

function EditSheet({ initial, onClose, onSaved }: { initial: Sound; onClose: () => void; onSaved: () => void }) {
  const [s, setS] = useState<Sound>(initial);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const set = (p: Partial<Sound>) => setS((o) => ({ ...o, ...p }));
  const upload = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > 1024 * 1024) return setErr("That sound is too big — keep it under 1 MB.");
    setBusy("Uploading…");
    setErr("");
    try {
      const r = await manageSound({ action: "upload", contentType: f.type || "audio/mpeg", fileBase64: await fileToBase64(f) });
      if (r.url) {
        set({ url: r.url });
        previewSound(r.url);
      }
    } catch (e: any) {
      setErr(e?.message || "Could not upload.");
    }
    setBusy("");
  };
  const save = async () => {
    setBusy("Saving…");
    setErr("");
    try {
      await manageSound({ action: "save", sound: { ...s, name: s.name.trim(), emoji: s.emoji.trim() } });
      onSaved();
    } catch (e: any) {
      setErr(e?.message || "Could not save.");
      setBusy("");
    }
  };
  const field = "mt-1 w-full rounded-xl border border-[#D4E5DC] bg-[#F2F6F4] px-3 py-2.5 text-[15px] text-[#16264A] outline-none";
  return (
    <Sheet onClose={onClose}>
      <h2 className="text-[19px] font-bold text-[#16264A]">{initial.id ? "✎ Edit Sound" : "＋ Add Sound"}</h2>
      <label className="mt-3 flex cursor-pointer items-center gap-2.5 rounded-[14px] bg-[#EFF8F4] p-3">
        <span className="text-[18px]">{s.url ? "✅" : "📁"}</span>
        <span className="flex-1 text-[13.5px] font-bold text-[#16264A]">{busy === "Uploading…" ? busy : s.url ? "Sound uploaded — tap to change" : "Choose a sound file (MP3, under 1 MB)"}</span>
        {s.url && (
          <span
            role="button"
            onClick={(e) => {
              e.preventDefault();
              previewSound(s.url);
            }}
            className="text-[16px] text-[#059669]"
          >
            ▶
          </span>
        )}
        <input type="file" accept="audio/*" className="hidden" disabled={!!busy} onChange={(e) => upload(e.target.files?.[0])} />
      </label>
      <p className="mt-3 text-[12px] font-bold text-[#68758D]">Name</p>
      <input value={s.name} maxLength={30} onChange={(e) => set({ name: e.target.value })} className={field} />
      <p className="mt-3 text-[12px] font-bold text-[#68758D]">Emoji</p>
      <input value={s.emoji} maxLength={8} onChange={(e) => set({ emoji: e.target.value })} className={field} />
      <p className="mt-3 text-[12px] font-bold text-[#68758D]">Group</p>
      <div className="mt-1 flex flex-wrap gap-2">
        {SOUND_GROUPS.map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => set({ group: k })}
            className={`rounded-full px-3 py-1.5 text-[12.5px] font-bold ${s.group === k ? "bg-[#059669] text-white" : "bg-[#F2F6F4] text-[#3F5A4E]"}`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2.5">
        <label className="text-[12px] font-bold text-[#68758D]">
          Seconds
          <input inputMode="numeric" value={String(s.seconds)} onChange={(e) => set({ seconds: Number(e.target.value.replace(/\D/g, "").slice(0, 2)) || 0 })} className={field} />
        </label>
        <label className="text-[12px] font-bold text-[#68758D]">
          Price (0 = free)
          <input inputMode="numeric" value={String(s.price)} onChange={(e) => set({ price: Number(e.target.value.replace(/\D/g, "").slice(0, 7)) || 0 })} className={field} />
        </label>
      </div>
      <label className="mt-3 flex items-center gap-2 text-[13.5px] text-[#16264A]">
        <input type="checkbox" checked={s.active} onChange={(e) => set({ active: e.target.checked })} />
        Show it to everyone
      </label>
      {err && <p className="mt-2.5 text-[12.5px] text-[#DC2626]">{err}</p>}
      <div className="mt-4 grid grid-cols-2 gap-2.5">
        <button type="button" onClick={onClose} className="rounded-[14px] bg-[#F2F6F4] py-3 text-[14px] font-bold text-[#16264A]">
          Cancel
        </button>
        <button type="button" disabled={!!busy} onClick={save} className="rounded-[14px] bg-[#059669] py-3 text-[14px] font-bold text-white disabled:opacity-60">
          {busy === "Saving…" ? busy : "Save"}
        </button>
      </div>
    </Sheet>
  );
}
