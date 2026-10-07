// The Auth "alias" email for a MIG ID: "<id lowercase>@login.migwith.local".
// An ID that starts or ends with "." or has ".." (e.g. "go.") would make an
// email Firebase refuses, so for those IDs the dots become "+" in the alias
// ("go+@login.migwith.local"). "+" is never part of a MIG ID, so every other
// ID keeps exactly the alias it already has. Same rule as migAliasEmail() in
// the server's index.js and the app's MigLoginSettingsScreens.kt.
export function migAliasEmail(id: string): string {
  const l = String(id || "").trim().toLowerCase();
  const bad = l.startsWith(".") || l.endsWith(".") || l.includes("..");
  return `${bad ? l.replace(/\./g, "+") : l}@login.migwith.local`;
}

/** The MIG ID back from an alias email ("go+@login.migwith.local" → "go."). */
export function migIdFromAliasEmail(email: string | null | undefined): string {
  return String(email || "").split("@")[0].replace(/\+/g, ".");
}
