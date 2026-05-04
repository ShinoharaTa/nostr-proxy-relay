/**
 * 公開 API (`/api/public/*`) のクライアント。BasicAuth 不要。
 * 仕様: docs/ui_redesign_ja.md §5.1
 */

export interface PublicEventsBuckets {
  /** 直近 60 分の 1 分粒度バケット (length=60) */
  posted_1h: number[];
  delivered_1h: number[];
  rejected_1h: number[];
}

export interface PublicBackend {
  url: string;
  /** "connected" | "connecting" | "disconnected" | "disabled" */
  status: string;
  connected_since: string | null;
}

export interface PublicIncident {
  ts: string;
  event_type: string;
  /** host + 短縮 detail。生 URL や IP / npub は含まれない。 */
  summary: string;
}

export interface PublicStatus {
  /** "operational" | "degraded" | "down" */
  status: string;
  uptime_sec: number;
  connections_active: number;
  events: PublicEventsBuckets;
  backends: PublicBackend[];
  incidents: PublicIncident[];
  generated_at: string;
}

export async function fetchPublicStatus(signal?: AbortSignal): Promise<PublicStatus> {
  const res = await fetch('/api/public/status', { signal });
  if (!res.ok) {
    throw new Error(`/api/public/status returned ${res.status}`);
  }
  return (await res.json()) as PublicStatus;
}
