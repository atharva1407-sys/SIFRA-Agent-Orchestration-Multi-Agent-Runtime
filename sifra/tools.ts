import { tool } from "ai";
import { z } from "zod";
import { runInSandbox, type SandboxApi } from "./sandbox";

// ── Canned data the read tools serve ────────────────────────────────────────

type Charge = { id: string; amount: number; date: string; description: string };

// Note the planted duplicate: ch_001 and ch_002 are the same charge.
export const CHARGES: Record<string, Charge[]> = {
  cus_88121: [
    { id: "ch_001", amount: 4900, date: "2026-05-01", description: "Pro plan — monthly" },
    { id: "ch_002", amount: 4900, date: "2026-05-01", description: "Pro plan — monthly" },
    { id: "ch_003", amount: 1500, date: "2026-04-18", description: "Extra seats" },
  ],
};

const KNOWLEDGE_BASE: Record<string, string> = {
  billing:
    "Double charges are usually a duplicate authorization that drops off in 3–5 days. If it already settled, refund immediately.",
  refund: "Refunds post in 5–10 business days. Pro accounts can be expedited.",
  export:
    "The Safari export failure is a known bug (TICKET-4412). Workaround: use Chrome or the CSV export.",
  pricing:
    "Team plans are $20/seat/mo with a volume discount at 25+ seats. For 50+ seats, send the pricing PDF.",
};

export function searchKB(query: string): string[] {
  const q = query.toLowerCase();
  const hits = Object.entries(KNOWLEDGE_BASE)
    .filter(([key]) => q.includes(key))
    .map(([, article]) => article);
  return hits.length ? hits : ["No exact match — use your judgment."];
}

// ── The read/compute API exposed INTO the sandbox (Code Mode) ────────────────
//
// When the agent writes code, these are the functions it can call. They're
// read-only: a re-run (after a crash) is harmless, so the whole runCode step can
// stay a single durable unit without risking duplicate side effects.
const sandboxApi: SandboxApi = {
  getCharges: async (customerId: string) => CHARGES[customerId] ?? [],
  searchKnowledgeBase: async (query: string) => searchKB(query),
};

// ── Real-Time Web Search & Live Information Tools ──────────────────────────

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

export async function searchWeb(query: string, maxResults = 5): Promise<{ title: string; snippet: string; url: string }[]> {
  // 1. If Tavily API Key is configured in environment, use clean structured search
  if (process.env.TAVILY_API_KEY) {
    try {
      const res = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: process.env.TAVILY_API_KEY,
          query,
          max_results: maxResults,
        }),
      });
      if (res.ok) {
        const data = (await res.json()) as { results?: Array<{ title?: string; content?: string; url?: string }> };
        if (data.results && data.results.length > 0) {
          return data.results.map((r) => ({
            title: r.title ?? "Search Result",
            snippet: r.content ?? "",
            url: r.url ?? "",
          }));
        }
      }
    } catch {
      // Fall through to zero-config search below
    }
  }

  // 2. Zero-config fallback: DuckDuckGo HTML search (no API key required)
  try {
    const res = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });
    if (!res.ok) throw new Error(`Search request returned status ${res.status}`);
    const html = await res.text();

    const results: { title: string; snippet: string; url: string }[] = [];
    const resultBlocks = html.split(/<div class="[^"]*result results_links[^"]*">/);

    for (const block of resultBlocks.slice(1, maxResults + 1)) {
      const titleMatch =
        block.match(/<a[^>]*class="[^"]*result__url[^"]*"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/) ||
        block.match(/<h2[^>]*>[\s\S]*?<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/);
      const snippetMatch = block.match(/<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/);

      if (titleMatch || snippetMatch) {
        const rawUrl = titleMatch ? titleMatch[1] : "";
        let cleanUrl = rawUrl;
        const uddgMatch = rawUrl.match(/[?&]uddg=([^&]+)/);
        if (uddgMatch) {
          cleanUrl = decodeURIComponent(uddgMatch[1]);
        }
        const rawTitle = titleMatch ? titleMatch[2].replace(/<[^>]+>/g, "").trim() : "Result";
        const rawSnippet = snippetMatch ? snippetMatch[1].replace(/<[^>]+>/g, "").trim() : "";

        results.push({
          title: decodeHtmlEntities(rawTitle),
          snippet: decodeHtmlEntities(rawSnippet),
          url: cleanUrl,
        });
      }
    }

    if (results.length > 0) return results;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return [{ title: "Search Error", snippet: `Failed to fetch search results: ${msg}`, url: "" }];
  }

  return [{ title: "No results", snippet: `No live search results found for: ${query}`, url: "" }];
}

