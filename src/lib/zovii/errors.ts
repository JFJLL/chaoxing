export type ZoviiErrorCode =
  | "INVALID_CODE"
  | "CODE_EXPIRED"
  | "CODE_USED"
  | "PHONE_ALREADY_REGISTERED"
  | "PHONE_NOT_REGISTERED"
  | "INVALID_CREDENTIALS"
  | "RATE_LIMITED"
  | "UNAUTHORIZED"
  | "TIMEOUT"
  | "NOT_FOUND"
  | "INVALID_REQUEST"
  | "ENTERPRISE_ACCESS_DENIED"
  | "SERVER_ERROR"
  | "UNKNOWN";

export class ZoviiError extends Error {
  readonly code: ZoviiErrorCode;
  readonly status: number;
  readonly retryable: boolean;
  readonly externalRequestId?: string;

  constructor(
    code: ZoviiErrorCode,
    message: string,
    options: { status?: number; retryable?: boolean; externalRequestId?: string; cause?: unknown } = {}
  ) {
    super(message);
    this.name = "ZoviiError";
    this.code = code;
    this.status = options.status ?? 0;
    this.retryable = options.retryable ?? false;
    this.externalRequestId = options.externalRequestId;
    if (options.cause !== undefined) {
      (this as { cause?: unknown }).cause = options.cause;
    }
  }
}

const USER_MESSAGES: Record<ZoviiErrorCode, string> = {
  INVALID_CODE: "验证码错误，请检查后重试",
  CODE_EXPIRED: "验证码已过期，请重新获取",
  CODE_USED: "验证码已使用，请重新获取",
  PHONE_ALREADY_REGISTERED: "该手机号已注册 Zovii 账号，可登录后关联已有账号",
  PHONE_NOT_REGISTERED: "该手机号尚未注册 Zovii 账号",
  INVALID_CREDENTIALS: "Zovii 账号或密码错误",
  RATE_LIMITED: "操作过于频繁，请稍后重试",
  UNAUTHORIZED: "Zovii 授权已失效，请重新关联账号",
  TIMEOUT: "Zovii 服务响应超时，请稍后重试",
  NOT_FOUND: "请求的资源不存在",
  INVALID_REQUEST: "请求参数有误，请检查后重试",
  ENTERPRISE_ACCESS_DENIED: "当前 Zovii 账号没有企业管理员权限",
  SERVER_ERROR: "Zovii 服务暂时不可用，请稍后重试",
  UNKNOWN: "外部服务异常，请稍后重试"
};

export function toUserMessage(code: ZoviiErrorCode): string {
  return USER_MESSAGES[code];
}

export function isZoviiError(error: unknown): error is ZoviiError {
  return error instanceof ZoviiError;
}

export type AuthZoviiFailure =
  | { kind: "INVALID_CODE" | "CODE_EXPIRED" | "CODE_USED" | "PHONE_NOT_REGISTERED" | "RATE_LIMITED"; message: string }
  | { kind: "ZOVII_ERROR"; message: string };

/**
 * Shared classification of Zovii auth failures for the register/link flows.
 * Each service maps the classification to its own domain error type.
 */
export function classifyAuthZoviiError(error: unknown): AuthZoviiFailure {
  if (error instanceof ZoviiError) {
    switch (error.code) {
      case "INVALID_CODE":
      case "CODE_EXPIRED":
      case "CODE_USED":
      case "PHONE_NOT_REGISTERED":
      case "RATE_LIMITED":
        return { kind: error.code, message: toUserMessage(error.code) };
      default:
        return { kind: "ZOVII_ERROR", message: toUserMessage(error.code) };
    }
  }
  return { kind: "ZOVII_ERROR", message: "外部服务异常，请稍后重试" };
}
