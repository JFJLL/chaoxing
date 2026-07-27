import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  HeadingLevel,
  LevelFormat,
  Packer,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType
} from "docx";
import type {
  AiCoursewarePayload,
  AiLessonPlanPayload,
  AiPaperPayload,
  AiQuestionPayload
} from "@/types/courseWorkspace";

export type ArtifactExportVariant = "default" | "student" | "teacher";

export type ArtifactExportQuestion = AiQuestionPayload["questions"][number] & {
  id?: string;
};

export type GenerateArtifactDocxInput =
  | {
      appType: "lesson_plan";
      title: string;
      courseTitle: string;
      payload: AiLessonPlanPayload;
      variant?: "default";
    }
  | {
      appType: "question_generation";
      title: string;
      courseTitle: string;
      payload: AiQuestionPayload;
      variant: "student" | "teacher";
    }
  | {
      appType: "paper_assembly";
      title: string;
      courseTitle: string;
      payload: AiPaperPayload;
      questions: ArtifactExportQuestion[];
      variant: "student" | "teacher";
    }
  | {
      appType: "courseware";
      title: string;
      courseTitle: string;
      payload: AiCoursewarePayload;
      variant?: "default";
    };

const COLORS = {
  blue: "2E74B5",
  darkBlue: "1F4D78",
  ink: "1F2937",
  muted: "64748B",
  lightFill: "F2F4F7",
  border: "D7DEE8"
} as const;

const numbering = {
  config: [
    {
      reference: "artifact-bullets",
      levels: [
        {
          level: 0,
          format: LevelFormat.BULLET,
          text: "•",
          alignment: AlignmentType.LEFT,
          style: {
            paragraph: {
              indent: { left: 720, hanging: 360 },
              spacing: { after: 160, line: 280 }
            }
          }
        }
      ]
    },
    {
      reference: "artifact-decimal",
      levels: [
        {
          level: 0,
          format: LevelFormat.DECIMAL,
          text: "%1.",
          alignment: AlignmentType.LEFT,
          style: {
            paragraph: {
              indent: { left: 720, hanging: 360 },
              spacing: { after: 160, line: 280 }
            }
          }
        }
      ]
    }
  ]
};

function titleBlock(title: string, courseTitle: string, subtitle: string) {
  return [
    new Paragraph({
      spacing: { after: 80 },
      children: [
        new TextRun({
          text: subtitle,
          color: COLORS.blue,
          bold: true,
          size: 22,
          font: "Microsoft YaHei"
        })
      ]
    }),
    new Paragraph({
      spacing: { after: 120 },
      children: [
        new TextRun({
          text: title,
          color: COLORS.ink,
          bold: true,
          size: 40,
          font: "Microsoft YaHei"
        })
      ]
    }),
    new Paragraph({
      spacing: { after: 360 },
      border: {
        bottom: {
          color: COLORS.blue,
          style: BorderStyle.SINGLE,
          size: 12,
          space: 8
        }
      },
      children: [
        new TextRun({
          text: `课程：${courseTitle}`,
          color: COLORS.muted,
          size: 20,
          font: "Microsoft YaHei"
        })
      ]
    })
  ];
}

function heading(text: string, level: typeof HeadingLevel.HEADING_1 | typeof HeadingLevel.HEADING_2) {
  return new Paragraph({ text, heading: level });
}

function bullet(text: string) {
  return new Paragraph({
    numbering: { reference: "artifact-bullets", level: 0 },
    children: [new TextRun({ text, font: "Microsoft YaHei" })]
  });
}

function decimal(text: string) {
  return new Paragraph({
    numbering: { reference: "artifact-decimal", level: 0 },
    children: [new TextRun({ text, font: "Microsoft YaHei" })]
  });
}

function bodyText(text: string, options?: { bold?: boolean; color?: string }) {
  return new Paragraph({
    spacing: { after: 120, line: 264 },
    children: [
      new TextRun({
        text,
        bold: options?.bold,
        color: options?.color ?? COLORS.ink,
        font: "Microsoft YaHei",
        size: 22
      })
    ]
  });
}

function lessonPlanSections(payload: AiLessonPlanPayload) {
  const processTable = new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: [1800, 1200, 6360],
    rows: [
      new TableRow({
        tableHeader: true,
        children: ["教学环节", "时间", "活动设计"].map(
          (value, index) =>
            new TableCell({
              width: { size: [1800, 1200, 6360][index], type: WidthType.DXA },
              shading: { fill: COLORS.lightFill, type: ShadingType.CLEAR },
              children: [bodyText(value, { bold: true, color: COLORS.darkBlue })]
            })
        )
      }),
      ...payload.teachingProcess.map(
        (step) =>
          new TableRow({
            children: [
              new TableCell({
                width: { size: 1800, type: WidthType.DXA },
                children: [bodyText(step.phase, { bold: true })]
              }),
              new TableCell({
                width: { size: 1200, type: WidthType.DXA },
                children: [bodyText(`${step.minutes} 分钟`)]
              }),
              new TableCell({
                width: { size: 6360, type: WidthType.DXA },
                children: [bodyText(step.activity)]
              })
            ]
          })
      )
    ]
  });

  return [
    heading("教学目标", HeadingLevel.HEADING_1),
    ...payload.objectives.map(bullet),
    heading("教学重点与难点", HeadingLevel.HEADING_1),
    ...payload.keyPoints.map(bullet),
    heading("教学过程", HeadingLevel.HEADING_1),
    processTable,
    heading("教学评价", HeadingLevel.HEADING_1),
    ...payload.assessment.map(bullet),
    heading("课后反思", HeadingLevel.HEADING_1),
    bodyText("________________________________________________________________________________")
  ];
}

