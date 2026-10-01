import { cache } from "react";
import { cookies } from "next/headers";
import { type NextAuthOptions, getServerSession } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { prisma } from "@/server/db";
import { IMPERSONATION_COOKIE, clearImpersonationCookie, readImpersonationCookie } from "@/server/impersonation";

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt", maxAge: 7 * 24 * 60 * 60 },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  providers: [
    CredentialsProvider({
      id: "credentials",
      name: "Email and password",
      credentials: {
        email: { label: "Email", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = credentials?.email?.toLowerCase().trim();
        const password = credentials?.password;
        if (!email || !password) return null;

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user || user.status === "deactivated" || !user.passwordHash) return null;

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) return null;

        return { id: user.id, email: user.email, name: user.fullName };
      },
    }),
  ],
  callbacks: {
    async signIn({ user }) {
      if (!user.email) return false;

      const dbUser = await prisma.user.findUnique({ where: { email: user.email } });
      if (!dbUser || dbUser.status === "deactivated") return "/login?error=notinvited";

      if (dbUser.status === "invited") {
        await prisma.user.update({
          where: { id: dbUser.id },
          data: { status: "active", lastLoginAt: new Date() },
        });
      } else {
        await prisma.user.update({ where: { id: dbUser.id }, data: { lastLoginAt: new Date() } });
      }
      await prisma.auditLog.create({
        data: {
          organizationId: dbUser.organizationId,
          actorId: dbUser.id,
          action: "sign_in",
          entityType: "user",
          entityId: dbUser.id,
        },
      });
      clearImpersonationCookie();
      return true;
    },
    async jwt({ token, user }) {
      if (user?.email) token.email = user.email;
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.email) session.user.email = token.email as string;
      if (typeof token.iat === "number") session.iat = token.iat;
      return session;
    },
  },
};

export function getAuthSession() {
  return getServerSession(authOptions);
}

export type CurrentUser = NonNullable<Awaited<ReturnType<typeof prisma.user.findUnique>>>;

type SessionContext = {
  /** The person who actually signed in. */
  actor: CurrentUser | null;
  /** Who the app is acting as. Equals actor, unless a manager has opened someone else's account. */
  user: CurrentUser | null;
};

/**
 * Always re-reads the user row rather than trusting JWT claims, so a role
 * change or deactivation takes effect on the next request.
 * Cached per React request so layout + page don't each hit the DB twice.
 */
const loadSessionContext = cache(async (): Promise<SessionContext> => {
  const session = await getAuthSession();
  if (!session?.user?.email) return { actor: null, user: null };

  const actor = await prisma.user.findUnique({ where: { email: session.user.email } });
  if (!actor || actor.status === "deactivated") return { actor: null, user: null };
  if (actor.sessionsInvalidatedAt && session.iat && session.iat * 1000 < actor.sessionsInvalidatedAt.getTime()) {
    return { actor: null, user: null };
  }

  const claim = readImpersonationCookie(cookies().get(IMPERSONATION_COOKIE)?.value);
  if (claim && actor.role === "lead" && claim.actorId === actor.id && claim.targetId !== actor.id) {
    const target = await prisma.user.findFirst({
      where: {
        id: claim.targetId,
        organizationId: actor.organizationId,
        status: { not: "deactivated" },
      },
    });
    if (target) return { actor, user: target };
  }

  return { actor, user: actor };
});

export const getSessionActor = cache(async (): Promise<CurrentUser | null> => {
  return (await loadSessionContext()).actor;
});

export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  return (await loadSessionContext()).user;
});

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireRole(roles: Array<"rep" | "lead">): Promise<CurrentUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) redirect("/today");
  return user;
}
