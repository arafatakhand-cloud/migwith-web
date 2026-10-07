// "miglife" is always SHOWN as "miGlife" (the app's brandMiglife). Display
// only: the real username stays "miglife" (logins, founder checks, lookups and
// old messages keep working), and links like web.miglife.app are left alone.
export const MIGLIFE_DISPLAY_NAME = "miGlife";

const WORD = /(?<![A-Za-z0-9_./])miglife(?![A-Za-z0-9_]|\.[A-Za-z])/gi;

export function brandMiglife(text: string): string {
  if (!text || !/miglife/i.test(text)) return text;
  return text.replace(WORD, MIGLIFE_DISPLAY_NAME);
}
