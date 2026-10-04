ALTER TABLE "pipeline_today_rows" ADD COLUMN "held" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "pipeline_today_rows" ADD COLUMN "returns_on" DATE;

CREATE TABLE "focus_card_skips" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "card_id" TEXT NOT NULL,
    "pipeline_row_id" TEXT,
    "lead_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "note" TEXT,
    "returns_on" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "focus_card_skips_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "focus_card_skips_lead_id_created_at_idx" ON "focus_card_skips"("lead_id", "created_at");
CREATE INDEX "focus_card_skips_card_id_idx" ON "focus_card_skips"("card_id");

ALTER TABLE "focus_card_skips" ADD CONSTRAINT "focus_card_skips_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "focus_card_skips" ADD CONSTRAINT "focus_card_skips_pipeline_row_id_fkey" FOREIGN KEY ("pipeline_row_id") REFERENCES "pipeline_today_rows"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "focus_card_skips" ADD CONSTRAINT "focus_card_skips_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "focus_card_skips" ADD CONSTRAINT "focus_card_skips_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
