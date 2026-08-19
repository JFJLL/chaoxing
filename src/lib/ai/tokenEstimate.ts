/**
 * 供应商未返回逐次精确 usage 时的保守估算。
 * 中文按约 1.3 token/字，其他文本按约 4 字符/token；每张图片和每份引用文件计入固定上下文开销。
 */
export function estimateTextTokens(value: string) {
  const normalized = value.trim();
  if (!normalized) return 0;
  const cjkCount = (normalized.match(/[\u3400-\u9fff\uf900-\ufaff]/g) ?? []).length;
  const otherCount = Math.max(0, normalized.length - cjkCount);
  return Math.ceil(cjkCount * 1.3 + otherCount / 4);
}

export function estimateCopilotPromptTokens(input: {
  system: string;
  history: string[];
  currentMessage: string;
  contextText: string;
  fileCount: number;
  imageCount: number;
}) {
  const textTokens = estimateTextTokens([
    input.system,
    ...input.history,
    input.currentMessage,
    input.contextText
  ].join("\n"));
  return textTokens + input.fileCount * 600 + input.imageCount * 800;
}
