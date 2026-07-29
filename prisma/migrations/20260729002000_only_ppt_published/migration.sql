UPDATE "CourseAiArtifact"
SET
  "status" = 'APPROVED',
  "publishedPayload" = NULL,
  "publishedAt" = NULL
WHERE "status" = 'PUBLISHED'
  AND "appType" <> 'ppt_courseware';
