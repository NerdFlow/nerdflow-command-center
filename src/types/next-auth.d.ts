import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    iat?: number;
    user: DefaultSession["user"];
  }
}
