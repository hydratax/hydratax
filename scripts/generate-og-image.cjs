const sharp = require("sharp");
const path = require("path");
const fs = require("fs");

const logoPath = path.join("public", "brand", "logo.png");
const outPath = path.join("public", "brand", "og.png");
const W = 1200;
const H = 630;

async function main() {
  const logo = await sharp(logoPath)
    .resize(320, 320, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();

  const bg = Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#0f766e"/>
        <stop offset="55%" stop-color="#0d9488"/>
        <stop offset="100%" stop-color="#134e4a"/>
      </linearGradient>
    </defs>
    <rect width="100%" height="100%" fill="url(#g)"/>
    <circle cx="1080" cy="80" r="220" fill="#ffffff" fill-opacity="0.06"/>
    <circle cx="120" cy="560" r="180" fill="#ffffff" fill-opacity="0.05"/>
    <text x="600" y="520" text-anchor="middle" font-family="Georgia, Times New Roman, serif" font-size="52" font-weight="600" fill="#ffffff">HydraTax</text>
    <text x="600" y="568" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="24" fill="#ccfbf1">UK tax &amp; accounting software</text>
  </svg>`);

  await sharp(bg)
    .composite([{ input: logo, top: 90, left: Math.round((W - 320) / 2) }])
    .png()
    .toFile(outPath);

  const meta = await sharp(outPath).metadata();
  console.log("wrote", outPath, meta.width, "x", meta.height, fs.statSync(outPath).size, "bytes");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
