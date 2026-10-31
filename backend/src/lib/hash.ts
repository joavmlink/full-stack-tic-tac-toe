import { createHash } from 'node:crypto';

/** SHA-256 as hex. Used wherever only a hash is stored (client IPs, match tokens). */
export const sha256Hex = (value: string) => createHash('sha256').update(value).digest('hex');
