import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, getCredentialEncryptionKey } from "../../src/lib/zovii/crypto";

const VALID_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

describe("zovii credential encryption", () => {
  const originalKey = process.env.ZOVII_CREDENTIAL_ENCRYPTION_KEY;

  beforeEach(() => {
    process.env.ZOVII_CREDENTIAL_ENCRYPTION_KEY = VALID_KEY;
  });

  afterEach(() => {
    if (originalKey === undefined) {
      delete process.env.ZOVII_CREDENTIAL_ENCRYPTION_KEY;
    } else {
      process.env.ZOVII_CREDENTIAL_ENCRYPTION_KEY = originalKey;
    }
  });

  it("round-trips a refresh token", () => {
    const encrypted = encryptSecret("refresh-token-abc-123");
    expect(encrypted).not.toContain("refresh-token-abc-123");
    expect(decryptSecret(encrypted)).toBe("refresh-token-abc-123");
  });

  it("produces unique ciphertext per call (random IV)", () => {
    const first = encryptSecret("same-value");
    const second = encryptSecret("same-value");
    expect(first).not.toBe(second);
    expect(decryptSecret(first)).toBe(decryptSecret(second));
  });

  it("rejects tampered ciphertext", () => {
    const encrypted = encryptSecret("secret-value");
    const tampered = `${encrypted.slice(0, -2)}AA`;
    expect(() => decryptSecret(tampered)).toThrow();
  });

  it("rejects decryption with a different key", () => {
    const encrypted = encryptSecret("secret-value");
    process.env.ZOVII_CREDENTIAL_ENCRYPTION_KEY = "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
    expect(() => decryptSecret(encrypted)).toThrow();
  });

  it("rejects malformed payloads", () => {
    expect(() => decryptSecret("not-an-encrypted-value")).toThrow();
  });

  it("requires the environment key", () => {
    delete process.env.ZOVII_CREDENTIAL_ENCRYPTION_KEY;
    expect(() => getCredentialEncryptionKey()).toThrow(/ZOVII_CREDENTIAL_ENCRYPTION_KEY/);
  });

  it("rejects keys that are not 32 bytes", () => {
    process.env.ZOVII_CREDENTIAL_ENCRYPTION_KEY = "too-short";
    expect(() => getCredentialEncryptionKey()).toThrow(/must be 32 bytes/);
  });
});
