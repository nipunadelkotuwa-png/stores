import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  DATABASE_URL: z.string().url().startsWith("postgresql://"),
  SESSION_COOKIE_SECRET: z.string().min(32),
  APP_ORIGIN: z.string().url(),
  APP_TIME_ZONE: z.string().default("Asia/Colombo"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  TRUST_PROXY: z.enum(["true", "false"]).default("false"),
});

let cached: z.infer<typeof envSchema> | undefined;

export function getEnv() {
  cached ??= envSchema.parse({
    NODE_ENV: process.env.NODE_ENV,
    DATABASE_URL: process.env.DATABASE_URL,
    SESSION_COOKIE_SECRET: process.env.SESSION_COOKIE_SECRET,
    APP_ORIGIN: process.env.APP_ORIGIN,
    APP_TIME_ZONE: process.env.APP_TIME_ZONE,
    LOG_LEVEL: process.env.LOG_LEVEL,
    TRUST_PROXY: process.env.TRUST_PROXY,
  });
  return cached;
}
