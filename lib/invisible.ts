import { doc, getDoc } from "firebase/firestore";
import { db } from "./firebase";
import { isMainFounderName } from "./founder";

// 🫥 WHO MAY BE INVISIBLE (the app's maCanBeInvisible): only the Founder
// (miglife + the founders miglife added), official Admins and Staff. For
// everybody else "Login as Invisible" and Presence Status INVISIBLE are
// ignored, and the Firestore rules refuse to save them.

const ROLES = new Set(["admin", "staff", "superadmin", "ceo", "owner"]);

/** From the name and role alone (no founders lookup). */
export function canBeInvisibleByRole(username: string | null | undefined, role: string | null | undefined): boolean {
  const r = String(role || "").trim().toLowerCase().replace(/[- ]/g, "_");
  const n = String(username || "").trim().toLowerCase();
  return isMainFounderName(n) || ROLES.has(r) || n === "admin" || n === "staff";
}

/** Also counts a founder miglife added (founders/{uid}). */
export async function canBeInvisible(uid: string, username: string | null | undefined, role: string | null | undefined): Promise<boolean> {
  if (canBeInvisibleByRole(username, role)) return true;
  try {
    return (await getDoc(doc(db, "founders", uid))).exists();
  } catch {
    return false;
  }
}
