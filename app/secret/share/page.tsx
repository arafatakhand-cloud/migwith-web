"use client";

import { useEffect, useState } from "react";
import { deleteField, doc, onSnapshot, setDoc, updateDoc } from "firebase/firestore";
import { getDownloadURL, ref as storageRef, uploadBytes } from "firebase/storage";
import { db, storage } from "../../../lib/firebase";
import { useFounderPerms } from "../../../lib/founder";
import { LEVEL_TIERS } from "../../../lib/rooms";
import { FounderShell } from "../_Shell";

// 🔐 Share Permissions (founder tool), like the app's MediaSharePermissionsPage:
// who may share pictures / voice / video, and the badge / level-badge pictures.

const ROLES: [string, string, string][] = [
  ["REGULAR", "Normal User", "👤"],
  ["MENTOR", "Mentor", "💼"],
  ["MERCHANT", "Merchant", "🛒"],
  ["king", "Emperor", "👑"],
  ["queen", "Angel", "👼"],
  ["mafia", "Don", "🎩"],
  ["vip", "Star", "⭐"],
  ["diamond", "Platinum", "💎"],
  ["premium", "Royal", "🏵️"],
  ["supporter", "Patron", "🛡️"],
  ["streamer", "Icon", "🎬"],
  ["ELITE_USER", "Elite User", "✨"],
  ["EXECUTIVE_BOARD", "Executive Board", "🏛️"],
  ["COUNTRY_REPRESENTATIVE", "Country Representative", "🌍"],
  ["STAFF", "Staff", "🛠️"],
  ["ADMIN", "Admin", "⚙️"],
  ["OWNER", "Owner", "👑"],
];

type Perm = { picture: boolean; voice: boolean; video: boolean };

export default function SharePermissionsPage() {
  const f = useFounderPerms();
  const [perms, setPerms] = useState<Record<string, Perm>>({});
  const [badges, setBadges] = useState<Record<string, string>>({});
  const [levelBadges, setLevelBadges] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState<string | null>(null);
  const [status, setStatus] = useState("");

  useEffect(() => {
    if (!f.can("share_permissions")) return;
    const a = onSnapshot(doc(db, "app_settings", "media_sharing_permissions"), (s) => {
      const out: Record<string, Perm> = {};
      ROLES.forEach(([k]) => {
        const m = (s.get(k) || {}) as Record<string, unknown>;
        out[k] = { picture: m.picture === true, voice: m.voice === true, video: m.video === true };
      });
      setPerms(out);
    });
    const b = onSnapshot(doc(db, "app_settings", "badge_images"), (s) => setBadges((s.data() || {}) as Record<string, string>));
    const c = onSnapshot(doc(db, "app_settings", "level_badge_images"), (s) => setLevelBadges((s.data() || {}) as Record<string, string>));
    return () => {
      a();
      b();
      c();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f.loaded]);

  const setPerm = (key: string, next: Perm) => {
    const prev = perms[key];
    setPerms((p) => ({ ...p, [key]: next }));
    setDoc(doc(db, "app_settings", "media_sharing_permissions"), { [key]: next }, { merge: true })
      .then(() => setStatus("Saved."))
      .catch((e) => {
        setPerms((p) => ({ ...p, [key]: prev }));
        setStatus(e?.message || "Setting save failed.");
      });
  };

  const upload = async (docId: "badge_images" | "level_badge_images", key: string, file: File | undefined) => {
    if (!file) return;
    setUploading(`${docId}/${key}`);
    setStatus("");
    try {
      const r = storageRef(storage, `${docId}/${key}.jpg`);
      await uploadBytes(r, file, { contentType: file.type || "image/jpeg" });
      await setDoc(doc(db, "app_settings", docId), { [key]: await getDownloadURL(r) }, { merge: true });
    } catch (e: any) {
      setStatus(e?.message || "Badge image upload failed.");
    } finally {
      setUploading(null);
    }
  };

  const ImageRow = ({ docId, k, icon, label, url }: { docId: "badge_images" | "level_badge_images"; k: string; icon: string; label: string; url?: string }) => (
    <div className="flex items-center gap-2.5 rounded-xl bg-white px-3 py-2">
      <span className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-[#F1F5FB] text-lg">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" className="h-full w-full object-cover" />
        ) : (
          icon
        )}
      </span>
      <span className="flex-1 text-sm font-semibold">{label}</span>
      <label className="cursor-pointer rounded-full bg-[#EAF1FB] px-3 py-1 text-xs font-bold text-[#15589B]">
        {uploading === `${docId}/${k}` ? "Uploading…" : "Upload"}
        <input type="file" accept="image/*" hidden onChange={(e) => upload(docId, k, e.target.files?.[0])} />
      </label>
      {url && (
        <button type="button" onClick={() => updateDoc(doc(db, "app_settings", docId), { [k]: deleteField() }).catch(() => {})} className="text-xs text-[#B3261E]">
          Reset
        </button>
      )}
    </div>
  );

  return (
    <FounderShell title="🔐 Share Permissions" allowed={f.can("share_permissions")} loaded={f.loaded}>
      <div className="overflow-hidden rounded-2xl bg-white">
        <div className="flex items-center px-3 py-2 text-xs font-bold text-[#6C87B0]">
          <span className="flex-1">Role</span>
          <span className="w-12 text-center">Pic</span>
          <span className="w-12 text-center">Voice</span>
          <span className="w-12 text-center">Video</span>
        </div>
        {ROLES.map(([k, label, icon]) => {
          const p = perms[k] || { picture: false, voice: false, video: false };
          return (
            <div key={k} className="flex items-center border-t border-[#EEF2F7] px-3 py-2 text-sm">
              <span className="flex-1">
                {icon} {label}
              </span>
              {(["picture", "voice", "video"] as const).map((field) => (
                <span key={field} className="flex w-12 justify-center">
                  <input type="checkbox" checked={p[field]} onChange={(e) => setPerm(k, { ...p, [field]: e.target.checked })} className="h-5 w-5" />
                </span>
              ))}
            </div>
          );
        })}
      </div>
      {status && <p className="text-xs text-gray-500">{status}</p>}

      <p className="pt-2 text-lg font-extrabold">🖼️ Badge Images</p>
      {ROLES.map(([k, label, icon]) => (
        <ImageRow key={k} docId="badge_images" k={k} icon={icon} label={label} url={badges[k]} />
      ))}

      <p className="pt-2 text-lg font-extrabold">🎖️ Level Badges</p>
      {LEVEL_TIERS.map(([name, icon]) => (
        <ImageRow key={name} docId="level_badge_images" k={name} icon={icon} label={name} url={levelBadges[name]} />
      ))}
    </FounderShell>
  );
}
