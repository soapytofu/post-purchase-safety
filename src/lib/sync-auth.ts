import { timingSafeEqual } from "node:crypto";

export function isAuthorizedSyncRequest(authorization: string | null, secret = process.env.SYNC_SECRET): boolean {
  if (!secret || secret.length < 24 || !authorization?.startsWith("Bearer ")) return false;
  const supplied = Buffer.from(authorization.slice(7));
  const expected = Buffer.from(secret);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}
