import { NextResponse, type NextRequest } from "next/server";

const INTERNAL = "/admin";

/**
 * The admin panel lives at /admin internally, but is reached through a secret path
 * set in the ADMIN_SECRET_PATH environment variable, so the real URL is never in the
 * source. When a secret is set, /admin itself returns 404 and only the secret path
 * serves the panel. The password gate and server-only service key are the real locks.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const secret = (process.env.ADMIN_SECRET_PATH || "").trim().replace(/^\/+|\/+$/g, "");
  const base = secret ? `/${secret}` : INTERNAL;

  const isInternal = pathname === INTERNAL || pathname.startsWith(`${INTERNAL}/`);
  if (secret && isInternal) {
    return new NextResponse(null, { status: 404 });
  }

  const isBase = pathname === base || pathname.startsWith(`${base}/`);
  if (isBase) {
    const rest = pathname.slice(base.length);
    const url = request.nextUrl.clone();
    url.pathname = `${INTERNAL}${rest}`;
    const res = NextResponse.rewrite(url);
    res.headers.set("x-admin-base", base);
    return res;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
