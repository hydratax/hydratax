import { describe, expect, it } from "vitest";
import {
  locationFromSlug,
  locationHubPath,
  locationSlug,
  resolveLocationFilter,
} from "./company-directory";

describe("location hub helpers", () => {
  it("builds stable slugs", () => {
    expect(locationSlug("London")).toBe("london");
    expect(locationHubPath("Manchester")).toBe("/companies/in/manchester");
  });

  it("resolves known SEO hubs from slug or query", () => {
    expect(locationFromSlug("london")).toBe("London");
    expect(locationFromSlug("manchester")).toBe("Manchester");
    expect(resolveLocationFilter("birmingham")).toBe("Birmingham");
    expect(resolveLocationFilter("")).toBeNull();
  });
});
