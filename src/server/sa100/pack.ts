import fs from "fs";
import path from "path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { Sa100Draft } from "@/lib/sa100/schema";
import {
  supplementsForDraft,
  type SaFormTemplate,
} from "@/lib/sa100/forms-catalog";
import { buildSa100Pdf, type SaPdfMeta } from "@/server/sa100/pdf";

function resolveHmrcPath(filename: string): string {
  const candidates = [
    path.join(process.cwd(), "public", "hmrc", filename),
    path.join(process.cwd(), "hmrc", filename),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(/* turbopackIgnore: true */ candidate)) return candidate;
  }
  throw new Error(`HMRC form PDF not found: ${filename}`);
}

async function appendOfficialForm(
  pack: PDFDocument,
  form: SaFormTemplate,
  draft: Sa100Draft,
  personName: string,
  meta: SaPdfMeta,
) {
  const bytes = fs.readFileSync(
    /* turbopackIgnore: true */ resolveHmrcPath(form.filename),
  );
  const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
  try {
    const acro = src.getForm();
    const set = (name: string, value: string) => {
      try {
        acro.getTextField(name).setText(value.slice(0, 80));
      } catch {
        /* field absent */
      }
    };
    set("Name", personName);
    set("UTR", draft.utr || "");
    set("NINO", draft.nino || "");
    set("Ref", meta.submissionRef?.trim() || "");
  } catch {
    /* no AcroForm */
  }
  const pages = await pack.copyPages(src, src.getPageIndices());
  const bannerFont = meta.submissionRef?.trim()
    ? await pack.embedFont(StandardFonts.HelveticaBold)
    : null;
  for (const page of pages) {
    pack.addPage(page);
    if (bannerFont && meta.submissionRef?.trim()) {
      page.drawText(`Submission number: ${meta.submissionRef.trim()}`, {
        x: 36,
        y: page.getSize().height - 18,
        size: 8,
        font: bannerFont,
        color: rgb(0.06, 0.35, 0.32),
      });
    }
  }
}

/**
 * SA100 return as filed: main TR pages plus only the supplementary forms
 * required by this person's income flags (e.g. employment → SA102,
 * self-employment → SA103F). Partnership SA800 returns are never attached
 * here — they are produced from the partnership desk.
 */
export async function buildSa100PackPdf(
  draft: Sa100Draft,
  personName: string,
  meta: SaPdfMeta = {},
): Promise<{
  bytes: Uint8Array;
  supplements: string[];
}> {
  const supplements = supplementsForDraft(draft);
  const draftForMain: Sa100Draft = {
    ...draft,
    enclosingSupplementary: supplements.length > 0 || draft.enclosingSupplementary,
  };

  const mainBytes = await buildSa100Pdf(draftForMain, personName, meta);
  const pack = await PDFDocument.load(mainBytes);

  for (const form of supplements) {
    await appendOfficialForm(pack, form, draft, personName, meta);
  }

  return {
    bytes: await pack.save(),
    supplements: supplements.map((s) => s.formCode),
  };
}
