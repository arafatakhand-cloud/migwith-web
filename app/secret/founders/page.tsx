"use client";

import { useEffect, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "../../../lib/firebase";
import { FOUNDER_PERMS, FOUNDER_PERM_GROUPS, useFounderPerms } from "../../../lib/founder";
import { FounderShell, card, input } from "../_Shell";

// 👥 Founders (migwith only), like the app: add a founder with permissions,
// change their permissions, remove them — all through manageFounder.

const manageFounder = httpsCallable<Record<string, unknown>, Record<string, any>>(functions, "manageFounder");

type Founder = { uid: string; username: string; perms: string[]; addedAt: number | null; role?: string };

// 🧰 2026-11-26: every Secret tool, in the Secret page's groups. One switch per group
// turns the whole group on / off; "Give all" / "Remove all" do every tool at once.
function PermList({ selected, onToggle, onReplace }: { selected: Set<string>; onToggle: (p: string) => void; onReplace?: (s: Set<string>) => void }) {
  const label = Object.fromEntries(FOUNDER_PERMS);
  const grouped = new Set(FOUNDER_PERM_GROUPS.flatMap(([, ps]) => ps));
  const groups: [string, string[]][] = [...FOUNDER_PERM_GROUPS, ["Other", FOUNDER_PERMS.map(([p]) => p).filter((p) => !grouped.has(p))]];
  const total = FOUNDER_PERMS.length;
  const on = FOUNDER_PERMS.filter(([p]) => selected.has(p)).length;
  const setGroup = (ps: string[], turnOn: boolean) => {
    if (!onReplace) return ps.forEach((p) => selected.has(p) !== turnOn && onToggle(p));
    const n = new Set(selected);
    ps.forEach((p) => (turnOn ? n.add(p) : n.delete(p)));
    onReplace(n);
  };
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => setGroup(FOUNDER_PERMS.map(([p]) => p), true)} className="flex-1 rounded-xl bg-[#0B1F3A] py-2 text-[12.5px] font-extrabold text-white">
          ✓ Give all tools
        </button>
        <button type="button" onClick={() => setGroup(FOUNDER_PERMS.map(([p]) => p), false)} className="flex-1 rounded-xl bg-[#E9EEF6] py-2 text-[12.5px] font-extrabold text-[#334155]">
          ✕ Remove all
        </button>
      </div>
      <p className="text-[12px] text-[#6B7A99]">
        <b className="text-[#1D4ED8]">{on}</b> of {total} tools on
      </p>
      {groups
        .filter(([, ps]) => ps.length > 0)
        .map(([g, ps]) => {
          const n = ps.filter((p) => selected.has(p)).length;
          const all = n === ps.length;
          return (
            <div key={g} className="border-t border-[#E3E9F2] pt-2">
              <div className="mb-1.5 flex items-center gap-2">
                <p className="flex-1 text-[13.5px] font-bold">{g}</p>
                <span className="rounded-full bg-white px-2 text-[11px] font-extrabold text-[#6B7A99]">
                  {n}/{ps.length}
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={all}
                  aria-label={`All of ${g}`}
                  onClick={() => setGroup(ps, !all)}
                  className={`relative h-5 w-9 rounded-full transition ${all ? "bg-[#16A34A]" : "bg-[#CBD5E1]"}`}
                >
                  <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${all ? "left-[18px]" : "left-0.5"}`} />
                </button>
                <span className="text-[11px] font-bold text-[#6B7A99]">All</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {ps.map((p) => {
                  const has = selected.has(p);
                  return (
                    <button
                      key={p}
                      type="button"
                      aria-pressed={has}
                      onClick={() => onToggle(p)}
                      className={`rounded-full border-[1.5px] px-2.5 py-1 text-[12px] font-bold ${has ? "border-[#BFD0FF] bg-[#E8F0FF] text-[#1D4ED8]" : "border-transparent bg-white text-[#5B6478]"}`}
                    >
                      {has ? "✓ " : ""}
                      {label[p] || p}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
    </div>
  );
}

function FounderCard({ f, busy, onSave, onRemove }: { f: Founder; busy: boolean; onSave: (p: string[]) => void; onRemove: () => void }) {
  const [edit, setEdit] = useState(new Set(f.perms));
  useEffect(() => setEdit(new Set(f.perms)), [f.perms]);
  const changed = edit.size !== f.perms.length || f.perms.some((p) => !edit.has(p));
  return (
    <div className="space-y-1.5 rounded-2xl bg-[#F1F5FB] p-4">
      <div className="flex items-center">
        <div className="flex-1">
          <p className="text-[15px] font-bold">
            {f.username}
            {f.role && (
              <span className="ml-2 rounded-full bg-[#DCE8F8] px-2 py-0.5 text-[11px] font-bold text-[#15589B]">
                {f.role === "admin" ? "⚙️ Admin" : "🛠 Staff"}
              </span>
            )}
          </p>
          {f.addedAt && (
            <p className="text-[11px] text-gray-500">
              Added {new Date(f.addedAt).toLocaleString(undefined, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
            </p>
          )}
        </div>
        <button type="button" disabled={busy} onClick={onRemove} className="text-sm font-bold text-[#D32F2F]">
          Remove
        </button>
      </div>
      <PermList
        selected={edit}
        onReplace={setEdit}
        onToggle={(p) => {
          const n = new Set(edit);
          if (n.has(p)) n.delete(p);
          else n.add(p);
          setEdit(n);
        }}
      />
      <button type="button" disabled={busy || !changed} onClick={() => onSave([...edit])} className="text-sm font-bold text-[#2F80ED] disabled:opacity-40">
        Save changes
      </button>
    </div>
  );
}

// 🎭 Permissions by role (Staff / Admin / Founder) and ➕ Add staff id / ➕ Add admin id
// (one MIG ID with its own tools), the same as the Android Founders page.
const ROLE_LABELS: [string, string][] = [
  ["staff", "🛠 Staff"],
  ["admin", "⚙️ Admin"],
  ["founder", "👥 Founder"],
];

function RoleTools({ onAdded }: { onAdded: () => void }) {
  const [roles, setRoles] = useState<Record<string, Set<string>>>({});
  const [staffName, setStaffName] = useState("");
  const [staffPerms, setStaffPerms] = useState(new Set<string>());
  const [adminName, setAdminName] = useState("");
  const [adminPerms, setAdminPerms] = useState(new Set<string>());
  const [msg, setMsg] = useState("");
  const [msgAt, setMsgAt] = useState<"staff" | "admin" | "">("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    manageFounder({ action: "roleList" })
      .then(({ data }) => {
        const out: Record<string, Set<string>> = {};
        for (const [k] of ROLE_LABELS) out[k] = new Set(Array.isArray(data.roles?.[k]) ? data.roles[k].map(String) : []);
        setRoles(out);
      })
      .catch(() => setMsg("❌ Could not load role tools."));
  }, []);

  const toggle = (set: Set<string>, p: string) => {
    const n = new Set(set);
    if (n.has(p)) n.delete(p);
    else n.add(p);
    return n;
  };

  const saveRole = async (role: string) => {
    setBusy(true);
    setMsg("");
    setMsgAt("");
    try {
      await manageFounder({ action: "roleSet", role, perms: [...(roles[role] || [])] });
      setMsg(`✅ ${role} tools saved.`);
    } catch (e: any) {
      setMsg("❌ " + (e?.message || "Could not save."));
    } finally {
      setBusy(false);
    }
  };

  const addRole = async (role: "staff" | "admin", name: string, perms: Set<string>, clear: () => void) => {
    setBusy(true);
    setMsg("");
    setMsgAt(role);
    setMsgAt(role);
    try {
      const { data } = await manageFounder({ action: "setUserRole", username: name.trim(), role, perms: [...perms] });
      setMsg(`✅ ${data.username || name.trim()} is now ${role}.`);
      clear();
      onAdded();
    } catch (e: any) {
      setMsg("❌ " + (e?.message || "Could not add."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className={`${card} space-y-3`}>
        <p className="text-[15px] font-bold">🎭 Permissions by role</p>
        <p className="text-xs text-gray-500">Everyone with the role gets the ticked tools.</p>
        {ROLE_LABELS.map(([k, label]) => (
          <div key={k} className="space-y-1 border-t pt-2">
            <p className="text-[13px] font-bold">{label}</p>
            <PermList selected={roles[k] || new Set()} onReplace={(n) => setRoles((r) => ({ ...r, [k]: n }))} onToggle={(p) => setRoles((r) => ({ ...r, [k]: toggle(r[k] || new Set(), p) }))} />
            <button type="button" disabled={busy} onClick={() => saveRole(k)} className="rounded-full bg-[#2F80ED] px-4 py-1.5 text-[13px] font-bold text-white disabled:opacity-40">
              Save {label}
            </button>
          </div>
        ))}
      </div>

      <div className={`${card} space-y-2`}>
        <p className="text-[15px] font-bold">➕ Add staff id</p>
        <input value={staffName} onChange={(e) => setStaffName(e.target.value)} placeholder="MIG ID" className={input} />
        <p className="text-xs text-gray-500">Permissions for this person</p>
        <PermList selected={staffPerms} onReplace={setStaffPerms} onToggle={(p) => setStaffPerms((s) => toggle(s, p))} />
        <button
          type="button"
          disabled={!staffName.trim() || busy}
          onClick={() => addRole("staff", staffName, staffPerms, () => { setStaffName(""); setStaffPerms(new Set()); })}
          className="w-full rounded-full bg-[#2F80ED] py-2.5 font-bold text-white disabled:opacity-40"
        >
          Add staff
        </button>
        {msg && msgAt === "staff" && <p className="text-[13px] font-bold text-gray-600">{msg}</p>}
      </div>

      <div className={`${card} space-y-2`}>
        <p className="text-[15px] font-bold">➕ Add admin id</p>
        <input value={adminName} onChange={(e) => setAdminName(e.target.value)} placeholder="MIG ID" className={input} />
        <p className="text-xs text-gray-500">Permissions for this person</p>
        <PermList selected={adminPerms} onReplace={setAdminPerms} onToggle={(p) => setAdminPerms((s) => toggle(s, p))} />
        <button
          type="button"
          disabled={!adminName.trim() || busy}
          onClick={() => addRole("admin", adminName, adminPerms, () => { setAdminName(""); setAdminPerms(new Set()); })}
          className="w-full rounded-full bg-[#2F80ED] py-2.5 font-bold text-white disabled:opacity-40"
        >
          Add admin
        </button>
        {msg && msgAt === "admin" && <p className="text-[13px] font-bold text-gray-600">{msg}</p>}
      </div>
      {msg && msgAt === "" && <p className="text-[13px] font-bold text-gray-600">{msg}</p>}
    </>
  );
}

export default function FoundersPage() {
  const f = useFounderPerms();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [founders, setFounders] = useState<Founder[]>([]);
  const [staff, setStaff] = useState<Founder[]>([]);
  const [name, setName] = useState("");
  const [perms, setPerms] = useState(new Set<string>());

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setStatus("");
    try {
      await fn();
    } catch (e: any) {
      setStatus("❌ " + (e?.message || "Failed"));
    } finally {
      setBusy(false);
    }
  };
  const refresh = async () => {
    const { data } = await manageFounder({ action: "list" });
    setFounders(
      (Array.isArray(data.founders) ? data.founders : []).map((m: any) => ({
        uid: String(m.uid || ""),
        username: String(m.username || ""),
        perms: Array.isArray(m.perms) ? m.perms.map(String) : [],
        addedAt: typeof m.addedAt === "number" ? m.addedAt : null,
      }))
    );
    setStaff(
      (Array.isArray(data.staff) ? data.staff : []).map((m: any) => ({
        uid: String(m.uid || ""),
        username: String(m.username || ""),
        role: String(m.role || "staff"),
        perms: Array.isArray(m.perms) ? m.perms.map(String) : [],
        addedAt: typeof m.addedAt === "number" ? m.addedAt : null,
      }))
    );
  };

  useEffect(() => {
    if (f.isMigwith) run(refresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f.isMigwith]);

  return (
    <FounderShell title="👥 Founders" allowed={f.isMigwith} loaded={f.loaded}>
      {busy && <div className="h-1 animate-pulse rounded bg-[#2F80ED]/60" />}
      {status && <p className="text-[13px] text-gray-500">{status}</p>}
      <RoleTools onAdded={() => run(refresh)} />

      <div className={`${card} space-y-2`}>
        <p className="text-[15px] font-bold">➕ Add a founder</p>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="MIG ID" className={input} />
        <p className="text-xs text-gray-500">Permissions</p>
        <PermList
          selected={perms}
          onReplace={setPerms}
          onToggle={(p) => {
            const n = new Set(perms);
            if (n.has(p)) n.delete(p);
            else n.add(p);
            setPerms(n);
          }}
        />
        <button
          type="button"
          disabled={!name.trim() || busy}
          onClick={() =>
            run(async () => {
              const { data } = await manageFounder({ action: "add", username: name.trim(), perms: [...perms] });
              setName("");
              setPerms(new Set());
              await refresh();
              setStatus("✅ Added " + String(data.username || name.trim()));
            })
          }
          className="w-full rounded-full bg-[#2F80ED] py-2.5 font-bold text-white disabled:opacity-40"
        >
          Add founder
        </button>
      </div>
      {staff.length > 0 && (
        <>
          <p className="font-bold">Staff &amp; Admin ids ({staff.length})</p>
          {staff.map((x) => (
            <FounderCard
              key={x.uid}
              f={x}
              busy={busy}
              onSave={(p) =>
                run(async () => {
                  await manageFounder({ action: "setUserRole", username: x.username, role: x.role, perms: p });
                  await refresh();
                  setStatus(`✅ Updated ${x.username}`);
                })
              }
              onRemove={() => {
                if (!window.confirm(`Remove ${x.username} from ${x.role}?`)) return;
                run(async () => {
                  await manageFounder({ action: "setUserRole", username: x.username, role: "user", perms: [] });
                  await refresh();
                  setStatus(`✅ Removed ${x.username}`);
                });
              }}
            />
          ))}
        </>
      )}
      {founders.length > 0 ? (
        <>
          <p className="font-bold">Founders ({founders.length})</p>
          {founders.map((x) => (
            <FounderCard
              key={x.uid}
              f={x}
              busy={busy}
              onSave={(p) =>
                run(async () => {
                  await manageFounder({ action: "update", uid: x.uid, perms: p });
                  await refresh();
                  setStatus("✅ Updated permissions");
                })
              }
              onRemove={() =>
                run(async () => {
                  await manageFounder({ action: "remove", uid: x.uid });
                  await refresh();
                  setStatus(`✅ Removed ${x.username}`);
                })
              }
            />
          ))}
        </>
      ) : (
        !busy && <p className="text-[13px] text-gray-500">No founders yet.</p>
      )}
    </FounderShell>
  );
}
