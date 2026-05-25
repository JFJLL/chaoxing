export function buildCourseOutlinePrompt(input: { courseTitle: string; documentText: string }) {
  return [
    "你是课程设计助手。请根据上传文档生成课程目录。",
    "只输出严格 JSON，不要 Markdown，不要解释。",
    "尽可能生成 6-12 章，每章 2-5 个课时。",
    "使用中文标题，保留文档中的领域术语。",
    "不要编造引用、页码或来源。",
    `课程名称：${input.courseTitle}`,
    "文档内容：",
    input.documentText.slice(0, 30_000)
  ].join("\n\n");
}
