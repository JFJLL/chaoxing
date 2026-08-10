CREATE UNIQUE INDEX "CourseKnowledgeMap_courseId_sourceJobId_version_key"
ON "CourseKnowledgeMap"("courseId", "sourceJobId", "version");

CREATE UNIQUE INDEX "CourseKnowledgeMap_courseId_selectionKey_version_key"
ON "CourseKnowledgeMap"("courseId", "selectionKey", "version");