export async function fetchLiveWeather(city: string): Promise<Record<string, unknown>> {
  try {
    // 1. Geocode city name to coordinates
    const geoRes = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`,
    );
    if (!geoRes.ok) throw new Error("Geocoding service unavailable");
    const geoData = (await geoRes.json()) as {
      results?: Array<{ name: string; country?: string; admin1?: string; latitude: number; longitude: number }>;
    };

    if (!geoData.results || geoData.results.length === 0) {
      return { error: `Could not resolve location coordinates for city: "${city}"` };
    }

    const loc = geoData.results[0];

    // 2. Fetch real-time weather from Open-Meteo
    const weatherRes = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m&timezone=auto`,
    );
    if (!weatherRes.ok) throw new Error("Weather forecast service unavailable");
    const weatherData = (await weatherRes.json()) as {
      current?: {
        time: string;
        temperature_2m: number;
        relative_humidity_2m: number;
        apparent_temperature: number;
        precipitation: number;
        weather_code: number;
        wind_speed_10m: number;
      };
      current_units?: Record<string, string>;
    };

    const current = weatherData.current;
    if (!current) return { error: "No weather readings currently available" };

    const weatherDescriptions: Record<number, string> = {
      0: "Clear sky",
      1: "Mainly clear",
      2: "Partly cloudy",
      3: "Overcast",
      45: "Foggy",
      48: "Depositing rime fog",
      51: "Light drizzle",
      53: "Moderate drizzle",
      55: "Dense drizzle",
      61: "Slight rain",
      63: "Moderate rain",
      65: "Heavy rain",
      71: "Slight snow fall",
      73: "Moderate snow fall",
      75: "Heavy snow fall",
      80: "Slight rain showers",
      81: "Moderate rain showers",
      82: "Violent rain showers",
      95: "Thunderstorm",
      96: "Thunderstorm with slight hail",
      99: "Thunderstorm with heavy hail",
    };

    const condition = weatherDescriptions[current.weather_code] ?? `Condition code ${current.weather_code}`;

    return {
      location: `${loc.name}, ${loc.admin1 ? loc.admin1 + ", " : ""}${loc.country ?? ""}`,
      temperature: `${current.temperature_2m} °C`,
      feelsLike: `${current.apparent_temperature} °C`,
      condition,
      humidity: `${current.relative_humidity_2m}%`,
      windSpeed: `${current.wind_speed_10m} km/h`,
      precipitation: `${current.precipitation} mm`,
      recordedAt: current.time,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { error: `Failed to fetch live weather: ${msg}` };
  }
}

