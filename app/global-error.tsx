"use client";

import * as Sentry from "@sentry/nextjs";
import NextError from "next/error";
import { useEffect } from "react";

/** Last-resort boundary for errors in the root layout. Reports to Sentry, then offers a reload. */
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ background: "#0f0f23", color: "#e2e8f0", fontFamily: "system-ui, sans-serif", display: "grid", placeItems: "center", minHeight: "100vh", margin: 0 }}>
        <div style={{ textAlign: "center", padding: 24 }}>
          <h1 style={{ fontSize: 28 }}>Something broke</h1>
          <p style={{ color: "#94a3b8" }}>We&apos;ve been told. Reload to keep playing.</p>
          <button onClick={() => window.location.reload()} style={{ marginTop: 16, minHeight: 44, padding: "0 20px", borderRadius: 12, border: 0, background: "#7c3aed", color: "white", fontWeight: 600, cursor: "pointer" }}>
            Reload
          </button>
        </div>
        <div style={{ display: "none" }}>
          <NextError statusCode={0} />
        </div>
      </body>
    </html>
  );
}
