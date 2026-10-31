import { randomBytes } from 'node:crypto';
import { sha256Hex } from './hash.js';

/**
 * A new secret for finishing one match: 32 random bytes (256 bits) as base64url (43 characters).
 * Only its hash is stored; the token itself is returned once, to the client that created the match.
 */
export function createMatchToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashMatchToken(token) };
}

// A plain SHA-256 is enough here: the token is random and high-entropy, not a user-chosen password.
export const hashMatchToken = sha256Hex;
