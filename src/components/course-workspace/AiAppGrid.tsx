import { AiAppCard } from "@/components/course-workspace/AiAppCard";
import type { CourseAiAppDefinition } from "@/lib/courseWorkspace/aiApps";

export function AiAppGrid({ apps, courseId }: { apps: CourseAiAppDefinition[]; courseId: string }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {apps.map((app) => (
        <AiAppCard key={app.key} app={app} courseId={courseId} />
      ))}
    </div>
  );
}
