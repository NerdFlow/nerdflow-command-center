import { getToken } from "next-auth/jwt";
import { NextResponse, type NextRequest } from "next/server";

// Role/status/onboarding checks need Prisma (Node runtime), so they live
// in src/app/(app)/layout.tsx as a Server Component. Middleware only handles
// the coarse "are you signed in at all" gate, since it runs on the Edge
// runtime where Prisma isn't available.
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isPublic =
    pathname === "/login" ||
    pathname === "/signup" ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/ingest") ||
    // Bearer-secured with its own CRON_SECRET check in the route handler
    // (see src/app/api/cron/lead-gen/route.ts) - not session auth, so it
    // must be exempted here or every call gets redirected to /login first.
    pathname.startsWith("/api/cron/") ||
    // Bearer FOCUS_INGEST_SECRET, checked in the route. Not a session.
    pathname.startsWith("/api/v1/focus/days/") ||
    pathname.startsWith("/api/v1/focus/cards/") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/brand") ||
    pathname === "/favicon.ico";

  if (isPublic) return NextResponse.next();

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|brand).*)"],
};
