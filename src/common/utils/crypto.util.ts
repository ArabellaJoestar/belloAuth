import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';

export class CryptoUtil {
  static hashSecret(secret: string): string {
    const salt = randomBytes(16).toString('hex');
    const derivedKey = scryptSync(secret, salt, 64).toString('hex');
    return `${salt}:${derivedKey}`;
  }

  static verifySecret(secret: string, storedHash: string): boolean {
    const [salt, key] = storedHash.split(':');
    if (!salt || !key) return false;

    const keyBuffer = Buffer.from(key, 'hex');
    const derivedBuffer = scryptSync(secret, salt, 64);

    if (keyBuffer.length !== derivedBuffer.length) return false;
    return timingSafeEqual(keyBuffer, derivedBuffer);
  }

  static generateRandomToken(bytes = 32): string {
    return randomBytes(bytes).toString('base64url');
  }

  static generateNumericCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  static verifyPkceChallenge(codeVerifier: string, codeChallenge: string, method: 'S256' | 'plain' = 'S256'): boolean {
    if (method === 'plain') {
      const a = Buffer.from(codeVerifier);
      const b = Buffer.from(codeChallenge);
      return a.length === b.length && timingSafeEqual(a, b);
    }

    const hash = createHash('sha256').update(codeVerifier).digest('base64url');
    const a = Buffer.from(hash);
    const b = Buffer.from(codeChallenge);
    return a.length === b.length && timingSafeEqual(a, b);
  }
}