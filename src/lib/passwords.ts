import bcrypt from "bcryptjs";

const BCRYPT_ROUNDS = 10;

export async function hashPassword(password: string) {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(password: string, passwordHash: string | null | undefined) {
  if (!passwordHash) {
    return false;
  }

  return bcrypt.compare(password, passwordHash);
}
