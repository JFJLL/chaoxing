CREATE TABLE "AiCoachTask" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "courseId" TEXT NOT NULL,
    "createdById" TEXT,
    "title" TEXT NOT NULL,
    "scenario" TEXT NOT NULL,
    "aiRole" TEXT NOT NULL,
    "objective" TEXT NOT NULL,
    "rubric" TEXT NOT NULL,
    "completionCriteria" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "publishedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AiCoachTask_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AiCoachTask_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "CourseAiConversation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "courseId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "title" TEXT,
    "coachTaskId" TEXT,
    "evaluation" TEXT,
    "evaluationStatus" TEXT,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CourseAiConversation_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CourseAiConversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CourseAiConversation_coachTaskId_fkey" FOREIGN KEY ("coachTaskId") REFERENCES "AiCoachTask" ("id") ON DELETE NO ACTION ON UPDATE CASCADE
);

CREATE TABLE "CourseAiMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "conversationId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "citations" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CourseAiMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "CourseAiConversation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "AiCoachTask_courseId_status_updatedAt_idx" ON "AiCoachTask"("courseId", "status", "updatedAt");
CREATE INDEX "AiCoachTask_createdById_updatedAt_idx" ON "AiCoachTask"("createdById", "updatedAt");
CREATE INDEX "CourseAiConversation_courseId_userId_kind_updatedAt_idx" ON "CourseAiConversation"("courseId", "userId", "kind", "updatedAt");
CREATE INDEX "CourseAiConversation_coachTaskId_userId_createdAt_idx" ON "CourseAiConversation"("coachTaskId", "userId", "createdAt");
CREATE INDEX "CourseAiMessage_conversationId_createdAt_idx" ON "CourseAiMessage"("conversationId", "createdAt");

CREATE TRIGGER "CourseAiConversation_coach_course_insert"
BEFORE INSERT ON "CourseAiConversation"
WHEN NEW."coachTaskId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "AiCoachTask" AS task
    WHERE task."id" = NEW."coachTaskId"
      AND task."courseId" = NEW."courseId"
  )
BEGIN
  SELECT RAISE(ABORT, 'AI_COACH_COURSE_MISMATCH');
END;

CREATE TRIGGER "CourseAiConversation_coach_course_update"
BEFORE UPDATE OF "courseId", "coachTaskId" ON "CourseAiConversation"
WHEN NEW."coachTaskId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "AiCoachTask" AS task
    WHERE task."id" = NEW."coachTaskId"
      AND task."courseId" = NEW."courseId"
  )
BEGIN
  SELECT RAISE(ABORT, 'AI_COACH_COURSE_MISMATCH');
END;
