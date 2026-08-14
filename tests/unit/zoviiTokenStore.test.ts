import { beforeEach, describe, expect, it, vi } from "vitest";
import { ZoviiClient } from "../../src/lib/zovii/client";
import { ZoviiTokenStore } from "../../src/lib/zovii/tokenStore";

describe("ZoviiTokenStore", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("caches the access token until it expires", async () => {
    const refresh = vi.fn(async () => ({
      accessToken: "access-1",
      refreshToken: "refresh-1",
      expiresIn: 3600
    }));
    const client = { refresh } as unknown as ZoviiClient;
    let now = 1_000_000;
    const store = new ZoviiTokenStore("refresh-1", client, () => now);

    await expect(store.getAccessToken()).resolves.toBe("access-1");
    await expect(store.getAccessToken()).resolves.toBe("access-1");
    expect(refresh).toHaveBeenCalledTimes(1);

    now += 3601 * 1000;
    await expect(store.getAccessToken()).resolves.toBe("access-1");
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("refreshes concurrently exactly once (single-flight)", async () => {
    let resolveRefresh: (tokens: { accessToken: string; refreshToken: string }) => void = () => undefined;
    const refresh = vi.fn(
      () =>
        new Promise<{ accessToken: string; refreshToken: string }>((resolve) => {
          resolveRefresh = resolve;
        })
    );
    const client = { refresh } as unknown as ZoviiClient;
    const store = new ZoviiTokenStore("refresh-1", client, () => 1_000_000);

    const first = store.getAccessToken();
    const second = store.getAccessToken();
    const third = store.getAccessToken();
    resolveRefresh({ accessToken: "access-1", refreshToken: "refresh-1" });

    await expect(Promise.all([first, second, third])).resolves.toEqual(["access-1", "access-1", "access-1"]);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("recovers after a failed refresh so the next call can retry", async () => {
    const refresh = vi
      .fn()
      .mockRejectedValueOnce(new Error("refresh failed"))
      .mockResolvedValueOnce({ accessToken: "access-2", refreshToken: "refresh-1", expiresIn: 3600 });
    const client = { refresh } as unknown as ZoviiClient;
    const store = new ZoviiTokenStore("refresh-1", client, () => 1_000_000);

    await expect(store.getAccessToken()).rejects.toThrow("refresh failed");
    await expect(store.getAccessToken()).resolves.toBe("access-2");
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("invalidate() forces a refresh on the next call", async () => {
    const refresh = vi.fn(async () => ({
      accessToken: "access-1",
      refreshToken: "refresh-1",
      expiresIn: 3600
    }));
    const client = { refresh } as unknown as ZoviiClient;
    const store = new ZoviiTokenStore("refresh-1", client, () => 1_000_000);

    await store.getAccessToken();
    store.invalidate();
    await store.getAccessToken();
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("persists a rotated refresh token through the rotation callback", async () => {
    const onRefreshRotated = vi.fn();
    const refresh = vi.fn().mockResolvedValue({
      accessToken: "access-1",
      refreshToken: "refresh-rotated",
      expiresIn: 3600
    });
    const client = { refresh } as unknown as ZoviiClient;
    const store = new ZoviiTokenStore("refresh-old", client, () => 1_000_000, onRefreshRotated);

    await store.getAccessToken();

    expect(onRefreshRotated).toHaveBeenCalledWith("refresh-rotated");
  });
});
