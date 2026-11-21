import { describe, expect, it } from "vitest";
import {
  humanizeHmrcFailure,
  hmrcOauthErrorToResult,
  messageForHmrcResult,
} from "./hmrc-user-messages";

describe("messageForHmrcResult", () => {
  it("maps known codes", () => {
    expect(messageForHmrcResult("app_credentials_invalid")).toMatch(
      /login details/i,
    );
    expect(messageForHmrcResult("not_authorised_by_client")).toMatch(
      /not authorised by the client/i,
    );
    expect(messageForHmrcResult("invalid_vrn")).toMatch(/VAT number/i);
  });
});

describe("humanizeHmrcFailure", () => {
  it("turns client_id invalid into plain English", () => {
    expect(
      humanizeHmrcFailure(
        '{"error":"invalid_request","error_description":"client_id is invalid"}',
      ),
    ).toMatch(/login details/i);
  });

  it("does not echo JSON dumps", () => {
    expect(humanizeHmrcFailure('{"foo":1,"bar":2}')).not.toContain("{");
  });
});

describe("hmrcOauthErrorToResult", () => {
  it("maps access_denied", () => {
    expect(hmrcOauthErrorToResult("access_denied")).toBe("access_denied");
  });
});
