import { createHmac, timingSafeEqual } from "crypto";

const BUCKET_MS = 30_000;

function bucketFor(now: Date) {
  return Math.floor(now.getTime() / BUCKET_MS);
}

function digest(sessionId: string, bucket: number, secret: string) {
  return createHmac("sha256", secret).update(`${sessionId}:${bucket}`).digest();
}

function valuesFor(sessionId: string, bucket: number, secret: string) {
  const value = digest(sessionId, bucket, secret);
  return {
    token: value.toString("base64url").slice(0, 32),
    code: (value.readUInt32BE(0) % 1_000_000).toString().padStart(6, "0")
  };
}

function sameValue(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function createAttendanceCredential(input: { sessionId: string; secret: string; now?: Date }) {
  const now = input.now ?? new Date();
  const bucket = bucketFor(now);
  return {
    ...valuesFor(input.sessionId, bucket, input.secret),
    expiresAt: new Date((bucket + 1) * BUCKET_MS)
  };
}

export function verifyAttendanceCredential(input: { sessionId: string; secret: string; value: string; now?: Date }) {
  const now = input.now ?? new Date();
  const currentBucket = bucketFor(now);
  const supplied = input.value.trim();
  return [currentBucket, currentBucket - 1].some((bucket) => {
    const expected = valuesFor(input.sessionId, bucket, input.secret);
    return sameValue(supplied, expected.token) || sameValue(supplied, expected.code);
  });
}
