-- Split into its own migration on purpose: Postgres will not let a new enum
-- value be used (e.g. in an UPDATE) within the same transaction that adds
-- it ("unsafe use of new value" / 55P04), and Prisma applies one migration
-- file as one transaction. This value must be committed here, in its own
-- migration, before 20260925170500_role_shrink_and_rest can use it.
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'lead';
