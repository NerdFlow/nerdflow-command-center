-- v2 Phase 0/1/2a/2b schema catch-up.
--
-- The dev database for this work was managed with `prisma db push` (see
-- project notes on migration-history divergence), so none of this session's
-- schema changes were ever captured as a real migration — `prisma migrate
-- deploy` on the server had nothing to apply, which is why production is
-- running v2 code against the old v1 schema (P2022 "column does not exist").
--
-- Two of these ALTER TYPEs shrink an enum (Role: manager/admin -> gone,
-- CampaignStatus: pending_approval -> gone). Production has real rows using
-- the old values (the "Value 'manager' not found in enum" error confirms
-- it), so each is preceded by a data remap using a text-cast comparison —
-- this doesn't depend on knowing every old label, and matches how the same
-- shrink was handled on the dev database: old manager/admin users become
-- lead (three roles collapsed to two, manager and admin merge into lead
-- per the product doc); any pending_approval campaign becomes active
-- (v2 has no approval gate at all, so "pending" has nowhere else to go).
--
-- This also drops several org_settings/users columns (welcome_message,
-- onboarding_progress, campaign_limit_per_rep, etc.) — that's intentional,
-- not accidental: those features were removed in v2. Whatever data is in
-- them today is lost once this runs.

-- CreateEnum
CREATE TYPE "ReplyLabel" AS ENUM ('interested', 'question', 'objection', 'not_now');

-- CreateEnum
CREATE TYPE "ReplyStatus" AS ENUM ('open', 'handled', 'snoozed');

-- CreateEnum
CREATE TYPE "ObjectionResponseStatus" AS ENUM ('new', 'testing', 'proven', 'retired');

-- CreateEnum
CREATE TYPE "LeadSourceRunStatus" AS ENUM ('running', 'paused', 'completed', 'failed');

-- CreateEnum
CREATE TYPE "LeadSourceRunSchedule" AS ENUM ('once', 'daily', 'weekly');

-- AlterEnum
ALTER TYPE "AiFeature" ADD VALUE 'lead_discovery';

-- Data remap before shrinking CampaignStatus (pending_approval has no home in v2 - no approval gate)
UPDATE "campaigns" SET "status" = 'active' WHERE "status"::text NOT IN ('draft', 'active', 'paused', 'archived');

-- AlterEnum
BEGIN;
CREATE TYPE "CampaignStatus_new" AS ENUM ('draft', 'active', 'paused', 'archived');
ALTER TABLE "campaigns" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "campaigns" ALTER COLUMN "status" TYPE "CampaignStatus_new" USING ("status"::text::"CampaignStatus_new");
ALTER TYPE "CampaignStatus" RENAME TO "CampaignStatus_old";
ALTER TYPE "CampaignStatus_new" RENAME TO "CampaignStatus";
DROP TYPE "CampaignStatus_old";
ALTER TABLE "campaigns" ALTER COLUMN "status" SET DEFAULT 'draft';
COMMIT;

-- AlterEnum
ALTER TYPE "LeadSource" ADD VALUE 'ai_search';

-- Data remap before shrinking Role (manager/admin merge into lead per product doc v2)
UPDATE "users" SET "role" = 'lead' WHERE "role"::text NOT IN ('rep', 'lead');

-- AlterEnum
BEGIN;
CREATE TYPE "Role_new" AS ENUM ('rep', 'lead');
ALTER TABLE "users" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "users" ALTER COLUMN "role" TYPE "Role_new" USING ("role"::text::"Role_new");
ALTER TYPE "Role" RENAME TO "Role_old";
ALTER TYPE "Role_new" RENAME TO "Role";
DROP TYPE "Role_old";
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'rep';
COMMIT;

-- AlterTable
ALTER TABLE "lead_sources_runs" ADD COLUMN     "auto_approve_above" INTEGER,
ADD COLUMN     "current_keyword" TEXT,
ADD COLUMN     "current_location" TEXT,
ADD COLUMN     "enriched" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "icp_id" TEXT,
ADD COLUMN     "keywords" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "locations" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "matched_icp" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "max_leads" INTEGER NOT NULL DEFAULT 100,
ADD COLUMN     "min_fit_score" INTEGER NOT NULL DEFAULT 50,
ADD COLUMN     "narration" TEXT,
ADD COLUMN     "schedule" "LeadSourceRunSchedule" NOT NULL DEFAULT 'once',
ADD COLUMN     "status" "LeadSourceRunStatus" NOT NULL DEFAULT 'running';

