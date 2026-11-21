import { describe, expect, it } from "vitest";
import { categoriesNeedingVatAllocate } from "./vat-box-allocate";

describe("categoriesNeedingVatAllocate", () => {
  it("lists heads still on Auto", () => {
    expect(
      categoriesNeedingVatAllocate(
        ["turnover", "finance_costs", "turnover", "consultancy"],
        {
          turnover: "sales_standard",
          finance_costs: "default",
        },
      ),
    ).toEqual(["finance_costs", "consultancy"]);
  });

  it("returns empty when every head is allocated", () => {
    expect(
      categoriesNeedingVatAllocate(["turnover", "admin_expenses"], {
        turnover: "sales_standard",
        admin_expenses: "purchases_standard",
      }),
    ).toEqual([]);
  });
});
