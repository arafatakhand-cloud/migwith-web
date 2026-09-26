"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { db, storage } from "../../../lib/firebase";
import { useCurrentUser } from "../../../lib/useCurrentUser";
import { PageShell } from "../../_components/PageShell";

// Same fields and storage paths as the app's EditProfilePage (MainActivity.kt).

const COUNTRIES = [
  "Bangladesh", "India", "Pakistan", "Nepal", "Bhutan", "Maldives",
  "Qatar", "Kuwait", "Oman", "Malaysia", "Singapore", "Indonesia",
  "Thailand", "Canada", "Australia", "Germany", "France", "Italy",
  "Spain", "Russia", "Brazil",
];
const RELATIONSHIPS = ["Single", "In a Relationship", "Married", "Divorced", "Widowed", "Prefer not to say"];
const GENDERS: [string, string][] = [
  ["Male", "♂ Male"],
  ["Female", "♀ Female"],
  ["Others", "♙ Others"],
];
// Nobody may look like the founder or staff through their Full Name.
const RESERVED = new Set(["migwith", "admin", "ceo", "staff", "owner", "support", "mod", "moderator", "superadmin"]);
const nameKey = (v: string) => v.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

export default function EditProfilePage() {
  const router = useRouter();
  const { user, username, loading } = useCurrentUser();

  const [loaded, setLoaded] = useState(false);
  const [fullName, setFullName] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [bio, setBio] = useState("");
  const [country, setCountry] = useState("");
  const [gender, setGender] = useState("Male");
  const [relationship, setRelationship] = useState("Single");
  const [photoUrl, setPhotoUrl] = useState("");
  const [coverPhotoUrl, setCoverPhotoUrl] = useState("");
  const [uploading, setUploading] = useState("");
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

  const upload = async (kind: "photo" | "cover", file: File | undefined) => {
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
      <PageShell>
        <div className="mx-auto max-w-md px-6 py-20 text-center">
          <Link href="/login" className="rounded-xl bg-blue-600 px-6 py-3 font-bold">
            Login
          </Link>
        </div>
      </PageShell>
    );
  }

  const field = "w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none focus:border-cyan-300/60";

  return (
    <PageShell>
      <div className="mx-auto max-w-xl px-4 py-6 sm:px-6">
        <div className="flex items-center gap-3">
          <Link href={`/profile/${encodeURIComponent(username || "me")}`} className="text-white/60 hover:text-white">
            ←
          </Link>
          <h1 className="text-2xl font-black">Edit Profile</h1>
        </div>

        {!loaded ? (
          <p className="py-16 text-center text-white/40">{error || "Loading…"}</p>
        ) : (
          <div className="mt-5 space-y-4">
            {/* Cover + photo */}
            <label className="relative block cursor-pointer">
              <div className="flex aspect-[3.2] items-center justify-center overflow-hidden rounded-3xl bg-gradient-to-b from-blue-600 to-[#0F2C55]">
                {coverPhotoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={coverPhotoUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-xl font-black">MIG WITH</span>
                )}
              </div>
              <span className="absolute bottom-2 right-2 rounded-lg bg-black/60 px-2.5 py-1 text-xs font-bold">
                {uploading === "cover" ? "Uploading…" : "📷 Change cover"}
              </span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={!!uploading}
                onChange={(e) => upload("cover", e.target.files?.[0])}
              />
            </label>

            <label className="flex cursor-pointer items-center gap-4">
              <div className="h-20 w-20 shrink-0 overflow-hidden rounded-full border-2 border-white/20 bg-gradient-to-br from-blue-500 to-cyan-400">
                {photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photoUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-3xl font-black">
                    {username.slice(0, 1).toUpperCase()}
                  </span>
                )}
              </div>
              <span className="rounded-xl border border-white/15 px-4 py-2 text-sm font-bold hover:bg-white/5">
                {uploading === "photo" ? "Uploading…" : "📷 Change photo"}
              </span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={!!uploading}
                onChange={(e) => upload("photo", e.target.files?.[0])}
              />
            </label>

            <div>
              <p className="mb-1 text-xs font-bold text-white/50">MIG ID (cannot be changed)</p>
              <p className="rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3 text-white/60">{username}</p>
            </div>

            <div>
              <p className="mb-1 text-xs font-bold text-white/50">Full Name</p>
              <input value={fullName} onChange={(e) => setFullName(e.target.value)} maxLength={40} className={field} />
            </div>

            <div>
              <p className="mb-1 text-xs font-bold text-white/50">Bio</p>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                maxLength={200}
                rows={3}
                className={`${field} resize-none`}
              />
            </div>

            <div>
              <p className="mb-1 text-xs font-bold text-white/50">Date of birth</p>
              <input
                type="date"
                value={dateOfBirth}
                onChange={(e) => setDateOfBirth(e.target.value)}
                className={`${field} [color-scheme:dark]`}
              />
            </div>

            <div>
              <p className="mb-1 text-xs font-bold text-white/50">Gender</p>
              <div className="flex gap-2">
                {GENDERS.map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setGender(value)}
                    className={`flex-1 rounded-xl border py-2.5 text-sm font-bold ${
                      gender === value ? "border-cyan-300 bg-cyan-300/15 text-cyan-200" : "border-white/10 text-white/60"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <p className="mb-1 text-xs font-bold text-white/50">Country</p>
                <select value={country} onChange={(e) => setCountry(e.target.value)} className={`${field} bg-[#0b1430]`}>
                  <option value="">—</option>
                  {!COUNTRIES.includes(country) && country && <option value={country}>{country}</option>}
                  {COUNTRIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <p className="mb-1 text-xs font-bold text-white/50">Relationship</p>
                <select
                  value={relationship}
                  onChange={(e) => setRelationship(e.target.value)}
                  className={`${field} bg-[#0b1430]`}
                >
                  {RELATIONSHIPS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {error && <p className="text-sm text-red-300">{error}</p>}

            <button
              type="button"
              onClick={save}
              disabled={saving || !!uploading}
              className="w-full rounded-2xl bg-gradient-to-r from-blue-600 to-cyan-500 py-3.5 font-black disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        )}
      </div>
    </PageShell>
  );
}
