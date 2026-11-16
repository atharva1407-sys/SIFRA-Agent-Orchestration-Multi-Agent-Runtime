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
//
// We use .chat() (Chat Completions), NOT the default provider call (Responses
// API). Over OpenRouter, the Responses API gives tool calls temporary ids
// ("fc_tmp_...") that the AI SDK sends back as item references, which OpenRouter
// can't resolve — so the 2nd turn of any tool-using workflow fails with
// "messages with role 'tool' must be a response to a preceding message with
// 'tool_calls'". Chat Completions replays the full tool call and works.
const openaiProvider = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL,
});
export const model = openaiProvider.chat(process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini");
