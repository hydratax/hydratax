import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";

export function isR2Configured() {
  return Boolean(
    process.env.CLOUDFLARE_R2_ACCOUNT_ID &&
      process.env.CLOUDFLARE_R2_ACCESS_KEY_ID &&
      process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY &&
      process.env.CLOUDFLARE_R2_BUCKET,
  );
}

function getR2Client() {
  const accountId = process.env.CLOUDFLARE_R2_ACCOUNT_ID!;
  return new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY!,
    },
  });
}

export async function uploadToR2(opts: {
  key: string;
  body: Buffer | Uint8Array;
  contentType: string;
}) {
  if (!isR2Configured()) {
    throw new Error("Cloudflare R2 is not configured");
  }
  const client = getR2Client();
  const bucket = process.env.CLOUDFLARE_R2_BUCKET!;
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: opts.key,
      Body: opts.body,
      ContentType: opts.contentType,
    }),
  );

  const publicBase = process.env.CLOUDFLARE_R2_PUBLIC_URL?.replace(/\/$/, "");
  if (publicBase) {
    return { key: opts.key, url: `${publicBase}/${opts.key}` };
  }
  // Private bucket — return r2:// key; serve via signed download route
  return { key: opts.key, url: `r2://${bucket}/${opts.key}` };
}

export async function getR2Object(key: string) {
  if (!isR2Configured()) throw new Error("Cloudflare R2 is not configured");
  const client = getR2Client();
  const bucket = process.env.CLOUDFLARE_R2_BUCKET!;
  const res = await client.send(
    new GetObjectCommand({ Bucket: bucket, Key: key }),
  );
  const bytes = await res.Body?.transformToByteArray();
  return {
    body: bytes ? Buffer.from(bytes) : null,
    contentType: res.ContentType ?? "application/octet-stream",
  };
}
