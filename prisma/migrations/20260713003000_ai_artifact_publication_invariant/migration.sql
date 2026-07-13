-- This statement deliberately fails if legacy data contains more than one
-- published revision per series. Conflicts must be reviewed explicitly; this
-- migration never silently deletes or archives user data.
CREATE UNIQUE INDEX "CourseAiArtifact_one_published_per_series"
ON "CourseAiArtifact"("seriesId")
WHERE "status" = 'PUBLISHED';
