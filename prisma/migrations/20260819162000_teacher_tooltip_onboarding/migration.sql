-- Persist the versioned, cross-page teacher tooltip tour separately from the old one-time modal state.
ALTER TABLE "User" ADD COLUMN "onboardingVersion" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "onboardingStep" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "onboardingCourseId" TEXT;
ALTER TABLE "User" ADD COLUMN "onboardingPromptCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "onboardingLastPromptAt" DATETIME;
ALTER TABLE "User" ADD COLUMN "onboardingLastSessionId" TEXT;
