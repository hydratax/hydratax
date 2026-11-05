import {
  createEmptyField,
  defaultOnboardingFields,
  newFieldId,
  type OnboardingField,
} from "@/lib/onboarding-forms";

export type StandardFormKey =
  | "client_onboarding"
  | "bank_statements_pack"
  | "id_aml_pack"
  | "year_end_info";

export type StandardFormDef = {
  key: StandardFormKey;
  name: string;
  description: string;
  fields: () => OnboardingField[];
};

export const STANDARD_FORMS: StandardFormDef[] = [
  {
    key: "client_onboarding",
    name: "New client onboarding",
    description:
      "Contact details, entity type, ID, proof of address, and bank export.",
    fields: () => defaultOnboardingFields(),
  },
  {
    key: "bank_statements_pack",
    name: "Bank statements pack",
    description: "Ask the client to upload statements or CSV for the period.",
    fields: () => [
      {
        id: newFieldId(),
        type: "section",
        label: "Bank statements",
      },
      {
        id: newFieldId(),
        type: "short_text",
        label: "Bank name(s)",
        required: true,
      },
      {
        id: newFieldId(),
        type: "date",
        label: "Period start",
        required: true,
      },
      {
        id: newFieldId(),
        type: "date",
        label: "Period end",
        required: true,
      },
      {
        id: newFieldId(),
        type: "file",
        label: "Bank statement PDF or CSV",
        required: true,
        accept: ".pdf,.csv,.xls,.xlsx",
        documentCategory: "accounts",
        helpText: "CSV preferred for automatic categorisation.",
      },
      {
        id: newFieldId(),
        type: "file",
        label: "Second account (optional)",
        required: false,
        accept: ".pdf,.csv,.xls,.xlsx",
        documentCategory: "accounts",
      },
      {
        id: newFieldId(),
        type: "checkbox",
        label: "I confirm these cover all business accounts for the period",
        required: true,
      },
    ],
  },
  {
    key: "id_aml_pack",
    name: "ID & AML documents",
    description: "Photo ID and proof of address for AML checks.",
    fields: () => [
      {
        id: newFieldId(),
        type: "section",
        label: "Identity",
      },
      {
        id: newFieldId(),
        type: "short_text",
        label: "Full legal name",
        required: true,
      },
      {
        id: newFieldId(),
        type: "file",
        label: "Photo ID (passport or driving licence)",
        required: true,
        accept: ".pdf,.jpg,.jpeg,.png,.webp",
        documentCategory: "general",
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
        type: "checkbox",
        label: "I confirm these documents are current and accurate",
        required: true,
      },
    ],
  },
  {
    key: "year_end_info",
    name: "Year-end information request",
    description: "Checklist of papers needed to prepare accounts.",
    fields: (): OnboardingField[] => {
      const fields: OnboardingField[] = [
        {
          id: newFieldId(),
          type: "section",
          label: "Year-end pack",
        },
        {
          id: newFieldId(),
          type: "date",
          label: "Accounting year end",
          required: true,
        },
        {
          id: newFieldId(),
          type: "file",
          label: "Bank statements for the year",
          required: true,
          accept: ".pdf,.csv,.xls,.xlsx",
          documentCategory: "accounts",
        },
        {
          id: newFieldId(),
          type: "file",
          label: "Sales invoices / cash book",
          required: false,
          accept: ".pdf,.xls,.xlsx,.csv",
          documentCategory: "accounts",
        },
        {
          id: newFieldId(),
          type: "file",
          label: "Purchase invoices / expenses",
          required: false,
          accept: ".pdf,.xls,.xlsx,.csv",
          documentCategory: "accounts",
        },
        {
          id: newFieldId(),
          type: "long_text",
          label: "Loans, HP, or director transactions to note",
          required: false,
        },
        {
          id: newFieldId(),
          type: "short_text",
          label: "Stock / WIP at year end (if applicable)",
          required: false,
        },
        {
          ...createEmptyField("checkbox"),
          label:
            "I confirm the information is complete to the best of my knowledge",
          required: true,
        },
      ];
      return fields;
    },
  },
];
