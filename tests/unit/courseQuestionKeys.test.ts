import { describe, expect, it } from "vitest";
import {
  normalizeEditedQuestionPayload,
  normalizeGeneratedArtifactPayload
} from "@/lib/courseWorkspace/questionKeys";

const question = (stem: string, id?: string) => ({
  ...(id ? { id } : {}),
  type: "short_answer" as const,
  stem,
  answer: `答案-${stem}`,
  explanation: `解析-${stem}`
});

const ids = [
  "11111111-1111-4111-8111-111111111111",
  "22222222-2222-4222-8222-222222222222",
  "33333333-3333-4333-8333-333333333333"
];

function allocator() {
  let index = 0;
  return () => ids[index++];
}

describe("question server keys", () => {
  it("replaces every model-supplied id during generation", () => {
    const payload = normalizeGeneratedArtifactPayload("question_generation", {
      questions: [question("一", "model-id"), question("二")]
    }, allocator());
    expect(payload).toMatchObject({ questions: [
      { id: `question_${ids[0]}`, stem: "一" },
      { id: `question_${ids[1]}`, stem: "二" }
    ] });
  });

  it("preserves valid source ids across arbitrary reorder and deletion", () => {
    const first = `question_${ids[0]}`;
    const second = `question_${ids[1]}`;
    const source = { questions: [question("一", first), question("二", second)] };
    const edited = normalizeEditedQuestionPayload(source, { questions: [question("二", second)] }, allocator());
    expect(edited.questions).toEqual([expect.objectContaining({ id: second, stem: "二" })]);
  });

  it("never reuses the deleted first question key for a new id-less question", () => {
    const first = `question_${ids[0]}`;
    const second = `question_${ids[1]}`;
    const edited = normalizeEditedQuestionPayload(
      { questions: [question("一", first), question("二", second)] },
      { questions: [question("二", second), question("新增")] },
      allocator()
    );
    expect(edited.questions.map((item) => item.id)).toEqual([second, `question_${ids[2]}`]);
  });

  it("allocates new ids to id-less additions and legacy id-less questions", () => {
    const existing = `question_${ids[0]}`;
    const edited = normalizeEditedQuestionPayload(
      { questions: [question("旧题", existing), question("legacy-without-id")] },
      { questions: [question("旧题", existing), question("新增题")] },
      allocator()
    );
    expect(edited.questions.map((item) => item.id)).toEqual([existing, `question_${ids[1]}`]);
  });

  it("rejects forged and duplicate client ids", () => {
    const existing = `question_${ids[0]}`;
    const source = { questions: [question("一", existing)] };
    for (const edited of [
      { questions: [question("伪造", `question_${ids[1]}`)] },
      { questions: [question("一", existing), question("重复", existing)] }
    ]) {
      try {
        normalizeEditedQuestionPayload(source, edited, allocator());
        throw new Error("expected invalid question key");
      } catch (error) {
        expect(error).toMatchObject({ code: "ARTIFACT_QUESTION_ID_INVALID" });
      }
    }
  });
});
