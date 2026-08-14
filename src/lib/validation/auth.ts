import { z } from "zod";

export const PHONE_PATTERN = /^1[3-9]\d{9}$/;
export const SMS_CODE_PATTERN = /^\d{4,8}$/;

export const loginSchema = z.object({
  email: z.string().email("请输入有效邮箱"),
  password: z.string().min(6, "密码至少 6 位")
});

export const sendCodeSchema = z.object({
  phone: z.string().regex(PHONE_PATTERN, "请输入有效的中国大陆手机号")
});

export const registerSchema = z
  .object({
    phone: z.string().regex(PHONE_PATTERN, "请输入有效的中国大陆手机号"),
    code: z.string().regex(SMS_CODE_PATTERN, "请输入收到的验证码"),
    name: z.string().trim().min(2, "姓名至少 2 个字符").max(30, "姓名最长 30 个字符"),
    email: z.string().email("请输入有效邮箱"),
    password: z
      .string()
      .min(6, "密码至少 6 位")
      .max(72, "密码最长 72 位")
      .refine((value) => Buffer.byteLength(value, "utf8") <= 72, "密码过长"),
    confirmPassword: z.string().min(1, "请再次输入密码")
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "两次输入的密码不一致",
    path: ["confirmPassword"]
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
