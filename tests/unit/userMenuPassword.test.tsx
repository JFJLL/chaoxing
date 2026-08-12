// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { UserMenu } from "@/components/shell/UserMenu";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const teacher = {
  id: "teacher-1",
  name: "张洪生",
  role: "TEACHER" as const,
  institutionId: "institution-1"
};

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body
  };
}

describe("UserMenu 修改密码", () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    vi.restoreAllMocks();
    globalThis.fetch = vi.fn();
  });

  it("closes the dialog and shows a toast after a successful change", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ ok: true }));
    globalThis.fetch = fetchMock;

    render(<UserMenu user={teacher} />);

    fireEvent.click(screen.getByRole("button", { name: "修改密码" }));
    fireEvent.change(screen.getByLabelText("当前密码"), {
      target: { value: "Scim2026" }
    });
    fireEvent.change(screen.getByLabelText("新密码"), {
      target: { value: "QApass2026" }
    });
    fireEvent.change(screen.getByLabelText("确认新密码"), {
      target: { value: "QApass2026" }
    });
    fireEvent.click(screen.getByRole("button", { name: "确认修改" }));

    expect((await screen.findByRole("status")).textContent).toContain(
      "密码修改成功，下次登录请使用新密码。"
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/change-password",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          currentPassword: "Scim2026",
          newPassword: "QApass2026",
          confirmPassword: "QApass2026"
        })
      })
    );
  });

  it("shows the current-password error and keeps the form values", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ error: "当前密码错误" }, 400));
    globalThis.fetch = fetchMock;

    render(<UserMenu user={teacher} />);

    fireEvent.click(screen.getByRole("button", { name: "修改密码" }));
    fireEvent.change(screen.getByLabelText("当前密码"), {
      target: { value: "WrongPass1" }
    });
    fireEvent.change(screen.getByLabelText("新密码"), {
      target: { value: "QApass2026" }
    });
    fireEvent.change(screen.getByLabelText("确认新密码"), {
      target: { value: "QApass2026" }
    });
    fireEvent.click(screen.getByRole("button", { name: "确认修改" }));

    expect((await screen.findByRole("alert")).textContent).toContain(
      "当前密码错误"
    );
    expect((screen.getByLabelText("当前密码") as HTMLInputElement).value).toBe(
      "WrongPass1"
    );
  });

  it("recovers from a network failure and clears the pending state", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError("network down"));

    render(<UserMenu user={teacher} />);

    fireEvent.click(screen.getByRole("button", { name: "修改密码" }));
    fireEvent.change(screen.getByLabelText("当前密码"), {
      target: { value: "Scim2026" }
    });
    fireEvent.change(screen.getByLabelText("新密码"), {
      target: { value: "QApass2026" }
    });
    fireEvent.change(screen.getByLabelText("确认新密码"), {
      target: { value: "QApass2026" }
    });
    fireEvent.click(screen.getByRole("button", { name: "确认修改" }));

    expect((await screen.findByRole("alert")).textContent).toContain(
      "网络异常，请稍后重试"
    );
    expect(
      (screen.getByRole("button", { name: "确认修改" }) as HTMLButtonElement)
        .disabled
    ).toBe(false);
  });

  it("opens a clean dialog after a successful change", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(jsonResponse({ ok: true }));

    render(<UserMenu user={teacher} />);

    fireEvent.click(screen.getByRole("button", { name: "修改密码" }));
    fireEvent.change(screen.getByLabelText("当前密码"), {
      target: { value: "Scim2026" }
    });
    fireEvent.change(screen.getByLabelText("新密码"), {
      target: { value: "QApass2026" }
    });
    fireEvent.change(screen.getByLabelText("确认新密码"), {
      target: { value: "QApass2026" }
    });
    fireEvent.click(screen.getByRole("button", { name: "确认修改" }));
    expect(await screen.findByRole("status")).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    fireEvent.click(screen.getByRole("button", { name: "修改密码" }));

    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows an explicit validation error without calling the API when fields are empty", async () => {
    render(<UserMenu user={teacher} />);

    fireEvent.click(screen.getByRole("button", { name: "修改密码" }));
    fireEvent.click(screen.getByRole("button", { name: "确认修改" }));

    expect((await screen.findByRole("alert")).textContent).toContain(
      "请输入当前密码"
    );
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("rejects mismatched new passwords before calling the API", async () => {
    render(<UserMenu user={teacher} />);

    fireEvent.click(screen.getByRole("button", { name: "修改密码" }));
    fireEvent.change(screen.getByLabelText("当前密码"), {
      target: { value: "Scim2026" }
    });
    fireEvent.change(screen.getByLabelText("新密码"), {
      target: { value: "QApass2026" }
    });
    fireEvent.change(screen.getByLabelText("确认新密码"), {
      target: { value: "Different2026" }
    });
    fireEvent.click(screen.getByRole("button", { name: "确认修改" }));

    expect((await screen.findByRole("alert")).textContent).toContain(
      "两次输入的新密码不一致"
    );
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
