# Spec: borrow request flow

The short written spec this feature was built from. Code and tests are checked
against it; when they disagree, one of them is wrong.

## People

- **Owner**: the neighbour who lends the item.
- **Neighbour**: anyone else. Can ask to borrow the item.

There is no real login in this task. The browser says who it is (`?as=<user id>`),
and the API trusts it. See "Out of scope".

## Item page

- Shows the item, its owner, and a month calendar.
- A day is **booked** when an accepted request covers it, otherwise **free**.
- Past days cannot be picked. Booked days cannot be picked.
- A neighbour picks one day, or a first and a last day. The period includes both.
- The owner sees the same calendar, read-only.

## Borrow request

A request has a period (first day, last day), an optional message of up to 280
characters, and a status.

```
pending ──accept──▶ accepted
   │
   └────decline───▶ declined
```

`accepted` and `declined` are final.

### Rules for sending

| Rule | Error |
| --- | --- |
| The last day is on or after the first day, and both are real calendar days | `INVALID_RANGE` |
| The period does not start before today | `IN_THE_PAST` |
| The period is at most 14 days | `TOO_LONG` |
| The owner cannot request their own item | `OWN_ITEM` |
| No day of the period is already booked | `DATES_TAKEN` |
| The neighbour has no other pending request that overlaps the period | `ALREADY_REQUESTED` |

Two different neighbours may both have pending requests for the same days. The
owner chooses between them.

### Rules for answering

| Rule | Error |
| --- | --- |
| Only the owner of the item can accept or decline | `NOT_OWNER` |
| Only a pending request can be answered | `NOT_PENDING` |
| A request cannot be accepted if any of its days is already booked | `DATES_TAKEN` |

When a request is accepted:

1. Its days become booked.
2. Every other pending request that overlaps those days is declined
   automatically and marked as such, so the neighbour can see why.

**An item is never booked twice for the same day**, including when two answers
arrive at the same moment.

## Live updates

Every browser on the item page holds one WebSocket subscription.

| Event | Requester sees | Owner sees | Everyone else sees |
| --- | --- | --- | --- |
| Request sent | their new request | the request appears in "Waiting for your answer" | nothing |
| Request accepted | status changes to Accepted | request moves to "Answered" | the days turn booked in the calendar |
| Request declined | status changes to Declined | request moves to "Answered" | nothing |

None of this needs a page refresh. People who are not part of a request never
receive its details, only the fact that availability changed.

## Days and time zones

Days are `YYYY-MM-DD` strings end to end. "Today" is the current UTC day on both
the server and the client.

## Out of scope

- Real authentication and sessions.
- More than one item, search, item photos.
- Cancelling a request, or changing an answer.
- Running several API instances (the event bus is in memory, see README).
