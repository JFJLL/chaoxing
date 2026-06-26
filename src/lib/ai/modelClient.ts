import OpenAI from "openai";

export type AiProvider = "openai-compatible" | "gemini";

export type AiModelConfig = {
  provider: AiProvider;
  apiKey: string;
  baseURL: string;
  model: string;
};

type JsonCompletionInput = {
  system: string;
  user: string;
  model?: string;
};

function firstNonEmpty(...values: Array<string | undefined>) {
  return values.find((value) => value && value.trim().length > 0)?.trim();
}

function normalizeProvider(value: string | undefined, baseURL: string): AiProvider {
  const provider = value?.trim().toLowerCase();
  if (provider === "gemini" || provider === "google" || provider === "gemini-native") {
    return "gemini";
  }
  if (provider === "openai" || provider === "openai-compatible") {
    return "openai-compatible";
  }
  if (/generativelanguage|googleapis/i.test(baseURL)) {
    return "gemini";
  }
  return "openai-compatible";
}

export function resolveAiModelConfig(model?: string): AiModelConfig | null {
  const apiKey = firstNonEmpty(process.env.AI_API_KEY, process.env.OPENAI_API_KEY, process.env.apiKey);
  if (!apiKey) return null;

  const baseURL =
    firstNonEmpty(
      process.env.AI_BASE_URL,
      process.env.OPENAI_BASE_URL,
      process.env.baseUrl,
      "https://api.openai.com/v1"
    ) ?? "https://api.openai.com/v1";
  const resolvedModel =
    firstNonEmpty(model, process.env.AI_MODEL, process.env.OPENAI_MODEL, process.env.model, "gpt-4.1-mini") ??
    "gpt-4.1-mini";
  const provider = firstNonEmpty(process.env.AI_PROVIDER, process.env.aiProvider);

  return {
    provider: normalizeProvider(provider, baseURL),
    apiKey,
    baseURL,
    model: resolvedModel
  };
}

function appendApiKey(url: URL, apiKey: string) {
  if (!url.searchParams.has("key")) {
    url.searchParams.set("key", apiKey);
  }
  return url.toString();
}

export function buildGeminiGenerateContentUrl(config: AiModelConfig) {
  const base = config.baseURL.replace(/\/+$/, "");
  const model = config.model.replace(/^models\//, "");
  const url = base.includes(":generateContent")
    ? new URL(base)
    : /\/models\/[^/]+$/.test(base)
      ? new URL(`${base}:generateContent`)
      : new URL(`${base}/models/${encodeURIComponent(model)}:generateContent`);

  return appendApiKey(url, config.apiKey);
}

async function createOpenAiCompatibleJsonCompletion(config: AiModelConfig, input: JsonCompletionInput) {
  const client = new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseURL
  });
  const completion = await client.chat.completions.create({
    model: config.model,
    messages: [
      {
        role: "system",
        content: input.system
      },
      {
        role: "user",
        content: input.user
      }
    ],
    response_format: { type: "json_object" }
  });

  return completion.choices[0]?.message.content || "";
}

async function createGeminiJsonCompletion(config: AiModelConfig, input: JsonCompletionInput) {
  const response = await fetch(buildGeminiGenerateContentUrl(config), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": config.apiKey
    },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `${input.system}\n\n${input.user}`
            }
          ]
        }
      ],
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.2
      }
    })
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Gemini API failed: ${response.status} ${message.slice(0, 300)}`);
  }

  const body = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  return body.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("") || "";
}

export async function createJsonCompletion(input: JsonCompletionInput) {
  const config = resolveAiModelConfig(input.model);
  if (!config) return null;

  if (config.provider === "gemini") {
    return createGeminiJsonCompletion(config, input);
  }

  return createOpenAiCompatibleJsonCompletion(config, input);
}
