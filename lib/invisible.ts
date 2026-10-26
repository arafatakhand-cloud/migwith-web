
// 🫥 WHO MAY BE INVISIBLE (the app's maCanBeInvisible): NOBODY any more
// (miglife asked — invisible entering caused trouble). "Login as Invisible"
// and Presence Status INVISIBLE are ignored for everyone.

export function canBeInvisibleByRole(username: string | null | undefined, role: string | null | undefined): boolean {
  void username;
  void role;
  return false;
}

export async function canBeInvisible(uid: string, username: string | null | undefined, role: string | null | undefined): Promise<boolean> {
  void uid;
  return canBeInvisibleByRole(username, role);
}
