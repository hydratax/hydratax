import type { z } from "zod";
import type { ct600FiguresSchema } from "@/server/money/schemas";
import type {
  Ct600QuestionnaireAnswers,
  Ct600QuestionnaireResult,
} from "@/lib/hmrc/filing-guides";
import type { YearEndAccountsDraft } from "@/server/accounts/year-end-from-bank";

export type Ct600Figures = z.infer<typeof ct600FiguresSchema>;

export type Ct600ReviewCompany = {
  name: string;
  companyNumber: string;
  utr: string;
  registeredOffice?: string | null;
  directors?: string[];
  declarantName?: string | null;
  declarantStatus?: string | null;
};

export type Ct600PrincipalContact = {
  title?: string;
  forename?: string;
  surname?: string;
  email?: string;
  telephone?: string;
};

export type Ct600AttachmentKind = "accounts" | "computations";

export type Ct600Attachment = {
  kind: Ct600AttachmentKind;
  filename: string;
  mediaType: string;
  contentBase64: string;
  byteLength: number;
};

export type Ct600PackageInput = {
  companyName: string;
  companyNumber: string;
  utr: string;
  figures: Ct600Figures;
  questionnaire: Ct600QuestionnaireAnswers;
  accountsDraft?: YearEndAccountsDraft | null;
  declarantName?: string | null;
  declarantStatus?: string | null;
  contact?: Ct600PrincipalContact | null;
  sender?: string;
  senderId?: string;
  senderPassword?: string;
  gatewayTest?: boolean;
};

export type Ct600ValidationIssue = {
  code: string;
  message: string;
  blocking: boolean;
};

export type Ct600PackageValidation = {
  ok: boolean;
  issues: Ct600ValidationIssue[];
  questionnaire: Ct600QuestionnaireResult;
};

export type Ct600BuiltPackage = {
  xml: string;
  hash: string;
  taxableProfitPence: number;
  taxChargePence: number;
  attachments: Ct600Attachment[];
  validation: Ct600PackageValidation;
  irmark: string;
};

export type Ct600SubmitResult = {
  ok: boolean;
  status: number;
  correlationId: string | null;
  qualifier: string | null;
  receipt: string;
  pollReceipt?: string;
  hash: string;
};
