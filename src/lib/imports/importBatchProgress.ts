export type ImportBatchProgressState = "processing" | "review" | "applied" | "failed";

export type ImportBatchProgress = {
  label: string;
  state: ImportBatchProgressState;
};

/**
 * Aggregates a whole import batch's status into a single reviewer-facing label.
 * The batch drives its own status through the multi-document combine pipeline,
 * so it must never be shown using an individual document's status.
 */
export function getImportBatchProgress(status: string): ImportBatchProgress {
  switch (status) {
    case "READY_FOR_REVIEW":
      return { label: "待确认", state: "review" };
    case "APPLIED":
      return { label: "已保存课程目录", state: "applied" };
    case "FAILED":
      return { label: "导入失败", state: "failed" };
    case "COMBINING":
      return { label: "正在综合多份资料并生成课程目录", state: "processing" };
    case "PROCESSING":
    case "QUEUED":
    default:
      return { label: "正在解析所选资料", state: "processing" };
  }
}

export function getImportBatchActionLabel(state: ImportBatchProgressState): string {
  switch (state) {
    case "review":
      return "查看并确认";
    case "applied":
      return "查看课程目录";
    case "failed":
      return "查看失败详情";
    case "processing":
    default:
      return "查看进度";
  }
}
