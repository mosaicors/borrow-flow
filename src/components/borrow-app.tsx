"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { MAX_BORROW_DAYS } from "@/domain/borrow";
import { type IsoDay, daysInRange, todayIso } from "@/domain/dates";
import { type PickProblem, type Selection, pickDay } from "@/domain/selection";
import type { LiveUpdate } from "@/server/routers/app";
import { DEFAULT_USER_ID, DEMO_ITEM_ID } from "@/shared";
import { type BorrowRequest, type Item, type Neighbour, TRPCProvider, trpc } from "@/trpc/client";
import { AvailabilityCalendar } from "./availability-calendar";
import { formatLength, formatRange } from "./format";
import { EmptyState, RequestCard } from "./request-list";

const PICK_PROBLEMS: Record<PickProblem, string> = {
  CROSSES_BOOKED: "That period includes a booked day, so the selection started over.",
  TOO_LONG: `You can borrow for up to ${MAX_BORROW_DAYS} days, so the selection started over.`,
};

/** Reads who we are browsing as from `?as=` and scopes all data to that user. */
export function BorrowApp() {
  const userId = useSearchParams().get("as") ?? DEFAULT_USER_ID;
  return (
    <TRPCProvider key={userId} userId={userId}>
      <ItemPage userId={userId} />
    </TRPCProvider>
  );
}

/** A short sentence for the live notice, or null when the viewer caused the change. */
function describeUpdate(update: LiveUpdate, viewerId: string): string | null {
  if (update.type !== "request") return null;
  const { request, change } = update;
  const period = formatRange(request);

  if (request.requesterId === viewerId) {
    if (change === "accepted") return `Your request for ${period} was accepted.`;
    if (change === "declined") {
      return request.autoDeclined
        ? `Your request for ${period} was closed: the days went to another neighbour.`
        : `Your request for ${period} was declined.`;
    }
    return null;
  }
  if (change === "created") return `${request.requesterName} asked to borrow for ${period}.`;
  if (request.autoDeclined) {
    return `${request.requesterName}'s request for ${period} was closed automatically.`;
  }
  return null;
}

function ItemPage({ userId }: { userId: string }) {
  const itemId = DEMO_ITEM_ID;
  const utils = trpc.useUtils();
  const users = trpc.users.list.useQuery();
  const item = trpc.item.get.useQuery({ itemId });
  const booked = trpc.item.bookedDays.useQuery({ itemId });

  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const knownUser = users.data?.some((user) => user.id === userId) ?? false;

  const live = trpc.requests.onChange.useSubscription(
    { itemId },
    {
      enabled: knownUser,
      onData(update) {
        void utils.item.bookedDays.invalidate();
        if (update.type !== "request") return;
        void utils.requests.mine.invalidate();
        void utils.requests.incoming.invalidate();
        setHighlightedId(update.request.id);
        const text = describeUpdate(update, userId);
        if (text) setNotice(text);
      },
    },
  );

  useEffect(() => {
    if (!highlightedId) return;
    const timer = setTimeout(() => setHighlightedId(null), 2_500);
    return () => clearTimeout(timer);
  }, [highlightedId]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 8_000);
    return () => clearTimeout(timer);
  }, [notice]);

  const bookedDays = useMemo(() => new Set(booked.data ?? []), [booked.data]);
  const isOwner = item.data?.owner.id === userId;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-16 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-stone-200 py-5">
        <div className="flex items-center gap-3">
          <span className="text-base font-semibold tracking-tight text-stone-900">
            Neighbour lending
          </span>
          <LiveIndicator status={knownUser ? live.status : "idle"} />
        </div>
        <UserSwitcher users={users.data ?? []} currentId={userId} ownerId={item.data?.owner.id} />
      </header>

      <div aria-live="polite" className="min-h-0">
        {notice && (
          <p
            data-testid="live-notice"
            className="live-flash mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950"
          >
            <span className="font-semibold">Just now:</span> {notice}
          </p>
        )}
      </div>

      {users.data && !knownUser ? (
        <EmptyStatePage>
          Nobody called “{userId}” lives here. Pick a neighbour in the top right corner.
        </EmptyStatePage>
      ) : item.error ? (
        <EmptyStatePage>
          The item could not be loaded. Check that the API process is running, then reload.
        </EmptyStatePage>
      ) : !item.data ? (
        <EmptyStatePage>Loading…</EmptyStatePage>
      ) : isOwner ? (
        <OwnerView item={item.data} bookedDays={bookedDays} highlightedId={highlightedId} />
      ) : (
        <NeighbourView item={item.data} bookedDays={bookedDays} highlightedId={highlightedId} />
      )}
    </div>
  );
}

function EmptyStatePage({ children }: { children: React.ReactNode }) {
  return <p className="py-24 text-center text-sm text-stone-600">{children}</p>;
}

