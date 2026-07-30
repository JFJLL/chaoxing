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

/**
 * Same shape as {@link generatedCourseOutlineSchema} but preserves the optional
 * chapter/lesson IDs produced by mapImportedOutlineToCourse. The apply route
 * relies on these IDs to update matched items in place instead of recreating
 * them; without this schema zod would strip the IDs and every item would be
 * treated as new.
 */
export const mappedCourseOutlineSchema = generatedCourseOutlineSchema.extend({
  chapters: z
    .array(
      generatedCourseOutlineSchema.shape.chapters.element.extend({
        id: z.string().min(1).optional(),
        lessons: z
          .array(
            generatedCourseOutlineSchema.shape.chapters.element.shape.lessons.element.extend({
              id: z.string().min(1).optional()
            })
          )
          .min(1)
      })
    )
    .min(3)
});

export type MappedCourseOutlineSchema = z.infer<typeof mappedCourseOutlineSchema>;
