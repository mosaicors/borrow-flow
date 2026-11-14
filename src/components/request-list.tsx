"use client";

import type { RequestStatus } from "@/domain/borrow";
import type { BorrowRequest } from "@/trpc/client";
import { formatLength, formatRange, formatTimestamp } from "./format";

const STATUS_LOOK: Record<RequestStatus, { label: string; className: string }> = {
  pending: { label: "Waiting for answer", className: "bg-amber-100 text-amber-900" },
  accepted: { label: "Accepted", className: "bg-emerald-100 text-emerald-900" },
  declined: { label: "Declined", className: "bg-rose-100 text-rose-900" },
};

export function StatusBadge({ status }: { status: RequestStatus }) {
  const look = STATUS_LOOK[status];
  return (
    <span
      data-status={status}
      className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-medium ${look.className}`}
    >
      {look.label}
    </span>
  );
}

type CardProps = {
  request: BorrowRequest;
  /** Show who sent it (the owner's view). */
  showRequester: boolean;
  /** True right after a live update touched this request, to draw the eye. */
  highlighted: boolean;
  /** Accept/decline buttons, when the viewer may answer. */
  actions?: React.ReactNode;
};

export function RequestCard({ request, showRequester, highlighted, actions }: CardProps) {
  return (
    <li
      data-request-id={request.id}
      className={`rounded-xl border border-stone-200 bg-white p-4 ${highlighted ? "live-flash" : ""}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {showRequester && (
            <p className="text-sm font-semibold text-stone-900">{request.requesterName}</p>
          )}
          <p className={showRequester ? "text-sm text-stone-700" : "text-sm font-medium text-stone-900"}>
            {formatRange(request)}
            <span className="whitespace-nowrap text-stone-500"> · {formatLength(request)}</span>
          </p>
        </div>
        <StatusBadge status={request.status} />
      </div>

      {request.message && <p className="mt-2 text-sm text-stone-600">“{request.message}”</p>}

      {request.autoDeclined && (
        <p className="mt-2 text-sm text-stone-600">
          Those days went to another neighbour, so this request was closed automatically.
        </p>
      )}

      <p className="mt-2 text-xs text-stone-500">
        Sent {formatTimestamp(request.createdAt)}
        {request.decidedAt && ` · answered ${formatTimestamp(request.decidedAt)}`}
      </p>

      {actions && <div className="mt-3 flex gap-2">{actions}</div>}
    </li>
  );
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl border border-dashed border-stone-300 px-4 py-6 text-center text-sm text-stone-600">
      {children}
    </p>
  );
}
