"use client";

import { useEffect, useState } from "react";
import { withBase } from "@/lib/basePath";

interface StatusResponse {
  commit: string | null;
  vercel_env: string | null;
  live_ready: boolean;
  mock: boolean;
}

/**
 * One-line deployment configuration readout on the lobby, fed by /api/status
 * (booleans + persona names only — no secrets). Points judges at Replay when
 * live voice isn't configured. Hidden entirely in static-export builds (no
 * /api) and on fetch failure (e.g. a deployment predating the route).
 */
export default function LiveStatus() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (process.env.NEXT_PUBLIC_STATIC_EXPORT === "1") return;
    fetch(withBase("/api/status"), { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((j) => setStatus(j as StatusResponse))
      .catch(() => setFailed(true));
  }, []);

  if (failed || !status) return null;

  const text = status.mock
    ? "Live voice: mock-agent mode — Replay also available"
    : status.live_ready
      ? "Live voice: configured (passcode required)"
      : "Live voice: not configured on this deployment — Replay available";

  return (
    <p className="mt-3 text-xs" aria-live="polite" style={{ color: "var(--muted)" }}>
      <span
        aria-hidden="true"
        className="mr-1 inline-block"
        style={{ color: status.live_ready ? "var(--held)" : "var(--muted)" }}
      >
        ●
      </span>
      {text}
      {status.commit && (
        <span className="mono ml-2" title={status.vercel_env ?? undefined}>
          · {status.commit}
        </span>
      )}
    </p>
  );
}
