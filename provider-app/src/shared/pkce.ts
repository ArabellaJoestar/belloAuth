export const API_BASE_URL = 'http://localhost:3000';

export interface GeolocationCoords {
  latitude: number | null;
  longitude: number | null;
}

function base64UrlEncode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function generatePkcePair(): Promise<{
  codeVerifier: string;
  codeChallenge: string;
  codeChallengeMethod: 'S256';
}> {
  const randomBytes = new Uint8Array(32);
  window.crypto.getRandomValues(randomBytes);
  const codeVerifier = base64UrlEncode(randomBytes.buffer);

  const encoder = new TextEncoder();
  const data = encoder.encode(codeVerifier);
  const digest = await window.crypto.subtle.digest('SHA-256', data);
  const codeChallenge = base64UrlEncode(digest);

  return {
    codeVerifier,
    codeChallenge,
    codeChallengeMethod: 'S256',
  };
}

export async function resolveBrowserGeolocation(
  useFallbackIfBlocked = true,
): Promise<GeolocationCoords> {
  if (!('geolocation' in navigator)) {
    return useFallbackIfBlocked
      ? { latitude: -8.047562, longitude: -34.876964 }
      : { latitude: null, longitude: null };
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: Number(position.coords.latitude.toFixed(6)),
          longitude: Number(position.coords.longitude.toFixed(6)),
        });
      },
      () => {
        resolve(
          useFallbackIfBlocked
            ? { latitude: -8.047562, longitude: -34.876964 }
            : { latitude: null, longitude: null },
        );
      },
      { timeout: 3000 },
    );
  });
}