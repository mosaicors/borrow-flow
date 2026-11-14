import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Both sides, side by side",
};

const SIDES = [
  { label: "Tom, a neighbour", src: "/?as=user-tom" },
  { label: "Maya, the owner", src: "/?as=user-maya" },
];

/**
 * Shows the neighbour and the owner next to each other in one window. Each
 * frame is its own browser context with its own WebSocket, so this is the same
 * as two separate windows, just easier to watch.
 */
export default function DemoPage() {
  return (
    <main className="grid h-dvh grid-cols-1 gap-px bg-stone-300 md:grid-cols-2">
      {SIDES.map((side) => (
        <section key={side.src} className="flex min-h-0 flex-col bg-stone-50">
          <h2 className="border-b border-stone-200 bg-white px-4 py-2 text-xs font-semibold uppercase tracking-wide text-stone-600">
            {side.label}
          </h2>
          <iframe title={side.label} src={side.src} className="min-h-0 w-full flex-1" />
        </section>
      ))}
    </main>
  );
}
