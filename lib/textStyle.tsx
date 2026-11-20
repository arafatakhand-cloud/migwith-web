import { Fragment, type ReactNode } from "react";

// ✍️ Text styles (miglife 2026-11, design S1) — same marks as the app (MigTextStyle.kt):
//   **bold**      __italic__      {{blue|coloured}}
// Styles can sit inside each other. Shown everywhere a message is drawn (room chat,
// private chat, Feed); an older app just shows the marks.

export const TEXT_COLORS: [string, string][] = [
  ["red", "#E5484D"],
  ["orange", "#F59E0B"],
  ["green", "#16A34A"],
  ["blue", "#2563EB"],
  ["purple", "#7C3AED"],
  ["pink", "#DB2777"],
  ["teal", "#0D9488"],
];
const COLOR: Record<string, string> = Object.fromEntries(TEXT_COLORS);

const STYLE_RE = /\{\{(red|orange|green|blue|purple|pink|teal)\|([\s\S]+?)\}\}|\*\*(?=\S)([\s\S]+?)(?<=\S)\*\*|(?<![A-Za-z0-9])__(?=\S)([\s\S]+?)(?<=\S)__(?![A-Za-z0-9])/;
const STYLE_RE_G = new RegExp(STYLE_RE.source, "g");

export const hasTextStyle = (s: string) => s.includes("**") || s.includes("__") || s.includes("{{");

/** the words only (titles, previews, notifications) */
export function plainText(s: string): string {
  if (!s || !hasTextStyle(s)) return s;
  let t = s;
  for (let i = 0; i < 4 && hasTextStyle(t); i++) t = t.replace(STYLE_RE_G, (_m, _c, a, b, c) => a ?? b ?? c ?? "");
  return t;
}

/** the marks out, the styles in; `plain` draws the unstyled pieces (emotes, @names, #tags…) */
export function styledNodes(text: string, plain: (s: string, key: string) => ReactNode, key = "s"): ReactNode[] {
  if (!text || !hasTextStyle(text)) return [<Fragment key={key}>{plain(text, key)}</Fragment>];
  const out: ReactNode[] = [];
  let rest = text;
  let i = 0;
  while (rest) {
    const m = STYLE_RE.exec(rest);
    if (!m) {
      out.push(<Fragment key={`${key}p${i++}`}>{plain(rest, `${key}p${i}`)}</Fragment>);
      break;
    }
    if (m.index > 0) out.push(<Fragment key={`${key}p${i++}`}>{plain(rest.slice(0, m.index), `${key}p${i}`)}</Fragment>);
    const k = `${key}_${i++}`;
    if (m[1]) out.push(<span key={k} style={{ color: COLOR[m[1]] }}>{styledNodes(m[2], plain, k)}</span>);
    else if (m[3] !== undefined) out.push(<b key={k} className="font-black">{styledNodes(m[3], plain, k)}</b>);
    else out.push(<i key={k}>{styledNodes(m[4], plain, k)}</i>);
    rest = rest.slice(m.index + m[0].length);
  }
  return out;
}
