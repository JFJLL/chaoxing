export function buildCourseOutlinePrompt(input: { courseTitle: string; documentText: string }) {
  return [
    "你是课程设计助手。请根据上传文档生成课程目录。",
    "只输出严格 JSON，不要 Markdown，不要解释。",
    "必须使用下面的英文 JSON 字段名，不要替换成中文字段名：",
    `{
  "title": "课程名称",
  "description": "不少于 10 个字的课程简介",
  "targetAudience": "目标学习者",
  "learningObjectives": ["学习目标1", "学习目标2", "学习目标3"],
  "chapters": [
    {
      "title": "章节标题",
      "summary": "章节简介",
      "order": 1,
      "lessons": [
        {
          "title": "课时标题",
          "summary": "课时简介",
          "order": 1,
          "estimatedMinutes": 30,
          "keyPoints": ["知识点1", "知识点2"],
          "suggestedActivities": ["课堂活动"],
          "assessmentPrompts": ["检测问题"]
        }
      ]
    }
  ]
}`,
    "尽可能生成 6-12 章，每章 2-5 个课时。",
    "使用中文标题，保留文档中的领域术语。",
    "不要编造引用、页码或来源。",
    `课程名称：${input.courseTitle}`,
    "文档内容：",
    input.documentText.slice(0, 30_000)
  ].join("\n\n");
}
