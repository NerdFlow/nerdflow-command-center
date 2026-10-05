-- Phase 1 outreach knowledge base, draft log, and settings.

ALTER TYPE "AiFeature" ADD VALUE IF NOT EXISTS 'outreach_draft';

CREATE TYPE "KbLayer" AS ENUM ('sales_craft', 'core', 'icp');
CREATE TYPE "KbScope" AS ENUM ('universal', 'icp');
CREATE TYPE "KbStatus" AS ENUM ('draft', 'pending', 'approved', 'retired');

ALTER TABLE "org_settings" ADD COLUMN "outreach_draft_kill_switch" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "org_settings" ADD COLUMN "outreach_draft_daily_cap" INTEGER NOT NULL DEFAULT 60;
ALTER TABLE "org_settings" ADD COLUMN "postal_address" TEXT;
ALTER TABLE "org_settings" ADD COLUMN "opt_out_line" TEXT;
ALTER TABLE "org_settings" ADD COLUMN "mailbox_signatures" JSONB NOT NULL DEFAULT '{}';

ALTER TABLE "ai_usage" ADD COLUMN "card_id" TEXT;
ALTER TABLE "ai_usage" ADD COLUMN "task_type" TEXT;
CREATE INDEX "ai_usage_organization_id_feature_created_at_idx" ON "ai_usage"("organization_id", "feature", "created_at");

CREATE TABLE "outreach_kb_entries" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "layer" "KbLayer" NOT NULL,
    "kind" TEXT NOT NULL,
    "icp" TEXT,
    "scope" "KbScope" NOT NULL,
    "status" "KbStatus" NOT NULL,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "source_path" TEXT NOT NULL,
    "source_link" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updated_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "outreach_kb_entries_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "outreach_drafts" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "lead_id" TEXT NOT NULL,
    "action_key" TEXT NOT NULL,
    "pipeline_row_id" TEXT,
    "channel" "Channel" NOT NULL,
    "subject" TEXT NOT NULL DEFAULT '',
    "body" TEXT NOT NULL,
    "opener_source_url" TEXT,
    "regenerate_count" INTEGER NOT NULL DEFAULT 0,
    "source" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "outreach_drafts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "outreach_kb_entries_organization_id_key_key" ON "outreach_kb_entries"("organization_id", "key");
CREATE INDEX "outreach_kb_entries_organization_id_status_kind_idx" ON "outreach_kb_entries"("organization_id", "status", "kind");
CREATE UNIQUE INDEX "outreach_drafts_organization_id_action_key_key" ON "outreach_drafts"("organization_id", "action_key");
CREATE INDEX "outreach_drafts_lead_id_idx" ON "outreach_drafts"("lead_id");

ALTER TABLE "outreach_kb_entries" ADD CONSTRAINT "outreach_kb_entries_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "outreach_kb_entries" ADD CONSTRAINT "outreach_kb_entries_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "outreach_drafts" ADD CONSTRAINT "outreach_drafts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "outreach_drafts" ADD CONSTRAINT "outreach_drafts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "outreach_drafts" ADD CONSTRAINT "outreach_drafts_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