function LiveIndicator({ status }: { status: "idle" | "connecting" | "pending" | "error" }) {
  const look = {
    idle: { dot: "bg-stone-300", label: "Not connected" },
    connecting: { dot: "bg-amber-500", label: "Connecting" },
    pending: { dot: "bg-emerald-600", label: "Live" },
    error: { dot: "bg-rose-600", label: "Offline" },
  }[status];

  return (
    <span
      data-testid="live-indicator"
      data-status={status}
      title="WebSocket connection to the API"
      className="inline-flex items-center gap-1.5 rounded-full border border-stone-200 bg-white px-2.5 py-1 text-xs font-medium text-stone-700"
    >
      <span aria-hidden className={`h-2 w-2 rounded-full ${look.dot}`} />
      {look.label}
    </span>
  );
}

function UserSwitcher({
  users,
  currentId,
  ownerId,
}: {
  users: Neighbour[];
  currentId: string;
  ownerId: string | undefined;
}) {
  return (
    <nav aria-label="Browse as" className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-stone-500">Browsing as</span>
      {users.map((user) => {
        const active = user.id === currentId;
        return (
          <Link
            key={user.id}
            href={`/?as=${user.id}`}
            aria-current={active ? "page" : undefined}
            className={`rounded-full px-3 py-1.5 font-medium transition-colors ${
              active
                ? "bg-stone-900 text-white"
                : "border border-stone-200 bg-white text-stone-700 hover:bg-stone-100"
            }`}
          >
            {user.name}
            {user.id === ownerId && <span className="font-normal opacity-70"> · owner</span>}
          </Link>
        );
      })}
    </nav>
  );
}

function ItemSummary({ item, isOwner }: { item: Item; isOwner: boolean }) {
  return (
    <section className="flex gap-4">
      <div
        aria-hidden
        className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-800"
      >
        <svg viewBox="0 0 64 64" className="h-11 w-11" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <rect x="8" y="16" width="32" height="15" rx="4" />
          <rect x="40" y="19" width="9" height="9" rx="1.5" />
          <path d="M49 23.5h10" />
          <path d="M16 31l-2 17h12l2-17" />
          <rect x="10" y="48" width="20" height="7" rx="2" />
        </svg>
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wide text-stone-500">{item.category}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-stone-900">{item.title}</h1>
        <p className="mt-1 text-sm text-stone-600">
          {isOwner ? "Your item" : `Lent by ${item.owner.name}`} · {item.owner.street}
        </p>
        <p className="mt-3 max-w-prose text-sm leading-6 text-stone-700">{item.description}</p>
      </div>
    </section>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-5">
      <h2 className="text-base font-semibold text-stone-900">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

type ViewProps = {
  item: Item;
  bookedDays: ReadonlySet<IsoDay>;
  highlightedId: string | null;
};

function NeighbourView({ item, bookedDays, highlightedId }: ViewProps) {
  const utils = trpc.useUtils();
  const today = todayIso();
  const mine = trpc.requests.mine.useQuery({ itemId: item.id });

  const [picked, setPicked] = useState<Selection>(null);
  const [pickProblem, setPickProblem] = useState<PickProblem | null>(null);
  const [message, setMessage] = useState("");

  // If someone else gets the days while we are choosing, drop the selection.
  const selection = useMemo(() => {
    if (!picked) return null;
    const range = { startDate: picked.startDate, endDate: picked.endDate ?? picked.startDate };
    return daysInRange(range).some((day) => bookedDays.has(day)) ? null : picked;
  }, [picked, bookedDays]);

  const create = trpc.requests.create.useMutation({
    onSuccess() {
      setPicked(null);
      setMessage("");
      void utils.requests.mine.invalidate();
    },
  });

  const requestedDays = useMemo(() => {
    const pending = (mine.data ?? []).filter((request) => request.status === "pending");
    return new Set(pending.flatMap((request) => daysInRange(request)));
  }, [mine.data]);

  const range = selection && {
    startDate: selection.startDate,
    endDate: selection.endDate ?? selection.startDate,
  };

  function handlePickDay(day: IsoDay) {
    const result = pickDay(selection, day, bookedDays);
    setPicked(result.selection);
    setPickProblem(result.problem);
    create.reset();
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!range) return;
    create.mutate({ itemId: item.id, ...range, message });
  }

  return (
    <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_24rem]">
      <div className="space-y-8">
        <ItemSummary item={item} isOwner={false} />
        <Panel title="When is it free?">
          <AvailabilityCalendar
            today={today}
            bookedDays={bookedDays}
            requestedDays={requestedDays}
            selection={selection}
            onPickDay={handlePickDay}
          />
        </Panel>
      </div>

      <div className="space-y-8">
        <Panel title="Ask to borrow">
          <form onSubmit={handleSubmit} className="space-y-4">
            {range ? (
              <div className="flex items-start justify-between gap-3 rounded-xl bg-emerald-50 px-4 py-3">
                <p className="text-sm text-emerald-950" data-testid="selected-range">
                  <span className="font-semibold">{formatRange(range)}</span>
                  <span className="block text-emerald-900/80">
                    {formatLength(range)}
                    {selection?.endDate === null && " · pick a later day to borrow for longer"}
                  </span>
                </p>
                <button
                  type="button"
                  onClick={() => setPicked(null)}
                  className="text-sm font-medium text-emerald-900 underline-offset-2 hover:underline"
                >
                  Clear
                </button>
              </div>
            ) : (
              <p className="rounded-xl bg-stone-100 px-4 py-3 text-sm text-stone-700">
                Pick a free day in the calendar. Pick a second day to borrow for longer.
              </p>
            )}

            {pickProblem && !create.error && (
              <p className="text-sm text-amber-800">{PICK_PROBLEMS[pickProblem]}</p>
            )}

            <label className="block">
              <span className="text-sm font-medium text-stone-800">
                Message to {item.owner.name} <span className="font-normal text-stone-500">(optional)</span>
              </span>
              <textarea
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                maxLength={280}
                rows={3}
                placeholder="What do you need it for?"
                className="mt-1.5 block w-full resize-none rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 placeholder:text-stone-400 focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-700/20"
              />
            </label>

            {create.error && (
              <p role="alert" className="text-sm text-rose-700">
                {create.error.data?.rule || create.error.data?.code === "UNAUTHORIZED"
                  ? create.error.message
                  : "The request could not be sent. Please try again."}
              </p>
            )}

            <button
              type="submit"
              disabled={!range || create.isPending}
              className="w-full rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-stone-300"
            >
              {create.isPending ? "Sending…" : "Send borrow request"}
            </button>
          </form>
        </Panel>

        <section>
          <h2 className="text-base font-semibold text-stone-900">Your requests</h2>
          <div className="mt-3">
            <RequestList
              requests={mine.data}
              empty="You have not asked to borrow this yet."
              render={(request) => (
                <RequestCard
                  key={request.id}
                  request={request}
                  showRequester={false}
                  highlighted={request.id === highlightedId}
                />
              )}
            />
          </div>
          <p className="mt-3 text-xs text-stone-500">
            The status changes here by itself when {item.owner.name} answers. No refresh needed.
          </p>
        </section>
      </div>
    </div>
  );
}

