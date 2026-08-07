import { z } from "zod";

const envSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  /** Explicit local escape hatch only — never enable in production. */
  MEMORY_STORE: z
    .string()
    .optional()
    .transform((v) => v === "true" || v === "1"),
  DATABASE_URL: z.string().optional(),
  TOKEN_ENCRYPTION_KEY: z.string().optional(),
  HMRC_ENV: z.enum(["sandbox", "production"]).default("sandbox"),
  HMRC_CLIENT_ID: z.string().optional(),
  HMRC_CLIENT_SECRET: z.string().optional(),
  HMRC_SERVER_TOKEN: z.string().optional(),
  HMRC_VENDOR_PUBLIC_IP: z.string().optional(),
  HMRC_VENDOR_LICENSE_IDS: z.string().default("hydratax"),
  HMRC_VENDOR_VERSION: z.string().default("HydraTax=0.1.0"),
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().optional(),
  CLERK_SECRET_KEY: z.string().optional(),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().optional(),
  BLOB_READ_WRITE_TOKEN: z.string().optional(),
});

export type AppEnv = z.infer<typeof envSchema>;

let cached: AppEnv | null = null;

export function getEnv(): AppEnv {
  if (cached) return cached;
  const parsed = envSchema.safeParse({
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    MEMORY_STORE: process.env.MEMORY_STORE ?? process.env.DEMO_MODE,
    DATABASE_URL: process.env.DATABASE_URL,
    TOKEN_ENCRYPTION_KEY: process.env.TOKEN_ENCRYPTION_KEY,
    HMRC_ENV: process.env.HMRC_ENV ?? "sandbox",
    HMRC_CLIENT_ID: process.env.HMRC_CLIENT_ID,
    HMRC_CLIENT_SECRET: process.env.HMRC_CLIENT_SECRET,
    HMRC_SERVER_TOKEN: process.env.HMRC_SERVER_TOKEN,
    HMRC_VENDOR_PUBLIC_IP: process.env.HMRC_VENDOR_PUBLIC_IP,
    HMRC_VENDOR_LICENSE_IDS: process.env.HMRC_VENDOR_LICENSE_IDS,
    HMRC_VENDOR_VERSION: process.env.HMRC_VENDOR_VERSION,
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
    CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY,
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
    BLOB_READ_WRITE_TOKEN: process.env.BLOB_READ_WRITE_TOKEN,
  });
  if (!parsed.success) {
    throw new Error(`Invalid environment: ${parsed.error.message}`);
  }
  cached = parsed.data;
  return cached;
}

/**
 * Local memory practice (empty) when MEMORY_STORE=true or no DATABASE_URL.
 * Not for production SaaS traffic.
 */
export function isMemoryStore(): boolean {
  const env = getEnv();
  if (env.MEMORY_STORE) return true;
  if (!env.DATABASE_URL) return true;
  return false;
}

/** @deprecated Use isMemoryStore */
export function isDemoMode(): boolean {
  return isMemoryStore();
}

export function isClerkConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY &&
      process.env.CLERK_SECRET_KEY,
  );
}

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function isBlobConfigured(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  );
}

export function isR2Configured(): boolean {
  return Boolean(
    process.env.CLOUDFLARE_R2_ACCOUNT_ID &&
      process.env.CLOUDFLARE_R2_ACCESS_KEY_ID &&
      process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY &&
      process.env.CLOUDFLARE_R2_BUCKET,
  );
}
