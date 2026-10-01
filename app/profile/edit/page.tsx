"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { db, storage } from "../../../lib/firebase";
import { useCurrentUser } from "../../../lib/useCurrentUser";
import { PageShell } from "../../_components/PageShell";
import { PhotoCropDialog } from "../../_components/PhotoCropDialog";
import { CountryPickerDialog } from "../../_components/CountryPicker";
import { countryFlag, countryInfoFor } from "../../../lib/countries";

// Same fields and storage paths as the app's EditProfilePage (MainActivity.kt).

const RELATIONSHIPS = ["Single", "In a Relationship", "Married", "Divorced", "Widowed", "Prefer not to say"];
const GENDERS: [string, string][] = [
  ["Male", "♂ Male"],
  ["Female", "♀ Female"],
  ["Others", "♙ Others"],
];
// Nobody may look like the founder or staff through their Full Name.
const RESERVED = new Set(["migwith", "miglife", "admin", "ceo", "staff", "owner", "support", "mod", "moderator", "superadmin"]);
const nameKey = (v: string) => v.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

export default function EditProfilePage() {
  const router = useRouter();
  const { user, username, loading } = useCurrentUser();

  const [loaded, setLoaded] = useState(false);
  const [fullName, setFullName] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [bio, setBio] = useState("");
  const [country, setCountry] = useState("");
  const [countryOpen, setCountryOpen] = useState(false);
  const [gender, setGender] = useState("Male");
  const [relationship, setRelationship] = useState("Single");
  const [photoUrl, setPhotoUrl] = useState("");
  const [coverPhotoUrl, setCoverPhotoUrl] = useState("");
  const [uploading, setUploading] = useState("");
  // A picked profile photo opens the crop editor first (like the app).
  const [cropFile, setCropFile] = useState<File | null>(null);
  // The cover gets the same editor with a wide frame (3.2 : 1, like the app).
  const [coverCropFile, setCoverCropFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user || !username) return;
    getDoc(doc(db, "users", user.uid))
      .then((snap) => {
        const x = snap.data() || {};
        setFullName(String(x.fullName || "").trim() || username);
        setDateOfBirth(String(x.dateOfBirth || "").trim());
        setBio(String(x.bio || "").trim());
        setCountry(String(x.country || "").trim());
        if (x.gender) setGender(String(x.gender));
        if (x.relationship) setRelationship(String(x.relationship));
        setPhotoUrl(String(x.photoUrl || x.profilePic || x.avatarUrl || x.imageUrl || "").trim());
        setCoverPhotoUrl(String(x.coverPhotoUrl || "").trim());
        setLoaded(true);
      })
      .catch(() => setError("Could not load your profile."));
  }, [user, username]);

  const upload = async (kind: "photo" | "cover", file: Blob | undefined) => {
    if (!file || !user) return;
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("The image must be smaller than 10 MB.");
      return;
    }
    setUploading(kind);
    setError("");
    try {
      const path = kind === "photo" ? `profile_pictures/${user.uid}.jpg` : `cover_pictures/${user.uid}.jpg`;
      const r = ref(storage, path);
      await uploadBytes(r, file, { contentType: file.type });
      const url = await getDownloadURL(r);
      const field = kind === "photo" ? "photoUrl" : "coverPhotoUrl";
      await setDoc(doc(db, "users", user.uid), { [field]: url }, { merge: true });
      if (kind === "photo") setPhotoUrl(url);
      else setCoverPhotoUrl(url);
    } catch (err) {
      console.error(err);
      setError("Upload failed. Please try again.");
    } finally {
      setUploading("");
    }
  };

  const save = async () => {
    if (!user) return;
    const cleanName = fullName.trim() || username;
    if (RESERVED.has(nameKey(cleanName)) && nameKey(cleanName) !== nameKey(username)) {
      setError("This name is reserved. Please choose a different Full Name.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await setDoc(
        doc(db, "users", user.uid),
        {
          fullName: cleanName,
          dateOfBirth: dateOfBirth.trim(),
          bio: bio.trim(),
          country: country.trim(),
          gender,
          relationship,
        },
        { merge: true }
      );
      router.push(`/profile/${encodeURIComponent(username)}`);
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Could not save profile.");
      setSaving(false);
    }
  };

  if (!loading && !user) {
    return (
      <PageShell light>
        <div className="mx-auto max-w-md px-6 py-20 text-center">
          <Link href="/login" className="rounded-xl bg-[#2F80ED] px-6 py-3 font-bold text-white">
            Login
          </Link>
        </div>
      </PageShell>
    );
  }

  const field = "w-full rounded-xl border border-[#D5E3F5] bg-white px-4 py-3 text-[#0B2A5B] outline-none focus:border-[#2F80ED]";

  return (
    <PageShell light pale>
      <div className="mx-auto max-w-xl px-4 py-6 sm:px-6">
        <div className="flex items-center gap-3">
          <Link href={`/profile/${encodeURIComponent(username || "me")}`} className="flex h-10 w-10 items-center justify-center rounded-full border border-[#BFD7F2] bg-white text-lg text-[#0B2A5B] shadow-sm">
            ←
          </Link>
          <h1 className="text-2xl font-black text-[#0B2A5B]">Edit Profile</h1>
        </div>

        {!loaded ? (
          <p className="py-16 text-center text-[#5B6B8C]">{error || "Loading…"}</p>
        ) : (
          <div className="mt-5 space-y-4">
            {/* Cover + photo exactly like the profile page: the same rainbow
                frame; the photo box (108 × 140) starts right at the cover's
                bottom border, joined to it. */}
            <label className="mig-frame relative block aspect-[3.2] cursor-pointer rounded-2xl">
              <div className="flex h-full items-center justify-center overflow-hidden rounded-[13px] bg-gradient-to-b from-[#174EA6] to-[#0B2A5B] text-white">
                {coverPhotoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={coverPhotoUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-xl font-black">MIG LIFE</span>
                )}
              </div>
              <span className="absolute bottom-2 right-2 rounded-[10px] bg-black/55 px-2.5 py-1 text-[13px] font-bold text-white">
                {uploading === "cover" ? "Uploading…" : "📷 Change cover"}
              </span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={!!uploading}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (!f) return;
                  if (!f.type.startsWith("image/")) return setError("Please choose an image.");
                  setCoverCropFile(f);
                }}
              />
            </label>

            <div className="!mt-0 flex items-start gap-3">
              {/* round photo half on the cover's bottom edge, same as the profile */}
              <label className="mig-frame relative z-10 ml-2.5 -mt-[52px] block h-[112px] w-[112px] shrink-0 cursor-pointer rounded-full">
                <div className="relative h-full overflow-hidden rounded-full bg-[#E8EEF5]">
                  {photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={photoUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center text-[42px] font-bold text-[#8FA3BF]">
                      {username.slice(0, 1).toUpperCase()}
                    </span>
                  )}
                  {uploading === "photo" ? (
                    <span className="absolute inset-0 flex items-center justify-center bg-black/45 text-xs font-bold text-white">Uploading…</span>
                  ) : (
                    <span className="absolute inset-x-0 bottom-0 bg-black/50 py-1 text-center text-xs font-bold text-white">📷</span>
                  )}
                </div>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={!!uploading}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (!f) return;
                    if (!f.type.startsWith("image/")) return setError("Please choose an image.");
                    setCropFile(f);
                  }}
                />
              </label>
              <div className="pt-3">
                <p className="text-[15px] font-bold text-[#0B2A5B]">Profile photo &amp; cover</p>
                <p className="mt-1 text-xs text-[#35507E]">
                  Tap the photo or the cover to change it. This is exactly how they look on your profile.
                </p>
              </div>
            </div>

            <div>
              <p className="mb-1 text-xs font-bold text-[#35507E]">MIG ID (cannot be changed)</p>
              <p className="rounded-xl border border-[#D5E3F5] bg-[#EAF2FC] px-4 py-3 text-[#5B6B8C]">{username}</p>
            </div>

            <div>
              <p className="mb-1 text-xs font-bold text-[#35507E]">Full Name</p>
              <input value={fullName} onChange={(e) => setFullName(e.target.value)} maxLength={40} className={field} />
            </div>

            <div>
              <p className="mb-1 text-xs font-bold text-[#35507E]">Bio</p>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                maxLength={200}
                rows={3}
                className={`${field} resize-none`}
              />
            </div>

            <div>
              <p className="mb-1 text-xs font-bold text-[#35507E]">Date of birth</p>
              <input
                type="date"
                value={dateOfBirth}
                onChange={(e) => setDateOfBirth(e.target.value)}
                className={`${field} [color-scheme:light]`}
              />
            </div>

            <div>
              <p className="mb-1 text-xs font-bold text-[#35507E]">Gender</p>
              <div className="flex gap-2">
                {GENDERS.map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setGender(value)}
                    className={`flex-1 rounded-xl border py-2.5 text-sm font-bold ${
                      gender === value ? "border-[#2F80ED] bg-[#2F80ED] text-white" : "border-[#D5E3F5] bg-white text-[#0B2A5B]"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <p className="mb-1 text-xs font-bold text-[#35507E]">Country</p>
                {/* searchable list of every country, with flags (like the app) */}
                <button type="button" onClick={() => setCountryOpen(true)} className={`${field} flex items-center gap-2 text-left`}>
                  <span className="text-lg leading-none">{countryInfoFor(country) ? countryFlag(countryInfoFor(country)!.iso) : "🌍"}</span>
                  <span className={`min-w-0 flex-1 truncate ${country ? "" : "text-[#8A9AB2]"}`}>{country || "Select your country"}</span>
                  <span className="text-[#2F80ED]">▾</span>
                </button>
              </div>
              <div>
                <p className="mb-1 text-xs font-bold text-[#35507E]">Relationship</p>
                <select
                  value={relationship}
                  onChange={(e) => setRelationship(e.target.value)}
                  className={field}
                >
                  {RELATIONSHIPS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {error && <p className="text-sm text-rose-600">{error}</p>}

            <button
              type="button"
              onClick={save}
              disabled={saving || !!uploading}
              className="w-full rounded-2xl bg-[#0B2A5B] py-3.5 font-black text-white shadow disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        )}
      </div>
      {countryOpen && (
        <CountryPickerDialog
          selected={country}
          onPick={(n) => {
            setCountry(n);
            setCountryOpen(false);
          }}
          onClose={() => setCountryOpen(false)}
        />
      )}
      {cropFile && (
        <PhotoCropDialog
          file={cropFile}
          // Round, like the photo on the profile.
          frameAspect={1}
          round
          outWidth={560}
          hint="Drag to move · pinch or scroll to zoom · the circle is your profile photo"
          onCancel={() => setCropFile(null)}
          onCropped={(jpeg) => {
            setCropFile(null);
            upload("photo", jpeg);
          }}
        />
      )}
      {coverCropFile && (
        <PhotoCropDialog
          file={coverCropFile}
          frameAspect={3.2}
          round={false}
          outWidth={1280}
          hint="Drag to move · pinch or scroll to zoom · the frame is your cover photo"
          onCancel={() => setCoverCropFile(null)}
          onCropped={(jpeg) => {
            setCoverCropFile(null);
            upload("cover", jpeg);
          }}
        />
      )}
    </PageShell>
  );
}
