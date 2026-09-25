-- Standalone on purpose (see 20260925170000_add_role_lead_enum_value for the
-- same lesson learned): this value was originally meant to land as part of
-- 20260925160000_v2_phase0_2b_schema, but that file used an explicit
-- BEGIN/COMMIT for the CampaignStatus enum swap right before this statement.
-- Postgres has no real nested transactions - that COMMIT closed out
-- everything before it, and this bare statement (running after the commit,
-- before the next failure) got rolled back along with the Role failure that
-- followed it. Confirmed via `prisma migrate diff` against the live
-- production schema that this is the only thing still missing.
ALTER TYPE "LeadSource" ADD VALUE IF NOT EXISTS 'ai_search';
