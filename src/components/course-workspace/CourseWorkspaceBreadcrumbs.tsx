import Link from "next/link";
import { ChevronRight } from "lucide-react";

type BreadcrumbItem = { label: string; href?: string };

export function CourseWorkspaceBreadcrumbs({
  courseId,
  courseTitle,
  current,
  parent,
  intermediate = []
}: {
  courseId: string;
  courseTitle: string;
  current: string;
  parent?: BreadcrumbItem;
  intermediate?: BreadcrumbItem[];
}) {
  const parentItem = parent ?? { label: "备课中心", href: `/space/courses/${courseId}/ai-workbench` };
  const items: BreadcrumbItem[] = [
    { label: "课程列表", href: "/space/courses" },
    { label: courseTitle, href: `/space/courses/${courseId}` },
    parentItem,
    ...intermediate,
    { label: current }
  ];

  return (
    <nav aria-label="面包屑" className="flex flex-wrap items-center gap-1 text-sm text-slate-500">
      {items.map((item, index) => (
        <span key={`${item.label}-${index}`} className="inline-flex min-w-0 items-center gap-1">
          {index ? <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-300" aria-hidden="true" /> : null}
          {item.href ? (
            <Link href={item.href} className="max-w-48 truncate transition hover:text-blue-700">{item.label}</Link>
          ) : (
            <span aria-current="page" className="max-w-56 truncate font-medium text-slate-700">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
