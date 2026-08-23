const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
} = require("@aws-sdk/client-s3");

const accountId = process.env.CLOUDFLARE_R2_ACCOUNT_ID;
const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY;
const bucket = process.env.CLOUDFLARE_R2_BUCKET;

const required = [
  "CLOUDFLARE_R2_ACCOUNT_ID",
  "CLOUDFLARE_R2_ACCESS_KEY_ID",
  "CLOUDFLARE_R2_SECRET_ACCESS_KEY",
  "CLOUDFLARE_R2_BUCKET",
];
const missing = required.filter((k) => !process.env[k]);
if (missing.length) {
  console.log("MISSING", missing.join(", "));
  process.exit(1);
}

const client = new S3Client({
  region: "auto",
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId, secretAccessKey },
});

(async () => {
  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
    console.log("HEAD_BUCKET ok bucket=" + bucket);

    const key = `connectivity-test/${Date.now()}.txt`;
    const body = "HydraTax R2 connectivity test";
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: "text/plain",
      }),
    );
    console.log("PUT ok key=" + key);

    const got = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const text = await got.Body.transformToString();
    console.log("GET ok match=" + (text === body));

    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    console.log("DELETE ok");
    console.log("R2_RESULT success");
  } catch (e) {
    console.log("R2_RESULT fail");
    console.log("ERROR", e.name || "Error", e.message || String(e));
    if (e.$metadata?.httpStatusCode) {
      console.log("HTTP", e.$metadata.httpStatusCode);
    }
    process.exit(1);
  }
})();
