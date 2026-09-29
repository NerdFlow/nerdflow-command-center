-- Widens lead_sources_runs.cost_usd from Decimal(10,2) to Decimal(10,4) to
-- match ai_usage.cost_usd's precision. Found via live testing: individual
-- Flash-Lite scoring calls cost ~$0.0001 each, which silently rounded to
-- $0.00 at 2 decimal places - real cost was happening but not visible,
-- undermining the "show actual cost after" requirement for cheap AI calls.
-- Purely additive precision (more decimal places, same integer range) -
-- no data loss, existing values keep their exact current value.
ALTER TABLE "lead_sources_runs" ALTER COLUMN "cost_usd" SET DATA TYPE DECIMAL(10,4);
