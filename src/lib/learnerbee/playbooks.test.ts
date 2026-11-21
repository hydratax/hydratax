import { describe, expect, it } from "vitest";
import {
  COACH_HOME_ACTIONS,
  PLAYBOOKS,
  getPlaybook,
} from "./playbooks";

describe("learnerbee playbooks", () => {
  it("keeps home suggestions short", () => {
    expect(COACH_HOME_ACTIONS.length).toBeGreaterThan(0);
    expect(COACH_HOME_ACTIONS.length).toBeLessThanOrEqual(6);
  });

  it("resolves every playbook chip", () => {
    for (const action of COACH_HOME_ACTIONS) {
      if (action.kind !== "playbook") continue;
      const book = getPlaybook(action.id);
      expect(book, action.id).toBeTruthy();
      expect(book!.steps.length).toBeGreaterThan(0);
    }
  });

  it("includes SA100 walkthrough", () => {
    expect(PLAYBOOKS.sa100.title).toMatch(/SA100/i);
    expect(PLAYBOOKS.sa100.steps[0]?.href).toContain("desk=sa");
  });
});
