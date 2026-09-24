import { type NextAuthOptions, getServerSession } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { prisma } from "@/server/db";

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

/**
 * Always re-reads the user row rather than trusting JWT claims, so a role
 * change or deactivation from /admin takes effect on the user's very next
 * request instead of waiting for their session to expire.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await getAuthSession();
  if (!session?.user?.email) return null;
  const user = await prisma.user.findUnique({ where: { email: session.user.email } });
  if (!user || user.status === "deactivated") return null;
  if (user.sessionsInvalidatedAt && session.iat && session.iat * 1000 < user.sessionsInvalidatedAt.getTime()) {
    return null;
  }
  return user;
}

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireRole(roles: Array<"rep" | "manager" | "admin">): Promise<CurrentUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) redirect("/today");
  return user;
}
