import { loadEnvFile } from "node:process";
import { z } from "zod";

try {
  loadEnvFile(new URL("../../../.env", import.meta.url));
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}

const optionalSecret = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().min(1).optional()
);

export const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash";
export const DEFAULT_GEMINI_FALLBACK_MODELS = [
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite"
];

const geminiModel = z
  .string()
  .trim()
  .min(1)
  .default(DEFAULT_GEMINI_MODEL)
  .transform((model) =>
    model === "gemini-2.5-flash" ? DEFAULT_GEMINI_MODEL : model
  );

const geminiFallbackModels = z
  .string()
  .default(DEFAULT_GEMINI_FALLBACK_MODELS.join(","))
  .transform((value) =>
    [...new Set(value.split(",").map((model) => model.trim()).filter(Boolean))]
  );

const environmentSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  WEB_ORIGIN: z.string().url().default("http://localhost:3000"),
  DEMO_STEP_DELAY_MS: z.coerce.number().int().min(0).max(5_000).default(180),
  TAVILY_API_KEY: optionalSecret,
  GEMINI_API_KEY: optionalSecret,
  GEMINI_MODEL: geminiModel,
  GEMINI_FALLBACK_MODELS: geminiFallbackModels,
  OPENROUTER_API_KEY: optionalSecret,
  OPENROUTER_MODEL: optionalSecret,
  DATABASE_URL: optionalSecret,
  REDIS_URL: optionalSecret
});

export type AppConfig = z.infer<typeof environmentSchema>;

export function loadConfig(
  input: NodeJS.ProcessEnv = process.env
): AppConfig {
  return environmentSchema.parse(input);
}
