-- System-assigned script on every touch (call:a, email:b, linkedin:first, …).
ALTER TABLE "touches" ADD COLUMN "script_id" TEXT;
