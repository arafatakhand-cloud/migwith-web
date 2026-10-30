"use client";

import { useState } from "react";
import { useRequireLogin } from "../../../lib/useRequireLogin";
import { useCurrentUser } from "../../../lib/useCurrentUser";
import { PageShell } from "../../_components/PageShell";
import { PageTitle } from "../../_components/LightCards";
import { isMainFounderName } from "../../../lib/founder";
import { prepareIcon } from "../../../lib/iconUpload";
import { founderStickerPack, useStickerPacks, type StickerPack } from "../../../lib/stickers";

// ⚙️ miglife's sticker admin: put in the starter packs, make a pack (name, kind,
// price — 0 = free, on/off, order), and add / remove its stickers. Every
// picture is turned the right way up and made a 512 × 512 PNG first (GIFs stay
// animated), then saved by the server (founderStickerPack).

const toBase64 = (b: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] || "");
    r.onerror = () => reject(new Error("Could not read the picture."));
    r.readAsDataURL(b);
  });

export default function StickerAdminPage() {
  useRequireLogin();
  const { username } = useCurrentUser();
  const packs = useStickerPacks(true);
  const [edit, setEdit] = useState<Partial<StickerPack> | null>(null);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");

  if (username && !isMainFounderName(username)) {
    return (
      <PageShell light>
        <p className="py-20 text-center text-sm text-[#7A8599]">Only miglife can manage sticker packs.</p>
      </PageShell>
    );
  }

  const run = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(label);
    setMsg("");
    try {
      await fn();
      setMsg("✅ Saved");
    } catch (e: any) {
      setMsg(e?.message || "Something went wrong.");
    } finally {
      setBusy("");
    }
  };

  const addStickers = (packId: string, files: FileList | null) =>
    files &&
    run("upload", async () => {
      for (const file of Array.from(files)) {
        const gif = file.type === "image/gif";
        const body: Blob = gif ? file : await prepareIcon(file);
        await founderStickerPack({ action: "addSticker", packId, contentType: gif ? "image/gif" : "image/png", fileBase64: await toBase64(body) });
      }
    });

  const field = "w-full rounded-xl border border-[#D4DDEB] px-3 py-2.5 text-base outline-none focus:border-[#2F80ED]";
  return (
    <PageShell light>
      <section className="mx-auto max-w-2xl px-3 pb-10 sm:px-6">
        <PageTitle title="Manage Stickers" subtitle="Packs, prices and pictures" icon="⚙️" backHref="/stickers" />
        {msg && <p className="mt-2 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-[#174EA6] shadow-sm">{msg}</p>}
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            disabled={!!busy}
            onClick={() => setEdit({ name: "", category: "", price: 0, active: true, sortOrder: 10 })}
            className="h-10 flex-1 rounded-xl bg-gradient-to-r from-[#3B82F6] to-[#8B5CF6] text-[14px] font-bold text-white disabled:opacity-50"
          >
            ＋ New pack
          </button>
          <button
            type="button"
            disabled={!!busy}
            onClick={() => run("seed", () => founderStickerPack({ action: "seedStarter" }))}
            className="h-10 flex-1 rounded-xl bg-white text-[14px] font-bold text-[#1565D8] shadow-sm disabled:opacity-50"
          >
            🆓 Add starter packs
          </button>
        </div>

        <div className="mt-3 space-y-3">
          {(packs || []).map((p) => (
            <div key={p.id} className="rounded-2xl bg-white p-3 shadow-sm">
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-extrabold text-[#0B2A5B]">
                    {p.name} {!p.active && <span className="text-[11px] font-bold text-[#E53935]">· OFF</span>}
                  </p>
                  <p className="text-[12px] text-[#7A8599]">
                    {p.category || "—"} · {p.stickers.length} stickers · {p.price ? `🪙 ${p.price.toLocaleString("en-US")}` : "Free"} · order {p.sortOrder}
                  </p>
                </div>
                <button type="button" onClick={() => setEdit(p)} className="rounded-lg bg-[#EEF3FB] px-3 py-1.5 text-[13px] font-bold text-[#1565D8]">
                  ✏️ Edit
                </button>
              </div>
              <div className="mt-2 grid grid-cols-6 gap-1.5">
                {p.stickers.map((s) => (
                  <div key={s.id || s.url} className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={s.url} alt="" className="aspect-square w-full rounded-lg bg-[#F6F9FE] object-contain" />
                    <button
                      type="button"
                      aria-label="Remove sticker"
                      disabled={!!busy}
                      onClick={() => confirm("Remove this sticker from the pack?") && run("remove", () => founderStickerPack({ action: "removeSticker", packId: p.id, stickerId: s.id }))}
                      className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-[#E53935] text-[11px] font-bold text-white"
                    >
                      ✕
                    </button>
                  </div>
                ))}
                <label className="flex aspect-square cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-[#B9C7DD] text-[22px] text-[#7A8599]">
                  {busy === "upload" ? "…" : "＋"}
                  <input type="file" accept="image/*" multiple hidden disabled={!!busy} onChange={(e) => addStickers(p.id, e.target.files)} />
                </label>
              </div>
            </div>
          ))}
        </div>
      </section>

      {edit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-3" onClick={() => setEdit(null)}>
          <div className="w-full max-w-md space-y-2.5 rounded-3xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-[#0B1F3A]">{edit.id ? "Edit pack" : "New pack"}</h2>
            <input value={edit.name || ""} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="Pack name" className={field} />
            <input value={edit.category || ""} onChange={(e) => setEdit({ ...edit, category: e.target.value })} placeholder="Kind (Love, Funny, Emoji…)" className={field} />
            <input
              value={String(edit.price ?? 0)}
              onChange={(e) => setEdit({ ...edit, price: Number(e.target.value.replace(/\D/g, "") || 0) })}
              placeholder="Price in coins (0 = free)"
              inputMode="numeric"
              className={field}
            />
            <input
              value={String(edit.sortOrder ?? 0)}
              onChange={(e) => setEdit({ ...edit, sortOrder: Number(e.target.value.replace(/[^\d-]/g, "") || 0) })}
              placeholder="Order (smaller first)"
              inputMode="numeric"
              className={field}
            />
            <label className="flex items-center justify-between text-sm">
              Show in the store
              <input type="checkbox" checked={edit.active !== false} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} className="h-5 w-5" />
            </label>
            <div className="flex gap-2 pt-1">
              <button type="button" onClick={() => setEdit(null)} className="h-11 flex-1 rounded-xl bg-[#EEF3FB] font-bold text-[#1565D8]">
                Cancel
              </button>
              <button
                type="button"
                disabled={!!busy || !(edit.name || "").trim()}
                onClick={() =>
                  run("save", async () => {
                    await founderStickerPack({
                      action: "save",
                      packId: edit.id || "",
                      name: edit.name,
                      category: edit.category,
                      price: edit.price ?? 0,
                      active: edit.active !== false,
                      sortOrder: edit.sortOrder ?? 0,
                    });
                    setEdit(null);
                  })
                }
                className="h-11 flex-1 rounded-xl bg-gradient-to-r from-[#3B82F6] to-[#8B5CF6] font-bold text-white disabled:opacity-50"
              >
                {busy === "save" ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}
