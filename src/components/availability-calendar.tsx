"use client";

import { useState } from "react";
import { type IsoDay, addDays } from "@/domain/dates";
import type { Selection } from "@/domain/selection";
import { formatDay, formatMonth } from "./format";


type Props = {
  today: IsoDay;
  bookedDays: ReadonlySet<IsoDay>;
  /** Days the viewer has asked for and is still waiting on. */
  requestedDays: ReadonlySet<IsoDay>;
  selection: Selection;
  /** Omit to make the calendar read-only (the owner's view). */
  onPickDay?: (day: IsoDay) => void;
};

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function firstOfMonth(day: IsoDay): IsoDay {
  return `${day.slice(0, 7)}-01`;
}

function shiftMonth(monthStart: IsoDay, amount: number): IsoDay {
  const date = new Date(`${monthStart}T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + amount);
  return date.toISOString().slice(0, 10);
}

/** The month as rows of seven cells, Monday first. `null` pads the edges. */
function monthGrid(monthStart: IsoDay): (IsoDay | null)[] {
  const first = new Date(`${monthStart}T00:00:00Z`);
  const leadingBlanks = (first.getUTCDay() + 6) % 7;
  const cells: (IsoDay | null)[] = Array.from({ length: leadingBlanks }, () => null);
  const nextMonth = shiftMonth(monthStart, 1);
  for (let day = monthStart; day < nextMonth; day = addDays(day, 1)) cells.push(day);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export function AvailabilityCalendar({
  today,
  bookedDays,
  requestedDays,
  selection,
  onPickDay,
}: Props) {
  const currentMonth = firstOfMonth(today);
  const [month, setMonth] = useState(currentMonth);
  const selectionEnd = selection ? (selection.endDate ?? selection.startDate) : null;

  return (
    <div>
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-stone-900" aria-live="polite">
          {formatMonth(month)}
        </h3>
        <div className="flex gap-1">
          <MonthButton
            label="Previous month"
            disabled={month <= currentMonth}
            onClick={() => setMonth(shiftMonth(month, -1))}
          >
            ←
          </MonthButton>
          <MonthButton label="Next month" onClick={() => setMonth(shiftMonth(month, 1))}>
            →
          </MonthButton>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-7 gap-1 text-center text-xs font-medium text-stone-500">
        {WEEKDAYS.map((weekday) => (
          <div key={weekday} className="py-1">
            {weekday}
          </div>
        ))}
      </div>

      <div className="mt-1 grid grid-cols-7 gap-1">
        {monthGrid(month).map((day, index) => {
          if (!day) return <div key={`blank-${index}`} />;

          const isPast = day < today;
          const isBooked = bookedDays.has(day);
          const isRequested = requestedDays.has(day);
          const isSelected =
            selection !== null &&
            selectionEnd !== null &&
            day >= selection.startDate &&
            day <= selectionEnd;
          const isEdge = isSelected && (day === selection?.startDate || day === selectionEnd);
          const disabled = isPast || isBooked || !onPickDay;

          let look = "text-stone-800 hover:bg-emerald-50";
          if (isPast) look = "text-stone-300";
          else if (isBooked) look = "bg-stone-100 text-stone-400 line-through";
          else if (isEdge) look = "bg-emerald-700 font-semibold text-white";
          else if (isSelected) look = "bg-emerald-100 text-emerald-900";
          else if (isRequested) look = "bg-amber-100 text-amber-900 hover:bg-amber-200";
          else if (!onPickDay) look = "text-stone-800";

          const state = isBooked
            ? "booked"
            : isPast
              ? "in the past"
              : isRequested
                ? "requested by you, waiting for an answer"
                : "free";

          return (
            <button
              key={day}
              type="button"
              disabled={disabled}
              onClick={() => onPickDay?.(day)}
              aria-label={`${formatDay(day)}, ${state}`}
              aria-pressed={isSelected}
              data-day={day}
              data-state={isBooked ? "booked" : isSelected ? "selected" : "free"}
              className={`relative flex h-10 items-center justify-center rounded-lg text-sm transition-colors disabled:cursor-default ${look}`}
            >
              {Number(day.slice(8))}
              {day === today && (
                <span
                  aria-hidden
                  className={`absolute bottom-1 h-1 w-1 rounded-full ${isEdge ? "bg-white" : "bg-emerald-700"}`}
                />
              )}
            </button>
          );
        })}
      </div>

      <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-stone-600">
        <Legend swatch="bg-white ring-1 ring-stone-300" label="Free" />
        <Legend swatch="bg-stone-200" label="Booked" />
        {onPickDay && <Legend swatch="bg-emerald-700" label="Your pick" />}
        {onPickDay && <Legend swatch="bg-amber-200" label="You asked, no answer yet" />}
      </ul>
    </div>
  );
}

function MonthButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-8 w-8 items-center justify-center rounded-lg border border-stone-200 text-stone-700 transition-colors hover:bg-stone-100 disabled:opacity-30 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}

function Legend({ swatch, label }: { swatch: string; label: string }) {
  return (
    <li className="flex items-center gap-2">
      <span aria-hidden className={`h-3 w-3 rounded ${swatch}`} />
      {label}
    </li>
  );
}
