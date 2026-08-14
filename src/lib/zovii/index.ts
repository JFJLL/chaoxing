export { ZoviiClient, sanitizeMeta, type ZoviiClientOptions, type ZoviiLogFn } from "./client";
export {
  ZoviiError,
  classifyAuthZoviiError,
  isZoviiError,
  toUserMessage,
  type AuthZoviiFailure,
  type ZoviiErrorCode
} from "./errors";
export { encryptSecret, decryptSecret, getCredentialEncryptionKey } from "./crypto";
export { ZoviiTokenStore } from "./tokenStore";
export {
  claimOperation,
  completeOperation,
  redactErrorMessage,
  OP_KINDS,
  OP_STATUS,
  type ClaimedOperation,
  type ClaimResult,
  type OperationKind,
  type OperationStatus
} from "./idempotency";
export {
  checkRateLimit,
  clearRateLimits,
  sendCodeLimit,
  type RateLimitOptions,
  type RateLimitResult,
  type SendCodeLimit
} from "./rateLimit";
export type {
  ZoviiAuthSession,
  ZoviiBalance,
  ZoviiMember,
  ZoviiMemberList,
  ZoviiTokens,
  ZoviiUser
} from "./types";
