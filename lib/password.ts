// 🔐 One password rule for sign-up, password change, reset and the secret page:
// at least 8 characters, with at least one letter and one digit.
// Existing accounts keep logging in with their old password; this only applies
// when a password is set or changed.
export const PASSWORD_RULE_TEXT = "Password must be at least 8 characters and contain a letter and a number.";

/** The error text for a password that breaks the rule, or null when it is fine. */
export function passwordProblem(pw: string): string | null {
  if (pw.length < 8) return PASSWORD_RULE_TEXT;
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return PASSWORD_RULE_TEXT;
  return null;
}
