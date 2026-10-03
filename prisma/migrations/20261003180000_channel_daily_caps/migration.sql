-- Per-rep daily caps for Focus routing. Channels already live on users.channels_worked.
ALTER TABLE "users" ADD COLUMN "channel_daily_caps" JSONB NOT NULL DEFAULT '{}';

-- Muqeet works email and LinkedIn. Call cards go to whoever has call in their settings.
UPDATE "users"
SET "channels_worked" = '["email","linkedin"]'::jsonb
WHERE split_part(lower("email"), '@', 1) = 'muqeet'
   OR lower(btrim("full_name")) = 'muqeet';
