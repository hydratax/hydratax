import { digitalIncomeRecordSchema } from "@/server/money/schemas";
import { penceToPounds } from "@/server/money/pence";
import { hmrcFetch } from "./client";
import type { FraudHeaderMap } from "./fraud-headers";
import { z } from "zod";

export function buildItsaPeriodicPayload(
  record: z.infer<typeof digitalIncomeRecordSchema>,
) {
  const validated = digitalIncomeRecordSchema.parse(record);
  return {
    periodDates: {
      periodStartDate: validated.periodStart,
      periodEndDate: validated.periodEnd,
    },
    periodIncome: {
      turnover: Number(penceToPounds(validated.turnoverPence)),
      other: Number(penceToPounds(validated.otherIncomePence)),
    },
    periodExpenses: {
      consolidatedExpenses: Number(penceToPounds(validated.expensesPence)),
    },
  };
}

export async function submitItsaPeriodicUpdate(opts: {
  nino: string;
  businessId: string;
  taxYear: string;
  record: z.infer<typeof digitalIncomeRecordSchema>;
  accessToken: string;
  fraudHeaders: FraudHeaderMap;
  actorId: string;
  clientId: string;
  practiceId?: string;
}) {
  const body = buildItsaPeriodicPayload(opts.record);

  return hmrcFetch({
    method: "PUT",
    path: `/individuals/business/self-employment/${opts.nino}/${opts.businessId}/period/${opts.taxYear}`,
    accessToken: opts.accessToken,
    fraudHeaders: opts.fraudHeaders,
    accept: "application/vnd.hmrc.2.0+json",
    body,
    actorId: opts.actorId,
    clientId: opts.clientId,
    practiceId: opts.practiceId,
    action: "hmrc.itsa.periodic",
  });
}

/** Demo submit when HMRC credentials are absent. */
export function mockItsaSubmit(record: z.infer<typeof digitalIncomeRecordSchema>) {
  const payload = buildItsaPeriodicPayload(record);
  return {
    ok: true,
    status: 200,
    correlationId: `demo-sa-${Date.now()}`,
    payload,
  };
}
