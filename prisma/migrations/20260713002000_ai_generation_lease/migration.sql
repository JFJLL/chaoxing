ALTER TABLE "CourseAiArtifact" ADD COLUMN "runToken" TEXT;

CREATE INDEX "CourseAiArtifact_status_runToken_idx" ON "CourseAiArtifact"("status", "runToken");
