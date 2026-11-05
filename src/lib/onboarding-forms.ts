/** Client onboarding / intake forms — Jotform-style field schemas. */

export type OnboardingFieldType =
  | "section"
  | "short_text"
  | "long_text"
  | "email"
  | "phone"
  | "date"
  | "select"
  | "checkbox"
  | "file";

export type OnboardingField = {
  id: string;
  type: OnboardingFieldType;
  label: string;
  required?: boolean;
  helpText?: string;
  /** Select options */
  options?: string[];
  /** File accept attribute */
  accept?: string;
  /** Maps uploaded file into client_documents.category */
  documentCategory?:
    | "general"
    | "accounts"
    | "vat"
    | "payroll"
    | "corporation_tax"
    | "self_assessment"
    | "companies_house";
};

export type OnboardingFormUpload = {
  fieldId: string;
  filename: string;
  documentId: string;
  uploadedAt: string;
};

export type FormActivityKind =
  | "created"
  | "amended"
  | "sent"
  | "opened"
  | "submitted";

export type FormActivity = {
  id: string;
  at: string;
  kind: FormActivityKind;
  actorId?: string;
  note?: string;
};

export type OnboardingFormRecord = {
  id: string;
  name: string;
  description: string;
  fields: OnboardingField[];
  token: string;
  status: "draft" | "sent" | "submitted";
  /** Built-in template key when seeded from STANDARD_FORMS */
  templateKey?: string;
  answers?: Record<string, string | boolean>;
  uploads?: OnboardingFormUpload[];
  activity?: FormActivity[];
  sentAt?: string;
  openedAt?: string;
  submittedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export function pushFormActivity(
  form: OnboardingFormRecord,
  kind: FormActivityKind,
  opts?: { actorId?: string; note?: string },
): OnboardingFormRecord {
  const at = new Date().toISOString();
  const entry: FormActivity = {
    id: crypto.randomUUID(),
    at,
    kind,
    actorId: opts?.actorId,
    note: opts?.note,
  };
  const activity = [...(form.activity ?? []), entry];
  return {
    ...form,
    activity,
    updatedAt: at,
    ...(kind === "sent" ? { sentAt: at, status: "sent" as const } : {}),
    ...(kind === "opened" && !form.openedAt ? { openedAt: at } : {}),
    ...(kind === "submitted"
      ? { submittedAt: at, status: "submitted" as const }
      : {}),
  };
}

export const FIELD_TYPE_LABELS: Record<OnboardingFieldType, string> = {
  section: "Section heading",
  short_text: "Short text",
  long_text: "Long text",
  email: "Email",
  phone: "Phone",
  date: "Date",
  select: "Dropdown",
  checkbox: "Checkbox",
  file: "File upload",
};

export function newFieldId() {
  return `f_${Math.random().toString(36).slice(2, 10)}`;
}

export function createEmptyField(
  type: OnboardingFieldType = "short_text",
): OnboardingField {
  const base: OnboardingField = {
    id: newFieldId(),
    type,
    label:
      type === "section"
        ? "Section"
        : type === "file"
          ? "Upload a document"
          : "Question",
    required: type !== "section" && type !== "checkbox",
  };
  if (type === "select") {
    base.options = ["Option 1", "Option 2"];
  }
  if (type === "file") {
    base.accept = ".pdf,.jpg,.jpeg,.png,.webp,.csv,.xls,.xlsx";
    base.documentCategory = "general";
  }
  return base;
}

/** Starter onboarding pack accountants can drop onto a new client. */
export function defaultOnboardingFields(): OnboardingField[] {
  return [
    {
      id: newFieldId(),
      type: "section",
      label: "About you",
    },
    {
      id: newFieldId(),
      type: "short_text",
      label: "Full legal name",
      required: true,
    },
    {
      id: newFieldId(),
      type: "email",
      label: "Best email",
      required: true,
    },
    {
      id: newFieldId(),
      type: "phone",
      label: "Mobile number",
      required: false,
    },
    {
      id: newFieldId(),
      type: "section",
      label: "Business",
    },
    {
      id: newFieldId(),
      type: "short_text",
      label: "Trading / company name",
      required: true,
    },
    {
      id: newFieldId(),
      type: "select",
      label: "Entity type",
      required: true,
      options: [
        "Limited company",
        "Sole trader",
        "Partnership",
        "Other",
      ],
    },
    {
      id: newFieldId(),
      type: "date",
      label: "Accounting year end",
      required: false,
    },
    {
      id: newFieldId(),
      type: "section",
      label: "Documents we need",
    },
    {
      id: newFieldId(),
      type: "file",
      label: "Photo ID (passport or driving licence)",
      required: true,
      accept: ".pdf,.jpg,.jpeg,.png,.webp",
      documentCategory: "general",
      helpText: "Clear colour scan or photo.",
    },
    {
      id: newFieldId(),
      type: "file",
      label: "Proof of address (utility bill or bank letter)",
      required: true,
      accept: ".pdf,.jpg,.jpeg,.png,.webp",
      documentCategory: "general",
    },
    {
      id: newFieldId(),
      type: "file",
      label: "Latest bank statement (CSV or PDF)",
      required: false,
      accept: ".pdf,.csv,.xls,.xlsx",
      documentCategory: "accounts",
      helpText: "CSV preferred so we can categorise lines automatically.",
    },
    {
      id: newFieldId(),
      type: "checkbox",
      label: "I confirm the information is accurate",
      required: true,
    },
  ];
}

export function reorderFields(
  fields: OnboardingField[],
  fromIndex: number,
  toIndex: number,
): OnboardingField[] {
  if (
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= fields.length ||
    toIndex >= fields.length ||
    fromIndex === toIndex
  ) {
    return fields;
  }
  const next = [...fields];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}
