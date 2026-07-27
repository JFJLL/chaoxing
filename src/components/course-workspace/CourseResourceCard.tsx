import React from "react";
import { FileText } from "lucide-react";

export type CourseResourceCardData = {
  id: string;
  title: string;
  type: string;
  url: string | null;
  driveFile: { id: string; name: string } | null;
};

export function CourseResourceCard({ resource }: { resource: CourseResourceCardData }) {
  const content = (
    <>
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
        <FileText className="h-5 w-5" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <h3 className="line-clamp-1 font-semibold text-slate-900">{resource.title}</h3>
        <p className="mt-1 line-clamp-1 text-sm text-slate-500">
          {resource.driveFile?.name ?? resource.url ?? resource.type}
        </p>
      </div>
    </>
  );
  const className = "flex items-center gap-4 rounded-2xl border border-slate-100 bg-slate-50 p-4 transition hover:border-blue-200 hover:bg-blue-50/40";
  if (resource.driveFile) {
    return (
      <a
        href={`/api/drive/${resource.driveFile.id}?preview=1`}
        target="_blank"
        rel="noreferrer"
        className={className}
      >
        {content}
      </a>
    );
  }
  if (resource.url) {
    return (
      <a href={resource.url} target="_blank" rel="noreferrer" className={className}>
        {content}
      </a>
    );
  }
  return <article className={className}>{content}</article>;
}