-- AlterTable
ALTER TABLE "org_settings" DROP COLUMN "auto_pause_bounce_ceil_pct",
DROP COLUMN "auto_pause_reply_floor_pct",
DROP COLUMN "auto_pause_touch_threshold",
DROP COLUMN "campaign_limit_per_rep",
DROP COLUMN "email_draft_saving_enabled",
DROP COLUMN "recording_consent_policy",
DROP COLUMN "welcome_message",
ADD COLUMN     "working_hours_default" JSONB NOT NULL DEFAULT '{"start":"09:00","end":"17:30","days":[1,2,3,4,5]}';

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "audience" TEXT,
ADD COLUMN     "case_studies" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "competitors" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "decision_maker_titles" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "donts" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "features" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "logo_url" VARCHAR(2048),
ADD COLUMN     "pricing" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "website" VARCHAR(2048);

-- AlterTable
ALTER TABLE "touches" ADD COLUMN     "reason" TEXT,
ADD COLUMN     "session_id" TEXT;

-- AlterTable
ALTER TABLE "users" DROP COLUMN "assistant_name",
DROP COLUMN "onboarding_completed_at",
DROP COLUMN "onboarding_progress",
ADD COLUMN     "channel_accounts" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "channels_worked" JSONB NOT NULL DEFAULT '["call","email"]',
ADD COLUMN     "photo_url" VARCHAR(2048),
ADD COLUMN     "profile_completed_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "research" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "market_snapshot" TEXT,
    "buyers" JSONB NOT NULL DEFAULT '[]',
    "pain_points" JSONB NOT NULL DEFAULT '[]',
    "competitors" JSONB NOT NULL DEFAULT '[]',
    "channels" JSONB NOT NULL DEFAULT '[]',
    "angles" JSONB NOT NULL DEFAULT '[]',
    "sources" JSONB NOT NULL DEFAULT '[]',
    "approved_by" TEXT,
    "approved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "research_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "icps" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "business_types" JSONB NOT NULL DEFAULT '[]',
    "keywords" JSONB NOT NULL DEFAULT '[]',
    "size_signals" TEXT,
    "must_have" JSONB NOT NULL DEFAULT '[]',
    "nice_to_have" JSONB NOT NULL DEFAULT '[]',
    "disqualifiers" JSONB NOT NULL DEFAULT '[]',
    "decision_maker_titles" JSONB NOT NULL DEFAULT '[]',
    "weights" JSONB NOT NULL DEFAULT '{}',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "icps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "focus_sessions" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "channel" "Channel" NOT NULL,
    "length_minutes" INTEGER NOT NULL,
    "goal" JSONB NOT NULL DEFAULT '{}',
    "touch_count" INTEGER NOT NULL DEFAULT 0,
    "conversation_count" INTEGER NOT NULL DEFAULT 0,
    "summary" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL,
    "ended_at" TIMESTAMP(3),

    CONSTRAINT "focus_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "replies" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "lead_id" TEXT NOT NULL,
    "channel" "Channel" NOT NULL,
    "text" TEXT NOT NULL,
    "label" "ReplyLabel",
    "status" "ReplyStatus" NOT NULL DEFAULT 'open',
    "response_draft" TEXT,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "handled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "replies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "objection_responses" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "objection" TEXT NOT NULL,
    "response_text" TEXT NOT NULL,
    "uses" INTEGER NOT NULL DEFAULT 0,
    "kept_talking_count" INTEGER NOT NULL DEFAULT 0,
    "lost_count" INTEGER NOT NULL DEFAULT 0,
    "status" "ObjectionResponseStatus" NOT NULL DEFAULT 'new',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "objection_responses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "research_campaign_id_key" ON "research"("campaign_id");

-- AddForeignKey
ALTER TABLE "research" ADD CONSTRAINT "research_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research" ADD CONSTRAINT "research_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "icps" ADD CONSTRAINT "icps_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_sources_runs" ADD CONSTRAINT "lead_sources_runs_icp_id_fkey" FOREIGN KEY ("icp_id") REFERENCES "icps"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "touches" ADD CONSTRAINT "touches_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "focus_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "focus_sessions" ADD CONSTRAINT "focus_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "replies" ADD CONSTRAINT "replies_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "objection_responses" ADD CONSTRAINT "objection_responses_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
