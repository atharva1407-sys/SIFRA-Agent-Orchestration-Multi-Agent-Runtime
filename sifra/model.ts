import { openai , createOpenAI} from "@ai-sdk/openai";

// The one place the model is configured.
//   - cheaper for a workshop → a "-mini" / "-nano" variant (e.g. "gpt-5-mini")
//   - this default            → "gpt-5.5"
//
// The provider reads OPENAI_API_KEY from the environment at request time
// (the server loads it from .dev.vars on startup).
const openaiProvider = createOpenAI({ apiKey: process.env.OPENAI_API_KEY, baseURL: process.env.OPENAI_BASE_URL });
export const model = openaiProvider(process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini");
