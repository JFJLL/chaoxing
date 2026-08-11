type NoticeAttachment = { driveFileId: string | null; deleted: boolean };
type NoticeRecord = { id: string; attachments: NoticeAttachment[] };
type AnnouncementReadRecord = { announcementId: string; userId: string };
type DriveFileDownloadRecord = { driveFileId: string; userId: string };

function completedNoticeIds(
  notices: NoticeRecord[],
  reads: AnnouncementReadRecord[],
  downloads: DriveFileDownloadRecord[],
  studentId: string
) {
  const readIds = new Set(reads.filter((read) => read.userId === studentId).map((read) => read.announcementId));
  const downloadedFileIds = new Set(downloads.filter((download) => download.userId === studentId).map((download) => download.driveFileId));
  return notices
    .filter((notice) => readIds.has(notice.id) && notice.attachments.every((attachment) => attachment.deleted || !attachment.driveFileId || downloadedFileIds.has(attachment.driveFileId)))
    .map((notice) => notice.id);
}

export function countCompletedNoticeEngagements(
  notices: NoticeRecord[],
  reads: AnnouncementReadRecord[],
  downloads: DriveFileDownloadRecord[],
  studentId: string
) {
  return completedNoticeIds(notices, reads, downloads, studentId).length;
}

export function noticeEngagementCompletionRate(
  notices: NoticeRecord[],
  reads: AnnouncementReadRecord[],
  downloads: DriveFileDownloadRecord[],
  studentId: string
) {
  if (!notices.length) return null;
  return Math.round(countCompletedNoticeEngagements(notices, reads, downloads, studentId) / notices.length * 100);
}