export async function fetchUrlContent(url: string): Promise<Record<string, unknown>> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const text = await res.text();
    const clean = text
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 5000);

    return { ok: true, url, content: clean };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Failed to fetch URL: ${msg}` };
  }
}

// ── The tool SCHEMAS the model sees ─────────────────────────────────────────

export const tools = {
  // Real-time weather lookup tool
  getWeather: tool({
    description:
      "Get live, real-time weather readings (temperature, condition, humidity, wind speed, precipitation) for any city or location in the world.",
    inputSchema: z.object({
      city: z.string().describe("The city or location name, e.g. 'Pune', 'Tokyo', 'London'"),
    }),
  }),

  // Real-time live web search tool
  webSearch: tool({
    description:
      "Search the live web for real-time information, breaking news, sports scores, current events, crypto/stock prices, and up-to-date facts.",
    inputSchema: z.object({
      query: z.string().describe("Search query to look up on the web, e.g. 'Bitcoin price today' or 'latest tech news'"),
    }),
  }),

  // Live web page reader tool
  fetchUrl: tool({
    description: "Fetch and read the readable text content of a specific web page or news article URL.",
    inputSchema: z.object({
      url: z.string().describe("Full web URL to fetch and read, e.g. 'https://news.ycombinator.com'"),
    }),
  }),
  // Code Mode: instead of chaining a dozen tool calls (each round-tripping
  // through the model), the agent writes ONE program that fetches and analyzes.
  runCode: tool({
    description: [
      "Run a JavaScript program (an async function body) to fetch and analyze data.",
      "Available inside the program:",
      "  • await tools.getCharges(customerId) → [{ id, amount (cents), date, description }]",
      "  • await tools.searchKnowledgeBase(query) → string[]",
      "  • console.log(...) for debugging",
      "Use `return` to return your result (any JSON value).",
    ].join("\n"),
    inputSchema: z.object({ code: z.string() }),
  }),

  classifyItem: tool({
    description: "Classify a work item into a category.",
    inputSchema: z.object({
      itemId: z.string(),
      category: z.enum(["billing", "technical", "sales", "other"]),
    }),
  }),
  draftReply: tool({
    description: "Write a draft reply for a work item. Does not send anything.",
    inputSchema: z.object({ itemId: z.string(), message: z.string() }),
  }),
  sendReply: tool({
    description: "Send the drafted reply to the customer. This really emails them.",
    inputSchema: z.object({ itemId: z.string(), draftId: z.string() }),
  }),

  // Privileged: only the billing specialist gets this. Moves real money.
  issueRefund: tool({
    description: "Issue a refund to the customer. IRREVERSIBLE — this moves real money.",
    inputSchema: z.object({
      customerId: z.string(),
      chargeId: z.string(),
      amountCents: z.number(),
    }),
  }),

  // Hand the conversation to a specialist agent. The harness intercepts this —
  // it switches the running agent rather than executing a tool.
  handoff: tool({
    description:
      "Hand off the conversation to a specialist agent when the task needs a capability you don't have (e.g. issuing a refund → billing).",
    inputSchema: z.object({ to: z.enum(["billing"]), reason: z.string() }),
  }),

  // Image-to-Text Visualization Tool: Analyze images (receipts, error screenshots, billing statements) and extract text.
  analyzeImage: tool({
    description:
      "Analyze an image (receipt screenshot, invoice, error log) to extract text, key fields, and visual data breakdowns.",
    inputSchema: z.object({
      imageUrl: z.string().describe("URL or data identifier of the image to analyze"),
      docType: z.enum(["receipt", "invoice", "screenshot", "general"]).optional(),
    }),
  }),
};

// ── The harness-owned executor ──────────────────────────────────────────────
//
// `runCode` is mediated: it never runs in the host process, only in the sandbox.
// The side-effecting tools (sendReply) still run here as normal durable steps.
export async function runTool(
  name: string,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  switch (name) {
    case "getWeather":
      return await fetchLiveWeather(String(args.city ?? ""));
    case "webSearch":
      return { results: await searchWeb(String(args.query ?? "")) };
    case "fetchUrl":
      return await fetchUrlContent(String(args.url ?? ""));
    case "runCode":
      return runInSandbox(String(args.code ?? ""), sandboxApi);
    case "getCharges":
      return { charges: CHARGES[String(args.customerId)] ?? [] };
    case "searchKnowledgeBase":
      return { articles: searchKB(String(args.query ?? "")) };
    case "classifyItem":
      return { ok: true, itemId: args.itemId, category: args.category };
    case "draftReply":
      return { ok: true, draftId: `draft-${args.itemId}` };
    case "sendReply":
      return { sent: true, itemId: args.itemId, draftId: args.draftId };
    case "issueRefund":
      return {
        refunded: true,
        customerId: args.customerId,
        chargeId: args.chargeId,
        amountCents: args.amountCents,
      };
    case "analyzeImage":
      return {
        ok: true,
        docType: args.docType ?? "receipt",
        extractedText: "Detected Text: Duplicate Charge for $49.00 on 2026-05-01 (ch_001, ch_002)",
        visualBreakdown: {
          confidenceScore: 0.99,
          extractedEntities: [
            { field: "Customer ID", value: "cus_88121" },
            { field: "Charge 1", value: "ch_001 ($49.00)" },
            { field: "Charge 2", value: "ch_002 ($49.00 - duplicate)" },
          ],
        },
      };
    default:
      throw new Error(`unknown tool: ${name}`);
  }
}
