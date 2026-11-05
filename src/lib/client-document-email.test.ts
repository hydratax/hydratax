import { describe, expect, it } from "vitest";
import {
  documentInboxEmail,
  documentInboxKeyFromName,
  parseDocumentInboxKeyFromAddresses,
} from "@/lib/client-document-email";

describe("document inbox addressing", () => {
  it("builds hydratax.uk.{compact} from company name", () => {
    expect(documentInboxKeyFromName("Hydra Retail Ltd")).toBe(
      "hydratax.uk.hydraretail",
    );
    expect(documentInboxKeyFromName("Travel Buds Limited")).toBe(
      "hydratax.uk.travelbuds",
    );
  });

  it("forms a full mailbox on the inbound domain", () => {
    expect(documentInboxEmail("hydratax.uk.hydraretail")).toBe(
      "hydratax.uk.hydraretail@docs.hydratax.uk",
    );
  });

  it("parses inbox key from To addresses", () => {
    expect(
      parseDocumentInboxKeyFromAddresses([
        "Bookkeeping <accounts@example.com>",
        "hydratax.uk.hydraretail@docs.hydratax.uk",
      ]),
    ).toBe("hydratax.uk.hydraretail");
  });
});
