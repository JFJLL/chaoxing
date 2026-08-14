import type { ZoviiClient } from "./client";

const DEFAULT_EXPIRES_IN_SECONDS = 60 * 60;
const REFRESH_SKEW_MS = 10_000;

/**
 * Caches the Zovii access token in memory (never persisted) and performs
 * single-flight refresh: concurrent callers share one refresh request.
 */
export class ZoviiTokenStore {
  private accessToken: string | null = null;
  private expiresAt: number | null = null;
  private refreshPromise: Promise<string> | null = null;
  private refreshToken: string;

  constructor(
    refreshToken: string,
    private readonly client: ZoviiClient,
    private readonly now: () => number = Date.now,
    private readonly onRefreshRotated?: (refreshToken: string) => Promise<void> | void
  ) {
    this.refreshToken = refreshToken;
  }

  async getAccessToken(): Promise<string> {
    if (this.accessToken && this.expiresAt !== null && this.now() < this.expiresAt - REFRESH_SKEW_MS) {
      return this.accessToken;
    }
    if (this.refreshPromise) {
      return this.refreshPromise;
    }
    this.refreshPromise = this.doRefresh().finally(() => {
      this.refreshPromise = null;
    });
    return this.refreshPromise;
  }

  invalidate(): void {
    this.accessToken = null;
    this.expiresAt = null;
  }

  private async doRefresh(): Promise<string> {
    const tokens = await this.client.refresh(this.refreshToken);
    if (tokens.refreshToken !== this.refreshToken) {
      this.refreshToken = tokens.refreshToken;
      if (this.onRefreshRotated) {
        await this.onRefreshRotated(tokens.refreshToken);
      }
    }
    this.accessToken = tokens.accessToken;
    this.expiresAt = this.now() + (tokens.expiresIn ?? DEFAULT_EXPIRES_IN_SECONDS) * 1000;
    return this.accessToken;
  }
}
