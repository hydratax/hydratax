import { describe, expect, it } from "vitest";
import {
  comparativesFromCt600Figures,
  extractComparativesFromFiledAccountsHtml,
} from "@/server/accounts/extract-filed-comparatives";

describe("extractComparativesFromFiledAccountsHtml", () => {
  it("reads micro-entity balance sheet tags into pence", () => {
    const html = `
      <ix:nonFraction name="uk-core:FixedAssets" contextRef="icur1" unitRef="GBP" decimals="0">69</ix:nonFraction>
      <ix:nonFraction name="uk-core:CurrentAssets" contextRef="icur1" unitRef="GBP" decimals="0">2,050</ix:nonFraction>
      <ix:nonFraction name="uk-core:CashBankOnHand" contextRef="icur1" unitRef="GBP" decimals="0">1,950</ix:nonFraction>
      <ix:nonFraction name="uk-core:Creditors" contextRef="icur1" unitRef="GBP" decimals="0">1,295</ix:nonFraction>
      <ix:nonFraction name="uk-core:CalledUpShareCapital" contextRef="icur1" unitRef="GBP" decimals="0">100</ix:nonFraction>
      <ix:nonFraction name="uk-core:ProfitLossAccountReserve" contextRef="icur1" unitRef="GBP" decimals="0">724</ix:nonFraction>
    `;
    const c = extractComparativesFromFiledAccountsHtml(html);
    expect(c.fixedAssetsPence).toBe(6900);
    expect(c.cashAtBankPence).toBe(195000);
    expect(c.otherDebtorsPence).toBe(10000); // 2050 - 1950
    expect(c.creditorsWithinOneYearPence).toBe(129500);
    expect(c.shareCapitalPence).toBe(10000);
    expect(c.profitAndLossReservePence).toBe(72400);
  });

  it("prefers current-year context and splits Equity using unpaid share capital", () => {
    const html = `
      <ix:nonFraction name="uk-core:FixedAssets" contextRef="icur1" unitRef="GBP" decimals="0">86</ix:nonFraction>
      <ix:nonFraction name="uk-core:FixedAssets" contextRef="iprev8" unitRef="GBP" decimals="0">108</ix:nonFraction>
      <ix:nonFraction name="uk-core:CurrentAssets" contextRef="icur1" unitRef="GBP" decimals="0">2,116</ix:nonFraction>
      <ix:nonFraction name="uk-core:CurrentAssets" contextRef="iprev8" unitRef="GBP" decimals="0">2,898</ix:nonFraction>
      <ix:nonFraction name="uk-core:Creditors" contextRef="icur9" unitRef="GBP" decimals="0">1,647</ix:nonFraction>
      <ix:nonFraction name="uk-core:Creditors" contextRef="iprev10" unitRef="GBP" decimals="0">2,851</ix:nonFraction>
      <ix:nonFraction name="uk-core:CalledUpShareCapitalNotPaidNotExpressedAsCurrentAsset" contextRef="icur1" unitRef="GBP" decimals="0">100</ix:nonFraction>
      <ix:nonFraction name="uk-core:Equity" contextRef="icur1" unitRef="GBP" decimals="0">655</ix:nonFraction>
      <ix:nonFraction name="uk-core:Equity" contextRef="iprev8" unitRef="GBP" decimals="0">255</ix:nonFraction>
    `;
    const c = extractComparativesFromFiledAccountsHtml(html);
    expect(c.fixedAssetsPence).toBe(8600);
    expect(c.cashAtBankPence).toBe(211600);
    expect(c.creditorsWithinOneYearPence).toBe(164700);
    expect(c.shareCapitalPence).toBe(10000);
    expect(c.profitAndLossReservePence).toBe(55500);
  });

  it("can read the prior column when the filing is for the current period", () => {
    const html = `
      <ix:nonFraction name="uk-core:FixedAssets" contextRef="icur1" unitRef="GBP" decimals="0">86</ix:nonFraction>
      <ix:nonFraction name="uk-core:FixedAssets" contextRef="iprev8" unitRef="GBP" decimals="0">108</ix:nonFraction>
      <ix:nonFraction name="uk-core:Equity" contextRef="icur1" unitRef="GBP" decimals="0">655</ix:nonFraction>
      <ix:nonFraction name="uk-core:Equity" contextRef="iprev8" unitRef="GBP" decimals="0">255</ix:nonFraction>
    `;
    const c = extractComparativesFromFiledAccountsHtml(html, {
      preferPriorColumn: true,
    });
    expect(c.fixedAssetsPence).toBe(10800);
    expect(c.profitAndLossReservePence).toBe(25500);
  });
});

describe("comparativesFromCt600Figures", () => {
  it("maps CT600 draft figures", () => {
    const c = comparativesFromCt600Figures({
      tangibleAssetsPence: 6879,
      cashAtBankPence: 194967,
      debtorsPence: 10000,
      creditorsPence: 125528,
      calledUpShareCapitalPence: 10000,
      profitAndLossAccountPence: 76318,
      turnoverPence: 2390506,
      administrativeExpensesPence: 100,
    });
    expect(c.fixedAssetsPence).toBe(6879);
    expect(c.cashAtBankPence).toBe(194967);
    expect(c.turnoverPence).toBe(2390506);
  });
});
