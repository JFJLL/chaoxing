export function classifyNoticeStatus(notice: { status: string; publishAt: Date | null }, now = new Date()) {
  if (notice.status === "PUBLISHED" && notice.publishAt && notice.publishAt > now) return "SCHEDULED" as const;
  if (notice.status === "PUBLISHED") return "PUBLISHED" as const;
  if (notice.status === "WITHDRAWN") return "WITHDRAWN" as const;
  return "DRAFT" as const;
}

export function normalizeNoticePublishAt(
  input: { nextStatus: string | undefined; previousStatus: string; requestedPublishAt: string | null | undefined },
  now = new Date()
) {
  if (input.requestedPublishAt) return new Date(input.requestedPublishAt);
  if (input.requestedPublishAt === null) return input.nextStatus === "PUBLISHED" ? now : null;
  if (input.nextStatus === "PUBLISHED" && input.previousStatus !== "PUBLISHED") return now;
  return undefined;
}
