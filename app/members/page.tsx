"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { collection, getDocs, limit, query, type DocumentData } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useRequireLogin } from "../../lib/useRequireLogin";
import { PageShell } from "../_components/PageShell";
import { PageTitle, PastelCard, SectionLabel } from "../_components/LightCards";

// Explore › Members, same categories and role checks as the app (MainActivity.kt).
// View only: role changes stay in the app.

type Category = { id: string; icon: string; title: string; subtitle: string; color: string; roles: string[] };

const MANAGEMENT: Category[] = [
  { id: "executive_board", icon: "🏅", title: "Executive Board", subtitle: "FOUNDER • Owner • Executive", color: "#3F55C7", roles: ["executive_board", "executive", "owner", "ceo"] },
  { id: "admin", icon: "🛡", title: "Admin", subtitle: "Admin IDs", color: "#E0A800", roles: ["admin", "administrator", "superadmin"] },
  { id: "country_representative", icon: "🌍", title: "Country Representative", subtitle: "Country representatives", color: "#B58A70", roles: ["country_representative", "countryrep", "country_rep"] },
  { id: "staff", icon: "🪪", title: "Staff", subtitle: "Staff IDs", color: "#22A447", roles: ["staff"] },
  { id: "elite_user", icon: "🛡", title: "Elite User", subtitle: "Elite members", color: "#12AFC7", roles: ["elite_user", "elite"] },
];
const COMMUNITY: Category[] = [
  { id: "mentor", icon: "🎓", title: "Mentor", subtitle: "Mentors", color: "#E12A2A", roles: ["mentor"] },
  { id: "merchant", icon: "🏪", title: "Merchant", subtitle: "Verified merchants", color: "#7B1FB8", roles: ["merchant"] },
  { id: "top", icon: "🏆", title: "Top Level Users", subtitle: "Highest level users", color: "#E0B000", roles: [] },
];

// Name colours on the dark rows (the app's accents).
const NAME_COLORS: Record<string, string> = {
  executive_board: "#8FA2FF",
  admin: "#FFD54F",
  country_representative: "#E0B89A",
  staff: "#39FF14",
  elite_user: "#00FFFF",
  mentor: "#FF4D4D",
  merchant: "#C77DFF",
  top: "#FFD54F",
};

type Member = { uid: string; name: string; photo: string; level: number; country: string; roles: string[] };

const norm = (v: string) => v.trim().toLowerCase().replace(/[-\s]/g, "_");

function toMember(uid: string, d: DocumentData): Member {
  const roles = [
    ...(Array.isArray(d.roles) ? d.roles.map((r: unknown) => norm(String(r))) : []),
    ...[d.role, d.memberType].filter((r) => typeof r === "string" && r.trim()).map((r) => norm(r)),
  ];
  return {
    uid,
    name: String(d.username || ""),
    photo: String(d.photoUrl || d.profilePic || d.avatarUrl || d.imageUrl || "").trim(),
    level: Number(d.level || 1),
    country: String(d.country || ""),
    roles,
  };
}

export default function MembersPage() {
  const ready = useRequireLogin();
  const [members, setMembers] = useState<Member[] | null>(null);
  const [selected, setSelected] = useState<Category | null>(null);

  useEffect(() => {
    if (!ready) return;
    getDocs(query(collection(db, "users"), limit(500)))
      .then((snap) => setMembers(snap.docs.map((d) => toMember(d.id, d.data())).filter((m) => m.name)))
      .catch(() => setMembers([]));
  }, [ready]);

  const list = useMemo(() => {
    if (!selected || !members) return [];
    if (selected.id === "top") return [...members].sort((a, b) => b.level - a.level).slice(0, 100);
    return members
      .filter((m) => m.roles.some((r) => selected.roles.includes(r)))
      .sort((a, b) => b.level - a.level);
  }, [selected, members]);

  return (
    <PageShell light>
      <section className="mx-auto max-w-2xl px-3 lg:max-w-4xl pb-8 sm:px-6">
        {selected ? (
          <>
            <PageTitle title={selected.title} subtitle={selected.subtitle} icon={selected.icon} />
            {members === null ? (
              <p className="py-10 text-center text-sm text-[#5B6B8C]">Loading…</p>
            ) : list.length === 0 ? (
              <p className="py-10 text-center text-sm text-[#5B6B8C]">No members yet.</p>
            ) : (
              <ul className="grid gap-2 md:grid-cols-2">
                {list.map((m, i) => (
                  <li key={m.uid}>
                    <Link
                      href={`/profile/${encodeURIComponent(m.name)}`}
                      className="flex items-center gap-3 rounded-2xl border border-[#3A3570] bg-gradient-to-r from-[#17163A] to-[#2B2656] px-3 py-2.5 shadow-md hover:brightness-110"
                    >
                      {selected.id === "top" && <span className="w-6 text-center text-sm font-black text-[#D9A400]">{i + 1}</span>}
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/10 font-black text-white">
                        {m.photo ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={m.photo} alt="" className="h-full w-full object-cover" />
                        ) : (
                          m.name.slice(0, 1).toUpperCase()
                        )}
                      </span>
                      <span data-notranslate className="min-w-0 flex-1">
                        <span className="block truncate font-bold" style={{ color: NAME_COLORS[selected.id] || selected.color }}>
                          {m.name}
                        </span>
                        <span className="block truncate text-xs text-white/70">
                          {[`Level ${m.level}`, m.country].filter(Boolean).join(" · ")}
                        </span>
                      </span>
                      <span className="text-white/50">›</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="mt-4 w-full rounded-2xl bg-white py-3 text-sm font-bold text-[#2F80ED] shadow-sm"
            >
              ← All categories
            </button>
          </>
        ) : (
          <>
            <PageTitle title="Members" subtitle="Explore · Community" />
            <SectionLabel>Management</SectionLabel>
            <div className="grid gap-2.5 md:grid-cols-2">
              {MANAGEMENT.map((c) => (
                <PastelCard key={c.id} icon={c.icon} title={c.title} subtitle={c.subtitle} color={c.color} onClick={() => setSelected(c)} />
              ))}
            </div>
            <SectionLabel>Community</SectionLabel>
            <div className="grid gap-2.5 md:grid-cols-2">
              {COMMUNITY.map((c) => (
                <PastelCard key={c.id} icon={c.icon} title={c.title} subtitle={c.subtitle} color={c.color} onClick={() => setSelected(c)} />
              ))}
            </div>
          </>
        )}
      </section>
    </PageShell>
  );
}
