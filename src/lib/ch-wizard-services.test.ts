import { describe, expect, it } from "vitest";
import { getChService } from "@/lib/ch-services";

describe("Companies House wizard services", () => {
  it("registers PSC and share allotment services", () => {
    expect(getChService("notify-psc")?.id).toBe("notify-psc");
    expect(getChService("change-psc")?.id).toBe("change-psc");
    expect(getChService("cease-psc")?.id).toBe("cease-psc");
    expect(getChService("return-of-allotment")?.id).toBe("return-of-allotment");
  });

  it("change-of-name requires resolution acknowledgement", () => {
    const service = getChService("change-of-name");
    expect(
      service?.formFields.some((f) => f.name === "resolutionAck" && f.required),
    ).toBe(true);
  });

  it("appoint-director requires structured identity fields", () => {
    const service = getChService("appoint-director");
    const required = service!.formFields.filter((f) => f.required).map((f) => f.name);
    expect(required).toEqual(
      expect.arrayContaining([
        "forename",
        "surname",
        "personalCode",
        "consentToAct",
        "residentialAddress",
      ]),
    );
  });
});
