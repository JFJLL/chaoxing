import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email("请输入有效邮箱"),
  password: z.string().min(6, "密码至少 6 位")
});

export const registerSchema = z.object({
  name: z.string().trim().min(1, "请输入姓名").max(50, "姓名不能超过 50 个字符"),
  email: z.string().trim().email("请输入有效邮箱"),
  password: z.string().min(6, "密码至少 6 位").max(72, "密码最长 72 位"),
  role: z.enum(["STUDENT", "TEACHER"]).optional().default("STUDENT")
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(6, "当前密码至少 6 位"),
    newPassword: z
      .string()
      .min(6, "新密码至少 6 位")
      .max(72, "新密码最长 72 位")
      .refine((value) => Buffer.byteLength(value, "utf8") <= 72, "新密码过长"),
    confirmPassword: z.string().min(1, "请再次输入新密码")
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "两次输入的新密码不一致",
    path: ["confirmPassword"]
  })
  .refine((data) => data.newPassword !== data.currentPassword, {
    message: "新密码不能与当前密码相同",
    path: ["newPassword"]
  });
