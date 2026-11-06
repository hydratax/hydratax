import { describe, expect, it } from "vitest";
import { emptyBankLedger, type BankLedger } from "@/lib/bank-ledger";
import { summariseForYearEndAccounts } from "@/server/accounts/year-end-from-bank";
import { enrichAccountsDraftFromLedger } from "@/server/accounts/enrich-accounts-from-ledger";

describe("enrichAccountsDraftFromLedger", () => {
  it("builds Note 1 assets, Note 2 parties and a balanced trial balance", () => {
    const draft = summariseForYearEndAccounts(
      [
        {
          dated: "2024-06-01",
          description: "Client fee",
          amountPence: 2007700,
          category: "turnover",
          confidence: "high",
        },
        {
          dated: "2024-06-02",
          description: "Travel",
          amountPence: -145400,
          category: "travel",
          confidence: "high",
        },
      ],
      {
        periodStart: "2023-03-01",
        periodEnd: "2024-02-28",
        openingCashPence: 0,
        shareCapitalPence: 10000,
        retainedBroughtForwardPence: 0,
      },
    );

    const ledger: BankLedger = {
      ...emptyBankLedger(),
      periodStart: "2023-03-01",
      periodEnd: "2024-02-28",
      unpaidShareCapitalPence: 10000,
      assets: [
        {
          id: "a1",
          name: "Office kit",
          class: "fixtures",
          acquiredOn: "2023-06-01",
          costPence: 13500,
          broughtForwardNbvPence: 0,
          method: "reducing_balance",
          ratePercent: 20,
          createdAt: "2023-06-01T00:00:00Z",
        },
      ],
      debtors: [
        {
          id: "d1",
          name: "Trade debtor",
          bucket: "trade",
          broughtForwardPence: 0,
          invoicesPence: 75100,
          receiptsPence: 0,
          closingOverridePence: 75100,
          createdAt: "2024-02-28T00:00:00Z",
        },
      ],
      creditors: [
        {
          id: "c1",
          name: "Accountancy accrual",
          bucket: "accountancy",
          broughtForwardPence: 0,
          billsPence: 46900,
          paymentsPence: 0,
          closingOverridePence: 46900,
          createdAt: "2024-02-28T00:00:00Z",
        },
        {
          id: "c2",
          name: "Other",
          bucket: "other",
          broughtForwardPence: 0,
          billsPence: 234572,
          paymentsPence: 0,
          closingOverridePence: 234572,
          createdAt: "2024-02-28T00:00:00Z",
        },
      ],
    };

    const enriched = enrichAccountsDraftFromLedger(draft, ledger, [], {
      shareCapitalPence: 10000,
    });

    expect(enriched.note1?.fixtures.costCarriedForwardPence).toBe(13500);
    expect(enriched.note1?.total.nbvCarriedForwardPence).toBeGreaterThan(0);
    expect(enriched.note2?.debtors.trade).toBe(75100);
    expect(enriched.note2?.debtors.unpaid_share_capital).toBe(10000);
    expect(enriched.note2?.creditorsWithin.accountancy).toBe(46900);
    expect(enriched.note2?.creditorsWithin.other).toBe(234572);
    expect(enriched.balanceSheet.otherDebtorsPence).toBe(85100);
    expect(enriched.trialBalance?.length).toBeGreaterThan(5);
    const debit = enriched.trialBalance!.reduce((s, r) => s + r.debitPence, 0);
    const credit = enriched.trialBalance!.reduce(
      (s, r) => s + r.creditPence,
      0,
    );
    expect(debit).toBe(credit);
  });
});
