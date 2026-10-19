-- Repair legacy or shadow full-status uniqueness without deleting jobs or results.
-- The original constraint incorrectly prevented a second SKIPPED/COMPLETED job.
DO $$
DECLARE legacy RECORD;
BEGIN
  FOR legacy IN
    SELECT i.indexrelid::regclass AS index_name, c.conname
    FROM pg_index i
    JOIN pg_class t ON t.oid = i.indrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    LEFT JOIN pg_constraint c ON c.conindid = i.indexrelid
    WHERE t.relname = 'AiCuratorJob' AND n.nspname = current_schema()
      AND i.indisunique AND NOT i.indisprimary AND i.indpred IS NULL
      AND (SELECT array_agg(a.attname::text ORDER BY k.ordinality)
           FROM unnest(i.indkey) WITH ORDINALITY k(attnum, ordinality)
           JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = k.attnum)
          = ARRAY['collectionId','jobType','phase','plantDefinitionId','targetEntityType','targetEntityId','targetField','status']::text[]
  LOOP
    IF legacy.conname IS NOT NULL THEN
      EXECUTE format('ALTER TABLE "AiCuratorJob" DROP CONSTRAINT %I', legacy.conname);
    ELSE
      EXECUTE format('DROP INDEX %s', legacy.index_name);
    END IF;
  END LOOP;
  DROP INDEX IF EXISTS "AiCuratorJob_active_scope_key";
  CREATE UNIQUE INDEX "AiCuratorJob_active_scope_key" ON "AiCuratorJob"
    ("collectionId","jobType",phase,"plantDefinitionId","targetEntityType","targetEntityId","targetField",status)
    WHERE status IN ('QUEUED','RUNNING','DEFERRED','WAITING_FOR_HUMAN');
END $$;
