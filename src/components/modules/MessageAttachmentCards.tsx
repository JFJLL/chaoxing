import Link from "next/link";
import { FileText } from "lucide-react";

type Attachment = { id: string; kind: string; fileName: string; mimeType: string | null; byteSize: number; driveFileId: string | null };

function attachmentUrl(messageId: string, attachmentId: string) {
  return `/api/inbox/${messageId}/attachments/${attachmentId}`;
}

function formatBytes(value: number) {
  return value < 1024 * 1024 ? `${Math.max(1, Math.round(value / 1024))} KB` : `${(value / 1024 / 1024).toFixed(1)} MB`;
}

export function MessageAttachmentCards({ messageId, attachments }: { messageId: string; attachments: Attachment[] }) {
  if (!attachments.length) return null;
  return <div className="mt-6"><h3 className="text-sm font-semibold text-slate-800">附件与引用</h3><div className="mt-3 grid gap-3 sm:grid-cols-2">{attachments.map((attachment) => {
    if (attachment.kind === "IMAGE") return <a key={attachment.id} href={attachmentUrl(messageId, attachment.id)} target="_blank" rel="noreferrer" className="group overflow-hidden rounded-xl border border-slate-200 bg-slate-50"><img src={attachmentUrl(messageId, attachment.id)} alt={attachment.fileName} className="h-36 w-full object-cover transition group-hover:scale-[1.02]" /><p className="truncate px-3 py-2 text-xs text-slate-600">{attachment.fileName}</p></a>;
    if (attachment.kind === "REFERENCE_FILE") return <Link key={attachment.id} href={`/space/drive?fileId=${attachment.driveFileId ?? ""}`} className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800"><FileText className="h-5 w-5 shrink-0" /><span className="min-w-0"><span className="block truncate font-medium">{attachment.fileName}</span><span className="mt-0.5 block text-xs text-amber-600">云盘引用文件</span></span></Link>;
    return <a key={attachment.id} href={attachmentUrl(messageId, attachment.id)} className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 text-sm text-slate-700 hover:border-indigo-200 hover:bg-indigo-50"><FileText className="h-5 w-5 shrink-0 text-indigo-600" /><span className="min-w-0"><span className="block truncate font-medium">{attachment.fileName}</span><span className="mt-0.5 block text-xs text-slate-500">{formatBytes(attachment.byteSize)}</span></span></a>;
  })}</div></div>;
}
