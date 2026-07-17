import { describe, expect, it } from "vitest";
import { buildCopilotHistory } from "@/lib/courseWorkspace/copilot";

describe("Copilot conversation history", () => {
  it("keeps recent complete turns instead of starting context with an orphaned assistant reply", () => {
    const history = buildCopilotHistory([
      { role: "USER", content: `旧问题-${"a".repeat(4_000)}` },
      { role: "ASSISTANT", content: `旧回复-${"b".repeat(8_000)}` },
      { role: "USER", content: `较新问题-${"c".repeat(4_000)}` },
      { role: "ASSISTANT", content: `较新回复-${"d".repeat(8_000)}` },
      { role: "USER", content: `最新问题-${"e".repeat(4_000)}` },
      { role: "ASSISTANT", content: `最新回复-${"f".repeat(8_000)}` }
    ]);

    expect(history[0]).toMatchObject({ role: "user", content: expect.stringContaining("较新问题") });
    expect(history.at(-1)).toMatchObject({ role: "assistant", content: expect.stringContaining("最新回复") });
    expect(history.some((message) => message.content.includes("旧回复"))).toBe(false);
  });
});
