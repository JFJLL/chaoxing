import { afterEach, describe, expect, it } from "vitest";
import { resolveTranslationModelConfig } from "../../src/lib/ai/modelClient";

const envNames = [
  "AI_API_KEY",
  "AI_BASE_URL",
  "AI_MODEL",
  "AI_PROVIDER",
  "AI_TRANSLATE_MODEL",
  "AI_TRANSLATE_BASE_URL",
  "AI_TRANSLATE_API_KEY",
  "AI_TRANSLATE_PROVIDER",
  "GEMINI_API_KEY",
  "GEMINI_BASE_URL",
  "GEMINI_MODEL",
  "GEMINI_PROVIDER",
  "OPENAI_API_KEY",
  "OPENAI_BASE_URL",
  "OPENAI_MODEL",
  "apiKey",
  "baseUrl",
  "model",
  "provider"
] as const;

const previous = Object.fromEntries(envNames.map((name) => [name, process.env[name]]));

afterEach(() => {
  for (const name of envNames) {
    if (previous[name] === undefined) delete process.env[name];
    else process.env[name] = previous[name];
  }
});

describe("translation model config", () => {
  it("returns null when no translation-specific env is set", () => {
    for (const name of envNames) delete process.env[name];
    expect(resolveTranslationModelConfig()).toBeNull();
  });

  it("overrides only the model name and keeps the main API key and base URL", () => {
    for (const name of envNames) delete process.env[name];
    process.env.AI_API_KEY = "main-key";
    process.env.AI_BASE_URL = "https://main.example.com/v1";
    process.env.AI_MODEL = "slow-model";
    process.env.AI_TRANSLATE_MODEL = "fast-model";

    const config = resolveTranslationModelConfig();
    expect(config).toMatchObject({
      apiKey: "main-key",
      baseURL: "https://main.example.com/v1",
      model: "fast-model"
    });
  });

  it("lets AI_TRANSLATE_* fully replace key, base URL and model", () => {
    for (const name of envNames) delete process.env[name];
    process.env.AI_TRANSLATE_API_KEY = "translate-key";
    process.env.AI_TRANSLATE_BASE_URL = "https://translate.example.com/v1";
    process.env.AI_TRANSLATE_MODEL = "translate-model";

    const config = resolveTranslationModelConfig();
    expect(config).toMatchObject({
      apiKey: "translate-key",
      baseURL: "https://translate.example.com/v1",
      model: "translate-model",
      provider: "openai-compatible"
    });
  });
});
