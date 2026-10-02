"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { getDownloadURL, ref as storageRef, uploadBytes } from "firebase/storage";
import { db, storage } from "../../lib/firebase";
import { useSession } from "../_components/AppSession";
import { PageShell } from "../_components/PageShell";
import { useRequireLogin } from "../../lib/useRequireLogin";
import { isMainFounderName, useFounderPerms } from "../../lib/founder";
import { BackButton } from "../_components/BackButton";

// Explore › Gift Shops, like the app's GiftStorePage: the catalog in the
// app's order with FEATURED / LIMITED badges; migwith adds, edits and
// deletes gifts here (gift_catalog, pictures in gift_images/).

type CatalogGift = {
  id: string;
  name: string;
  category: string;
  price: number;
  icon: string;
  imageUrl: string;
  animation: string;
  limited: boolean;
  featured: boolean;
  active: boolean;
  sortOrder: number;
};

const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);

export default function GiftShopsPage() {
  const ready = useRequireLogin();
  const router = useRouter();
  const { user, username } = useSession();
  // miglife, or a founder with the 🎁 Gift Edit tool (founderHas("gift_shop") in the rules)
  const founderPerms = useFounderPerms();
  const isAdmin = isMainFounderName(username) || founderPerms.can("gift_shop");
  const [gifts, setGifts] = useState<CatalogGift[] | null>(null);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<{ id: string; initial: CatalogGift | null } | null>(null);

  useEffect(() => {
    if (!ready) return;
    return onSnapshot(
      collection(db, "gift_catalog"),
      (snap) =>
        setGifts(
          snap.docs
            .map((d) => ({
              id: d.id,
              name: String(d.get("name") || "").trim() || "Unnamed Gift",
              category: String(d.get("category") || "Gift"),
              price: Number(d.get("price_coins") ?? d.get("priceCoins") ?? 0),
              icon: String(d.get("icon") || "🎁").trim() || "🎁",
              imageUrl: String(d.get("imageUrl") || "").trim(),
              animation: String(d.get("animation") || ""),
              limited: bool(d.get("limited"), false),
              featured: bool(d.get("featured"), false),
              active: bool(d.get("active"), true),
              sortOrder: Number(d.get("sortOrder") ?? 999999),
            }))
            .sort((a, b) => a.sortOrder - b.sortOrder || a.name.toLowerCase().localeCompare(b.name.toLowerCase()))
        ),
      (err) => {
        setError(err.message || "Could not load gifts.");
        setGifts([]);
      }
    );
  }, [ready]);

  const shown = (gifts || []).filter((g) => !isAdmin || !search.trim() || g.name.toLowerCase().includes(search.trim().toLowerCase()));

  const save = async (id: string, isNew: boolean, data: Record<string, unknown>) => {
    try {
      if (isNew) await setDoc(doc(db, "gift_catalog", id), { ...data, createdAt: serverTimestamp(), createdBy: user?.uid || "" });
      else await updateDoc(doc(db, "gift_catalog", id), { ...data, updatedAt: serverTimestamp() });
      setEditing(null);
    } catch (e: any) {
      setError(e?.message || "Could not save the gift.");
    }
  };

  return (
    <PageShell light>
      <section className="mx-auto max-w-2xl p-3.5 pb-8 lg:max-w-4xl">
        <div className="flex items-center gap-1">
          <BackButton onClick={() => router.back()} className="mr-1.5" />
          <div className="min-w-0 flex-1">
            <h1 className="text-[25px] font-bold text-[#0B1F3A]">🎁 Gift Shops</h1>
            <p className="text-xs text-[#68758D]">Coins • Special &amp; Limited</p>
          </div>
          {isAdmin && (
            <button
              type="button"
              onClick={() => setEditing({ id: `gift_${Date.now()}`, initial: null })}
              className="rounded-full bg-[#0B1F3A] px-3 py-2 text-xs font-semibold text-white"
            >
              ＋ Add Gift
            </button>
          )}
        </div>

        {isAdmin && (
          <>
            <p className="mt-2.5 rounded-2xl border border-[#D4AF37]/65 bg-[#FFF6D8] p-3.5 text-xs text-[#0B1F3A]">
              Admin mode: Add, edit or delete gifts. Normal users can only browse the catalog.
            </p>
            <label className="mt-3 flex items-center gap-2 rounded-[14px] border border-[#D4DDEB] bg-white px-3 py-2.5">
              <span>🔍</span>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search gifts by name…"
                className="min-w-0 flex-1 bg-transparent text-sm outline-none"
              />
              {search && (
                <button type="button" onClick={() => setSearch("")} className="px-1 text-[#68758D]">
                  ✕
                </button>
              )}
            </label>
          </>
        )}

        {error && <p className="mt-2.5 rounded-[14px] bg-[#FFE8E8] p-3 text-xs text-[#9E2B2B]">{error}</p>}

        {gifts === null ? (
          <p className="p-4 text-[#0B1F3A]">Loading gifts…</p>
        ) : gifts.length === 0 ? (
          <p className="py-10 text-center text-sm text-[#5B6B8C]">No gifts have been added yet.</p>
        ) : shown.length === 0 ? (
          <p className="py-10 text-center text-sm text-[#5B6B8C]">No gift matches &quot;{search}&quot;.</p>
        ) : (
          <ul className="mt-3 grid grid-cols-3 gap-2.5 sm:grid-cols-4 lg:grid-cols-6">
            {shown.map((g) => (
              <li key={g.id} className="relative py-1">
                <div
                  className={`flex flex-col items-center rounded-[18px] bg-white px-2 pb-2.5 pt-3 text-center ${
                    g.featured
                      ? "border-[1.5px] border-[#D4AF37]/80 shadow-[0_6px_14px_rgba(212,175,55,.35)]"
                      : g.limited
                        ? "border border-[#E1A9A9] shadow"
                        : "border border-[#D4DDEB] shadow"
                  } ${g.active ? "" : "opacity-55"}`}
                >
                  <span
                    className={`flex h-[62px] w-[62px] items-center justify-center overflow-hidden rounded-full border bg-gradient-to-br from-[#EAF1FB] to-[#D7E6FA] text-[30px] shadow ${
                      g.featured ? "border-[#D4AF37]/70" : "border-white/60"
                    }`}
                  >
                    {g.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={g.imageUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      g.icon
                    )}
                  </span>
                  <span data-notranslate className="mt-2 w-full truncate text-[13px] font-bold text-[#0B1F3A]">
                    {g.name}
                  </span>
                  <span
                    className={`mt-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                      g.active ? "bg-[#FFF1D0] text-[#B17A00]" : "bg-[#EDEFF3] text-[#8A9AB2]"
                    }`}
                  >
                    💰 {g.price}
                    {g.active ? "" : " • Off"}
                  </span>
                  {isAdmin && (
                    <div className="mt-1.5 flex w-full justify-evenly border-t border-[#E8EEF5] pt-1 text-[11px] font-semibold">
                      <button type="button" onClick={() => setEditing({ id: g.id, initial: g })} className="px-1.5 py-0.5 text-[#15589B]">
                        ✎ Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (window.confirm(`Delete Gift?\n\nAre you sure you want to delete "${g.name}"?`))
                            deleteDoc(doc(db, "gift_catalog", g.id)).catch((e) => setError(e?.message || "Could not delete."));
                        }}
                        className="px-1.5 py-0.5 text-[#C23B3B]"
                      >
                        🗑 Delete
                      </button>
                    </div>
                  )}
                </div>
                {(g.featured || g.limited) && (
                  <span
                    className={`absolute right-1 top-2 rounded-full px-[7px] py-0.5 text-[8px] font-extrabold text-white shadow ${
                      g.featured ? "bg-gradient-to-r from-[#D4AF37] to-[#B8860B]" : "bg-gradient-to-r from-[#E86A6A] to-[#9B4B4B]"
                    }`}
                  >
                    {g.featured ? "★ FEATURED" : "⏳ LIMITED"}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {editing && (
        <GiftEditor
          id={editing.id}
          initial={editing.initial}
          onClose={() => setEditing(null)}
          onSave={(data) => save(editing.id, !editing.initial, data)}
        />
      )}
    </PageShell>
  );
}

function GiftEditor({
  id,
  initial,
  onClose,
  onSave,
}: {
  id: string;
  initial: CatalogGift | null;
  onClose: () => void;
  onSave: (data: Record<string, unknown>) => void;
}) {
  const [name, setName] = useState(initial?.name || "");
  const [category, setCategory] = useState(initial?.category || "");
  const [price, setPrice] = useState(initial ? String(initial.price) : "");
  const [icon, setIcon] = useState(initial?.icon || "🎁");
  const [imageUrl, setImageUrl] = useState(initial?.imageUrl || "");
  const [animation, setAnimation] = useState(initial?.animation || "");
  const [sortOrder, setSortOrder] = useState(initial ? String(initial.sortOrder) : "0");
  const [limited, setLimited] = useState(initial?.limited ?? false);
  const [featured, setFeatured] = useState(initial?.featured ?? false);
  const [active, setActive] = useState(initial?.active ?? true);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    setUploadError("");
    try {
      const r = storageRef(storage, `gift_images/${id}.jpg`);
      await uploadBytes(r, file, { contentType: file.type || "image/jpeg" });
      setImageUrl(await getDownloadURL(r));
    } catch (e: any) {
      setUploadError(e?.message || "Image upload failed.");
    } finally {
      setUploading(false);
    }
  };

  const field = "w-full rounded-xl border border-[#D4DDEB] px-3 py-2.5 text-base outline-none focus:border-[#2F80ED]";
  const check = (label: string, v: boolean, set: (b: boolean) => void) => (
    <label className="flex items-center justify-between text-sm">
      {label}
      <input type="checkbox" checked={v} onChange={(e) => set(e.target.checked)} className="h-5 w-5" />
    </label>
  );
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-3" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-md space-y-2.5 overflow-y-auto rounded-3xl bg-white p-5 text-[#0B1F3A]" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold">{initial ? "Edit Gift" : "Add Gift"}</h2>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Gift Name" className={field} />
        <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Category" className={field} />
        <input value={price} onChange={(e) => setPrice(e.target.value.replace(/\D/g, ""))} placeholder="Price (Coins)" inputMode="numeric" className={field} />
        <input value={icon} onChange={(e) => setIcon(e.target.value)} placeholder="Emoji/Icon (used until a picture is uploaded)" className={field} />
        <div className="flex items-center gap-2">
          <span className="text-sm">Picture (optional)</span>
          {imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageUrl} alt="" className="h-10 w-10 rounded-full object-cover" />
          )}
          <label className="ml-auto cursor-pointer rounded-full bg-[#EAF1FB] px-3 py-1.5 text-xs font-bold text-[#15589B]">
            {uploading ? "Uploading…" : "Upload"}
            <input type="file" accept="image/*" hidden onChange={(e) => upload(e.target.files?.[0])} />
          </label>
          {imageUrl && (
            <button type="button" onClick={() => setImageUrl("")} className="text-xs font-bold text-[#C23B3B]">
              Remove
            </button>
          )}
        </div>
        {uploadError && <p className="text-xs text-[#C23B3B]">{uploadError}</p>}
        <input value={animation} onChange={(e) => setAnimation(e.target.value)} placeholder="Animation/Effect (optional)" className={field} />
        <input value={sortOrder} onChange={(e) => setSortOrder(e.target.value.replace(/[^\d-]/g, ""))} placeholder="Sort Order" inputMode="numeric" className={field} />
        {check("Limited Gift", limited, setLimited)}
        {check("Featured Gift", featured, setFeatured)}
        {check("Active", active, setActive)}
        <div className="flex justify-end gap-2 pt-1 text-sm font-bold">
          <button type="button" onClick={onClose} className="px-3 py-2 text-[#2F80ED]">
            Cancel
          </button>
          <button
            type="button"
            disabled={uploading}
            onClick={() => {
              const cleanPrice = Number(price) || 0;
              if (!name.trim() || cleanPrice < 5) return;
              onSave({
                name: name.trim(),
                category: category.trim() || "Special",
                price_coins: cleanPrice,
                icon: icon.trim() || "🎁",
                imageUrl: imageUrl.trim(),
                animation: animation.trim(),
                limited,
                featured,
                active,
                sortOrder: Number(sortOrder) || 0,
              });
            }}
            className="px-3 py-2 text-[#0B1F3A]"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