function OwnerView({ item, bookedDays, highlightedId }: ViewProps) {
  const utils = trpc.useUtils();
  const incoming = trpc.requests.incoming.useQuery({ itemId: item.id });
  const decide = trpc.requests.decide.useMutation({
    onSettled() {
      void utils.requests.incoming.invalidate();
      void utils.item.bookedDays.invalidate();
    },
  });

  const pending = incoming.data?.filter((request) => request.status === "pending");
  const answered = incoming.data?.filter((request) => request.status !== "pending");

  return (
    <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_24rem]">
      <div className="space-y-8">
        <ItemSummary item={item} isOwner />
        <Panel title="Booked days">
          <AvailabilityCalendar
            today={todayIso()}
            bookedDays={bookedDays}
            requestedDays={new Set()}
            selection={null}
          />
        </Panel>
      </div>

      <div className="space-y-8">
        <section>
          <h2 className="text-base font-semibold text-stone-900">
            Waiting for your answer{pending ? ` (${pending.length})` : ""}
          </h2>
          {decide.error && (
            <p role="alert" className="mt-2 text-sm text-rose-700">
              {decide.error.data?.rule
                ? decide.error.message
                : "The answer could not be saved. Please try again."}
            </p>
          )}
          <div className="mt-3">
            <RequestList
              requests={pending}
              empty="No open requests. New ones appear here as soon as a neighbour sends one."
              render={(request) => {
                const busy = decide.isPending && decide.variables?.requestId === request.id;
                return (
                  <RequestCard
                    key={request.id}
                    request={request}
                    showRequester
                    highlighted={request.id === highlightedId}
                    actions={
                      <>
                        <button
                          type="button"
                          disabled={decide.isPending}
                          onClick={() => decide.mutate({ requestId: request.id, decision: "accepted" })}
                          className="flex-1 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-800 disabled:opacity-60"
                        >
                          {busy && decide.variables?.decision === "accepted" ? "Accepting…" : "Accept"}
                        </button>
                        <button
                          type="button"
                          disabled={decide.isPending}
                          onClick={() => decide.mutate({ requestId: request.id, decision: "declined" })}
                          className="flex-1 rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm font-semibold text-stone-800 transition-colors hover:bg-stone-100 disabled:opacity-60"
                        >
                          {busy && decide.variables?.decision === "declined" ? "Declining…" : "Decline"}
                        </button>
                      </>
                    }
                  />
                );
              }}
            />
          </div>
        </section>

        <section>
          <h2 className="text-base font-semibold text-stone-900">Answered</h2>
          <div className="mt-3">
            <RequestList
              requests={answered}
              empty="Nothing answered yet."
              render={(request) => (
                <RequestCard
                  key={request.id}
                  request={request}
                  showRequester
                  highlighted={request.id === highlightedId}
                />
              )}
            />
          </div>
        </section>
      </div>
    </div>
  );
}

function RequestList({
  requests,
  empty,
  render,
}: {
  requests: BorrowRequest[] | undefined;
  empty: string;
  render: (request: BorrowRequest) => React.ReactNode;
}) {
  if (!requests) return <EmptyState>Loading…</EmptyState>;
  if (requests.length === 0) return <EmptyState>{empty}</EmptyState>;
  return <ul className="space-y-3">{requests.map(render)}</ul>;
}
