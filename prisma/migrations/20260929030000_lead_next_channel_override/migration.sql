-- Additive, nullable column - no data loss, existing rows get NULL (no override).
ALTER TABLE "leads" ADD COLUMN "next_channel_override" "Channel";
