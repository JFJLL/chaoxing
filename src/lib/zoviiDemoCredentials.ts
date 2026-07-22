import type { SessionUser } from "@/lib/auth";

export type ZoviiDemoCredential = {
  account: string;
  password: string;
};

const DEMO_CREDENTIAL_ENV_BY_USER_NAME: Record<string, { account: string; password: string }> = {
  "李素艳": {
    account: "ZOVII_DEMO_LI_SUYAN_ACCOUNT",
    password: "ZOVII_DEMO_LI_SUYAN_PASSWORD"
  },
  "王一帆": {
    account: "ZOVII_DEMO_WANG_YIFAN_ACCOUNT",
    password: "ZOVII_DEMO_WANG_YIFAN_PASSWORD"
  },
  "学习者": {
    account: "ZOVII_DEMO_STUDENT_ACCOUNT",
    password: "ZOVII_DEMO_STUDENT_PASSWORD"
  }
};

export function getZoviiDemoCredential(user: Pick<SessionUser, "name">): ZoviiDemoCredential | null {
  const envKeys = DEMO_CREDENTIAL_ENV_BY_USER_NAME[user.name];
  if (!envKeys) return null;

  const account = process.env[envKeys.account]?.trim();
  const password = process.env[envKeys.password];
  return account && password ? { account, password } : null;
}
