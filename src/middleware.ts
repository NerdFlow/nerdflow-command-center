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
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/ingest") ||
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
