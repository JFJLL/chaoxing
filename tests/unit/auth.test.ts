import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "../../src/lib/passwords";
import { loginSchema } from "../../src/lib/validation/auth";

describe("password helpers", () => {
  it("hashes and verifies the correct password", async () => {
    const password = "Teacher@2026";
    const passwordHash = await hashPassword(password);

    expect(passwordHash).not.toBe(password);
    await expect(verifyPassword(password, passwordHash)).resolves.toBe(true);
  });

  it("rejects a wrong password", async () => {
    const passwordHash = await hashPassword("Teacher@2026");

    await expect(verifyPassword("WrongPassword", passwordHash)).resolves.toBe(false);
    await expect(verifyPassword("Teacher@2026", null)).resolves.toBe(false);
  });
});

describe("login schema", () => {
  it("rejects an invalid email", () => {
    const result = loginSchema.safeParse({
      email: "invalid-email",
      password: "Teacher@2026"
    });

    expect(result.success).toBe(false);
    expect(result.error?.flatten().fieldErrors.email).toContain("请输入有效邮箱");
  });

  it("rejects a short password", () => {
    const result = loginSchema.safeParse({
      email: "li.suyan@example.local",
      password: "12345"
    });

    expect(result.success).toBe(false);
    expect(result.error?.flatten().fieldErrors.password).toContain("密码至少 6 位");
  });
});
