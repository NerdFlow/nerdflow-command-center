import { type NextAuthOptions, getServerSession } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import { redirect } from "next/navigation";
import { prisma } from "@/server/db";
import { getOrgSettings } from "@/server/settings";

const devLoginEnabled = process.env.ALLOW_DEV_LOGIN === "true";
const googleConfigured = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

async function isEmailAllowed(email: string) {
  const domain = email.split("@")[1]?.toLowerCase();
  const settings = await getOrgSettings();
  const allowed = (settings?.allowedEmailDomain || process.env.ALLOWED_EMAIL_DOMAIN || "").toLowerCase();
  return Boolean(domain && allowed && domain === allowed);
}

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt", maxAge: 7 * 24 * 60 * 60 },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  providers: [
    ...(googleConfigured
      ? [
          GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID!,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
          }),
        ]
      : []),
    ...(devLoginEnabled
      ? [
          CredentialsProvider({
            id: "dev-login",
            name: "Dev login",
            credentials: { email: { label: "Email", type: "text" } },
            async authorize(credentials) {
              const email = credentials?.email?.toLowerCase().trim();
              if (!email) return null;
              const user = await prisma.user.findUnique({ where: { email } });
              if (!user || user.status === "deactivated") return null;
              return { id: user.id, email: user.email, name: user.fullName };
            },
          }),
        ]
      : []),
  ],
  callbacks: {
    async signIn({ user, account }) {
      if (!user.email) return false;
      const isDevLogin = account?.provider === "dev-login";

      if (!isDevLogin) {
        const allowed = await isEmailAllowed(user.email);
        if (!allowed) return "/login?error=domain";
      }

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
