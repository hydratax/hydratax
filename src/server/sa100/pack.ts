import fs from "fs";
import path from "path";
import { PDFDocument, StandardFonts, rgb, type PDFPage } from "pdf-lib";
import type { Sa100Draft } from "@/lib/sa100/schema";
import {
  supplementsForDraft,
  type SaFormTemplate,
} from "@/lib/sa100/forms-catalog";
import { buildSa100Pdf, type SaPdfMeta } from "@/server/sa100/pdf";
import { fillSa102EmploymentPage } from "@/server/sa100/sa102-fill";
import { fillSa103FPages } from "@/server/sa100/sa103-fill";
import { fillSa105Pages } from "@/server/sa100/sa105-fill";

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

async function drawSubmissionBanner(
  pack: PDFDocument,
  pages: PDFPage[],
  meta: SaPdfMeta,
) {
  if (!meta.submissionRef?.trim()) return;
  const bannerFont = await pack.embedFont(StandardFonts.HelveticaBold);
  for (const page of pages) {
    page.drawText(`Submission number: ${meta.submissionRef.trim()}`, {
      x: 36,
      y: page.getSize().height - 18,
      size: 8,
      font: bannerFont,
      color: rgb(0.06, 0.35, 0.32),
    });
  }
}

async function appendTemplatePages(
  pack: PDFDocument,
  filename: string,
): Promise<PDFPage[]> {
  const bytes = fs.readFileSync(
    /* turbopackIgnore: true */ resolveHmrcPath(filename),
  );
  const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const copied = await pack.copyPages(src, src.getPageIndices());
  for (const page of copied) pack.addPage(page);
  return copied;
}

async function appendBlankSupplement(
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
  for (const page of pages) pack.addPage(page);
  await drawSubmissionBanner(pack, pages, meta);
}

/** One filled SA102 per employment row. */
async function appendFilledSa102(
  pack: PDFDocument,
  draft: Sa100Draft,
  personName: string,
  meta: SaPdfMeta,
) {
  const form = supplementsForDraft(draft).find((f) => f.formCode === "SA102");
  if (!form) return;
  const employments =
    draft.employments.length > 0
      ? draft.employments
      : [
          {
            employerName: "",
            payeRef: "",
            pay: 0,
            payrolledBenefitsStudentLoan: 0,
            taxTakenOff: 0,
            tips: 0,
            wasDirector: false,
            directorCeasedDate: "",
            wasCloseCompany: false,
            closeCompanyName: "",
            closeCompanyNumber: "",
            closeCompanyDividends: 0,
            closeCompanySharePct: 0,
            offPayroll: false,
            benefitCars: 0,
            benefitFuel: 0,
            benefitMedical: 0,
            benefitVouchers: 0,
            benefitGoods: 0,
            benefitAccommodation: 0,
            benefitOther: 0,
            benefitExpensesPayments: 0,
            benefits: 0,
            expenseTravel: 0,
            expenseFixed: 0,
            expenseProfessional: 0,
            expenseOther: 0,
          },
        ];

  for (const emp of employments) {
    const copied = await appendTemplatePages(pack, form.filename);
    const first = copied[0];
    if (first) {
      await fillSa102EmploymentPage(
        pack,
        first,
        emp,
        personName,
        draft.utr || "",
      );
    }
    await drawSubmissionBanner(pack, copied, meta);
  }
}

async function appendFilledSa103F(
  pack: PDFDocument,
  draft: Sa100Draft,
  personName: string,
  meta: SaPdfMeta,
) {
  const form = supplementsForDraft(draft).find((f) => f.formCode === "SA103F");
  if (!form) return;
  const copied = await appendTemplatePages(pack, form.filename);
  await fillSa103FPages(pack, copied, draft, personName);
  await drawSubmissionBanner(pack, copied, meta);
}

async function appendFilledSa105(
  pack: PDFDocument,
  draft: Sa100Draft,
  personName: string,
  meta: SaPdfMeta,
) {
  const form = supplementsForDraft(draft).find((f) => f.formCode === "SA105");
  if (!form) return;
  const copied = await appendTemplatePages(pack, form.filename);
  await fillSa105Pages(pack, copied, draft, personName);
  await drawSubmissionBanner(pack, copied, meta);
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
    enclosingSupplementary:
      supplements.length > 0 || draft.enclosingSupplementary,
  };

  const mainBytes = await buildSa100Pdf(draftForMain, personName, meta);
  const pack = await PDFDocument.load(mainBytes);

  for (const form of supplements) {
    if (form.formCode === "SA102") {
      await appendFilledSa102(pack, draft, personName, meta);
      continue;
    }
    if (form.formCode === "SA103F") {
      await appendFilledSa103F(pack, draft, personName, meta);
      continue;
    }
    if (form.formCode === "SA105") {
      await appendFilledSa105(pack, draft, personName, meta);
      continue;
    }
    await appendBlankSupplement(pack, form, draft, personName, meta);
  }

  return {
    bytes: await pack.save(),
    supplements: supplements.map((s) => s.formCode),
  };
}
