import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ZoviiCredentialDialogContent } from "@/components/course-workspace/ZoviiCanvasLauncher";
import { getZoviiDemoCredential } from "@/lib/zoviiDemoCredentials";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

describe("Zovii demo login", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([
    ["李素艳", "ZOVII_DEMO_LI_SUYAN_ACCOUNT", "ZOVII_DEMO_LI_SUYAN_PASSWORD"],
    ["王一帆", "ZOVII_DEMO_WANG_YIFAN_ACCOUNT", "ZOVII_DEMO_WANG_YIFAN_PASSWORD"],
    ["学习者", "ZOVII_DEMO_STUDENT_ACCOUNT", "ZOVII_DEMO_STUDENT_PASSWORD"]
  ])("maps %s only to that user's configured credential", (name, accountKey, passwordKey) => {
    vi.stubEnv(accountKey, `${name}-account`);
    vi.stubEnv(passwordKey, `${name}-password`);

    expect(getZoviiDemoCredential({ name })).toEqual({
      account: `${name}-account`,
      password: `${name}-password`
    });
  });

  it("does not provide a credential for an unknown user", () => {
    expect(getZoviiDemoCredential({ name: "其他用户" })).toBeNull();
  });

  it("does not provide a partial credential", () => {
    vi.stubEnv("ZOVII_DEMO_LI_SUYAN_ACCOUNT", "configured-account");
    expect(getZoviiDemoCredential({ name: "李素艳" })).toBeNull();
  });

  it("renders only the current credential in the dialog content", () => {
    const html = renderToStaticMarkup(
      <ZoviiCredentialDialogContent
        credential={{ account: "current-account", password: "current-password" }}
        copied={null}
        onCopy={vi.fn()}
      />
    );

    expect(html).toContain("Zovii 自动登录正在建设中");
    expect(html).toContain("current-account");
    expect(html).toContain("current-password");
    expect(html).not.toContain("other-account");
    expect(html).not.toContain("other-password");
  });
});
