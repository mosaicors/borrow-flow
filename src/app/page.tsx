import { Suspense } from "react";
import { BorrowApp } from "@/components/borrow-app";

export default function Home() {
  // BorrowApp reads `?as=` from the URL, which is only known per request, so it
  // renders inside Suspense and the static shell stays prerenderable.
  return (
    <Suspense fallback={<p className="py-24 text-center text-sm text-stone-600">Loading…</p>}>
      <BorrowApp />
    </Suspense>
  );
}
