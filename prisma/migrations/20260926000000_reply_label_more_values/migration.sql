-- Additive only, no data remap needed - existing Reply.label values (interested,
-- question, objection, not_now) are unaffected. Safe to add all three in one
-- transaction since none of them are used (in an INSERT/UPDATE) within this
-- same migration - the "can't use a new enum value in the same transaction
-- that added it" restriction only bites when a value is both added AND used
-- before that transaction commits.
ALTER TYPE "ReplyLabel" ADD VALUE IF NOT EXISTS 'unsubscribe';
ALTER TYPE "ReplyLabel" ADD VALUE IF NOT EXISTS 'out_of_office';
ALTER TYPE "ReplyLabel" ADD VALUE IF NOT EXISTS 'wrong_person';
