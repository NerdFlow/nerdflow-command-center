-- Own migration: Postgres will not let a new enum value be used in the
-- same transaction that adds it. Later migrations may set needs_contact.
ALTER TYPE "LeadStatus" ADD VALUE IF NOT EXISTS 'needs_contact';
