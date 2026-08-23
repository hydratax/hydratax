import { emptySa100Draft } from "../src/lib/sa100/schema";
import { calculateSa302 } from "../src/lib/sa100/calculate";

const d = emptySa100Draft({
  hasEmployment: true,
  employments: [
    {
      employerName: "Acme",
      payeRef: "123/AB",
      pay: 45000,
      taxTakenOff: 6500,
      tips: 0,
      benefits: 0,
    },
  ],
  hasSelfEmployment: true,
  seTurnover: 20000,
  seExpenses: 5000,
  interestUntaxedUk: 800,
  dividendsUk: 2000,
  giftAid: 100,
  declarationAccepted: true,
});

const c = calculateSa302(d);
console.log({
  totalIncome: c.totalIncome,
  incomeTax: c.incomeTax,
  class4Nic: c.class4Nic,
  amountDue: c.amountDue,
  refundDue: c.refundDue,
});
