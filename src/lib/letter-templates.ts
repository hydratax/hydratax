/** UK practice letter templates — merge with letterhead + client fields. */

export type LetterTemplateKey =
  | "director_confirmation"
  | "income_confirmation"
  | "self_employment_confirmation"
  | "accountancy_reference"
  | "address_confirmation"
  | "mortgage_reference";

export type LetterTemplateDef = {
  key: LetterTemplateKey;
  name: string;
  description: string;
  /** Body with {{tokens}} — practice letterhead wraps this */
  body: string;
};

export type LetterMergeVars = {
  client_name: string;
  company_name: string;
  company_number: string;
  director_name: string;
  tax_year: string;
  period_end: string;
  income_amount: string;
  practice_name: string;
  sender_name: string;
  today: string;
};

export const LETTER_TEMPLATES: LetterTemplateDef[] = [
  {
    key: "director_confirmation",
    name: "Confirmation of director",
    description:
      "Confirms a named individual is a director of the limited company.",
    body: `To whom it may concern,

We act as accountants for {{company_name}} (company number {{company_number}}).

We confirm that {{director_name}} is a director of the company as at {{today}}.

Please contact us if you need any further information.

Yours faithfully,

{{sender_name}}
{{practice_name}}`,
  },
  {
    key: "income_confirmation",
    name: "Confirmation of income",
    description:
      "Confirms earnings / drawings for a tax year (directors or sole traders).",
    body: `To whom it may concern,

We act as accountants for {{client_name}}.

We confirm that, based on the records available to us, {{client_name}}’s income for the tax year {{tax_year}} was approximately {{income_amount}}.

This letter is provided for information only and does not constitute a guarantee of future income.

Yours faithfully,

{{sender_name}}
{{practice_name}}`,
  },
  {
    key: "self_employment_confirmation",
    name: "Self-employment confirmation",
    description: "Confirms the client is self-employed and trading.",
    body: `To whom it may concern,

We act as accountants for {{client_name}}.

We confirm that {{client_name}} is self-employed and has been trading under our engagement. Their accounting year end is {{period_end}}.

Please contact us if you require further details for your due diligence.

Yours faithfully,

{{sender_name}}
{{practice_name}}`,
  },
  {
    key: "accountancy_reference",
    name: "Accountancy reference letter",
    description: "General character / professional reference from the practice.",
    body: `To whom it may concern,

We act as accountants for {{client_name}}{{#company_number}} / {{company_name}} ({{company_number}}){{/company_number}}.

In the course of our professional relationship we have found them to be reliable in providing the information we request for tax and accounts work.

This letter is given in good faith and without liability on the part of this firm.

Yours faithfully,

{{sender_name}}
{{practice_name}}`,
  },
  {
    key: "address_confirmation",
    name: "Confirmation of address",
    description: "Confirms the address we hold on the client file.",
    body: `To whom it may concern,

We act as accountants for {{client_name}}.

We confirm that the address we hold on our records for {{client_name}} is as advised by the client and used for correspondence in connection with their tax and accounts affairs.

Yours faithfully,

{{sender_name}}
{{practice_name}}`,
  },
  {
    key: "mortgage_reference",
    name: "Mortgage / lender reference",
    description: "Income and employment-style confirmation for lenders.",
    body: `To whom it may concern,

We act as accountants for {{client_name}}.

For the tax year {{tax_year}}, based on the information provided to us and returns we have prepared or reviewed, we understand their relevant income to be in the region of {{income_amount}}.

This letter is issued solely for the purpose of a mortgage / finance application and should not be relied upon for any other purpose. We accept no liability to third parties.

Yours faithfully,

{{sender_name}}
{{practice_name}}`,
  },
];

export function mergeLetterBody(
  template: string,
  vars: Partial<LetterMergeVars>,
): string {
  let out = template;
  // Simple {{#company_number}}...{{/company_number}} optional block
  out = out.replace(
    /\{\{#company_number\}\}([\s\S]*?)\{\{\/company_number\}\}/g,
    (_, inner: string) => (vars.company_number ? inner : ""),
  );
  for (const [key, value] of Object.entries(vars)) {
    out = out.replaceAll(`{{${key}}}`, value ?? "");
  }
  return out.replace(/\{\{[a-z_]+\}\}/g, "");
}
