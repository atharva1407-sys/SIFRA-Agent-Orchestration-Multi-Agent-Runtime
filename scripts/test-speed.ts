import fs from "fs";
import path from "path";
import { createOpenAI } from "@ai-sdk/openai";
import { generateText } from "ai";

const envPath = path.resolve(process.cwd(), ".dev.vars");
const envContent = fs.readFileSync(envPath, "utf-8");
const envVars: Record<string, string> = {};

envContent.split("\n").forEach((line) => {
  const trimmed = line.trim();
  if (trimmed && !trimmed.startsWith("#")) {
    const [key, ...vals] = trimmed.split("=");
    if (key && vals.length > 0) {
      envVars[key.trim()] = vals.join("=").trim();
    }
  }
});

const openaiProvider = createOpenAI({
  apiKey: envVars["OPENAI_API_KEY"],
  baseURL: envVars["OPENAI_BASE_URL"],
});

async function benchmark(modelName: string) {
  console.log(`\n--- Benchmarking model: "${modelName}" ---`);
  const model = openaiProvider(modelName);
  const startTime = Date.now();

  try {
    const result = await generateText({
      model,
      prompt: "Explain the concept of durable execution in 3 short bullet points.",
    });

    const elapsedMs = Date.now() - startTime;
    const tokens = result.usage?.completionTokens ?? 0;
    const tokensPerSec = tokens > 0 ? ((tokens / elapsedMs) * 1000).toFixed(2) : "N/A";

    console.log(`Latency: ${elapsedMs} ms`);
    console.log(`Tokens generated: ${tokens}`);
    console.log(`Speed: ${tokensPerSec} tokens/sec`);
    console.log(`Sample Output:\n${result.text.trim()}`);
  } catch (err: any) {
    console.error(`Error testing "${modelName}":`, err.message);
  }
}

async function main() {
  console.log("Using Base URL:", envVars["OPENAI_BASE_URL"]);

  console.log("\n1. Testing current hardcoded harness setting ('gpt-5.5')...");
  await benchmark("gpt-5.5");

  console.log("\n2. Testing configured model from .dev.vars ('openai/gpt-4o-mini')...");
  await benchmark("openai/gpt-4o-mini");

  console.log("\n3. Testing high-speed model ('meta-llama/llama-3.3-70b-instruct')...");
  await benchmark("meta-llama/llama-3.3-70b-instruct");
}

main();
