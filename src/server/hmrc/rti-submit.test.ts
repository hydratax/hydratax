import { describe, expect, it } from "vitest";
import { extractRtiErrorMessage, wrapRtiGovTalk } from "@/server/hmrc/rti-submit";
import { buildEpsXml } from "@/server/hmrc/payroll";

describe("extractRtiErrorMessage", () => {
  it("prefers ChRIS body error over generic 3001 wrapper", () => {
    const receipt = `<?xml version='1.0'?>
<GovTalkMessage>
  <GovTalkDetails>
    <GovTalkErrors>
      <Error>
        <Number>3001</Number>
        <Text>The submission of this document has failed due to departmental specific business logic in the Body tag.</Text>
      </Error>
    </GovTalkErrors>
  </GovTalkDetails>
  <Body>
    <ErrorResponse>
      <Error>
        <Number>2022</Number>
        <Text>IRmark not found.</Text>
        <Location>IRmark</Location>
      </Error>
    </ErrorResponse>
  </Body>
</GovTalkMessage>`;
    expect(extractRtiErrorMessage(receipt)).toBe(
      "IRmark not found. @ IRmark (2022)",
    );
  });
});

describe("RTI EPS package", () => {
  it("includes IRheader, IRmark, tax-year schema, and EmpRefs PayeRef without office", () => {
    const eps = buildEpsXml({
      employerPayeRef: "123/AB45678",
      accountsOfficeRef: "123PA00045678",
      taxYear: "26-27",
      periodStart: "2026-08-01",
      periodEnd: "2026-08-31",
      noPaymentForPeriod: true,
      senderId: "123456789012",
      senderPassword: "secret",
      gatewayTest: false,
    });
    expect(eps.bodyInner).toContain("<IRheader>");
    expect(eps.bodyInner).toContain('<IRmark Type="generic">');
    expect(eps.bodyInner).toContain(
      "http://www.govtalk.gov.uk/taxation/PAYE/RTI/EmployerPaymentSummary/26-27/1",
    );
    expect(eps.bodyInner).toContain("<PayeRef>AB45678</PayeRef>");
    expect(eps.bodyInner).not.toContain("<PayeRef>123/AB45678</PayeRef>");
    expect(eps.xml).toContain("HMRC-PAYE-RTI-EPS");
    expect(eps.irmark).toBeTruthy();
  });

  it("wraps with TaxOffice keys", () => {
    const xml = wrapRtiGovTalk({
      className: "HMRC-PAYE-RTI-EPS",
      bodyInner: "<IRenvelope/>",
      payeRef: "123/AB45678",
      senderId: "1",
      senderPassword: "x",
      gatewayTest: true,
    });
    expect(xml).toContain('<Key Type="TaxOfficeNumber">123</Key>');
    expect(xml).toContain('<Key Type="TaxOfficeReference">AB45678</Key>');
  });
});