function questionSections(
  questions: ArtifactExportQuestion[],
  variant: "student" | "teacher"
) {
  return questions.flatMap((question, index) => {
    const children: Array<Paragraph> = [
      heading(`第 ${index + 1} 题`, HeadingLevel.HEADING_2),
      bodyText(question.stem, { bold: true })
    ];
    for (const [optionIndex, option] of (question.options ?? []).entries()) {
      children.push(
        bodyText(`${String.fromCharCode(65 + optionIndex)}. ${option}`)
      );
    }
    if (question.type === "short_answer" && variant === "student") {
      children.push(
        bodyText("答："),
        bodyText("________________________________________________________________________________"),
        bodyText("________________________________________________________________________________")
      );
    }
    if (variant === "teacher") {
      children.push(
        bodyText(`参考答案：${question.answer}`, { color: COLORS.darkBlue }),
        bodyText(`解析：${question.explanation}`)
      );
    }
    return children;
  });
}

function paperSections(
  payload: AiPaperPayload,
  questions: ArtifactExportQuestion[],
  variant: "student" | "teacher"
) {
  const byId = new Map(
    questions.filter((question) => question.id).map((question) => [question.id as string, question])
  );
  const children: Array<Paragraph> = [
    bodyText("请按题目要求作答。学生版不包含答案与解析。")
  ];

  let displayIndex = 0;
  for (const section of payload.sections) {
    children.push(
      heading(`${section.name}（${section.score} 分）`, HeadingLevel.HEADING_1)
    );
    for (const questionId of section.questionIds) {
      const question = byId.get(questionId);
      if (!question) continue;
      displayIndex += 1;
      children.push(
        heading(`第 ${displayIndex} 题`, HeadingLevel.HEADING_2),
        bodyText(question.stem, { bold: true })
      );
      for (const [optionIndex, option] of (question.options ?? []).entries()) {
        children.push(
          bodyText(`${String.fromCharCode(65 + optionIndex)}. ${option}`)
        );
      }
      if (variant === "teacher") {
        children.push(
          bodyText(`参考答案：${question.answer}`, { color: COLORS.darkBlue }),
          bodyText(`解析：${question.explanation}`)
        );
      } else if (question.type === "short_answer") {
        children.push(
          bodyText("答："),
          bodyText("________________________________________________________________________________")
        );
      }
    }
  }
  return children;
}

function coursewareSections(payload: AiCoursewarePayload) {
  return payload.slides.flatMap((slide, index) => [
    heading(`第 ${index + 1} 页　${slide.title}`, HeadingLevel.HEADING_1),
    ...slide.bullets.map(bullet),
    heading("教师讲解提示", HeadingLevel.HEADING_2),
    bodyText(slide.speakerNotes)
  ]);
}

export async function generateArtifactDocx(input: GenerateArtifactDocxInput) {
  const variant = input.variant ?? "default";
  const subtitle =
    input.appType === "lesson_plan"
      ? "AI 教案"
      : input.appType === "question_generation"
        ? variant === "teacher" ? "AI 题目 · 教师版" : "AI 题目 · 学生版"
        : input.appType === "paper_assembly"
          ? variant === "teacher" ? "智能组卷 · 教师版" : "智能组卷 · 学生版"
          : "AI 课件文稿";

  const content =
    input.appType === "lesson_plan"
      ? lessonPlanSections(input.payload)
      : input.appType === "question_generation"
        ? questionSections(input.payload.questions, input.variant)
        : input.appType === "paper_assembly"
          ? paperSections(input.payload, input.questions, input.variant)
          : coursewareSections(input.payload);

  const document = new Document({
    numbering,
    styles: {
      default: {
        document: {
          run: {
            font: "Microsoft YaHei",
            size: 22,
            color: COLORS.ink
          },
          paragraph: {
            spacing: { after: 120, line: 264 }
          }
        },
        heading1: {
          run: {
            font: "Microsoft YaHei",
            size: 32,
            bold: true,
            color: COLORS.blue
          },
          paragraph: {
            spacing: { before: 320, after: 160 },
            keepNext: true
          }
        },
        heading2: {
          run: {
            font: "Microsoft YaHei",
            size: 26,
            bold: true,
            color: COLORS.darkBlue
          },
          paragraph: {
            spacing: { before: 240, after: 120 },
            keepNext: true
          }
        }
      }
    },
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 1440,
              right: 1440,
              bottom: 1440,
              left: 1440,
              header: 708,
              footer: 708
            }
          }
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({
                    text: "易美课程平台　",
                    color: COLORS.muted,
                    size: 18,
                    font: "Microsoft YaHei"
                  }),
                  new TextRun({
                    children: [PageNumber.CURRENT],
                    color: COLORS.muted,
                    size: 18
                  })
                ]
              })
            ]
          })
        },
        children: [...titleBlock(input.title, input.courseTitle, subtitle), ...content]
      }
    ]
  });

  return Buffer.from(await Packer.toBuffer(document));
}
