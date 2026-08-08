import Link from "next/link";
import {
  LegalH2,
  LegalH3,
  LegalShell,
} from "@/components/legal/legal-shell";
import {
  LEGAL_COMPANY,
  LEGAL_CONTACT_EMAIL,
  LEGAL_UPDATED,
  legalTradingAs,
  registeredOfficeLine,
} from "@/lib/legal";

export const metadata = {
  title: "Data Processing Agreement — HydraTax",
  description:
    "HydraTax Data Processing Agreement (DPA) for UK GDPR processing of personal data.",
};

export default function DpaPage() {
  const brand = LEGAL_COMPANY.tradingName;
  const email = LEGAL_CONTACT_EMAIL;
  const processor = legalTradingAs();

  return (
    <LegalShell title="Data Processing Agreement" updated={LEGAL_UPDATED.dpa}>
      <p>
        <strong className="text-ink">{processor}</strong>
        <br />
        Company number: {LEGAL_COMPANY.companyNumber}
        <br />
        Registered office: {registeredOfficeLine()}
      </p>

      <LegalH2>1. About this agreement</LegalH2>
      <p>
        This Data Processing Agreement (&quot;DPA&quot;) forms part of the{" "}
        <Link href="/terms" className="font-semibold text-sea">
          Terms of Service
        </Link>{" "}
        between you (&quot;you&quot;, &quot;Controller&quot;) and{" "}
        {LEGAL_COMPANY.legalName} trading as {brand} (&quot;we&quot;,
        &quot;Processor&quot;) and applies to our processing of Personal Data on
        your behalf when you use the {brand} service (&quot;Service&quot;).
      </p>
      <p>
        It applies automatically when you accept the Terms of Service. No
        counter-signature is required. It is governed by the same law and
        jurisdiction as the Terms of Service (England and Wales).
      </p>
      <p>
        Capitalised terms not defined here have the meanings given in the UK
        GDPR and the Data Protection Act 2018.
      </p>

      <LegalH2>2. Roles, scope and duration</LegalH2>
      <p>
        You are the Controller of the Personal Data you submit to the Service.
        We are the Processor and process the Personal Data only on your
        documented instructions, as set out in the Terms of Service, this DPA,
        and the configuration choices you make within the Service.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[480px] border-collapse text-left text-xs">
          <tbody>
            <tr className="border-b border-line/70">
              <td className="py-2 pr-3 font-semibold text-ink">Subject matter</td>
              <td className="py-2">
                Provision of the {brand} Service: preparation and submission of
                UK tax and Companies House filings (including VAT, Corporation
                Tax / CT600, Self Assessment, PAYE/RTI, confirmation statements
                and annual accounts).
              </td>
            </tr>
            <tr className="border-b border-line/70">
              <td className="py-2 pr-3 font-semibold text-ink">Duration</td>
              <td className="py-2">
                For as long as you have an account with us, plus the
                post-termination retention periods set out in §11 below.
              </td>
            </tr>
            <tr className="border-b border-line/70">
              <td className="py-2 pr-3 font-semibold text-ink">
                Nature and purpose
              </td>
              <td className="py-2">
                Storage, retrieval, transformation, generation of statutory
                documents, transmission to HMRC and Companies House on your
                instruction, customer support, and operational analytics.
              </td>
            </tr>
            <tr className="border-b border-line/70">
              <td className="py-2 pr-3 font-semibold text-ink">
                Types of Personal Data
              </td>
              <td className="py-2">
                Identification and contact data; company-officer data; financial
                or payroll data attached to a named individual where applicable;
                account credentials and authentication data; support
                correspondence; submission credentials.
              </td>
            </tr>
            <tr>
              <td className="py-2 pr-3 font-semibold text-ink">
                Categories of Data Subjects
              </td>
              <td className="py-2">
                You; colleagues authorised to use the account; directors,
                secretaries, employees and members of the companies you file
                for; individuals named in support correspondence.
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <LegalH2>3. Your obligations as Controller</LegalH2>
      <ul className="list-disc space-y-1 pl-5">
        <li>
          You confirm that your collection and provision of Personal Data to the
          Service complies with applicable data protection law and that you have
          the legal basis to instruct us to process it.
        </li>
        <li>
          You are responsible for the lawfulness, accuracy and completeness of
          the Personal Data you submit and for responding to Data Subjects,
          with the assistance described in §8.
        </li>
        <li>
          You retain control over your account configuration, the data you
          upload, and the timing and content of any submission to HMRC or
          Companies House.
        </li>
      </ul>

      <LegalH2>4. Our obligations as Processor</LegalH2>
      <p>We will:</p>
      <ul className="list-disc space-y-1 pl-5">
        <li>
          Process Personal Data only on your documented instructions, including
          in respect of transfers outside the United Kingdom, except where
          required by law (in which case we will inform you unless prohibited).
        </li>
        <li>
          Ensure that personnel authorised to process Personal Data are bound by
          appropriate confidentiality obligations.
        </li>
        <li>
          Implement and maintain appropriate technical and organisational
          measures designed to protect Personal Data (§6).
        </li>
        <li>Engage sub-processors only in accordance with §7.</li>
        <li>
          Assist you with your obligations under §8 and §9 of this DPA.
        </li>
        <li>
          Make available information necessary to demonstrate compliance,
          principally through this DPA and our{" "}
          <Link href="/legal/sub-processors" className="font-semibold text-sea">
            Sub-processor List
          </Link>
          .
        </li>
        <li>
          At your choice, delete or return Personal Data at the end of the
          agreement (§11).
        </li>
      </ul>

      <LegalH2>5. Confidentiality</LegalH2>
      <p>
        We will treat all Personal Data as confidential and will limit access to
        those of our personnel and sub-processor personnel who need access to
        perform the Service. Each such person is bound by a written
        confidentiality obligation of no less protection than this DPA imposes
        on us.
      </p>

      <LegalH2>6. Security measures</LegalH2>
      <p>
        We implement appropriate technical and organisational measures to
        protect Personal Data against accidental or unlawful destruction, loss,
        alteration, unauthorised disclosure or access. Measures include
        encryption in transit, restricted production access, monitored hosting,
        regular backups and time-bound retention of authentication credentials.
      </p>
      <p>
        We may update these measures from time to time provided that the level
        of protection is not materially decreased.
      </p>

      <LegalH2>7. Sub-processors</LegalH2>
      <p>
        You provide general authorisation for us to engage the sub-processors
        listed at{" "}
        <Link href="/legal/sub-processors" className="font-semibold text-sea">
          /legal/sub-processors
        </Link>{" "}
        to process Personal Data in connection with the Service.
      </p>
      <p>
        We will give you at least 14 days&apos; advance notice of any intended
        addition or replacement of a sub-processor by updating the published
        list. If you object on legitimate data-protection grounds within 14
        days, and the affected service cannot reasonably be provided without the
        new sub-processor, you may terminate the affected portion of the Service
        and receive a refund for any unused prepaid period.
      </p>
      <p>
        Each sub-processor is bound by a written agreement that imposes data
        protection obligations equivalent in substance to those in this DPA. We
        remain responsible to you for the performance of each sub-processor&apos;s
        obligations.
      </p>

      <LegalH2>8. Assistance with data subject rights</LegalH2>
      <p>
        Taking into account the nature of the processing, we will assist you
        with appropriate technical and organisational measures, insofar as
        possible, to fulfil your obligation to respond to requests from Data
        Subjects exercising their rights under the UK GDPR. For data export,
        rectification or other rights requests, contact{" "}
        <a className="font-semibold text-sea" href={`mailto:${email}`}>
          {email}
        </a>
        .
      </p>

      <LegalH2>9. Assistance with breach notification, DPIA and prior consultation</LegalH2>
      <p>
        We will notify you without undue delay, and in any event within 72 hours
        of becoming aware, of any Personal Data Breach affecting your data, and
        provide information reasonably required for you to comply with Articles
        33 and 34 of the UK GDPR.
      </p>
      <p>
        Taking into account the nature of the processing and the information
        available to us, we will provide reasonable assistance with any DPIA and
        any prior consultation with the ICO that you are required to carry out
        in respect of the Service.
      </p>

      <LegalH2>10. Audit</LegalH2>
      <p>
        You may verify our compliance with this DPA by reviewing this DPA, the
        Sub-processor List, and any answers we provide to specific written
        questions sent to{" "}
        <a className="font-semibold text-sea" href={`mailto:${email}`}>
          {email}
        </a>
        . As a self-serve subscription product we do not accommodate on-site
        audits or third-party audit firms at the standard subscription tier.
      </p>

      <LegalH2>11. End of agreement</LegalH2>
      <p>
        On termination, you may request an export of your data by emailing{" "}
        <a className="font-semibold text-sea" href={`mailto:${email}`}>
          {email}
        </a>{" "}
        before instructing deletion. Within 30 days of the later of (a) your
        written instruction to delete and (b) account termination, we will
        delete or anonymise Personal Data held in active production systems.
        Backups containing Personal Data are deleted on the next backup-cycle
        rotation following the active deletion.
      </p>
      <p>
        We will retain the minimum Personal Data required by law (typically
        filing records for the periods set out in Privacy Policy §2.4) and
        confirm completion in writing.
      </p>

      <LegalH2>12. International transfers</LegalH2>
      <p>
        Where we transfer Personal Data outside the United Kingdom, we rely on
        the UK adequacy regulations (for transfers to EEA countries) or on the
        UK International Data Transfer Agreement / UK Addendum to the EU
        Standard Contractual Clauses (for transfers to other third countries).
        Current destinations and mechanisms are listed at{" "}
        <Link href="/legal/sub-processors" className="font-semibold text-sea">
          /legal/sub-processors
        </Link>
        .
      </p>

      <LegalH2>13. Liability</LegalH2>
      <p>
        Our liability under this DPA is subject to the limitations and
        exclusions set out in the Terms of Service §5, except to the extent that
        such limitation is prohibited by applicable law.
      </p>

      <LegalH2>14. Changes to this DPA</LegalH2>
      <p>
        We may update this DPA from time to time. Where a change materially
        affects your rights, we will notify you in advance and you may terminate
        the Service for that reason within 30 days of the notice. Continued use
        of the Service after the effective date constitutes acceptance.
      </p>

      <LegalH2>15. Contact</LegalH2>
      <p>
        For questions about this DPA, our processing of your data, or to make a
        request under any of the sections above, contact{" "}
        <a className="font-semibold text-sea" href={`mailto:${email}`}>
          {email}
        </a>
        .
      </p>
      <p>
        {LEGAL_COMPANY.legalName}
        <br />
        Trading as {brand}
        <br />
        Company number: {LEGAL_COMPANY.companyNumber}
        <br />
        Registered office: {registeredOfficeLine()}
      </p>

      <LegalH3>Related</LegalH3>
      <ul className="list-disc space-y-1 pl-5">
        <li>
          <Link href="/terms" className="font-semibold text-sea">
            Terms of Service
          </Link>
        </li>
        <li>
          <Link href="/terms#privacy" className="font-semibold text-sea">
            Privacy Policy
          </Link>
        </li>
        <li>
          <Link href="/legal/sub-processors" className="font-semibold text-sea">
            Sub-processors
          </Link>
        </li>
      </ul>
    </LegalShell>
  );
}
