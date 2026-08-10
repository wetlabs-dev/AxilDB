-- Repair foreign keys that a clean install may have skipped because two historical
-- provenance migrations share a timestamp prefix and run in lexical order.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint constraint_record
    JOIN pg_class table_record ON table_record.oid = constraint_record.conrelid
    JOIN pg_attribute column_record
      ON column_record.attrelid = table_record.oid
     AND column_record.attnum = ANY(constraint_record.conkey)
    WHERE constraint_record.contype = 'f'
      AND table_record.relname = 'AcquisitionBatch'
      AND column_record.attname = 'distributorId'
  ) THEN
    ALTER TABLE "AcquisitionBatch"
      ADD CONSTRAINT "AcquisitionBatch_distributorId_fkey"
      FOREIGN KEY ("distributorId") REFERENCES "Distributor"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint constraint_record
    JOIN pg_class table_record ON table_record.oid = constraint_record.conrelid
    JOIN pg_attribute column_record
      ON column_record.attrelid = table_record.oid
     AND column_record.attnum = ANY(constraint_record.conkey)
    WHERE constraint_record.contype = 'f'
      AND table_record.relname = 'AcquisitionBatch'
      AND column_record.attname = 'distributorOutletId'
  ) THEN
    ALTER TABLE "AcquisitionBatch"
      ADD CONSTRAINT "AcquisitionBatch_distributorOutletId_fkey"
      FOREIGN KEY ("distributorOutletId") REFERENCES "DistributorOutlet"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
