-- Remove two-factor authentication (MFA) support entirely.
ALTER TABLE "org_settings" DROP COLUMN "mfa_required_for_all_roles";
ALTER TABLE "users" DROP COLUMN "mfa_enabled";
ALTER TABLE "users" DROP COLUMN "mfa_secret";
