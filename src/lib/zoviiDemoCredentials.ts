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

// 新一批老师：直接使用本人平台账号（邮箱）登录 Zovii，密码统一为平台初始密码
const BATCH_TEACHER_NAMES = new Set([
  "郇𤩽", "张洪生", "周子颜", "刘江红", "王青亦", "卜希霆", "程科", "陈文玲", "陈娴颖",
  "刁基诺", "丁颖", "何震", "韩新华", "何勇", "靳斌", "蒋多", "李晓萱", "林振宇",
  "彭健", "戚春华", "齐骥", "孙芊芊", "田卉", "魏晓阳", "王夏歌", "王晋", "王文勋",
  "萧盈盈", "熊海峰", "徐文松", "余博", "杨红", "杨剑飞", "袁庆丰", "郑宁", "张鸿霞",
  "周凯", "周丽娜", "朱敏", "朱依娜", "邓源", "郑华", "周慕超", "胥迪", "徐子喻", "向笠"
]);

const BATCH_DEFAULT_PASSWORD = "Scim2026";

export function getZoviiDemoCredential(
  user: Pick<SessionUser, "name"> & { email?: string }
): ZoviiDemoCredential | null {
  const envKeys = DEMO_CREDENTIAL_ENV_BY_USER_NAME[user.name];
  if (envKeys) {
    const account = process.env[envKeys.account]?.trim();
    const password = process.env[envKeys.password];
    return account && password ? { account, password } : null;
  }

  if (BATCH_TEACHER_NAMES.has(user.name)) {
    const account = user.email?.trim();
    return account ? { account, password: BATCH_DEFAULT_PASSWORD } : null;
  }

  return null;
}
