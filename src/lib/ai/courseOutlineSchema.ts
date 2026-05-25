import { z } from "zod";

export const generatedCourseOutlineSchema = z.object({
  title: z.string().min(2),
  description: z.string().min(10),
  targetAudience: z.string().min(2),
  learningObjectives: z.array(z.string().min(2)).min(3),
  chapters: z
    .array(
      z.object({
        title: z.string().min(2),
        summary: z.string().min(5),
        order: z.number().int().positive(),
        lessons: z
          .array(
            z.object({
              title: z.string().min(2),
              summary: z.string().min(5),
              order: z.number().int().positive(),
              estimatedMinutes: z.number().int().min(5).max(180),
              keyPoints: z.array(z.string().min(2)).min(2),
              suggestedActivities: z.array(z.string().min(2)).min(1),
              assessmentPrompts: z.array(z.string().min(2)).min(1)
            })
          )
          .min(1)
      })
    )
    .min(3)
});

export type GeneratedCourseOutlineSchema = z.infer<typeof generatedCourseOutlineSchema>;
