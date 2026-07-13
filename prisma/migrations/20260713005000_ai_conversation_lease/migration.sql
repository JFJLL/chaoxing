ALTER TABLE "CourseAiConversation" ADD COLUMN "generationToken" TEXT;

CREATE INDEX "CourseAiConversation_status_generationToken_idx"
ON "CourseAiConversation"("status", "generationToken");
