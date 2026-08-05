"use client";

function Key({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded-md border border-neutral-600 bg-neutral-800 px-1.5 py-0.5 font-sans text-xs font-semibold text-neutral-200">
      {children}
    </kbd>
  );
}

function Row({ glyph, color, children }: { glyph: string; color: string; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className={`mt-0.5 w-7 shrink-0 text-center text-lg font-black ${color}`}>{glyph}</span>
      <span className="text-sm text-neutral-300">{children}</span>
    </li>
  );
}

/** First-run walkthrough for the blind test. Reopenable via the ? button. */
export function SwipeTutorial({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="How the blind test works"
    >
      <div className="max-h-[85dvh] w-full max-w-md space-y-5 overflow-y-auto rounded-3xl border border-neutral-700 bg-neutral-900 p-6">
        <div>
          <h2 className="text-2xl font-black">How it works</h2>
          <p className="mt-2 text-sm text-neutral-300">
            You hear real snippets from the line-up — no names shown. Vote by feel;
            your likes build your personal route through the parade.
          </p>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500">Swipe the disc</p>
          <ul className="mt-2 space-y-2">
            <Row glyph="→" color="text-emerald-400">Drag right — <b>Like</b></Row>
            <Row glyph="←" color="text-rose-400">Drag left — <b>Nope</b></Row>
            <Row glyph="↑" color="text-amber-400">Drag up — <b>⭐ Superlike</b>: locks the artist into your route</Row>
            <Row glyph="●" color="text-neutral-400">Tap the disc — play / pause</Row>
          </ul>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500">Or use the keyboard</p>
          <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-sm text-neutral-300">
            <Key>→</Key> like · <Key>←</Key> nope · <Key>↑</Key> superlike · <Key>↓</Key> skip ·{" "}
            <Key>Space</Key> play/pause · <Key>U</Key> undo
          </p>
        </div>

        <p className="text-sm text-neutral-400">
          The buttons below the disc do the same. After each vote the artist is
          revealed — tap the card to continue.
        </p>

        <button
          onClick={onClose}
          className="w-full rounded-2xl bg-fuchsia-600 py-3.5 font-bold transition active:scale-[0.98]"
        >
          Got it — let&apos;s play
        </button>
      </div>
    </div>
  );
}
