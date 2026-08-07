import { neon } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import * as schema from "./schema";

let db: NeonHttpDatabase<typeof schema> | null = null;

export function getDb() {
  if (db) return db;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is required when MEMORY_STORE is not enabled");
  }
  const sql = neon(url);
  db = drizzle(sql, { schema });
  return db;
}

export { schema };
