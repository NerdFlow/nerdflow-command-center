-- Call script A/B feedback collected in Focus (no AI).
ALTER TABLE "touches" ADD COLUMN "script_used" TEXT;
ALTER TABLE "touches" ADD COLUMN "script_rating" TEXT;
ALTER TABLE "touches" ADD COLUMN "caller_note" TEXT;
