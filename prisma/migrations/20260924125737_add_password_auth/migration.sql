-- Replace Google OAuth with email/password auth, domain-gated signup.
ALTER TABLE "users" ADD COLUMN "password_hash" TEXT;
