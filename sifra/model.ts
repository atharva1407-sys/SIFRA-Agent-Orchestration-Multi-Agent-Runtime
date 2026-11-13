import { createOpenAI } from "@ai-sdk/openai";

// The one place the model is configured. Everything comes from .dev.vars:
//   OPENAI_API_KEY    — key for whichever endpoint OPENAI_BASE_URL points at
//   OPENAI_BASE_URL   — e.g. https://openrouter.ai/api/v1 or https://api.openai.com/v1
//   OPENROUTER_MODEL  — model id. OpenRouter uses "openai/gpt-4o-mini"; calling
//                       OpenAI directly uses plain "gpt-4o-mini".
//
// Note: the fallback below is an OpenRouter-style id. If you point
// OPENAI_BASE_URL at api.openai.com, set OPENROUTER_MODEL too (without the
// "openai/" prefix) or the request will 404.
const openaiProvider = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL,
});
export const model = openaiProvider(process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini");
