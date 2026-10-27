import { NextResponse, type NextRequest } from "next/server";

// miglife.app (and www.) is the landing page; the app is web.miglife.app.
//  • miglife.app/            → shows the landing page (/welcome)
//  • miglife.app/anything    → web.miglife.app/anything (old links keep working)
// web.miglife.app and preview URLs are not touched.
const LANDING_HOST = /^(www\.)?miglife\.app$/i;

export function middleware(req: NextRequest) {
  const host = (req.headers.get("host") || "").split(":")[0];
  if (!LANDING_HOST.test(host)) return NextResponse.next();

  const { pathname, search } = req.nextUrl;
  if (pathname === "/" || pathname === "/welcome") {
    if (host.toLowerCase().startsWith("www.")) {
      return NextResponse.redirect(`https://miglife.app/${search}`, 308);
    }
    return NextResponse.rewrite(new URL(`/welcome${search}`, req.url));
  }
  return NextResponse.redirect(`https://web.miglife.app${pathname}${search}`, 308);
}

export const config = {
  // Pages only: not Next's own files or anything in public/ (icons, sounds …).
  // ⚡ Only on miglife.app / www.miglife.app — web.miglife.app pages (and every
  // tab switch there) no longer pass through this extra step.
  matcher: [
    {
      source: "/((?!_next/|api/|.*\\.[a-zA-Z0-9]+$).*)",
      has: [{ type: "host", value: "(www\\.)?miglife\\.app" }],
    },
  ],
};
