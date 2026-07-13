"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ImportTimeline } from "@/components/ai-import/ImportTimeline";
import { getNextPollDelay, isImportTerminal, parseImportJobResponse } from "@/lib/imports/importProgress";

type ImportProgressClientProps = {
  jobId: string;
  initialStatus: string;
  initialCurrentStage: string | null;
  initialJobsAhead: number | null;
  initialErrorMessage: string | null;
  retryHref: string;
};

export function ImportProgressClient({
  jobId,
  initialStatus,
  initialCurrentStage,
  initialJobsAhead,
  initialErrorMessage,
  retryHref
}: ImportProgressClientProps) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [currentStage, setCurrentStage] = useState(initialCurrentStage);
  const [jobsAhead, setJobsAhead] = useState(initialJobsAhead);
  const [errorMessage, setErrorMessage] = useState(initialErrorMessage);
  const [pollError, setPollError] = useState<string>();
  const hasRefreshed = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let latestStatus = initialStatus;

    const scheduleNextPoll = (nextStatus: string) => {
      const delay = getNextPollDelay(nextStatus);
      if (cancelled || delay === null) return;
      timeoutId = setTimeout(poll, delay);
    };

    const poll = async () => {
      try {
        const response = await fetch(`/api/ai-import/${jobId}`);
        if (!response.ok) throw new Error("Failed to refresh import status");

        const job = parseImportJobResponse(await response.json());
        if (!job) throw new Error("Invalid import status response");
        if (cancelled) return;

        latestStatus = job.status;
        setStatus(job.status);
        setCurrentStage(job.currentStage);
        setJobsAhead(job.jobsAhead);
        setErrorMessage(job.errorMessage);
        setPollError(undefined);

        if (isImportTerminal(job.status)) {
          if (!hasRefreshed.current) {
            hasRefreshed.current = true;
            router.refresh();
          }
          return;
        }

        scheduleNextPoll(job.status);
      } catch {
        if (cancelled) return;
        setPollError("状态更新失败，正在重试");
        scheduleNextPoll(latestStatus);
      }
    };

    scheduleNextPoll(latestStatus);

    return () => {
      cancelled = true;
      if (timeoutId !== undefined) clearTimeout(timeoutId);
    };
  }, [initialStatus, jobId, router]);

  return (
    <ImportTimeline
      status={status}
      currentStage={currentStage}
      jobsAhead={jobsAhead}
      errorMessage={errorMessage}
      retryHref={retryHref}
      pollError={pollError}
    />
  );
}
