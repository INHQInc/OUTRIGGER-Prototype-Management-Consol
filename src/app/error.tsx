"use client";

/**
 * Route error boundary — a render crash degrades to a readable message + reset,
 * never a black screen. (A missing field in an AI draft used to blank the whole
 * page; this makes any future render throw recoverable in place.)
 */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="min-h-[60vh] flex items-center justify-center p-8">
      <div className="max-w-md w-full rounded-xl border border-danger/40 bg-[color-mix(in_srgb,var(--danger)_5%,transparent)] p-6 space-y-3">
        <div className="text-[15px] font-semibold text-danger">Something broke on this screen</div>
        <p className="text-[14px] text-muted leading-relaxed">
          The page hit an error while rendering — your data is safe. Try again; if it keeps happening, reload the app.
        </p>
        {error?.message && (
          <pre className="text-[12.5px] font-mono text-muted-2 whitespace-pre-wrap max-h-40 overflow-y-auto rounded-lg bg-background/60 border border-border/60 px-3 py-2">{error.message}</pre>
        )}
        <div className="flex items-center gap-2 pt-1">
          <button onClick={reset} className="h-9 px-4 rounded-lg bg-accent text-accent-fg text-[14px] font-semibold hover:bg-accent-hover">Try again</button>
          <a href="/" className="h-9 px-4 rounded-lg border border-border text-[14px] font-medium text-muted hover:text-foreground flex items-center">Back to dashboard</a>
        </div>
      </div>
    </div>
  );
}
