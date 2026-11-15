/// <reference types="vite/client" />

declare module 'provider_app/pkce' {
  export const API_BASE_URL: string;

  export interface GeolocationCoords {
    latitude: number | null;
    longitude: number | null;
  }

  export function generatePkcePair(): Promise<{
    codeVerifier: string;
    codeChallenge: string;
    codeChallengeMethod: 'S256';
  }>;

  export function resolveBrowserGeolocation(
    useFallbackIfBlocked?: boolean,
  ): Promise<GeolocationCoords>;
}

declare module 'provider_app/WebhookMonitor' {
  import type { FC } from 'react';
  export const WebhookMonitor: FC<{ title?: string }>;
  export default WebhookMonitor;
}

declare module 'provider_app/SessionAuditTable' {
  import type { FC } from 'react';
  export const SessionAuditTable: FC;
  export default SessionAuditTable;
}