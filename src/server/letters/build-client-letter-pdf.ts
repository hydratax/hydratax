import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { PracticeLetterhead } from "@/lib/desk-profile";

function wrapText(
  text: string,
  font: { widthOfTextAtSize: (t: string, size: number) => number },
  size: number,
  maxWidth: number,
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) return [""];
  const lines: string[] = [];
  let current = words[0]!;
  for (let i = 1; i < words.length; i++) {
    const next = `${current} ${words[i]}`;
    if (font.widthOfTextAtSize(next, size) <= maxWidth) {
      current = next;
    } else {
      lines.push(current);
      current = words[i]!;
    }
  }
  lines.push(current);
  return lines;
}

async function embedLogo(
  doc: PDFDocument,
  logoUrl: string | undefined,
): Promise<{ image: Awaited<ReturnType<PDFDocument["embedPng"]>>; width: number; height: number } | null> {
  const raw = logoUrl?.trim();
  if (!raw) return null;

  let bytes: Uint8Array | null = null;
  let mime = "";

  if (raw.startsWith("data:")) {
    const m = /^data:([^;]+);base64,([\s\S]+)$/.exec(raw);
    if (!m) return null;
    mime = m[1]!.toLowerCase();
    bytes = Uint8Array.from(Buffer.from(m[2]!, "base64"));
  } else {
    const keyMatch = /[?&]key=([^&]+)/.exec(raw);
    const key = keyMatch
      ? decodeURIComponent(keyMatch[1]!)
      : raw.startsWith("practices/")
        ? raw
        : null;
    if (!key || !key.includes("/branding/")) return null;
    try {
      const { getR2Object, isR2Configured } = await import("@/server/storage/r2");
      if (!isR2Configured()) return null;
      const obj = await getR2Object(key);
      if (!obj.body) return null;
      bytes = new Uint8Array(obj.body);
      mime = (obj.contentType ?? "").toLowerCase();
    } catch {
      return null;
    }
  }

  if (!bytes?.length) return null;

  try {
    const image =
      mime.includes("png") || raw.includes("image/png")
        ? await doc.embedPng(bytes)
        : await doc.embedJpg(bytes);
    const maxW = 160;
    const maxH = 56;
    const scale = Math.min(maxW / image.width, maxH / image.height, 1);
    return {
      image,
      width: image.width * scale,
      height: image.height * scale,
    };
  } catch {
    return null;
  }
}

/** A4 letter PDF with practice letterhead for email attachment. */
export async function buildClientLetterPdf(input: {
  letterhead: PracticeLetterhead;
  title: string;
  body: string;
  letterDate?: string;
}): Promise<Uint8Array> {
  const lh = input.letterhead;
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const serif = await doc.embedFont(StandardFonts.TimesRomanBold);

  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const marginX = 54;
  const contentWidth = pageWidth - marginX * 2;
  let page = doc.addPage([pageWidth, pageHeight]);
  let y = pageHeight - 50;

  const sea = rgb(0.059, 0.463, 0.431);
  const ink = rgb(0.11, 0.1, 0.09);
  const soft = rgb(0.34, 0.33, 0.31);

  // Accent bar
  page.drawRectangle({
    x: marginX,
    y: pageHeight - 28,
    width: contentWidth,
    height: 3.5,
    color: sea,
  });

  const logo = await embedLogo(doc, lh.logoUrl);
  if (logo) {
    page.drawImage(logo.image, {
      x: marginX,
      y: y - logo.height,
      width: logo.width,
      height: logo.height,
    });
    y -= logo.height + 10;
  }

  const practice = (lh.practiceName || "Practice").slice(0, 80);
  page.drawText(practice, {
    x: marginX,
    y: y - 14,
    size: 14,
    font: serif,
    color: ink,
  });
  y -= 20;

  if (lh.qualification?.trim()) {
    page.drawText(lh.qualification.trim().slice(0, 100), {
      x: marginX,
      y: y - 10,
      size: 8,
      font: bold,
      color: sea,
    });
    y -= 14;
  }

  for (const line of lh.addressLines ?? []) {
    if (!line.trim()) continue;
    page.drawText(line.trim().slice(0, 90), {
      x: marginX,
      y: y - 10,
      size: 8.5,
      font: regular,
      color: soft,
    });
    y -= 12;
  }

  const contact = [lh.phone, lh.email, lh.website].filter(Boolean).join(" · ");
  if (contact) {
    page.drawText(contact.slice(0, 110), {
      x: marginX,
      y: y - 10,
      size: 8.5,
      font: regular,
      color: soft,
    });
    y -= 12;
  }

  y -= 8;
  page.drawLine({
    start: { x: marginX, y },
    end: { x: pageWidth - marginX, y },
    thickness: 0.75,
    color: rgb(0.9, 0.89, 0.88),
  });
  y -= 22;

  const dateLabel =
    input.letterDate?.trim() ||
    new Date().toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  page.drawText(dateLabel, {
    x: marginX,
    y,
    size: 10,
    font: regular,
    color: ink,
  });
  y -= 16;

  page.drawText(input.title.slice(0, 90), {
    x: marginX,
    y,
    size: 11,
    font: bold,
    color: ink,
  });
  y -= 22;

  const ensureSpace = (need: number) => {
    if (y - need < 60) {
      // Footer on current page
      drawFooter(page);
      page = doc.addPage([pageWidth, pageHeight]);
      y = pageHeight - 54;
    }
  };

  const drawFooter = (p: typeof page) => {
    const lines = (lh.footerLines ?? []).filter((l) => l.trim()).slice(0, 4);
    if (!lines.length) return;
    p.drawLine({
      start: { x: marginX, y: 56 },
      end: { x: pageWidth - marginX, y: 56 },
      thickness: 0.5,
      color: rgb(0.9, 0.89, 0.88),
    });
    let fy = 44;
    for (const line of lines) {
      p.drawText(line.trim().slice(0, 110), {
        x: marginX,
        y: fy,
        size: 7,
        font: regular,
        color: soft,
      });
      fy -= 10;
    }
  };

  const blocks = input.body.replace(/\r\n/g, "\n").trim().split(/\n{2,}/);
  for (const block of blocks) {
    const rawLines = block.split("\n");
    for (const rawLine of rawLines) {
      const wrapped = wrapText(rawLine.trim() || " ", regular, 10.5, contentWidth);
      for (const line of wrapped) {
        ensureSpace(14);
        page.drawText(line, {
          x: marginX,
          y,
          size: 10.5,
          font: regular,
          color: ink,
        });
        y -= 14;
      }
    }
    y -= 8;
  }

  drawFooter(page);
  return doc.save();
}
