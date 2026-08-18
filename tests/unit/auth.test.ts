import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "../../src/lib/passwords";
import { loginSchema, registerSchema } from "../../src/lib/validation/auth";

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

describe("register schema", () => {
  it("validates valid registration data with default role", () => {
    const result = registerSchema.safeParse({
      name: "新同学",
      email: "student@example.com",
      password: "Password123"
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.role).toBe("STUDENT");
      expect(result.data.name).toBe("新同学");
    }
  });

  it("accepts TEACHER role", () => {
    const result = registerSchema.safeParse({
      name: "王老师",
      email: "teacher@example.com",
      password: "Password123",
      role: "TEACHER"
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.role).toBe("TEACHER");
    }
  });

  it("rejects empty name or invalid email or short password", () => {
    const result = registerSchema.safeParse({
      name: "",
      email: "not-an-email",
      password: "123"
    });

    expect(result.success).toBe(false);
    expect(result.error?.flatten().fieldErrors.name).toContain("请输入姓名");
    expect(result.error?.flatten().fieldErrors.email).toContain("请输入有效邮箱");
    expect(result.error?.flatten().fieldErrors.password).toContain("密码至少 6 位");
  });
});
