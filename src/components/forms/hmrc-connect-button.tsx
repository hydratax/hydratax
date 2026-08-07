"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { disconnectHmrcAction } from "@/server/actions/hmrc-connect";

export function HmrcConnectButton({
  clientId,
  connected,
}: {
  clientId: string;
  connected: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  if (connected) {
    return (
      <div className="flex items-center gap-2">
        <span className="badge badge-ok">HMRC connected</span>
        <button
          type="button"
          className="btn btn-secondary text-sm"
          disabled={pending}
          onClick={() =>
            start(async () => {
              await disconnectHmrcAction(clientId);
              router.refresh();
            })
          }
        >
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <a
      href={`/api/hmrc/authorize?clientId=${clientId}`}
      className="btn btn-primary text-sm"
    >
      Connect HMRC
    </a>
  );
}
