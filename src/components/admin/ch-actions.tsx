"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  markChRequestPaid,
  updateChRequestStatus,
} from "@/server/actions/ch-requests";

export function AdminChActions({
  requestId,
  paymentStatus,
  status,
}: {
  requestId: string;
  paymentStatus: string;
  status: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <div className="flex flex-wrap gap-1">
      {paymentStatus !== "paid" && (
        <button
          type="button"
          disabled={pending}
          className="btn btn-secondary text-xs"
          onClick={() =>
            start(async () => {
              await markChRequestPaid(requestId);
              router.refresh();
            })
          }
        >
          Mark paid
        </button>
      )}
      {status !== "in_progress" && (
        <button
          type="button"
          disabled={pending}
          className="btn btn-secondary text-xs"
          onClick={() =>
            start(async () => {
              await updateChRequestStatus(requestId, "in_progress");
              router.refresh();
            })
          }
        >
          Start
        </button>
      )}
      {status !== "completed" && (
        <button
          type="button"
          disabled={pending}
          className="btn btn-secondary text-xs"
          onClick={() =>
            start(async () => {
              await updateChRequestStatus(requestId, "completed");
              router.refresh();
            })
          }
        >
          Complete
        </button>
      )}
    </div>
  );
}
