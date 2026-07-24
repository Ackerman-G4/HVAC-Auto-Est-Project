'use client';

/**
 * Global error boundary (overhaul-v3 Phase 5.1).
 * Last line of defense — replaces the root layout when it crashes, so it
 * must render its own <html>/<body> and cannot rely on globals.css.
 */

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0a141d',
          color: '#e6eef5',
          fontFamily: 'ui-sans-serif, system-ui, sans-serif',
        }}
      >
        <div style={{ maxWidth: 420, padding: 32, textAlign: 'center' }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>
            HVAC Studio hit a critical error
          </h1>
          <p style={{ fontSize: 14, opacity: 0.75, lineHeight: 1.6, marginBottom: 8 }}>
            The application shell failed to load. Your saved data is not
            affected. Reload to recover.
          </p>
          {error.digest && (
            <p style={{ fontSize: 11, opacity: 0.5, fontFamily: 'monospace', marginBottom: 20 }}>
              ref: {error.digest}
            </p>
          )}
          <button
            onClick={reset}
            style={{
              padding: '10px 22px',
              borderRadius: 12,
              border: 'none',
              background: '#1aa88f',
              color: '#06121e',
              fontWeight: 600,
              fontSize: 14,
              cursor: 'pointer',
            }}
          >
            Reload application
          </button>
        </div>
      </body>
    </html>
  );
}
