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

function normalizeProvider(value: string | undefined, baseURL: string, model?: string): AiProvider {
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
  if (/^(models\/)?gemini[-/]/i.test(model ?? "")) {
    return "gemini";
  }
  return "openai-compatible";
}

export function resolveAiModelConfig(model?: string): AiModelConfig | null {
  const googleApiKey = firstNonEmpty(
    process.env.GEMINI_API_KEY,
    process.env.GOOGLE_API_KEY,
    process.env.GOOGLE_GENERATIVE_AI_API_KEY,
    process.env.geminiApiKey,
    process.env.googleApiKey
  );
  const apiKey = firstNonEmpty(
    process.env.AI_API_KEY,
    googleApiKey,
    process.env.OPENAI_API_KEY,
    process.env.apiKey,
    process.env.key,
    process.env.api_key
  );
  if (!apiKey) return null;

  const explicitProvider = firstNonEmpty(
    process.env.AI_PROVIDER,
    process.env.GEMINI_PROVIDER,
    process.env.GOOGLE_PROVIDER,
    process.env.GOOGLE_AI_PROVIDER,
    process.env.aiProvider,
    process.env.provider
  );
  const providerHint = explicitProvider ?? (googleApiKey ? "gemini" : undefined);
  const hintedProvider = normalizeProvider(providerHint, "");
  const defaultBaseURL = hintedProvider === "gemini" ? "https://generativelanguage.googleapis.com/v1beta" : "https://api.openai.com/v1";

  const baseURL =
    firstNonEmpty(
      process.env.AI_BASE_URL,
      process.env.GEMINI_BASE_URL,
      process.env.GOOGLE_BASE_URL,
      process.env.GOOGLE_AI_BASE_URL,
      process.env.baseUrl,
      process.env.base_url,
      process.env.apiUrl,
      process.env.api_url,
      process.env.url,
      process.env.OPENAI_BASE_URL,
      defaultBaseURL
    ) ?? defaultBaseURL;
  const inferredProvider = normalizeProvider(providerHint, baseURL);
  const defaultModel = inferredProvider === "gemini" ? "gemini-2.5-flash" : "gpt-4.1-mini";
  const resolvedModel =
    firstNonEmpty(
      model,
      process.env.AI_MODEL,
      process.env.GEMINI_MODEL,
      process.env.GOOGLE_MODEL,
      process.env.GOOGLE_AI_MODEL,
      process.env.model,
      process.env.modelName,
      process.env.model_name,
      process.env.OPENAI_MODEL,
      defaultModel
    ) ?? defaultModel;

  return {
    provider: normalizeProvider(providerHint, baseURL, resolvedModel),
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

function normalizeGeminiBaseURL(baseURL: string) {
  const base = baseURL.replace(/\/+$/, "");
  if (base.includes(":generateContent") || /\/models\/[^/]+$/.test(base) || /\/v\d+(?:beta|alpha)?(?:\/|$)/i.test(base)) {
    return base;
  }
  return `${base}/v1beta`;
}

export function buildGeminiGenerateContentUrl(config: AiModelConfig) {
  const base = normalizeGeminiBaseURL(config.baseURL);
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
