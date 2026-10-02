-- Sales Pipeline Today rows. One sheet row is one Focus card.
CREATE TABLE "pipeline_today_rows" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "lead_id" TEXT NOT NULL,
    "queue_date" DATE NOT NULL,
    "sheet_row" INTEGER NOT NULL,
    "external_key" TEXT NOT NULL,
    "time_label" TEXT NOT NULL,
    "contact_name" TEXT,
    "company" TEXT NOT NULL,
    "action_label" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "channel" "Channel" NOT NULL,
    "link_kind" TEXT NOT NULL,
    "link_url" TEXT,
    "mailto_to" TEXT,
    "mailto_subject" TEXT,
    "message" TEXT NOT NULL DEFAULT '',
    "sheet_done" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'open',
    "outcome_mode" TEXT NOT NULL,
    "intel" TEXT NOT NULL,
    "connect_no_note" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pipeline_today_rows_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "pipeline_today_rows_organization_id_external_key_key" ON "pipeline_today_rows"("organization_id", "external_key");
CREATE INDEX "pipeline_today_rows_owner_id_queue_date_status_idx" ON "pipeline_today_rows"("owner_id", "queue_date", "status");

ALTER TABLE "pipeline_today_rows" ADD CONSTRAINT "pipeline_today_rows_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pipeline_today_rows" ADD CONSTRAINT "pipeline_today_rows_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pipeline_today_rows" ADD CONSTRAINT "pipeline_today_rows_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
