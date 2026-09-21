import { NextResponse, type NextRequest } from "next/server";

// UX only: the real authorization is always server-side. Keep this cookie name
// in sync with SESSION_COOKIE_NAME (production on Firebase Hosting: __session).
const SESSION_COOKIE = "neoma_session";

const PROTECTED = ["/today", "/groups", "/vault", "/calendar", "/settings"];

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const guarded = PROTECTED.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (!guarded) return NextResponse.next();
  if (req.cookies.get(SESSION_COOKIE)?.value) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!api|_next|assets|favicon|icon|.*\\..*).*)"],
};
