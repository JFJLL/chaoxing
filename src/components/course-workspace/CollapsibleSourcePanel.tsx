"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

/**
 * A controlled collapsible panel for AI source selectors (lesson-plan document
 * sources, courseware source lesson plan, PPT source courseware). It starts
 * collapsed, keeps its selection while collapsed, and surfaces a summary so the
 * teacher always sees the current source without expanding.
 */
export function CollapsibleSourcePanel({
  title,
  summary,
  panelId,
  children,
  defaultExpanded = false
}: {
  title: string;
  summary: ReactNode;
  panelId: string;
  children: ReactNode;
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  return (
    <div className="rounded-xl border border-slate-200">
      <button
        type="button"
        onClick={() => setExpanded((current) => !current)}
        aria-expanded={expanded}
        aria-controls={panelId}
        className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left"
      >
        <span className="min-w-0">
          <span className="block text-sm font-medium text-slate-800">{title}</span>
          <span className="mt-0.5 block text-xs text-slate-500">{summary}</span>
        </span>
        <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-blue-600">
          {expanded ? "收起" : "展开"}
          {expanded ? <ChevronUp className="h-4 w-4" aria-hidden="true" /> : <ChevronDown className="h-4 w-4" aria-hidden="true" />}
        </span>
      </button>
      {expanded ? <div id={panelId} className="border-t border-slate-100 px-3 py-3">{children}</div> : null}
    </div>
  );
}
