ALTER TABLE "org_settings" ADD COLUMN "focus_cadence" JSONB NOT NULL DEFAULT '[{"day":0,"channel":"email"},{"day":2,"channel":"linkedin"},{"day":4,"channel":"email"},{"day":10,"channel":"email"}]';

ALTER TABLE "leads" ADD COLUMN "cadence_started_on" DATE;
