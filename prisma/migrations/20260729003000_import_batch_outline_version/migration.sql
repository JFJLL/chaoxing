ALTER TABLE "DocumentImportBatch" ADD COLUMN "generatedOutlineVersion" INTEGER NOT NULL DEFAULT 0;

UPDATE "DocumentImportBatch"
SET "generatedOutlineVersion" = 1
WHERE "generatedOutline" IS NOT NULL;
