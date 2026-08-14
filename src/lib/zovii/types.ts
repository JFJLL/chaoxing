export type ZoviiTokens = {
  accessToken: string;
  refreshToken: string;
  expiresIn?: number;
};

export type ZoviiUser = {
  id: string;
  phone?: string | null;
  username?: string | null;
  nickname?: string | null;
  email?: string | null;
  enterpriseId?: string | null;
  enterpriseRole?: string | null;
};

export type ZoviiMember = {
  id: string;
  userId?: string | null;
  displayId?: string | null;
  phone?: string | null;
  name?: string | null;
  username?: string | null;
  role?: string | null;
  status?: string | null;
  credits?: number | null;
  enterpriseBalance?: number | null;
  consumption?: number | null;
  callCount?: number | null;
  joinedAt?: string | null;
};

export type ZoviiMemberList = {
  members: ZoviiMember[];
  total?: number;
  page?: number;
  limit?: number;
};

export type ZoviiBalance = {
  balance?: number | null;
  available?: number | null;
  poolBalance?: number | null;
  totalAllocated?: number | null;
  currency?: string | null;
};

export type ZoviiAuthSession = {
  user: ZoviiUser;
  tokens: ZoviiTokens;
};

export type ZoviiSendCodeResult = {
  requestId?: string;
};
