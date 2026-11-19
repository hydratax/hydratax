/** Bureau bulk import + RTI queue knobs (DB-backed; no Redis). */

/** Max companies in one enqueue (zip / manifest). */
export const BULK_IMPORT_MAX_COMPANIES = 1000;

/** Companies processed per cron / worker tick. */
export const BULK_IMPORT_COMPANIES_PER_TICK = 5;

/** Soft row cap still applies per company CSV (same as desk sync import). */
export const BULK_IMPORT_MAX_CSV_CHARS = 2_000_000;

/** RTI submits claimed per tick across the platform. */
export const RTI_SUBMIT_PER_TICK = 2;

/**
 * Practical gap between FPS/EPS posts from HydraTax.
 * HMRC does not publish a Transaction Engine per-software daily cap;
 * this protects Gateway / TE from burst traffic when a bureau runs ~1000 EmpRefs.
 */
export const RTI_MIN_GAP_MS = 2_500;

/** Feature flag: when false, enqueue stubs only — desk still submits live sync. */
export const RTI_QUEUE_LIVE_ENABLED =
  String(process.env.RTI_SUBMIT_QUEUE_ENABLED || "").toLowerCase() === "true" ||
  String(process.env.RTI_SUBMIT_QUEUE_ENABLED || "") === "1";
