/**
 * Delete objects from Cloudflare R2 (S3-compatible). Kept separate from
 * `src/server/storage/r2.ts` (upload owner = another worker) so privacy
 * erasure never depends on upload-path changes.
 */

import { DeleteObjectsCommand, S3Client } from "@aws-sdk/client-s3";

export function r2Configured(): boolean {
  return Boolean(
    process.env.CLOUDFLARE_R2_ACCOUNT_ID &&
      process.env.CLOUDFLARE_R2_ACCESS_KEY_ID &&
      process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY &&
      process.env.CLOUDFLARE_R2_BUCKET,
  );
}

/** Keys come from our own DB rows; still reject path tricks defensively. */
export function isSafeObjectKey(key: unknown): key is string {
  return (
    typeof key === "string" &&
    key.length > 0 &&
    key.length < 1024 &&
    !key.includes("..") &&
    !key.startsWith("/") &&
    !key.startsWith("r2://") &&
    !/^https?:/i.test(key)
  );
}

/** Returns number of keys submitted for deletion (S3 DeleteObjects is idempotent). */
export async function deleteR2Objects(keys: unknown[]): Promise<number> {
  if (!r2Configured()) return 0;
  const safe = [...new Set(keys.filter(isSafeObjectKey))];
  if (safe.length === 0) return 0;

  const client = new S3Client({
    region: "auto",
    endpoint: `https://${process.env.CLOUDFLARE_R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY!,
    },
  });
  const bucket = process.env.CLOUDFLARE_R2_BUCKET!;

  for (let i = 0; i < safe.length; i += 500) {
    const batch = safe.slice(i, i + 500);
    const res = await client.send(
      new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true },
      }),
    );
    if (res.Errors?.length) {
      throw new Error(`R2 delete reported ${res.Errors.length} error(s)`);
    }
  }
  return safe.length;
}
