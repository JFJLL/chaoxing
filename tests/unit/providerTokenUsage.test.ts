import { describe, expect, it } from "vitest";
import { parseProviderTokenUsage } from "@/lib/ai/modelClient";

describe("供应商实际 Token usage 解析", () => {
  it("读取 OpenAI 兼容响应的 usage 字段", () => {
    expect(parseProviderTokenUsage("openai-compatible", "gpt-4.1-mini", {
      usage: { prompt_tokens: 123, completion_tokens: 45, total_tokens: 168 }
    })).toEqual({
      provider: "openai-compatible",
      model: "gpt-4.1-mini",
      promptTokens: 123,
      completionTokens: 45,
      totalTokens: 168
    });
  });

  it("读取 Gemini 响应的 usageMetadata 字段", () => {
    expect(parseProviderTokenUsage("gemini", "gemini-2.5-flash", {
      usageMetadata: { promptTokenCount: 256, candidatesTokenCount: 64, totalTokenCount: 320 }
    })).toEqual({
      provider: "gemini",
      model: "gemini-2.5-flash",
      promptTokens: 256,
      completionTokens: 64,
      totalTokens: 320
    });
  });

  it("供应商未回传完整 usage 时保持不可用，不以本地规则估算", () => {
    expect(parseProviderTokenUsage("openai-compatible", "gpt-4.1-mini", {
      usage: { prompt_tokens: 12, completion_tokens: 4 }
    })).toBeNull();
    expect(parseProviderTokenUsage("gemini", "gemini-2.5-flash", {})).toBeNull();
  });
});
